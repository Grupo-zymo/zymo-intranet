// Mesa de ayuda — configuración: áreas que reciben tickets, categorías por
// área, metas del líder y personas asignables. Montado en /api/mesa.

import { Router } from "express"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../../config/prisma"
import { esLiderDe } from "../../services/mesaAuth"
import { MesaError, areasDelPanel, cuentasDeArea } from "../../services/mesaIntranet"
import { calcularTablero } from "../../services/mesaTablero"
import { listarCuentas } from "../../utils/userNames"
import { acceso, actorDe, idSchema, ruta, validar } from "./comun"

const router = Router()

function soloAdmin(esAdmin: boolean): void {
  if (!esAdmin) throw new MesaError(403, "Solo administración configura las áreas de la mesa de ayuda")
}

function unico(err: unknown, mensaje: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new MesaError(409, mensaje)
  throw err
}

// GET /areas — áreas que reciben tickets, con sus categorías activas (formulario de nueva solicitud).
// Con ?todas=true el admin ve también las áreas desactivadas y todas las categorías; el líder ve
// las categorías inactivas solo de sus áreas (para poder reactivarlas).
router.get("/areas", ruta(async (req, res) => {
  const quien = acceso(req)
  const pideTodas = req.query.todas === "true"
  const todas = pideTodas && quien.esAdmin
  const areas = await prisma.mesaArea.findMany({
    where: todas ? {} : { recibeTickets: true },
    include: { categorias: { orderBy: [{ orden: "asc" }, { nombre: "asc" }] } },
    orderBy: { nombre: "asc" },
  })
  res.json(areas.map((a) => ({
    ...a,
    categorias: todas || (pideTodas && esLiderDe(quien, a.areaId)) ? a.categorias : a.categorias.filter((c) => c.activa),
  })))
}))

// GET /areas-panel — áreas del panel admin, para elegir cuáles reciben tickets (solo admin).
router.get("/areas-panel", ruta(async (req, res) => {
  soloAdmin(acceso(req).esAdmin)
  res.json(await areasDelPanel(req.headers.authorization))
}))

const areaSchema = z.object({
  prefijo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/),
  recibeTickets: z.boolean().optional(),
  esSac: z.boolean().optional(),
})

// PUT /areas/:areaId — activa o actualiza un área de la mesa (solo admin).
// El nombre NO viene del navegador: se toma del panel admin.
router.put("/areas/:areaId", ruta(async (req, res) => {
  soloAdmin(acceso(req).esAdmin)
  const areaId = validar(idSchema, req.params.areaId)
  const body = validar(areaSchema, req.body)
  const delPanel = (await areasDelPanel(req.headers.authorization)).find((a) => a.id === areaId)
  if (!delPanel) throw new MesaError(404, "Esa área no existe en el panel de administración")
  const datos = { nombre: delPanel.name, prefijo: body.prefijo, recibeTickets: body.recibeTickets ?? true, esSac: body.esSac ?? false }
  try {
    res.json(await prisma.mesaArea.upsert({ where: { areaId }, create: { areaId, ...datos }, update: datos }))
  } catch (err) {
    unico(err, `El prefijo ${body.prefijo} ya lo usa otra área`)
  }
}))

/** Categorías: las maneja el admin o el líder de esa área. */
async function exigirGestionDeArea(req: Parameters<typeof acceso>[0], areaId: number): Promise<void> {
  const quien = acceso(req)
  if (!quien.esAdmin && !esLiderDe(quien, areaId)) throw new MesaError(403, "Solo el líder del área o administración puede cambiar esto")
  if (!(await prisma.mesaArea.findUnique({ where: { areaId }, select: { areaId: true } }))) {
    throw new MesaError(404, "Esa área todavía no está activa en la mesa de ayuda")
  }
}

const nombreCategoria = z.string().trim().min(2).max(60)

// POST /areas/:areaId/categorias
router.post("/areas/:areaId/categorias", ruta(async (req, res) => {
  const areaId = validar(idSchema, req.params.areaId)
  await exigirGestionDeArea(req, areaId)
  const { nombre } = validar(z.object({ nombre: nombreCategoria }), req.body)
  try {
    res.status(201).json(await prisma.mesaCategoria.create({ data: { areaId, nombre } }))
  } catch (err) {
    unico(err, "Esa categoría ya existe en el área")
  }
}))

// PATCH /categorias/:id — renombrar, activar/desactivar u ordenar. No se borran: los tickets viejos las siguen mostrando.
router.patch("/categorias/:id", ruta(async (req, res) => {
  const id = validar(idSchema, req.params.id)
  const cambios = validar(
    z.object({ nombre: nombreCategoria.optional(), activa: z.boolean().optional(), orden: z.number().int().min(0).max(999).optional() })
      .refine((v) => Object.keys(v).length > 0),
    req.body,
  )
  const actual = await prisma.mesaCategoria.findUnique({ where: { id } })
  if (!actual) throw new MesaError(404, "No encontramos esa categoría")
  await exigirGestionDeArea(req, actual.areaId)
  try {
    res.json(await prisma.mesaCategoria.update({ where: { id }, data: cambios }))
  } catch (err) {
    unico(err, "Esa categoría ya existe en el área")
  }
}))

const horas = z.number().int().min(1).max(24 * 90).nullable()

// PUT /areas/:areaId/metas — las define el líder del área (el admin solo consulta).
router.put("/areas/:areaId/metas", ruta(async (req, res) => {
  const areaId = validar(idSchema, req.params.areaId)
  if (!esLiderDe(acceso(req), areaId)) throw new MesaError(403, "Las metas las define el líder del área")
  const body = validar(z.object({ metaPrimeraRespuestaH: horas, metaCierreH: horas }), req.body)
  if (!(await prisma.mesaArea.findUnique({ where: { areaId }, select: { areaId: true } }))) {
    throw new MesaError(404, "Esa área todavía no está activa en la mesa de ayuda")
  }
  const actor = await actorDe(req)
  res.json(await prisma.mesaArea.update({
    where: { areaId },
    data: { ...body, metasActualizadasPor: actor.nombre, metasActualizadasEn: new Date() },
  }))
}))

// GET /areas/:areaId/tablero?dias=7|30|90 — indicadores del área contra sus metas. Solo su líder.
router.get("/areas/:areaId/tablero", ruta(async (req, res) => {
  const areaId = validar(idSchema, req.params.areaId)
  if (!esLiderDe(acceso(req), areaId)) throw new MesaError(403, "El tablero es del líder del área")
  const { dias } = validar(z.object({ dias: z.coerce.number().refine((d) => [7, 30, 90].includes(d)).default(30) }), req.query)
  const area = await prisma.mesaArea.findUnique({ where: { areaId } })
  if (!area) throw new MesaError(404, "Esa área todavía no está activa en la mesa de ayuda")
  const desde = new Date(Date.now() - dias * 86_400_000)
  // Lo pendiente de ahora + lo creado o cerrado en el período (lo viejo ya cerrado no aporta)
  const tickets = await prisma.mesaTicket.findMany({
    where: { areaId, eliminadoEn: null, OR: [{ estado: { not: "cerrado" } }, { createdAt: { gte: desde } }, { cerradoEn: { gte: desde } }] },
    select: { estado: true, createdAt: true, primeraRespuestaEn: true, cerradoEn: true, categoria: { select: { nombre: true } }, responsables: { select: { nombre: true } } },
  })
  const tablero = calcularTablero(
    tickets.map((t) => ({ ...t, categoria: t.categoria?.nombre ?? null, responsables: t.responsables.map((r) => r.nombre) })),
    { primeraRespuestaH: area.metaPrimeraRespuestaH, cierreH: area.metaCierreH },
    dias,
  )
  res.json({ area: { areaId: area.areaId, nombre: area.nombre, metasActualizadasPor: area.metasActualizadasPor, metasActualizadasEn: area.metasActualizadasEn }, ...tablero })
}))

// GET /usuarios?areaId= — a quién se le puede asignar. Con areaId: el equipo de esa
// área (para quien la gestiona). Sin areaId: todas las cuentas activas (solo SAC y
// admin, que suman responsables de otras áreas).
router.get("/usuarios", ruta(async (req, res) => {
  const quien = acceso(req)
  if (req.query.areaId === undefined) {
    if (!quien.esAdmin && !quien.esSac) throw new MesaError(403, "Solo Servicio al Cliente puede sumar personas de otras áreas")
    res.json(await listarCuentas())
    return
  }
  const areaId = validar(idSchema, req.query.areaId)
  if (!quien.esAdmin && !quien.esSac && !quien.areaIds.includes(areaId)) throw new MesaError(403, "Solo puedes ver el equipo de tu área")
  const area = await prisma.mesaArea.findUnique({ where: { areaId } })
  if (!area) throw new MesaError(404, "Esa área todavía no está activa en la mesa de ayuda")
  const cuentas = await cuentasDeArea(area.nombre)
  res.json(cuentas.map((c) => ({ id: c.id, nombre: c.nombre, email: c.email, cargo: c.cargo })))
}))

export default router
