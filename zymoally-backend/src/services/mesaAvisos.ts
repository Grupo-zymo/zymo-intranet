// Mesa de ayuda — avisos de la campana de la intranet (no hay correo: el
// objetivo es no depender de Outlook).
//
// A quién le llega (regla del negocio, 2026-11-12):
//   · Ticket sin responsable → a todas las personas del área que lo atiende.
//   · Ticket con responsable (alguien lo tomó, se lo asignaron o Servicio al
//     Cliente lo redirigió ya con nombre) → solo a los responsables.
//   · Lo que le importa a quien lo pidió (le respondieron, lo cerraron, lo
//     redirigieron) también le llega a él.
//   · Nunca a quien hizo la acción.

import { prisma } from "../config/prisma"
import { horasLaboralesMesa } from "../utils/businessHours"
import { cuentasDeArea } from "./mesaIntranet"

export type TipoAviso = "nuevo" | "asignacion" | "respuesta" | "nota" | "cierre" | "redireccion" | "fuera_de_meta"

export interface ParaQuien {
  responsables: number[]
  miembrosArea: number[]
  creadorId: number
  /** Quien hizo la acción (null si la hizo el sistema). */
  actorId: number | null
  incluirCreador: boolean
  /** Si viene, reemplaza a responsables/área (ej.: la persona recién asignada). */
  soloEstos?: number[]
}

/** Función pura: a quién se le avisa. */
export function destinatarios(p: ParaQuien): number[] {
  const base = p.soloEstos ?? (p.responsables.length > 0 ? p.responsables : p.miembrosArea)
  const todos = p.incluirCreador ? [...base, p.creadorId] : base
  return [...new Set(todos)].filter((id) => id !== p.actorId)
}

interface TicketAviso {
  id: number
  codigo: string
  areaNombre: string
  creadorId: number
}

interface Opciones {
  actorId: number | null
  incluirCreador?: boolean
  soloEstos?: number[]
}

/**
 * Crea los avisos de un evento. Nunca tumba la acción principal: si falla
 * (por ejemplo, el backend Python no responde para listar el área), se registra
 * y la acción sigue.
 */
export async function avisar(ticket: TicketAviso, tipo: TipoAviso, texto: string, o: Opciones): Promise<number> {
  try {
    const responsables = (await prisma.mesaResponsable.findMany({ where: { ticketId: ticket.id }, select: { userId: true } })).map((r) => r.userId)
    // Solo se consulta el área cuando hace falta (ticket sin responsable y sin destinatarios fijos)
    const miembrosArea = o.soloEstos || responsables.length > 0 ? [] : (await cuentasDeArea(ticket.areaNombre)).map((c) => c.id)
    const ids = destinatarios({ responsables, miembrosArea, creadorId: ticket.creadorId, actorId: o.actorId, incluirCreador: o.incluirCreador ?? false, soloEstos: o.soloEstos })
    if (ids.length === 0) return 0
    await prisma.mesaAviso.createMany({ data: ids.map((userId) => ({ userId, ticketId: ticket.id, tipo, texto: texto.slice(0, 300) })) })
    return ids.length
  } catch (err) {
    console.error(`[mesa] no se pudieron crear los avisos de ${ticket.codigo} (${tipo}): ${err instanceof Error ? err.message : "error"}`)
    return 0
  }
}

/** Borra los avisos leídos hace más de 30 días: la campana solo muestra los últimos y no hay buzón histórico. */
export async function limpiarAvisosViejos(ahora = new Date()): Promise<number> {
  const r = await prisma.mesaAviso.deleteMany({ where: { leidoEn: { lt: new Date(ahora.getTime() - 30 * 86_400_000) } } })
  return r.count
}

/**
 * Tickets que pasaron la meta de su área (horas laborales) y siguen sin
 * respuesta o sin cerrar. Avisa una sola vez por meta. Lo llama el cron.
 */
export async function avisarFueraDeMeta(ahora = new Date(), soloAreas?: number[]): Promise<number> {
  const candidatos = await prisma.mesaTicket.findMany({
    where: {
      ...(soloAreas ? { areaId: { in: soloAreas } } : {}), // el self-check lo limita a sus áreas de prueba
      eliminadoEn: null,
      estado: { not: "cerrado" },
      OR: [
        { avisoRespuestaEn: null, primeraRespuestaEn: null, area: { metaPrimeraRespuestaH: { not: null } } },
        { avisoCierreEn: null, area: { metaCierreH: { not: null } } },
      ],
    },
    select: {
      id: true, codigo: true, areaNombre: true, creadorId: true, createdAt: true, primeraRespuestaEn: true, avisoRespuestaEn: true, avisoCierreEn: true,
      area: { select: { metaPrimeraRespuestaH: true, metaCierreH: true } },
    },
  })
  let enviados = 0
  for (const t of candidatos) {
    const llevan = horasLaboralesMesa(t.createdAt, ahora)
    const { metaPrimeraRespuestaH: mr, metaCierreH: mc } = t.area
    if (mr !== null && !t.primeraRespuestaEn && !t.avisoRespuestaEn && llevan > mr) {
      enviados += await avisar(t, "fuera_de_meta", `${t.codigo} pasó la meta de primera respuesta (${mr} h) y sigue sin respuesta`, { actorId: null })
      await prisma.$executeRaw`UPDATE "MesaTicket" SET "avisoRespuestaEn" = ${ahora} WHERE id = ${t.id}` // sin tocar updatedAt: no debe reordenar la bandeja
    }
    if (mc !== null && !t.avisoCierreEn && llevan > mc) {
      enviados += await avisar(t, "fuera_de_meta", `${t.codigo} pasó la meta de cierre (${mc} h) y sigue abierto`, { actorId: null })
      await prisma.$executeRaw`UPDATE "MesaTicket" SET "avisoCierreEn" = ${ahora} WHERE id = ${t.id}`
    }
  }
  return enviados
}
