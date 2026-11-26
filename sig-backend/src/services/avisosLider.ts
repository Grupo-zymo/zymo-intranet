// Avisos al líder de área en la campana de la intranet: alguien autorizado aprobó o rechazó una versión o un
// documento de un procedimiento de SU área. La campana y las notificaciones del teléfono viven en zymoally-backend;
// aquí solo se decide a quién se le avisa, con qué texto y a dónde lleva. Nunca tumba la aprobación.

import prisma from "../config/prisma"
import { env } from "../config/env"

/** Quien tiene este permiso en el área del procedimiento es su líder en el SIG (misma regla que middleware/gateLider.ts). */
const PERM_LIDER = "mod_sig_lider"
/** Topes de la campana (zymoally-backend/src/services/pushApi.ts): por encima de esto rechaza el aviso. */
const MAX_TEXTO = 300
const MAX_URL = 300

export type TipoDoc = "version" | "instructivo" | "formato" | "anexo"
export type Decision = "APROBADO" | "RECHAZADO"

export interface Evento {
  decision: Decision
  tipo: TipoDoc
  /** Código del procedimiento (PRC-000-ABC). */
  codigo: string
  /** Quien aprobó o rechazó. null = no se nombra a nadie (versión que un gerente o admin subió ya aprobada). */
  quien: string | null
  /** Número de la versión (si se escribió al subirla) o nombre del documento. */
  nombre?: string | null
  motivo?: string | null
}

const unaLinea = (t: string | null | undefined): string => (t ?? "").replace(/\s+/g, " ").trim()

/** Texto del aviso. `esAutor`: a quien subió el archivo se le dice «tu»; a los demás líderes del área, «la/el». */
export function textoAviso(e: Evento, esAutor: boolean): string {
  const femenino = e.tipo === "version"
  const nombre = unaLinea(e.nombre)
  const que = e.tipo === "version" ? `versión${nombre ? ` ${nombre}` : ""}` : `${e.tipo} «${nombre}»`
  const cosa = `${que} del ${e.codigo}`
  const quien = unaLinea(e.quien)
  let texto: string
  if (quien) {
    texto = `${quien} ${e.decision === "APROBADO" ? "aprobó" : "rechazó"} ${esAutor ? "tu" : femenino ? "la" : "el"} ${cosa}`
  } else {
    const participio = (e.decision === "APROBADO" ? "aprobad" : "rechazad") + (femenino ? "a" : "o")
    texto = `${esAutor ? "Tu" : femenino ? "La" : "El"} ${cosa} fue ${participio}`
  }
  const motivo = e.decision === "RECHAZADO" ? unaLinea(e.motivo) : ""
  if (motivo) texto += `: ${motivo}`
  // Al cortar no se deja medio emoji: un par sustituto partido es texto inválido y la campana rechazaría el aviso
  return texto.length > MAX_TEXTO ? texto.slice(0, MAX_TEXTO - 1).replace(/[\uD800-\uDBFF]$/, "") + "…" : texto
}

/** A quién se le avisa: los líderes del área sin repetir y nunca quien hizo la acción. Separa a quien subió el archivo (recibe «tu»). */
export function repartir(lideres: number[], actorId: number, autorId: number | null): { autor: number[]; otros: number[] } {
  const ids = [...new Set(lideres)].filter((id) => id !== actorId)
  return { autor: ids.filter((id) => id === autorId), otros: ids.filter((id) => id !== autorId) }
}

/** Ruta del procedimiento en el SIG del líder (la abre pages/sig/SigPage.tsx). Si no cabe en la campana, suelta el título y luego el código. */
export function urlProcedimiento(p: { id: number; codigo: string; titulo: string }): string {
  const intentos: Record<string, string>[] = [{ codigo: p.codigo, titulo: p.titulo }, { codigo: p.codigo }]
  for (const extra of intentos) {
    const url = `/sig-area?${new URLSearchParams({ proc: String(p.id), ...extra })}`
    if (url.length <= MAX_URL) return url
  }
  return `/sig-area?proc=${p.id}`
}

/** Lo que recibe la campana (POST /api/avisos/interno de zymoally-backend). */
export interface AvisoCampana {
  userIds: number[]
  tipo: string
  titulo: string
  texto: string
  url: string
  etiqueta: string
}

export interface AvisoLideres {
  procedimientoId: number
  decision: Decision
  tipo: TipoDoc
  nombre?: string | null
  motivo?: string | null
  /** Quien hizo la acción: nunca se le avisa. */
  actor: { id: number; nombre: string }
  /** false = el aviso no dice quién fue (versión que un gerente o admin subió ya aprobada: nadie pulsó «aprobar»). */
  nombrar?: boolean
  /** Quien subió la versión o el documento. */
  autorId: number | null
}

export interface Deps {
  procedimiento: (id: number) => Promise<{ id: number; codigo: string; titulo: string; intranetAreaId: number | null } | null>
  /** Ids de las cuentas que lideran esa área de la intranet. */
  lideres: (intranetAreaId: number) => Promise<number[]>
  enviar: (aviso: AvisoCampana) => Promise<void>
}

/** Devuelve la función que avisa. Nunca lanza: si algo falla se registra y la aprobación sigue. */
export function crearAvisador(deps: Deps) {
  return async (a: AvisoLideres): Promise<void> => {
    try {
      const proc = await deps.procedimiento(a.procedimientoId)
      // Una carpeta sin enlazar a un área de la intranet no tiene líderes a quienes avisar
      if (!proc || proc.intranetAreaId == null) return
      const { autor, otros } = repartir(await deps.lideres(proc.intranetAreaId), a.actor.id, a.autorId)
      const evento: Evento = { decision: a.decision, tipo: a.tipo, codigo: proc.codigo, quien: a.nombrar === false ? null : a.actor.nombre, nombre: a.nombre, motivo: a.motivo }
      const comun = {
        tipo: a.decision === "APROBADO" ? "sig_aprobado" : "sig_rechazado",
        titulo: `SIG · ${proc.codigo}`.slice(0, 80),
        url: urlProcedimiento(proc),
        etiqueta: `sig-proc-${proc.id}`,
      }
      if (autor.length > 0) await deps.enviar({ ...comun, userIds: autor, texto: textoAviso(evento, true) })
      if (otros.length > 0) await deps.enviar({ ...comun, userIds: otros, texto: textoAviso(evento, false) })
    } catch (err) {
      console.error(`[sig] no se pudo avisar a los líderes del procedimiento ${a.procedimientoId}: ${err instanceof Error ? err.message : "error"}`)
    }
  }
}

// ── Avisos del listado maestro: van por área (la carpeta del SIG), no por procedimiento ──

export interface AvisoArea {
  /** Carpeta del SIG (SigArea.id). */
  areaId: number
  texto: string
  /** Quien hizo el cambio: nunca se le avisa. */
  actorId: number
  url: string
  etiqueta: string
}

export interface DepsArea {
  area: (id: number) => Promise<{ id: number; intranetAreaId: number | null } | null>
  lideres: Deps["lideres"]
  enviar: Deps["enviar"]
}

/** Devuelve la función que avisa a los líderes del área. Nunca lanza: si algo falla se registra y el cambio sigue. */
export function crearAvisoArea(deps: DepsArea) {
  return async (a: AvisoArea): Promise<void> => {
    try {
      const area = await deps.area(a.areaId)
      if (!area || area.intranetAreaId == null) return
      const userIds = [...new Set(await deps.lideres(area.intranetAreaId))].filter((id) => id !== a.actorId)
      if (userIds.length === 0) return
      await deps.enviar({ userIds, tipo: "sig_listado", titulo: "SIG · Listado maestro", texto: a.texto, url: a.url, etiqueta: a.etiqueta })
    } catch (err) {
      console.error(`[sig] no se pudo avisar a los líderes del área ${a.areaId}: ${err instanceof Error ? err.message : "error"}`)
    }
  }
}

// ── Dependencias reales ──

async function buscarProcedimiento(id: number) {
  const p = await prisma.sigProcedimiento.findUnique({ where: { id }, select: { id: true, codigo: true, titulo: true, area: { select: { intranetAreaId: true } } } })
  return p ? { id: p.id, codigo: p.codigo, titulo: p.titulo, intranetAreaId: p.area.intranetAreaId } : null
}

/** La intranet (backend Python) responde quién tiene el permiso de líder EN esa área: la de su cuenta o una adicional. */
async function lideresDelArea(intranetAreaId: number): Promise<number[]> {
  const res = await fetch(`${env.INTRANET_API_URL}/api/push-destinatarios/area/${intranetAreaId}?permiso=${PERM_LIDER}`, {
    headers: { "X-Internal-Key": env.INTERNAL_KEY },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(`la intranet respondió ${res.status} al pedir los líderes del área`)
  const datos: unknown = await res.json()
  if (!Array.isArray(datos)) throw new Error("respuesta inesperada de la intranet")
  return datos.map((d: { id?: unknown }) => Number(d?.id)).filter((id) => Number.isInteger(id) && id > 0)
}

async function enviarACampana(aviso: AvisoCampana): Promise<void> {
  const res = await fetch(`${env.AVISOS_URL}/api/avisos/interno`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Key": env.INTERNAL_KEY },
    body: JSON.stringify(aviso),
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(`la campana respondió ${res.status}`)
}

/**
 * Avisa a los líderes del área del procedimiento. Se llama sin esperar (`void avisarLideres(...)`).
 * Sin AVISOS_URL no hace nada: así queda el SIG de pruebas, que no debe avisar a líderes reales.
 */
export const avisarLideres: (a: AvisoLideres) => Promise<void> = env.AVISOS_URL
  ? crearAvisador({ procedimiento: buscarProcedimiento, lideres: lideresDelArea, enviar: enviarACampana })
  : async () => {}

/** Avisa a los líderes de una carpeta del SIG (listado maestro). Mismo apagado que `avisarLideres` sin AVISOS_URL. */
export const avisarLideresDelArea: (a: AvisoArea) => Promise<void> = env.AVISOS_URL
  ? crearAvisoArea({
    area: (id) => prisma.sigArea.findUnique({ where: { id }, select: { id: true, intranetAreaId: true } }),
    lideres: lideresDelArea,
    enviar: enviarACampana,
  })
  : async () => {}
