// Quién tiene un permiso en la intranet (backend Python). Caché de 60 s y
// tolerante a fallos: si no responde, devuelve [] y se registra; el aviso se
// pierde, pero nada se rompe.

import { env } from "../config/env"

export interface Destinatario { id: number; email: string; nombre: string }
export type Buscador = (permiso: string) => Promise<Destinatario[]>

const buscarEnIntranet: Buscador = async (permiso) => {
  const res = await fetch(`${env.INTRANET_API_URL}/api/push-destinatarios?permiso=${encodeURIComponent(permiso)}`, {
    headers: { "X-Internal-Key": env.INTERNAL_KEY },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(`estado ${res.status}`)
  const datos: unknown = await res.json()
  if (!Array.isArray(datos)) throw new Error("respuesta inesperada")
  return datos.filter((d): d is Destinatario => !!d && typeof d.email === "string")
}

export function crearDestinatarios(buscar: Buscador = buscarEnIntranet, ttlMs = 60_000, ahora: () => number = Date.now) {
  const cache = new Map<string, { hasta: number; lista: Destinatario[] }>()
  return async (permiso: string): Promise<Destinatario[]> => {
    const c = cache.get(permiso)
    if (c && c.hasta > ahora()) return c.lista
    try {
      const lista = await buscar(permiso)
      cache.set(permiso, { hasta: ahora() + ttlMs, lista })
      return lista
    } catch (err) {
      console.error(`[push] no se pudo consultar destinatarios (${err instanceof Error ? err.message : "error"})`)
      return c?.lista ?? [] // si hay una lista vieja, mejor eso que nadie
    }
  }
}

export const destinatariosDelPermiso = crearDestinatarios()
