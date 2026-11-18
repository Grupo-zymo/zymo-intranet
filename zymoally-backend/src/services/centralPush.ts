// Avisos push de la Central de tickets a partir de los eventos REALES del relay
// (centralStream). Solo decide y manda; no toca la base.
//
// Privacidad: las notas internas (mensaje.interno) NUNCA generan aviso, y del
// mensaje del cliente solo viajan los primeros 100 caracteres.

import { PERM_CENTRAL, normalizarCorreo } from "./centralAuth"
import type { Destinatario } from "./destinatarios"
import type { MensajePush } from "./mesaPush"

export const URL_CENTRAL = "/servicio-cliente/central"
const MAX_TEXTO = 100

export interface Aviso {
  /** Correo del responsable, o null = la dirección. */
  para: string | null
  mensaje: MensajePush
}

const recortar = (t: string, n: number): string => (t.length > n ? t.slice(0, n - 1) + "…" : t)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Decide qué avisar (o nada) para un evento del stream. Pura. */
export function decidirAviso(evento: string, ev: Record<string, unknown>): Aviso | null {
  const radicado = ev.radicado
  if (typeof radicado !== "number" && typeof radicado !== "string") return null
  const etiqueta = `central-${radicado}`
  const asignado = normalizarCorreo(ev.asignadoEmail)

  if (evento === "mensaje.nuevo") {
    const m = obj(ev.mensaje)
    if (!m || m.interno === true || m.deCliente !== true || typeof m.texto !== "string") return null
    const nombre = typeof m.autorNombre === "string" && m.autorNombre.trim() ? m.autorNombre.trim() : "cliente"
    return {
      para: asignado || null,
      mensaje: { titulo: recortar(`Mensaje de ${nombre}`, 80), texto: recortar(m.texto.replace(/\s+/g, " ").trim(), MAX_TEXTO), url: URL_CENTRAL, etiqueta },
    }
  }

  if (evento === "caso.actualizado") {
    // asignadoAntesEmail solo viaja cuando hubo asumir/asignar/liberar.
    if (ev.asignadoAntesEmail === undefined || !asignado) return null
    if (normalizarCorreo(ev.asignadoAntesEmail) === asignado) return null
    return { para: asignado, mensaje: { titulo: "Te asignaron un caso", texto: `Caso #${radicado}`, url: URL_CENTRAL, etiqueta: `${etiqueta}-asignado` } }
  }
  return null
}

/** No repite la misma etiqueta al mismo correo dentro de la ventana. */
export function crearAntiduplicado(ventanaMs = 20_000, ahora: () => number = Date.now) {
  const vistos = new Map<string, number>()
  return (correo: string, etiqueta: string): boolean => {
    const t = ahora()
    for (const [k, hasta] of vistos) if (hasta <= t) vistos.delete(k)
    const clave = `${correo}\u0000${etiqueta}`
    if ((vistos.get(clave) ?? 0) > t) return false
    vistos.set(clave, t + ventanaMs)
    return true
  }
}

export interface DepsAvisos {
  destinatarios: (permiso: string) => Promise<Destinatario[]>
  enviar: (correos: string[], mensaje: MensajePush) => Promise<unknown>
  permitir?: (correo: string, etiqueta: string) => boolean
}

/** Devuelve el manejador que se engancha al relay. Nunca lanza. */
export function crearAvisosCentral(deps: DepsAvisos) {
  const permitir = deps.permitir ?? crearAntiduplicado()
  return async (evento: string, ev: Record<string, unknown>): Promise<void> => {
    try {
      const aviso = decidirAviso(evento, ev)
      if (!aviso) return
      const correos = aviso.para
        ? [aviso.para]
        : (await deps.destinatarios(PERM_CENTRAL)).map((d) => normalizarCorreo(d.email)).filter(Boolean)
      const salen = [...new Set(correos)].filter((c) => permitir(c, aviso.mensaje.etiqueta))
      if (salen.length > 0) await deps.enviar(salen, aviso.mensaje)
    } catch {
      console.error("[central-push] aviso no enviado")
    }
  }
}
