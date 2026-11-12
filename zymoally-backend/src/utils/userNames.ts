// Nombres reales de las cuentas de la intranet. El JWT NO trae `full_name`
// (ver CLAUDE.md), así que se le pregunta al backend Python. Mismo patrón que
// task-backend/src/utils/userNames.ts, con caché corta para no pedir la lista
// en cada acción.

import { env } from "../config/env"

export interface CuentaIntranet {
  id: number
  nombre: string
  email: string
}

const CACHE_MS = 5 * 60_000
let cache: { hasta: number; cuentas: CuentaIntranet[] } | null = null

/** Cuentas activas de la intranet. Si el backend Python no responde, lista vacía (no rompe la acción). */
export async function listarCuentas(): Promise<CuentaIntranet[]> {
  if (cache && cache.hasta > Date.now()) return cache.cuentas
  try {
    const res = await fetch(`${env.INTRANET_API_URL}/api/tasks-v2/users`, {
      headers: { "X-Internal-Key": env.INTERNAL_KEY },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return cache?.cuentas ?? []
    const filas = (await res.json()) as { id: number; full_name: string | null; email: string }[]
    const cuentas = filas.map((u) => ({
      id: u.id,
      nombre: (u.full_name ?? "").trim() || u.email,
      email: u.email.trim().toLowerCase(),
    }))
    cache = { hasta: Date.now() + CACHE_MS, cuentas }
    return cuentas
  } catch {
    return cache?.cuentas ?? []
  }
}

/**
 * Nombre de quien ejecuta la acción. Si no se puede resolver cae al correo:
 * nunca "Usuario N", porque ese texto queda grabado para siempre en el caso.
 */
export async function resolveActorName(userId: number, email: string): Promise<string> {
  const cuenta = (await listarCuentas()).find((c) => c.id === userId)
  return cuenta?.nombre || email
}
