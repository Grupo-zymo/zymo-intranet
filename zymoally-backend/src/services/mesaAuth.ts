// Mesa de ayuda — quién ve y quién puede hacer qué. Sin Express, sin red y sin
// base de datos, para probar cada regla suelta (ver mesaAuth.selfcheck.ts).
//
// La relación de una persona con un ticket sale de datos, no de un rol global:
//   admin       → role "admin": ve todo, incluidos los eliminados.
//   area        → su área (User.area o areas_extra) es el área destino: gestiona.
//   responsable → SAC lo sumó al ticket desde otra área: gestiona ESE ticket.
//   creador     → lo radicó: lo ve, comenta, adjunta y puede eliminarlo.
// Encima van dos capacidades: líder (permiso; metas y tablero de su área) y SAC
// (pertenecer a un área marcada esSac; redirigir y sumar responsables).

import type { Prisma } from "@prisma/client"

// Acceso a la mesa de ayuda. Al estrenarla solo entran los administradores: un admin
// habilita a cada persona en Organización → Editar permisos. El permiso de líder incluye el acceso.
export const PERM_MESA = "mod_tickets_mesa"
export const PERM_MESA_LIDER = "mod_tickets_lider"

/** ¿Esta cuenta puede entrar a la mesa de ayuda? (admin, o con el permiso de acceso o el de líder) */
export function puedeEntrarMesa(user: { role?: string; app_permissions?: string[] } | undefined): boolean {
  if (!user) return false
  if (user.role === "admin") return true
  const permisos = Array.isArray(user.app_permissions) ? user.app_permissions : []
  return permisos.includes(PERM_MESA) || permisos.includes(PERM_MESA_LIDER)
}

export type Decision = { ok: true } | { ok: false; status: 403 | 404; error: string }
const PERMITIDO: Decision = { ok: true }
const NO_ENCONTRADO: Decision = { ok: false, status: 404, error: "No encontramos ese ticket" }
const prohibido = (error: string): Decision => ({ ok: false, status: 403, error })

/** Las áreas se comparan SIEMPRE así: sin tildes, en minúsculas y sin espacios de más
 *  (mismo criterio que backend/app/services/usuarios_por_area.py). */
export function normalizarArea(texto: unknown): string {
  if (typeof texto !== "string") return ""
  return texto.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().split(/\s+/).filter(Boolean).join(" ")
}

interface UsuarioToken {
  id?: number | string
  role?: string
  email?: string
  area?: string | null
  areas_extra?: unknown
  app_permissions?: string[]
}

export interface AreaMesa {
  areaId: number
  nombre: string
  /** Área que hoy hace de Servicio al Cliente (2026-11: Planeación y Consultoria). */
  esSac?: boolean
}

export interface AccesoMesa {
  userId: number
  esAdmin: boolean
  esLider: boolean
  esSac: boolean
  /** Áreas de la mesa a las que pertenece (principal por nombre + adicionales por id). */
  areaIds: number[]
}

/** Acceso de quien llama, o null si el token no trae un id de usuario válido. */
export function resolverAccesoMesa(user: UsuarioToken | undefined, areas: AreaMesa[]): AccesoMesa | null {
  const userId = Number(user?.id)
  if (!user || !Number.isInteger(userId) || userId <= 0) return null
  const permisos = Array.isArray(user.app_permissions) ? user.app_permissions : []
  const propia = normalizarArea(user.area)
  const extra = Array.isArray(user.areas_extra) ? user.areas_extra.filter((n): n is number => Number.isInteger(n)) : []
  const mias = areas.filter((a) => (propia !== "" && normalizarArea(a.nombre) === propia) || extra.includes(a.areaId))
  const areaIds = mias.map((a) => a.areaId)
  return {
    userId,
    esAdmin: user.role === "admin",
    esLider: permisos.includes(PERM_MESA_LIDER),
    esSac: mias.some((a) => a.esSac === true),
    areaIds,
  }
}

export interface TicketParaAcceso {
  creadorId: number
  areaId: number
  eliminadoEn: Date | null
  responsableIds: number[]
}

export type Relacion = "admin" | "area" | "responsable" | "creador"

/** La relación más fuerte con el ticket, o null si no debe saber que existe. */
export function relacionCon(acceso: AccesoMesa, t: TicketParaAcceso): Relacion | null {
  if (acceso.esAdmin) return "admin"
  if (t.eliminadoEn) return null // el registro de eliminados es solo del admin
  if (acceso.areaIds.includes(t.areaId)) return "area"
  if (t.responsableIds.includes(acceso.userId)) return "responsable"
  if (t.creadorId === acceso.userId) return "creador"
  return null
}

export type AccionMesa =
  | "ver"
  | "comentar"
  | "evidencia"
  | "ver_internas"
  | "nota_interna"
  | "asignar"
  | "estado"
  | "categoria"
  | "eliminar"
  | "redirigir"
  | "sumar_responsable"

const DE_GESTION: ReadonlySet<AccionMesa> = new Set(["ver_internas", "nota_interna", "asignar", "estado", "categoria"])

/**
 * ¿Puede `acceso` hacer `accion` sobre el ticket? Un ticket ajeno responde 404
 * (no se revela que existe); lo que no puede hacer en uno que sí ve, 403.
 */
export function decidirMesa(acceso: AccesoMesa, accion: AccionMesa, t: TicketParaAcceso): Decision {
  const rel = relacionCon(acceso, t)
  if (!rel) return NO_ENCONTRADO
  if (t.eliminadoEn && accion !== "ver") return prohibido("El ticket fue eliminado: solo se puede consultar")
  const gestiona = rel !== "creador"

  if (accion === "ver" || accion === "comentar" || accion === "evidencia") return PERMITIDO
  if (DE_GESTION.has(accion)) return gestiona ? PERMITIDO : prohibido("Solo el área que atiende el ticket puede hacer eso")
  if (accion === "eliminar") {
    return rel === "admin" || t.creadorId === acceso.userId ? PERMITIDO : prohibido("Solo quien creó el ticket puede eliminarlo")
  }
  // redirigir | sumar_responsable
  return rel === "admin" || acceso.esSac ? PERMITIDO : prohibido("Solo Servicio al Cliente puede redirigir o sumar responsables")
}

export type VistaMesa = "mias" | "area" | "todas" | "eliminados"

/** Filtro de la lista, FORZADO en el servidor según quién llama (nunca según lo que pida el navegador). */
export function filtroLista(acceso: AccesoMesa, vista: VistaMesa): { ok: true; where: Prisma.MesaTicketWhereInput } | Extract<Decision, { ok: false }> {
  if (vista === "mias") return { ok: true, where: { creadorId: acceso.userId, eliminadoEn: null } }
  if (vista === "area") {
    return {
      ok: true,
      where: {
        eliminadoEn: null,
        OR: [{ areaId: { in: acceso.areaIds } }, { responsables: { some: { userId: acceso.userId } } }],
      },
    }
  }
  if (!acceso.esAdmin) return { ok: false, status: 403, error: "Solo administración ve los tickets de todas las áreas" }
  return { ok: true, where: vista === "todas" ? { eliminadoEn: null } : { eliminadoEn: { not: null } } }
}

/** Metas y tablero: el líder, y solo de sus áreas. El admin no los usa (su vista es el panorama entre áreas). */
export function esLiderDe(acceso: AccesoMesa, areaId: number): boolean {
  return acceso.esLider && acceso.areaIds.includes(areaId)
}
