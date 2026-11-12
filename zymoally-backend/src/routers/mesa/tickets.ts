// Mesa de ayuda — tickets. Montado en /api/mesa detrás de authenticate +
// requireMesaAccess. Cada handler pregunta a services/mesaAuth.ts qué puede
// hacer quien llama; nada de lo que decide el acceso viene del navegador.

import { Router, type Request } from "express"
import { z } from "zod"
import crypto from "crypto"
import fs from "fs"
import path from "path"
import multer from "multer"
import { Prisma } from "@prisma/client"
import { prisma } from "../../config/prisma"
import { env } from "../../config/env"
import { crearTicketConCodigo } from "../../services/mesaCodigo"
import { decidirMesa, filtroLista, relacionCon, type AccionMesa, type TicketParaAcceso } from "../../services/mesaAuth"
import { MesaError, cuentasDeArea } from "../../services/mesaIntranet"
import { avisar } from "../../services/mesaAvisos"
import { listarCuentas } from "../../utils/userNames"
import { acceso, actorDe, exigir, idSchema, ruta, validar } from "./comun"

const router = Router()

// ─── Evidencias: en disco, bajo UPLOAD_DIR/mesa, y solo se descargan por la API ──
// (app.ts bloquea /uploads/mesa en el estático público).
export const DIR_EVIDENCIAS = path.resolve(env.UPLOAD_DIR, "mesa")

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(DIR_EVIDENCIAS, { recursive: true })
      cb(null, DIR_EVIDENCIAS)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10)
      cb(null, `${crypto.randomUUID()}${ext}`)
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
})
const adjuntos = upload.array("evidencias", 10)

function archivosDe(req: Request): Express.Multer.File[] {
  return (req.files as Express.Multer.File[] | undefined) ?? []
}

/** Si la petición no prospera, los archivos que multer ya guardó no deben quedar huérfanos. */
function descartar(files: Express.Multer.File[]): void {
  for (const f of files) fs.rm(f.path, { force: true }, () => {})
}

function filasEvidencia(files: Express.Multer.File[], ticketId: number, actor: { id: number; nombre: string }, mensajeId?: number) {
  return files.map((f) => ({
    ticketId,
    mensajeId,
    nombreArchivo: f.originalname.slice(0, 200),
    ruta: f.filename,
    tipo: f.mimetype.slice(0, 100),
    tamano: f.size,
    subidoPorId: actor.id,
    subidoPorNombre: actor.nombre,
  }))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ACCIONES: AccionMesa[] = ["ver", "comentar", "evidencia", "ver_internas", "nota_interna", "asignar", "estado", "categoria", "eliminar", "redirigir", "sumar_responsable"]

async function cargar(id: number) {
  const ticket = await prisma.mesaTicket.findUnique({ where: { id }, include: { responsables: true } })
  if (!ticket) throw new MesaError(404, "No encontramos ese ticket")
  const paraAcceso: TicketParaAcceso = {
    creadorId: ticket.creadorId,
    areaId: ticket.areaId,
    eliminadoEn: ticket.eliminadoEn,
    responsableIds: ticket.responsables.map((r) => r.userId),
  }
  return { ticket, paraAcceso }
}

function historial(ticketId: number, actor: { id: number; nombre: string }, accion: string, detalle?: Prisma.InputJsonValue) {
  return prisma.mesaHistorial.create({ data: { ticketId, actorId: actor.id, actorNombre: actor.nombre, accion, detalle } })
}

// ─── Lista y resumen ────────────────────────────────────────────────────────

const radicadoSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)
const vistaSchema = z.enum(["mias", "area", "todas", "eliminados"]).default("mias")
const cierto = z.literal("true").optional()

const listaSchema = z.object({
  vista: vistaSchema,
  estado: z.enum(["abierto", "en_espera", "cerrado", "activos"]).optional(),
  areaId: idSchema.optional(),
  sinAsignar: cierto,
  asignadoAMi: cierto,
  sinRespuesta: cierto,
  q: z.string().trim().min(1).max(120).optional(),
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(50),
})

function whereDe(req: Request, vista: z.infer<typeof vistaSchema>): Prisma.MesaTicketWhereInput {
  const filtro = filtroLista(acceso(req), vista)
  if (!filtro.ok) throw new MesaError(filtro.status, filtro.error)
  return filtro.where
}

router.get("/tickets", ruta(async (req, res) => {
  const f = validar(listaSchema, req.query)
  const extras: Prisma.MesaTicketWhereInput[] = []
  if (f.estado) extras.push(f.estado === "activos" ? { estado: { not: "cerrado" } } : { estado: f.estado })
  if (f.areaId) extras.push({ areaId: f.areaId })
  if (f.sinAsignar) extras.push({ responsables: { none: {} } })
  if (f.sinRespuesta) extras.push({ primeraRespuestaEn: null })
  if (f.asignadoAMi) extras.push({ responsables: { some: { userId: acceso(req).userId } } })
  if (f.q) extras.push({ OR: [{ asunto: { contains: f.q, mode: "insensitive" } }, { codigo: { contains: f.q, mode: "insensitive" } }] })
  const where: Prisma.MesaTicketWhereInput = { AND: [whereDe(req, f.vista), ...extras] }
  const [total, items] = await Promise.all([
    prisma.mesaTicket.count({ where }),
    prisma.mesaTicket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (f.pagina - 1) * f.limite,
      take: f.limite,
      include: {
        categoria: { select: { id: true, nombre: true } },
        responsables: { select: { userId: true, nombre: true }, orderBy: { asignadoEn: "asc" } },
      },
    }),
  ])
  res.json({ total, pagina: f.pagina, limite: f.limite, items })
}))

// GET /resumen?vista= — contadores de las pestañas de la bandeja
router.get("/resumen", ruta(async (req, res) => {
  const f = validar(z.object({ vista: vistaSchema, areaId: idSchema.optional() }), req.query)
  const base: Prisma.MesaTicketWhereInput = f.areaId ? { AND: [whereDe(req, f.vista), { areaId: f.areaId }] } : whereDe(req, f.vista)
  const [porEstado, sinAsignar, asignadosAMi, sinRespuesta] = await Promise.all([
    prisma.mesaTicket.groupBy({ by: ["estado"], where: base, _count: { _all: true } }),
    prisma.mesaTicket.count({ where: { AND: [base, { estado: { not: "cerrado" } }, { responsables: { none: {} } }] } }),
    prisma.mesaTicket.count({ where: { AND: [base, { estado: { not: "cerrado" } }, { responsables: { some: { userId: acceso(req).userId } } }] } }),
    prisma.mesaTicket.count({ where: { AND: [base, { estado: { not: "cerrado" } }, { primeraRespuestaEn: null }] } }),
  ])
  const n = (estado: string) => porEstado.find((g) => g.estado === estado)?._count._all ?? 0
  res.json({ abierto: n("abierto"), en_espera: n("en_espera"), cerrado: n("cerrado"), sinAsignar, asignadosAMi, sinRespuesta })
}))

// GET /panorama — tickets por área y estado, para la vista de administración (no son métricas:
// es cuánto hay en cada área ahora mismo). Solo admin.
router.get("/panorama", ruta(async (req, res) => {
  if (!acceso(req).esAdmin) throw new MesaError(403, "Solo administración ve el panorama entre áreas")
  const vivos: Prisma.MesaTicketWhereInput = { eliminadoEn: null }
  const activos: Prisma.MesaTicketWhereInput = { ...vivos, estado: { not: "cerrado" } }
  const [areas, porEstado, sinAsignar, sinRespuesta, eliminados] = await Promise.all([
    prisma.mesaArea.findMany({ orderBy: { nombre: "asc" }, select: { areaId: true, nombre: true, prefijo: true, recibeTickets: true } }),
    prisma.mesaTicket.groupBy({ by: ["areaId", "estado"], where: vivos, _count: { _all: true } }),
    prisma.mesaTicket.groupBy({ by: ["areaId"], where: { ...activos, responsables: { none: {} } }, _count: { _all: true } }),
    prisma.mesaTicket.groupBy({ by: ["areaId"], where: { ...activos, primeraRespuestaEn: null }, _count: { _all: true } }),
    prisma.mesaTicket.count({ where: { eliminadoEn: { not: null } } }),
  ])
  const de = (filas: { areaId: number; _count: { _all: number } }[], areaId: number) => filas.find((f) => f.areaId === areaId)?._count._all ?? 0
  const estado = (areaId: number, e: string) => porEstado.find((f) => f.areaId === areaId && f.estado === e)?._count._all ?? 0
  res.json({
    eliminados,
    areas: areas.map((a) => ({
      ...a,
      abierto: estado(a.areaId, "abierto"),
      en_espera: estado(a.areaId, "en_espera"),
      cerrado: estado(a.areaId, "cerrado"),
      sinAsignar: de(sinAsignar, a.areaId),
      sinRespuesta: de(sinRespuesta, a.areaId),
    })),
  })
}))

// GET /yo — qué es quien llama en la mesa (para que la pantalla muestre lo que le corresponde;
// los permisos de verdad se revisan en cada acción)
router.get("/yo", ruta(async (req, res) => {
  const { esAdmin, esLider, esSac, areaIds } = acceso(req)
  res.json({ esAdmin, esLider, esSac, areaIds })
}))

// GET /por-radicado/:radicado — tickets internos que nacieron de un caso de la Central,
// solo los que quien llama puede ver (los creó, son de su área o es responsable; el admin, todos)
router.get("/por-radicado/:radicado", ruta(async (req, res) => {
  const radicado = validar(radicadoSchema, req.params.radicado)
  const quien = acceso(req)
  const visibles: Prisma.MesaTicketWhereInput = quien.esAdmin
    ? { eliminadoEn: null }
    : { OR: [whereDe(req, "mias"), whereDe(req, "area")] }
  const tickets = await prisma.mesaTicket.findMany({
    where: { AND: [{ radicadoOrigen: radicado }, visibles] },
    orderBy: { id: "asc" },
    select: { id: true, codigo: true, asunto: true, estado: true, areaNombre: true, createdAt: true },
  })
  res.json(tickets)
}))

// ─── Crear ──────────────────────────────────────────────────────────────────

const crearSchema = z.object({
  areaId: idSchema,
  categoriaId: idSchema.optional(),
  asunto: z.string().trim().min(3).max(160),
  descripcion: z.string().trim().min(1).max(8000),
  prioridad: z.enum(["alta", "media", "baja"]).optional(),
  // Caso de la Central de tickets que origina este ticket interno (solo SAC o admin)
  radicadoOrigen: radicadoSchema.optional(),
})

async function exigirCategoriaDe(areaId: number, categoriaId: number): Promise<void> {
  const cat = await prisma.mesaCategoria.findUnique({ where: { id: categoriaId } })
  if (!cat || cat.areaId !== areaId || !cat.activa) throw new MesaError(400, "Esa categoría no pertenece al área")
}

router.post("/tickets", adjuntos, ruta(async (req, res) => {
  const files = archivosDe(req)
  try {
    const body = validar(crearSchema, req.body)
    const quien = acceso(req)
    if (body.radicadoOrigen && !quien.esAdmin && !quien.esSac) throw new MesaError(403, "Solo Servicio al Cliente puede enlazar un caso de la Central")
    const area = await prisma.mesaArea.findUnique({ where: { areaId: body.areaId } })
    if (!area || !area.recibeTickets) throw new MesaError(400, "Esa área no recibe solicitudes")
    if (body.categoriaId) await exigirCategoriaDe(body.areaId, body.categoriaId)
    const actor = await actorDe(req)
    const ticket = await crearTicketConCodigo({
      ...body,
      creadorId: actor.id,
      creadorNombre: actor.nombre,
      creadorEmail: actor.email,
      creadorArea: req.user?.area ?? null,
      creadorSede: req.user?.sede ?? null,
    })
    await prisma.$transaction([
      prisma.mesaEvidencia.createMany({ data: filasEvidencia(files, ticket.id, actor) }),
      historial(ticket.id, actor, "creado"),
    ])
    await avisar(ticket, "nuevo", `${actor.nombre} le pidió a ${ticket.areaNombre}: ${ticket.asunto}`, { actorId: actor.id })
    res.status(201).json(ticket)
  } catch (err) {
    descartar(files)
    throw err
  }
}))

// ─── Detalle ────────────────────────────────────────────────────────────────

router.get("/tickets/:id", ruta(async (req, res) => {
  const id = validar(idSchema, req.params.id)
  const { paraAcceso } = await cargar(id)
  const quien = acceso(req)
  exigir(decidirMesa(quien, "ver", paraAcceso))
  const ticket = await prisma.mesaTicket.findUniqueOrThrow({
    where: { id },
    include: {
      categoria: { select: { id: true, nombre: true } },
      responsables: { orderBy: { asignadoEn: "asc" } },
      mensajes: { orderBy: { createdAt: "asc" } },
      evidencias: { orderBy: { createdAt: "asc" }, select: { id: true, mensajeId: true, nombreArchivo: true, tipo: true, tamano: true, subidoPorNombre: true, createdAt: true } },
      historial: { orderBy: { createdAt: "asc" } },
    },
  })
  // Las notas internas (y lo que traen adjunto) son solo de quien gestiona el ticket
  if (!decidirMesa(quien, "ver_internas", paraAcceso).ok) {
    const internos = new Set(ticket.mensajes.filter((m) => m.interno).map((m) => m.id))
    ticket.mensajes = ticket.mensajes.filter((m) => !m.interno)
    ticket.evidencias = ticket.evidencias.filter((e) => e.mensajeId === null || !internos.has(e.mensajeId))
  }
  const permisos = Object.fromEntries(ACCIONES.map((a) => [a, decidirMesa(quien, a, paraAcceso).ok]))
  res.json({ ...ticket, relacion: relacionCon(quien, paraAcceso), permisos })
}))

// GET /evidencias/:id — descarga con sesión (nunca por URL pública)
router.get("/evidencias/:id", ruta(async (req, res) => {
  const id = validar(idSchema, req.params.id)
  const ev = await prisma.mesaEvidencia.findUnique({ where: { id }, include: { mensaje: { select: { interno: true } } } })
  if (!ev) throw new MesaError(404, "No encontramos ese archivo")
  const { paraAcceso } = await cargar(ev.ticketId)
  exigir(decidirMesa(acceso(req), ev.mensaje?.interno ? "ver_internas" : "ver", paraAcceso))
  const archivo = path.join(DIR_EVIDENCIAS, path.basename(ev.ruta))
  if (!fs.existsSync(archivo)) throw new MesaError(404, "El archivo ya no está disponible")
  res.download(archivo, ev.nombreArchivo)
}))

// ─── Mensajes (comentario público o nota interna), con evidencias opcionales ──

const mensajeSchema = z.object({
  texto: z.string().trim().min(1).max(4000),
  interno: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
})

router.post("/tickets/:id/mensajes", adjuntos, ruta(async (req, res) => {
  const files = archivosDe(req)
  try {
    const id = validar(idSchema, req.params.id)
    const body = validar(mensajeSchema, req.body)
    const { ticket, paraAcceso } = await cargar(id)
    const quien = acceso(req)
    exigir(decidirMesa(quien, body.interno ? "nota_interna" : "comentar", paraAcceso))
    if (files.length) exigir(decidirMesa(quien, "evidencia", paraAcceso))
    const esCreador = relacionCon(quien, paraAcceso) === "creador"
    // Cerrado: si escribe quien lo creó, se reabre solo; el área debe reabrirlo a propósito.
    if (ticket.estado === "cerrado" && !esCreador) throw new MesaError(409, "El ticket está cerrado: reábrelo para responder")
    const actor = await actorDe(req)
    const ahora = new Date()
    const cambios: Prisma.MesaTicketUpdateInput = { updatedAt: ahora }
    if (ticket.estado === "cerrado") Object.assign(cambios, { estado: "abierto", cerradoEn: null })
    if (!body.interno && !esCreador && !ticket.primeraRespuestaEn) cambios.primeraRespuestaEn = ahora
    const mensaje = await prisma.$transaction(async (tx) => {
      const m = await tx.mesaMensaje.create({ data: { ticketId: id, autorId: actor.id, autorNombre: actor.nombre, texto: body.texto, interno: body.interno } })
      await tx.mesaEvidencia.createMany({ data: filasEvidencia(files, id, actor, m.id) })
      await tx.mesaTicket.update({ where: { id }, data: cambios })
      if (ticket.estado === "cerrado") {
        await tx.mesaHistorial.create({ data: { ticketId: id, actorId: actor.id, actorNombre: actor.nombre, accion: "reabierto", detalle: { por: "respuesta de quien lo creó" } } })
      }
      return m
    })
    await avisar(
      ticket,
      body.interno ? "nota" : "respuesta",
      body.interno ? `${actor.nombre} dejó una nota interna en ${ticket.codigo}` : `${actor.nombre} respondió en ${ticket.codigo}`,
      { actorId: actor.id, incluirCreador: !body.interno }, // una nota interna nunca le llega a quien lo pidió
    )
    res.status(201).json(mensaje)
  } catch (err) {
    descartar(files)
    throw err
  }
}))

// ─── Estado y clasificación ─────────────────────────────────────────────────

const actualizarSchema = z
  .object({
    estado: z.enum(["abierto", "en_espera", "cerrado"]).optional(),
    categoriaId: idSchema.nullable().optional(),
    prioridad: z.enum(["alta", "media", "baja"]).nullable().optional(),
    venceEn: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0)

router.patch("/tickets/:id", ruta(async (req, res) => {
  const id = validar(idSchema, req.params.id)
  const body = validar(actualizarSchema, req.body)
  const { ticket, paraAcceso } = await cargar(id)
  const quien = acceso(req)
  const { estado, ...clasificacion } = body
  if (estado !== undefined) exigir(decidirMesa(quien, "estado", paraAcceso))
  if (Object.keys(clasificacion).length) exigir(decidirMesa(quien, "categoria", paraAcceso))
  if (body.categoriaId) await exigirCategoriaDe(ticket.areaId, body.categoriaId)
  const actor = await actorDe(req)
  const data: Prisma.MesaTicketUncheckedUpdateInput = {
    ...clasificacion,
    venceEn: body.venceEn === undefined ? undefined : body.venceEn && new Date(body.venceEn),
  }
  const cambiaEstado = estado !== undefined && estado !== ticket.estado
  if (cambiaEstado) Object.assign(data, { estado, cerradoEn: estado === "cerrado" ? new Date() : null })
  const [actualizado] = await prisma.$transaction([
    prisma.mesaTicket.update({ where: { id }, data }),
    ...(cambiaEstado ? [historial(id, actor, "estado", { de: ticket.estado, a: estado })] : []),
    ...(Object.keys(clasificacion).length ? [historial(id, actor, "clasificado", clasificacion)] : []),
  ])
  if (cambiaEstado && estado === "cerrado") await avisar(ticket, "cierre", `${actor.nombre} cerró ${ticket.codigo}`, { actorId: actor.id, incluirCreador: true })
  res.json(actualizado)
}))

// ─── Responsables ───────────────────────────────────────────────────────────

router.post("/tickets/:id/responsables", ruta(async (req, res) => {
  const id = validar(idSchema, req.params.id)
  const { userId } = validar(z.object({ userId: idSchema }), req.body)
  const { ticket, paraAcceso } = await cargar(id)
  const quien = acceso(req)
  exigir(decidirMesa(quien, "ver", paraAcceso))
  // El nombre y el correo salen del backend Python, no de lo que mande el navegador.
  const delArea = (await cuentasDeArea(ticket.areaNombre)).find((c) => c.id === userId)
  const tomarlo = userId === quien.userId && relacionCon(quien, paraAcceso) === "area" // "lo tomo yo", también con área adicional
  let persona: { id: number; nombre: string; email: string; area: string | null }
  if (delArea) {
    exigir(decidirMesa(quien, "asignar", paraAcceso))
    persona = delArea
  } else if (tomarlo) {
    const yo = await actorDe(req)
    persona = { ...yo, area: req.user?.area ?? null }
  } else {
    exigir(decidirMesa(quien, "sumar_responsable", paraAcceso))
    const cuenta = (await listarCuentas()).find((c) => c.id === userId)
    if (!cuenta) throw new MesaError(404, "No encontramos esa cuenta activa")
    persona = { ...cuenta, area: null }
  }
  const actor = await actorDe(req)
  try {
    const [responsable] = await prisma.$transaction([
      prisma.mesaResponsable.create({ data: { ticketId: id, userId: persona.id, nombre: persona.nombre, email: persona.email, area: persona.area, asignadoPor: actor.nombre } }),
      historial(id, actor, "asignado", { a: persona.nombre, deOtraArea: !delArea && !tomarlo }),
      prisma.mesaTicket.update({ where: { id }, data: { updatedAt: new Date() } }),
    ])
    await avisar(ticket, "asignacion", `${actor.nombre} te asignó ${ticket.codigo}: ${ticket.asunto}`, { actorId: actor.id, soloEstos: [persona.id] })
    res.status(201).json(responsable)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new MesaError(409, "Esa persona ya es responsable del ticket")
    throw err
  }
}))

router.delete("/tickets/:id/responsables/:userId", ruta(async (req, res) => {
  const id = validar(idSchema, req.params.id)
  const userId = validar(idSchema, req.params.userId)
  const { ticket, paraAcceso } = await cargar(id)
  exigir(decidirMesa(acceso(req), "asignar", paraAcceso))
  const actual = ticket.responsables.find((r) => r.userId === userId)
  if (!actual) throw new MesaError(404, "Esa persona no es responsable del ticket")
  const actor = await actorDe(req)
  await prisma.$transaction([
    prisma.mesaResponsable.delete({ where: { id: actual.id } }),
    historial(id, actor, "desasignado", { a: actual.nombre }),
  ])
  res.status(204).end()
}))

// ─── Redirigir a otra área (Servicio al Cliente) ────────────────────────────

router.post("/tickets/:id/redirigir", ruta(async (req, res) => {
  const id = validar(idSchema, req.params.id)
  const body = validar(z.object({ areaId: idSchema, nota: z.string().trim().min(1).max(500).optional(), responsableId: idSchema.optional() }), req.body)
  const { ticket, paraAcceso } = await cargar(id)
  exigir(decidirMesa(acceso(req), "redirigir", paraAcceso))
  if (body.areaId === ticket.areaId) throw new MesaError(400, "El ticket ya está en esa área")
  const destino = await prisma.mesaArea.findUnique({ where: { areaId: body.areaId } })
  if (!destino || !destino.recibeTickets) throw new MesaError(400, "Esa área no recibe solicitudes")
  // Servicio al Cliente puede redirigirlo ya con nombre: debe ser alguien del área destino
  const nuevo = body.responsableId ? (await cuentasDeArea(destino.nombre)).find((c) => c.id === body.responsableId) : undefined
  if (body.responsableId && !nuevo) throw new MesaError(400, "Esa persona no es del área a la que rediriges")
  const actor = await actorDe(req)
  // El consecutivo no cambia (es la identidad del ticket). La categoría y los
  // responsables eran del área anterior: se limpian para que la nueva lo reciba en limpio.
  const [actualizado] = await prisma.$transaction([
    prisma.mesaTicket.update({ where: { id }, data: { areaId: destino.areaId, areaNombre: destino.nombre, categoriaId: null } }),
    prisma.mesaResponsable.deleteMany({ where: { ticketId: id } }),
    historial(id, actor, "redirigido", { de: ticket.areaNombre, a: destino.nombre, nota: body.nota ?? null, responsable: nuevo?.nombre ?? null }),
    ...(nuevo ? [prisma.mesaResponsable.create({ data: { ticketId: id, userId: nuevo.id, nombre: nuevo.nombre, email: nuevo.email, area: nuevo.area, asignadoPor: actor.nombre } })] : []),
  ])
  // Con nombre: solo a esa persona. Sin nombre: a toda el área nueva. Y a quien lo pidió, siempre.
  await avisar(actualizado, "redireccion", `${actor.nombre} redirigió ${ticket.codigo} a ${destino.nombre}: ${ticket.asunto}`, { actorId: actor.id, incluirCreador: true })
  res.json(actualizado)
}))

// ─── Eliminar (borrado lógico; el registro queda para el admin) ─────────────

router.delete("/tickets/:id", ruta(async (req, res) => {
  const id = validar(idSchema, req.params.id)
  const { motivo } = validar(z.object({ motivo: z.string().trim().min(3).max(300) }), req.body)
  const { paraAcceso } = await cargar(id)
  exigir(decidirMesa(acceso(req), "eliminar", paraAcceso)) // uno ya eliminado: 404 para todos menos el admin (403)
  const actor = await actorDe(req)
  await prisma.$transaction([
    prisma.mesaTicket.update({ where: { id }, data: { eliminadoEn: new Date(), eliminadoPorId: actor.id, eliminadoPorNombre: actor.nombre, motivoEliminacion: motivo } }),
    historial(id, actor, "eliminado", { motivo }),
  ])
  res.status(204).end()
}))

export default router
