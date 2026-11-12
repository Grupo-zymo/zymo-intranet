// Personas a las que se les puede asignar un caso: cuentas activas de las
// áreas de Operaciones, con su cargo del directorio. La fuente es el backend
// Python (GET /api/tasks-v2/users-por-area, solo con X-Internal-Key).

import { env } from "../config/env"
import { CentralError } from "./autogestionClient"

export interface LiderCentral {
  id: number
  nombre: string
  email: string
  area: string | null
  cargo: string | null
  esLider: boolean
}

const CACHE_MS = 60_000
let cache: { hasta: number; lideres: LiderCentral[] } | null = null

export async function listarLideres(): Promise<LiderCentral[]> {
  if (cache && cache.hasta > Date.now()) return cache.lideres
  try {
    const res = await fetch(`${env.INTRANET_API_URL}/api/tasks-v2/users-por-area?prefijo=Operaciones`, {
      headers: { "X-Internal-Key": env.INTERNAL_KEY },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`estado ${res.status}`)
    const lideres = (await res.json()) as LiderCentral[]
    cache = { hasta: Date.now() + CACHE_MS, lideres }
    return lideres
  } catch (err) {
    console.error(`[central] no se pudo cargar la lista de líderes (${err instanceof Error ? err.message : "error"})`)
    if (cache) return cache.lideres // mejor una lista de hace un rato que ninguna
    throw new CentralError(502, "No pudimos cargar la lista de líderes de operaciones")
  }
}
