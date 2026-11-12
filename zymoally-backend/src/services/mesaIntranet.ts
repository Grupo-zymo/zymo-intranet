// Lo que la mesa de ayuda le pregunta al backend Python: áreas del panel admin
// y cuentas activas por área. El navegador nunca manda nombres ni correos de
// otras personas: se toman de aquí.

import { env } from "../config/env"
import { normalizarArea } from "./mesaAuth"

export class MesaError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export interface AreaIntranet {
  id: number
  name: string
}

/** Áreas del panel admin. Se pide con el token de quien llama (el endpoint exige sesión). */
export async function areasDelPanel(authorization: string | undefined): Promise<AreaIntranet[]> {
  try {
    const res = await fetch(`${env.INTRANET_API_URL}/areas`, {
      headers: { Authorization: authorization ?? "" },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`estado ${res.status}`)
    return (await res.json()) as AreaIntranet[]
  } catch (err) {
    console.error(`[mesa] no se pudieron leer las áreas del panel (${err instanceof Error ? err.message : "error"})`)
    throw new MesaError(502, "No pudimos leer las áreas de la intranet")
  }
}

export interface CuentaDeArea {
  id: number
  nombre: string
  email: string
  area: string | null
  cargo: string | null
}

const CACHE_MS = 60_000
const cache = new Map<string, { hasta: number; cuentas: CuentaDeArea[] }>()

/**
 * Cuentas activas cuya área principal es exactamente `nombreArea` (sin tildes ni
 * mayúsculas). ponytail: no incluye a quien la tiene solo como área adicional
 * (areas_extra) — esas personas ven la bandeja pero no salen para asignar;
 * ampliar /users-por-area en el backend Python si hace falta.
 */
export async function cuentasDeArea(nombreArea: string): Promise<CuentaDeArea[]> {
  const clave = normalizarArea(nombreArea)
  const guardado = cache.get(clave)
  if (guardado && guardado.hasta > Date.now()) return guardado.cuentas
  try {
    const res = await fetch(`${env.INTRANET_API_URL}/api/tasks-v2/users-por-area?prefijo=${encodeURIComponent(nombreArea)}`, {
      headers: { "X-Internal-Key": env.INTERNAL_KEY },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`estado ${res.status}`)
    const filas = (await res.json()) as CuentaDeArea[]
    // El endpoint filtra por "empieza por": aquí se exige el área exacta.
    const cuentas = filas.filter((c) => normalizarArea(c.area) === clave)
    cache.set(clave, { hasta: Date.now() + CACHE_MS, cuentas })
    return cuentas
  } catch (err) {
    console.error(`[mesa] no se pudo cargar el equipo del área (${err instanceof Error ? err.message : "error"})`)
    if (guardado) return guardado.cuentas
    throw new MesaError(502, "No pudimos cargar las personas de esa área")
  }
}
