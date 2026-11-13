// Piezas puras del chat de la Central: normalizar el mensaje que llega por el stream o por la API,
// fusionar sin duplicados y decidir qué es «del cliente». Sin React.

import type { CentralCasoDetalle, CentralCasoItem, CentralMensaje } from "@/types/centralTickets"

/** Mensaje tal como viaja por el cable (contrato PLAN.md (b)) o por GET /mensajes; tolera el formato viejo del detalle. */
export interface MensajeCable {
  id: number | string
  texto: string
  interno?: boolean
  origen?: "app" | "intranet"
  creadoEn: string
  autorNombre?: string
  autor?: string
  rol?: string
  deCliente?: boolean
  clienteMsgId?: string | null
}

export function aMensaje(m: MensajeCable): CentralMensaje {
  const deCliente = typeof m.deCliente === "boolean" ? m.deCliente : undefined
  return {
    id: m.id,
    texto: m.texto,
    interno: m.interno === true,
    origen: m.origen === "intranet" ? "intranet" : "app",
    creadoEn: m.creadoEn,
    autor: m.autor ?? m.autorNombre ?? "",
    rol: m.rol ?? (deCliente ? "cliente" : "equipo"),
    ...(deCliente !== undefined ? { deCliente } : {}),
    clienteMsgId: m.clienteMsgId ?? null,
  }
}

const num = (id: number | string) => Number(id)

/** Suma `nuevos` a `actuales` sin repetir (por id o por clienteMsgId) y en orden de id. */
export function fusionarMensajes(actuales: CentralMensaje[], nuevos: CentralMensaje[]): CentralMensaje[] {
  const porId = new Map<string, CentralMensaje>()
  const porClave = new Map<string, string>()
  const alta = (m: CentralMensaje) => {
    const k = String(m.id)
    const previo = porId.get(k)
    porId.set(k, previo ? { ...previo, ...m } : m)
    if (m.clienteMsgId) porClave.set(m.clienteMsgId, k)
  }
  actuales.forEach(alta)
  for (const m of nuevos) {
    const k = m.clienteMsgId ? porClave.get(m.clienteMsgId) : undefined
    if (k !== undefined && k !== String(m.id)) continue
    alta(m)
  }
  const todos = [...porId.values()]
  return todos.every((m) => Number.isFinite(num(m.id))) ? todos.sort((a, b) => num(a.id) - num(b.id)) : todos
}

export function esDelCliente(m: CentralMensaje, clienteNombre: string): boolean {
  if (m.interno || m.origen === "intranet") return false
  if (typeof m.deCliente === "boolean") return m.deCliente
  return m.rol.toLowerCase().includes("cliente") || m.autor === clienteNombre
}

export function idMaximo(mensajes: CentralMensaje[]): number {
  let max = 0
  for (const m of mensajes) {
    const n = num(m.id)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max
}

/** Aplica un `mensaje.nuevo` al detalle en caché. */
export function conMensaje(caso: CentralCasoDetalle, m: CentralMensaje): CentralCasoDetalle {
  return { ...caso, mensajes: fusionarMensajes(caso.mensajes, [m]) }
}

/**
 * Aplica un `mensaje.nuevo` a un ítem de la bandeja. La nota interna no cambia ni «último mensaje» ni «no leídos»
 * (solo el contador de mensajes). `abierto`: el equipo está viendo ese caso, así que no queda sin leer.
 */
export function conMensajeEnItem(item: CentralCasoItem, m: CentralMensaje, abierto: boolean): CentralCasoItem {
  if (m.interno) return { ...item, mensajes: item.mensajes + 1 }
  const deCliente = esDelCliente(m, item.cliente.nombre)
  return {
    ...item,
    mensajes: item.mensajes + 1,
    ultimoMensaje: { creadoEn: m.creadoEn, deCliente },
    ...(deCliente && !abierto && typeof item.noLeidos === "number" ? { noLeidos: item.noLeidos + 1 } : {}),
  }
}

/** Agrupa mensajes por día local para los separadores. */
export function claveDia(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const DIA = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" })
const DIA_ANIO = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" })

export function etiquetaDia(iso: string, ahora = Date.now()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const hoy = claveDia(new Date(ahora).toISOString())
  const ayer = claveDia(new Date(ahora - 86_400_000).toISOString())
  const k = claveDia(iso)
  if (k === hoy) return "Hoy"
  if (k === ayer) return "Ayer"
  return d.getFullYear() === new Date(ahora).getFullYear() ? DIA.format(d) : DIA_ANIO.format(d)
}

export const HORA = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" })
export const hora = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : HORA.format(d)
}
