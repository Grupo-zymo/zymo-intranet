// Central de tickets → Mesa de ayuda. Los operativos no tienen acceso a la Central: solo a la Mesa. Por eso, cuando la
// dirección o Servicio al Cliente asigna un caso a una persona, el caso queda como un ticket de la Mesa de ayuda de SU área
// con ella como responsable (le llega el aviso de la campana y el del teléfono). La Central sigue siendo el registro del caso.
//
// Las funciones puras (elegirArea, textoTicket, planear) se prueban en centralMesa.selfcheck.ts; las de base de datos son finas.

import { prisma } from "../config/prisma"
import { crearTicketConCodigo } from "./mesaCodigo"
import { avisar } from "./mesaAvisos"
import { normalizarArea } from "./mesaAuth"

export interface CasoParaMesa {
  radicado: string
  asunto: string
  cliente: string | null
  tipo: string | null
  severidad: string | null
}
export interface AsignadoMesa { id: number; nombre: string; email: string; area: string | null }
export interface ActorMesa { id: number; nombre: string; email: string }

export type ResultadoMesa =
  | { ok: true; id: number; codigo: string; accion: "creado" | "reasignado" | "sin_cambios" }
  | { ok: false; motivo: string }

interface AreaMesa { areaId: number; nombre: string; recibeTickets: boolean }

/** La Mesa del área de la persona (comparando el nombre sin tildes ni mayúsculas), o null si su área no recibe tickets. */
export function elegirArea(areas: AreaMesa[], nombreArea: string | null): AreaMesa | null {
  const buscada = normalizarArea(nombreArea)
  if (buscada === "") return null
  return areas.find((a) => a.recibeTickets && normalizarArea(a.nombre) === buscada) ?? null
}

/** Asunto y descripción del ticket. Solo datos del caso; jamás texto de la conversación ni notas internas. */
export function textoTicket(caso: CasoParaMesa, actorNombre: string, nota?: string): { asunto: string; descripcion: string } {
  const lineas = [
    `Caso ${caso.radicado} de la Central de tickets, asignado por ${actorNombre}.`,
    caso.cliente ? `Cliente: ${caso.cliente}` : null,
    caso.tipo ? `Tipo: ${caso.tipo}` : null,
    caso.severidad ? `Severidad: ${caso.severidad}` : null,
    nota ? `Indicaciones de ${actorNombre}: ${nota}` : null,
    "Responde al cliente desde la Central; aquí llevas el seguimiento.",
  ].filter((l): l is string => l !== null)
  return { asunto: `Caso ${caso.radicado} · ${caso.asunto}`.slice(0, 160), descripcion: lineas.join("\n").slice(0, 8000) }
}

export interface TicketAbierto { id: number; areaId: number; responsables: number[] }
export interface Plan {
  /** Tickets abiertos del mismo caso en OTRA área: el caso se mudó, se cierran. */
  cerrar: number[]
  /** Ticket del mismo caso en el área correcta, si ya existe. */
  usar: { id: number; yaEsResponsable: boolean; otrosResponsables: boolean } | null
}

export function planear(abiertos: TicketAbierto[], areaId: number, asignadoId: number): Plan {
  const cerrar = abiertos.filter((t) => t.areaId !== areaId).map((t) => t.id)
  const mio = abiertos.find((t) => t.areaId === areaId)
  if (!mio) return { cerrar, usar: null }
  return { cerrar, usar: { id: mio.id, yaEsResponsable: mio.responsables.includes(asignadoId) && mio.responsables.length === 1, otrosResponsables: mio.responsables.some((r) => r !== asignadoId) } }
}

const historial = (ticketId: number, actor: ActorMesa, accion: string, detalle?: Record<string, string>) =>
  prisma.mesaHistorial.create({ data: { ticketId, actorId: actor.id, actorNombre: actor.nombre, accion, detalle } })

/** Deja el caso en la Mesa de ayuda de la persona asignada. Nunca lanza: si algo falla, la asignación en la Central sigue y se explica el motivo. */
export async function enlazarAsignacion(p: { caso: CasoParaMesa; asignado: AsignadoMesa; actor: ActorMesa; nota?: string }): Promise<ResultadoMesa> {
  try {
    const areas = await prisma.mesaArea.findMany({ select: { areaId: true, nombre: true, recibeTickets: true } })
    const area = elegirArea(areas, p.asignado.area)
    if (!area) return { ok: false, motivo: `El área «${p.asignado.area ?? "sin área"}» no está activa en la Mesa de ayuda, así que ${p.asignado.nombre} no verá el caso allí. Actívala en Mesa de ayuda → Configuración.` }

    const abiertos = await prisma.mesaTicket.findMany({
      where: { radicadoOrigen: p.caso.radicado, eliminadoEn: null, estado: { not: "cerrado" } },
      select: { id: true, areaId: true, codigo: true, responsables: { select: { userId: true } } },
    })
    const plan = planear(abiertos.map((t) => ({ id: t.id, areaId: t.areaId, responsables: t.responsables.map((r) => r.userId) })), area.areaId, p.asignado.id)

    for (const id of plan.cerrar) {
      await prisma.$transaction([
        prisma.mesaTicket.update({ where: { id }, data: { estado: "cerrado", cerradoEn: new Date() } }),
        historial(id, p.actor, "estado", { de: "abierto", a: "cerrado" }),
      ])
    }

    const aviso = `${p.actor.nombre} te asignó el caso ${p.caso.radicado}: ${p.caso.asunto}`
    if (plan.usar) {
      const ticket = abiertos.find((t) => t.id === plan.usar!.id)!
      if (plan.usar.yaEsResponsable) return { ok: true, id: ticket.id, codigo: ticket.codigo, accion: "sin_cambios" }
      await prisma.$transaction([
        prisma.mesaResponsable.deleteMany({ where: { ticketId: ticket.id } }),
        prisma.mesaResponsable.create({ data: { ticketId: ticket.id, userId: p.asignado.id, nombre: p.asignado.nombre, email: p.asignado.email, area: p.asignado.area, asignadoPor: p.actor.nombre } }),
        historial(ticket.id, p.actor, "asignado", { a: p.asignado.nombre }),
        prisma.mesaTicket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } }),
      ])
      await avisar({ id: ticket.id, codigo: ticket.codigo, areaNombre: area.nombre, creadorId: p.actor.id }, "asignacion", aviso, { actorId: p.actor.id, soloEstos: [p.asignado.id] })
      return { ok: true, id: ticket.id, codigo: ticket.codigo, accion: "reasignado" }
    }

    const { asunto, descripcion } = textoTicket(p.caso, p.actor.nombre, p.nota)
    const ticket = await crearTicketConCodigo({
      areaId: area.areaId, asunto, descripcion, creadorId: p.actor.id, creadorNombre: p.actor.nombre, creadorEmail: p.actor.email,
      radicadoOrigen: p.caso.radicado,
    })
    await prisma.$transaction([
      historial(ticket.id, p.actor, "creado"),
      prisma.mesaResponsable.create({ data: { ticketId: ticket.id, userId: p.asignado.id, nombre: p.asignado.nombre, email: p.asignado.email, area: p.asignado.area, asignadoPor: p.actor.nombre } }),
      historial(ticket.id, p.actor, "asignado", { a: p.asignado.nombre }),
    ])
    await avisar(ticket, "asignacion", aviso, { actorId: p.actor.id, soloEstos: [p.asignado.id] })
    return { ok: true, id: ticket.id, codigo: ticket.codigo, accion: "creado" }
  } catch (err) {
    console.error(`[central→mesa] no se pudo dejar el caso ${p.caso.radicado} en la Mesa (${err instanceof Error ? err.message : "error"})`)
    return { ok: false, motivo: "No pudimos dejar el caso en la Mesa de ayuda; la asignación en la Central sí quedó." }
  }
}

/** Al liberar el caso en la Central, la persona deja de ser responsable del ticket (el ticket queda sin asignar en su Mesa). */
export async function soltarAsignacion(radicado: string, actor: ActorMesa): Promise<number> {
  try {
    const abiertos = await prisma.mesaTicket.findMany({
      where: { radicadoOrigen: radicado, eliminadoEn: null, estado: { not: "cerrado" } },
      select: { id: true, responsables: { select: { id: true, nombre: true } } },
    })
    let n = 0
    for (const t of abiertos) {
      if (t.responsables.length === 0) continue
      await prisma.$transaction([
        prisma.mesaResponsable.deleteMany({ where: { ticketId: t.id } }),
        ...t.responsables.map((r) => historial(t.id, actor, "desasignado", { a: r.nombre })),
      ])
      n++
    }
    return n
  } catch (err) {
    console.error(`[central→mesa] no se pudo soltar el caso ${radicado} en la Mesa (${err instanceof Error ? err.message : "error"})`)
    return 0
  }
}
