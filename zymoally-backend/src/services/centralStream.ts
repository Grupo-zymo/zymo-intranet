// Relay de tiempo real de la Central de tickets.
//
// UNA sola conexión SSE hacia la API de casos (firehose con X-Service-Key) y
// fan-out a los navegadores conectados, filtrando por nivel:
//   - director: todo, tal cual llega.
//   - líder: solo eventos de casos asignados (ahora o antes) a su correo.
//   - hello y resync: a todos.
// Al navegador NUNCA viaja `id:` ni, salvo al director, asignadoEmail /
// asignadoAntesEmail. La clave de servicio vive solo en autogestionClient.
//
// El stream es un AVISO, no almacenamiento: si el upstream se corta, se
// reconecta con Last-Event-ID y se manda `resync` a todos para que recarguen.

import { crearParserSse, type BloqueSse } from "../utils/sse"
import type { NivelCentral } from "./centralAuth"

export interface RespuestaUpstream {
  ok: boolean
  status: number
  body: AsyncIterable<Uint8Array | string> | null
}

export type AbrirUpstream = (lastId: number | null, signal: AbortSignal) => Promise<RespuestaUpstream>

export interface Suscriptor {
  nivel: NivelCentral
  /** Correo en minúsculas. */
  email: string
  /** Escribe un bloque SSE ya formateado. */
  escribir(texto: string): void
  /** Bytes pendientes de salir hacia este navegador (res.writableLength); para el backpressure. */
  bufferado?(): number
  /** Cierra la conexión de este navegador (buffer desbordado). */
  cerrar?(): void
}

/** Por encima de esto, los avisos efímeros (escribiendo) se descartan para ese suscriptor. */
const BUFFER_DESCARTE = 64 * 1024
/** Por encima de esto, se cierra la conexión: el navegador reconecta y recarga. */
const BUFFER_MAXIMO = 1024 * 1024

export interface OpcionesRelay {
  abrir: AbrirUpstream
  maxPorUsuario?: number
  maxTotal?: number
  backoffMinMs?: number
  backoffMaxMs?: number
  /** Sin bytes del upstream durante este tiempo se da por colgado y se reconecta. */
  silencioMs?: number
}

const DATOS_SOLO_SERVICIO = ["asignadoEmail", "asignadoAntesEmail"] as const

const bloque = (event: string, data: string): string => `event: ${event}\ndata: ${data}\n\n`

function correo(valor: unknown): string {
  return typeof valor === "string" ? valor.trim().toLowerCase() : ""
}

export function crearRelay(opciones: OpcionesRelay) {
  const maxPorUsuario = opciones.maxPorUsuario ?? 5
  const maxTotal = opciones.maxTotal ?? 200
  const backoffMin = opciones.backoffMinMs ?? 1_000
  const backoffMax = opciones.backoffMaxMs ?? 30_000
  const silencioMs = opciones.silencioMs ?? 75_000

  const suscriptores = new Set<Suscriptor>()
  let lastId: number | null = null
  let upstream: AbortController | null = null
  let temporizador: NodeJS.Timeout | null = null
  let intentos = 0
  let detenido = false
  let huboConexion = false // ¿ya hubo alguna conexión upstream establecida?

  function enviar(s: Suscriptor, texto: string, efimero = false): void {
    try {
      const pendiente = s.bufferado?.() ?? 0
      if (pendiente > BUFFER_MAXIMO) {
        suscriptores.delete(s)
        s.cerrar?.()
        return
      }
      if (efimero && pendiente > BUFFER_DESCARTE) return
      s.escribir(texto)
    } catch {
      suscriptores.delete(s) // socket roto: el cierre real lo limpia la ruta
    }
  }

  function aTodos(texto: string): void {
    for (const s of [...suscriptores]) enviar(s, texto)
  }

  function repartir(b: BloqueSse): void {
    // El hello de cada suscriptor lo manda suscribir(); el del upstream no se reenvía.
    if (b.event === "hello") return
    if (b.event === "resync") {
      aTodos(bloque("resync", b.data || "{}"))
      return
    }
    if (b.id !== undefined && /^\d+$/.test(b.id)) lastId = Math.max(lastId ?? 0, Number(b.id))
    let ev: Record<string, unknown>
    try {
      const parseado: unknown = JSON.parse(b.data)
      if (!parseado || typeof parseado !== "object" || Array.isArray(parseado)) return
      ev = parseado as Record<string, unknown>
    } catch {
      return // data no parseable: se descarta
    }
    const limpio = { ...ev }
    for (const campo of DATOS_SOLO_SERVICIO) delete limpio[campo]
    const dataLimpia = JSON.stringify(limpio)

    const efimero = b.event === "escribiendo"
    for (const s of [...suscriptores]) {
      if (s.nivel === "director") {
        enviar(s, bloque(b.event, b.data), efimero)
      } else if (correo(ev.asignadoEmail) === s.email || correo(ev.asignadoAntesEmail) === s.email) {
        // Solo el director ve los correos de asignación: al líder se le quitan siempre.
        enviar(s, bloque(b.event, dataLimpia), efimero)
      }
    }
  }

  function programarReconexion(): void {
    if (detenido || suscriptores.size === 0 || temporizador) return
    const base = Math.min(backoffMax, backoffMin * 2 ** Math.min(intentos, 10))
    const espera = Math.min(backoffMax, Math.round(base * (0.8 + Math.random() * 0.4)))
    intentos += 1
    temporizador = setTimeout(() => {
      temporizador = null
      void conectar(true)
    }, espera)
    temporizador.unref?.()
  }

  async function conectar(reconexion: boolean): Promise<void> {
    if (detenido || upstream || suscriptores.size === 0) return
    if (temporizador) {
      clearTimeout(temporizador)
      temporizador = null
    }
    const control = new AbortController()
    upstream = control
    let vigilante: NodeJS.Timeout | null = null
    const armar = (): void => {
      if (vigilante) clearTimeout(vigilante)
      vigilante = setTimeout(() => control.abort(), silencioMs)
      vigilante.unref?.()
    }
    try {
      armar()
      const res = await opciones.abrir(lastId, control.signal)
      if (!res.ok || !res.body) {
        console.error(`[central-stream] el servicio de casos respondió ${res.status}`)
        throw new Error("upstream no disponible")
      }
      // Conexión nueva tras otra previa (o tras reintentos): los eventos del hueco se perdieron.
      if (reconexion || huboConexion) aTodos(bloque("resync", "{}"))
      huboConexion = true
      intentos = 0 // conexión establecida
      const decodificador = new TextDecoder()
      const parser = crearParserSse(repartir)
      for await (const trozo of res.body) {
        armar()
        parser.push(typeof trozo === "string" ? trozo : decodificador.decode(trozo, { stream: true }))
      }
    } catch (err) {
      if (!detenido) console.error(`[central-stream] upstream caído (${err instanceof Error ? err.name : "error"})`)
    } finally {
      if (vigilante) clearTimeout(vigilante)
      control.abort()
      upstream = null
    }
    programarReconexion() // fin normal o error: se reintenta mientras haya gente
  }

  function motivoDeRechazo(email: string): "usuario" | "total" | null {
    if (suscriptores.size >= maxTotal) return "total"
    let propios = 0
    for (const o of suscriptores) if (o.email === email) propios += 1
    return propios >= maxPorUsuario ? "usuario" : null
  }

  return {
    /** Motivo por el que NO cabe otra conexión de este correo (para responder 429 antes de abrir el stream). */
    motivoDeRechazo,
    /** Devuelve la función de baja, o el motivo del rechazo si se supera algún tope. */
    suscribir(s: Suscriptor): { baja: () => void } | { error: "usuario" | "total" } {
      const motivo = motivoDeRechazo(s.email)
      if (motivo) return { error: motivo }
      suscriptores.add(s)
      enviar(s, bloque("hello", JSON.stringify({ t: new Date().toISOString() })))
      void conectar(false)
      return { baja: () => void suscriptores.delete(s) }
    },
    cantidad: (): number => suscriptores.size,
    /** Solo para pruebas y apagado limpio. */
    detener(): void {
      detenido = true
      if (temporizador) clearTimeout(temporizador)
      temporizador = null
      upstream?.abort()
    },
  }
}

export type RelayCentral = ReturnType<typeof crearRelay>
