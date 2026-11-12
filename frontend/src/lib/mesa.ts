import type { MesaEstado, MesaHistorial } from "@/types/mesa"

export { mensajeDeError, estadoDeError } from "@/lib/centralTickets"

export const ESTADO_TEXTO: Record<MesaEstado, string> = {
  abierto: "Abierto",
  en_espera: "En espera",
  cerrado: "Cerrado",
}

export function tamanoLegible(bytes: number): string {
  // Espacio de no separación: la unidad no se parte del número
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Una línea del historial en lenguaje corriente. */
export function textoHistorial(h: MesaHistorial): string {
  const d = h.detalle ?? {}
  const estado = (v: unknown) => ESTADO_TEXTO[v as MesaEstado]?.toLowerCase() ?? String(v)
  switch (h.accion) {
    case "creado": return "creó la solicitud"
    case "estado": return `cambió el estado de ${estado(d.de)} a ${estado(d.a)}`
    case "reabierto": return "reabrió la solicitud al responder"
    case "asignado": return `sumó a ${String(d.a)} como responsable${d.deOtraArea ? " (de otra área)" : ""}`
    case "desasignado": return `quitó a ${String(d.a)} de los responsables`
    case "redirigido": return `redirigió de ${String(d.de)} a ${String(d.a)}${d.nota ? `: ${String(d.nota)}` : ""}`
    case "clasificado": return "cambió la clasificación"
    case "eliminado": return `eliminó la solicitud: ${String(d.motivo)}`
    default: return h.accion
  }
}
