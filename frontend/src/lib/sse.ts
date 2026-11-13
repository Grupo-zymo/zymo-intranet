// Cliente SSE con fetch + ReadableStream (EventSource no deja mandar el Bearer). Sin dependencias: se verifica
// en frontend/scripts/sse.selfcheck.ts. Contrato: docs/chat-tiempo-real/PLAN.md de la app de autogestión, (f).

export type EstadoStream = "conectando" | "en_vivo" | "reconectando" | "sin_stream"

export interface EventoSse {
  /** `id:` del evento, o null si no lo trae. */
  id: string | null
  evento: string
  datos: string
}

/** Fallos seguidos (sin llegar a «en vivo») tras los cuales se cede el trabajo al sondeo. */
export const FALLOS_PARA_SIN_STREAM = 3
/** Sin un solo byte (ni el latido de 25 s) durante este tiempo, la conexión se da por muerta. */
export const SILENCIO_MAX_MS = 70_000

/** Espera de reconexión: 1 s, 2 s, 4 s… hasta 30 s, con jitter (50 %–100 % de la base). */
export function esperaBackoff(intento: number, azar: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, intento - 1))
  return Math.round(base * (0.5 + azar() * 0.5))
}

/** Parser de líneas SSE. Acepta trozos partidos en cualquier punto; ignora comentarios (`: ping`). */
export function crearParser(emitir: (e: EventoSse) => void): { push: (texto: string) => void } {
  let resto = ""
  let id: string | null = null
  let evento = ""
  let datos: string[] = []
  let primera = true

  function linea(l: string) {
    if (l === "") {
      if (datos.length > 0 || evento) emitir({ id, evento: evento || "message", datos: datos.join("\n") })
      evento = ""
      datos = []
      return
    }
    if (l.startsWith(":")) return
    const i = l.indexOf(":")
    const campo = i === -1 ? l : l.slice(0, i)
    let valor = i === -1 ? "" : l.slice(i + 1)
    if (valor.startsWith(" ")) valor = valor.slice(1)
    if (campo === "id") id = valor
    else if (campo === "event") evento = valor
    else if (campo === "data") datos.push(valor)
  }

  return {
    push(texto: string) {
      if (primera) {
        primera = false
        if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1)
      }
      resto += texto
      const partes = resto.split(/\r\n|\n|\r/)
      // La última parte puede estar incompleta (o un \r a la espera de su \n): se guarda.
      resto = partes.pop() ?? ""
      for (const l of partes) linea(l)
    },
  }
}

export interface OpcionesStream {
  url: string
  /** Se lee en cada intento: el token puede haber cambiado. */
  token: () => string | null
  /** Último `id:` recibido (si el servidor los manda); se reenvía como Last-Event-ID. */
  ultimoId?: () => string | number | null | undefined
  onEvento: (e: EventoSse) => void
  onEstado: (estado: EstadoStream) => void
  /** 401: la sesión venció. No se reintenta. */
  onNoAutorizado: () => void
  signal?: AbortSignal
  /** Avisa cada vez que la app vuelve a primer plano; devuelve la función para dejar de avisar. */
  suscribirPrimerPlano?: (alVolver: () => void) => () => void
  // Inyectables para la verificación:
  fetchFn?: typeof fetch
  esperar?: (ms: number) => Promise<void>
  azar?: () => number
  silencioMaxMs?: number
}

export interface ControlStream {
  cerrar: () => void
  /** Corta la conexión actual (si la hay) y reconecta sin esperar. */
  reconectarYa: () => void
}

class Despertar extends Error {}

export function abrirStream(op: OpcionesStream): ControlStream {
  const fetchFn = op.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const silencioMax = op.silencioMaxMs ?? SILENCIO_MAX_MS
  const cierre = new AbortController()
  let conexion: AbortController | null = null
  let despertarEspera: (() => void) | null = null
  let estado: EstadoStream | null = null
  let cerrado = false

  const fijar = (e: EstadoStream) => {
    if (estado === e || cerrado) return
    estado = e
    op.onEstado(e)
  }
  const cerrar = () => {
    if (cerrado) return
    cerrado = true
    cierre.abort()
    conexion?.abort(new Despertar())
    despertarEspera?.()
    quitarPrimerPlano?.()
    estado = null
  }
  op.signal?.addEventListener("abort", cerrar, { once: true })
  if (op.signal?.aborted) cerrado = true

  const esperar =
    op.esperar ??
    ((ms: number) =>
      new Promise<void>((ok) => {
        const t = setTimeout(ok, ms)
        despertarEspera = () => {
          clearTimeout(t)
          ok()
        }
      }))

  function reconectarYa() {
    if (cerrado) return
    conexion?.abort(new Despertar())
    despertarEspera?.()
  }
  const quitarPrimerPlano = op.suscribirPrimerPlano?.(reconectarYa)

  /** Una conexión. Devuelve cómo terminó. */
  async function conectar(): Promise<"vivo-cortado" | "fallo" | "despertado" | "fin"> {
    const ctl = new AbortController()
    conexion = ctl
    let vivo = false
    let temporizador: ReturnType<typeof setTimeout> | undefined
    const armar = () => {
      clearTimeout(temporizador)
      temporizador = setTimeout(() => ctl.abort(new Error("silencio")), silencioMax)
    }
    try {
      // Solo cabeceras que el CORS del servidor admite (Authorization, Content-Type, Accept): una cabecera propia como
      // Cache-Control rompe el preflight cuando la app corre empaquetada (origen https://localhost). `cache: "no-store"` ya evita el caché.
      const cabeceras: Record<string, string> = { Accept: "text/event-stream" }
      const t = op.token()
      if (t) cabeceras.Authorization = `Bearer ${t}`
      const ultimo = op.ultimoId?.()
      if (ultimo !== null && ultimo !== undefined && ultimo !== "") cabeceras["Last-Event-ID"] = String(ultimo)

      armar()
      const res = await fetchFn(op.url, { headers: cabeceras, signal: ctl.signal, cache: "no-store" })
      if (res.status === 401) {
        cerrar()
        op.onNoAutorizado()
        return "fin"
      }
      if (res.status === 403) {
        // Sin permiso para la Central: reintentar no cambia nada.
        cerrar()
        op.onEstado("sin_stream")
        return "fin"
      }
      if (!res.ok || !res.body) return "fallo"

      const lector = res.body.getReader()
      ctl.signal.addEventListener("abort", () => { lector.cancel(ctl.signal.reason).catch(() => {}) }, { once: true })
      const decodificador = new TextDecoder("utf-8")
      const parser = crearParser((e) => {
        if (!vivo) {
          vivo = true
          fijar("en_vivo")
        }
        op.onEvento(e)
      })
      for (;;) {
        const { done, value } = await lector.read()
        if (done) break
        armar()
        parser.push(decodificador.decode(value, { stream: true }))
      }
      if (ctl.signal.aborted) throw ctl.signal.reason
      return vivo ? "vivo-cortado" : "fallo"
    } catch (e) {
      if (cerrado) return "fin"
      if (e instanceof Despertar || (ctl.signal.reason instanceof Despertar)) return "despertado"
      return vivo ? "vivo-cortado" : "fallo"
    } finally {
      clearTimeout(temporizador)
      if (conexion === ctl) conexion = null
    }
  }

  void (async () => {
    let fallos = 0
    let intento = 0
    while (!cerrado) {
      fijar(fallos >= FALLOS_PARA_SIN_STREAM ? "sin_stream" : estado === null ? "conectando" : "reconectando")
      const fin = await conectar()
      if (cerrado) return
      if (fin === "despertado") {
        // Volvió a primer plano: reconectar ya, sin castigo.
        fallos = 0
        intento = 0
        continue
      }
      if (fin === "vivo-cortado") {
        fallos = 0
        intento = 1
      } else {
        fallos += 1
        intento += 1
        if (fallos >= FALLOS_PARA_SIN_STREAM) fijar("sin_stream")
        else fijar("reconectando")
      }
      if (fin === "vivo-cortado") fijar("reconectando")
      await esperar(esperaBackoff(intento, op.azar))
    }
  })()

  return { cerrar, reconectarYa }
}
