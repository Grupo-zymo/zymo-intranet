import { Router, Request, Response } from "express"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import prisma from "../config/prisma"
import { getUserId, requireSigAccess } from "../middleware/auth"
import { fueraDeArea } from "../middleware/gateLider"
import { avisarLideresDelArea } from "../services/avisosLider"
import {
  DISPOSICIONES, TIPOS, alertasDe, codigoEnTexto, normalizarCodigo, repetidosDe, revisarCodigo, siguienteCodigo,
  textoAvisoListado, tipoDeTexto, type Alerta, type EventoListado,
} from "../services/listadoMaestro"
import { resolveActorName } from "../utils/userNames"

// Listado maestro de documentos (reemplaza el Excel FR-002-SIG). Escriben admin, gerente y mod_sig; los líderes
// (`req.sigAreaIds`) y mod_sig_subir solo leen: la puerta (middleware/gateLider.ts) no les deja pasar a las escrituras.
// Contrato: docs/superpowers/plans/2026-11-27-sig-listado-maestro.md, «Contrato de la API».
const router = Router()

type Documento = {
  tipo: "procedimiento" | "instructivo" | "protocolo" | "formato" | "anexo"
  id: number; codigo: string; titulo: string
  procedimiento: { id: number; codigo: string; titulo: string; areaId: number }
}
type HistorialItem = { fecha: string; quien: string; accion: "creado" | "cambiado" | "area" | "baja" | "reactivado" | "importado"; detalle?: string }
const conArea = { area: { select: { id: true, nombre: true, sigla: true } } } as const
type FilaConArea = Prisma.SigListadoMaestroGetPayload<{ include: typeof conArea }>

const err = (res: Response, status: number, error: string, campo?: string) => { res.status(status).json(campo ? { error, campo } : { error }) }

// ── Lectura: cruce con lo cargado en el SIG ──

/** Llave del cruce: el documento de una fila se busca SOLO en su propia área (un código repetido en otra área no es suyo,
 *  y a un líder no se le muestran títulos de otras áreas). */
const llaveDoc = (areaId: number, codigo: string) => `${areaId}|${normalizarCodigo(codigo)}`

/**
 * Todos los documentos vigentes del SIG con el código que se les encuentra: procedimientos, instructivos y protocolos por su
 * campo `codigo`; formatos y anexos por el código al inicio del nombre o del archivo. No cuentan los procedimientos
 * obsoletos ni lo rechazado; si hay varios con el mismo código en el área, gana el aprobado.
 * ponytail: lee las cinco tablas y el listado completos en cada consulta (hoy cientos de filas); con miles, filtrar por código en SQL.
 */
async function documentosDelSig() {
  const proc = { select: { id: true, codigo: true, titulo: true, areaId: true } } as const
  const vigente = { estado: { not: "RECHAZADO" as const } }
  const [procs, inst, prot, form, anex] = await Promise.all([
    prisma.sigProcedimiento.findMany({ where: { estado: { not: "OBSOLETO" } }, ...proc }),
    prisma.sigInstructivo.findMany({ where: { activo: true, ...vigente }, select: { id: true, codigo: true, titulo: true, estado: true, procedimiento: proc } }),
    prisma.sigProtocolo.findMany({ where: { activo: true }, select: { id: true, codigo: true, titulo: true, procedimiento: proc } }),
    prisma.sigFormato.findMany({ where: vigente, select: { id: true, nombre: true, nombreArchivo: true, estado: true, procedimiento: proc } }),
    prisma.sigDocAnexo.findMany({ where: vigente, select: { id: true, nombre: true, nombreArchivo: true, estado: true, procedimiento: proc } }),
  ])
  const pendiente = new Set<Documento>() // subidos por un líder y aún sin verificar: cuentan, pero ceden ante uno aprobado
  const conCodigo: Documento[] = [
    ...procs.map((p) => ({ tipo: "procedimiento" as const, id: p.id, codigo: p.codigo, titulo: p.titulo, procedimiento: p })),
    ...prot.map((p) => ({ tipo: "protocolo" as const, id: p.id, codigo: p.codigo, titulo: p.titulo, procedimiento: p.procedimiento })),
  ]
  for (const i of inst) {
    const d: Documento = { tipo: "instructivo", id: i.id, codigo: i.codigo, titulo: i.titulo, procedimiento: i.procedimiento }
    if (i.estado === "PENDIENTE_REVISION") pendiente.add(d)
    conCodigo.push(d)
  }
  const sinCodigo: number[] = [] // área de cada formato o anexo al que no se le encuentra código
  for (const [tipo, filas] of [["formato", form], ["anexo", anex]] as const) {
    for (const f of filas) {
      const codigo = codigoEnTexto(f.nombre) ?? codigoEnTexto(f.nombreArchivo)
      if (!codigo) { sinCodigo.push(f.procedimiento.areaId); continue }
      const d: Documento = { tipo, id: f.id, codigo, titulo: f.nombre, procedimiento: f.procedimiento }
      if (f.estado === "PENDIENTE_REVISION") pendiente.add(d)
      conCodigo.push(d)
    }
  }
  const porCodigo = new Map<string, Documento>()
  for (const d of [...conCodigo].sort((a, b) => Number(pendiente.has(a)) - Number(pendiente.has(b)))) {
    const k = llaveDoc(d.procedimiento.areaId, d.codigo)
    if (!porCodigo.has(k)) porCodigo.set(k, d)
  }
  return { conCodigo, porCodigo, sinCodigo }
}

async function contexto() {
  const [todas, docs] = await Promise.all([
    prisma.sigListadoMaestro.findMany({ include: conArea }),
    documentosDelSig(),
  ])
  return { todas, docs, repetidos: repetidosDe(todas) }
}
type Contexto = Awaited<ReturnType<typeof contexto>>

const ordenTipo = (tipo: string) => { const i = TIPOS.findIndex((t) => t.tipo === tipo); return i < 0 ? TIPOS.length : i }

/**
 * Una fila tal como la pide el contrato: sin el área anidada, con sus alertas y el documento de su área que tiene su código.
 * Al líder de área (`req.sigAreaIds`) no se le envía la ubicación: es el «espacio exclusivo del SIG» del FR-002-SIG
 * (enlaces a SharePoint con el original), y él solo consulta en pantalla, sin descargar.
 */
function vestir({ area, ...fila }: FilaConArea, ctx: Contexto, esLider = false) {
  return {
    ...fila,
    ...(esLider ? { ubicacion: null } : {}),
    alertas: alertasDe(fila, area.sigla, ctx.repetidos),
    documento: ctx.docs.porCodigo.get(llaveDoc(fila.areaId, fila.codigo)) ?? null,
  }
}

async function responderFila(res: Response, id: number, status = 200) {
  const ctx = await contexto()
  const fila = ctx.todas.find((f) => f.id === id)
  if (!fila) { err(res, 404, "Fila no encontrada"); return }
  res.status(status).json(vestir(fila, ctx)) // responde a escrituras: solo admin, gerente y mod_sig
}

// GET /api/listado-maestro/areas — carpetas con su conteo de filas vigentes y de filas con alertas
router.get("/areas", async (req: Request, res: Response) => {
  const [areas, filas] = await Promise.all([
    prisma.sigArea.findMany({
      where: req.sigAreaIds ? { id: { in: req.sigAreaIds } } : {},
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, color: true, sigla: true },
    }),
    prisma.sigListadoMaestro.findMany({ select: { areaId: true, codigo: true, tipo: true, estado: true } }),
  ])
  const repetidos = repetidosDe(filas)
  res.json(areas.map((a) => {
    const propias = filas.filter((f) => f.areaId === a.id)
    return {
      ...a,
      total: propias.filter((f) => f.estado !== "BAJA").length,
      conAlertas: propias.filter((f) => alertasDe(f, a.sigla, repetidos).length > 0).length,
    }
  }))
})

// GET /api/listado-maestro?areaId=N (pantalla) · ?codigo=X (agente analista)
router.get("/", async (req: Request, res: Response) => {
  if (typeof req.query.codigo === "string" && req.query.codigo.trim()) {
    const codigo = normalizarCodigo(req.query.codigo)
    const ctx = await contexto()
    const filas = ctx.todas.filter((f) => f.codigo === codigo && !fueraDeArea(req, f.areaId))
    res.json({ codigo, filas: filas.map((f) => ({ ...vestir(f, ctx, !!req.sigAreaIds), area: f.area })) })
    return
  }

  const areaId = Number(req.query.areaId)
  if (!Number.isInteger(areaId) || areaId <= 0) { err(res, 400, "Indica el área (areaId) o un código (codigo).", "areaId"); return }
  const area = fueraDeArea(req, areaId) ? null
    : await prisma.sigArea.findUnique({ where: { id: areaId }, select: { id: true, nombre: true, color: true, sigla: true } })
  if (!area) { err(res, 404, "Área no encontrada", "areaId"); return }

  const ctx = await contexto()
  const filas = ctx.todas
    .filter((f) => f.areaId === areaId)
    .sort((a, b) => ordenTipo(a.tipo) - ordenTipo(b.tipo) || a.codigo.localeCompare(b.codigo))
    .map((f) => vestir(f, ctx, !!req.sigAreaIds))
  // un documento cuyo código no aparece en ninguna fila de ninguna área, aunque esté dada de baja
  const enListado = new Set(ctx.todas.map((f) => f.codigo))
  const fueraDelListado = ctx.docs.conCodigo.filter((d) => d.procedimiento.areaId === areaId && !enListado.has(normalizarCodigo(d.codigo)))
  const vigentes = filas.filter((f) => f.estado !== "BAJA")
  const con = (a: Alerta) => vigentes.filter((f) => f.alertas.includes(a)).length
  // el siguiente número libre por tipo: cuenta lo dado de baja y los códigos que ya tienen documentos cargados
  const usados = [...enListado, ...ctx.docs.conCodigo.map((d) => normalizarCodigo(d.codigo))]

  res.json({
    area,
    filas,
    fueraDelListado,
    resumen: {
      filas: vigentes.length,
      repetidos: con("repetido"),
      siglaArea: con("sigla_area"),
      forma: con("forma"),
      sinDocumento: vigentes.filter((f) => !f.documento).length,
      fueraDelListado: fueraDelListado.length,
      documentosSinCodigo: ctx.docs.sinCodigo.filter((id) => id === areaId).length,
    },
    siguientes: Object.fromEntries(TIPOS.map((t) => [t.tipo, siguienteCodigo(t.tipo, area.sigla, usados)])),
  })
})

// ── Escritura (admin, gerente, mod_sig) ──

const vacioANull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v)
const texto = (max: number) => z.preprocess(vacioANull, z.string().trim().max(max).nullish())
const fecha = z.preprocess(vacioANull, z.string().date("Fecha inválida: usa AAAA-MM-DD").nullish())
  .transform((v) => (v == null ? v : new Date(`${v}T00:00:00Z`)))
const anos = z.number().int().min(0).max(999).nullish()

const FilaSchema = z.object({
  areaId: z.number().int().positive(),
  tipo: z.string().max(30),
  codigo: z.string().max(30),
  nombre: z.string().trim().min(1, "Escribe el nombre del documento").max(300),
  empresa: texto(60),
  version: texto(20),
  fechaCreacion: fecha,
  fechaActualizacion: fecha,
  controlCambios: texto(5000),
  anosActivo: anos,
  anosInactivo: anos,
  disposicionFinal: z.preprocess(vacioANull, z.enum(DISPOSICIONES).nullish()),
  ubicacion: texto(2000),
  revisado: z.boolean().optional(),
  estado: z.enum(["APROBADO", "PENDIENTE"]).optional(),
})

function invalido(res: Response, e: z.ZodError) {
  const issue = e.issues[0]
  const campo = String(issue?.path[0] ?? "")
  err(res, 400, campo ? `Revisa «${campo}»: ${issue.message}` : "Datos inválidos", campo || undefined)
}

/** Tipo del catálogo y código normalizado, o el error para el formulario. */
function validarCodigo(tipoTexto: string, codigoTexto: string): { tipo: string; codigo: string } | { error: string; campo: "tipo" | "codigo" } {
  const tipo = tipoDeTexto(tipoTexto)
  if (!tipo) return { error: `El tipo «${tipoTexto}» no está en el catálogo del listado maestro.`, campo: "tipo" }
  const codigo = normalizarCodigo(codigoTexto)
  const problema = revisarCodigo(codigo, tipo)
  return problema ? { error: problema, campo: "codigo" } : { tipo, codigo }
}

type Tx = Prisma.TransactionClient

/**
 * Escribe solo si ninguna otra fila vigente (de cualquier área) usa ya ese código. El candado por código dentro de la
 * transacción evita que dos altas iguales a la vez pasen las dos (la base no tiene `@unique`: el Excel trae repetidos).
 */
async function sinRepetir<T>(codigo: string, idPropio: number | null, escribir: (tx: Tx) => Promise<T>): Promise<{ ok: T } | { usa: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${codigo}))`
    const otra = await tx.sigListadoMaestro.findFirst({
      where: { codigo, estado: { not: "BAJA" }, ...(idPropio ? { id: { not: idPropio } } : {}) },
      select: { id: true, nombre: true, area: { select: { nombre: true } } },
    })
    if (otra) return { usa: `El código ${codigo} ya lo usa «${otra.nombre}» (fila ${otra.id}) en el área ${otra.area.nombre}.` }
    return { ok: await escribir(tx) }
  }, { maxWait: 10_000 }) // los 2 s por defecto no alcanzan en frío (recién desplegado): la primera alta daba 500
}

async function quienEs(req: Request) {
  const id = getUserId(req.user!)
  return { id, nombre: await resolveActorName(id, req.user!.full_name) }
}

const entrada = (quien: string, accion: HistorialItem["accion"], detalle?: string): HistorialItem =>
  ({ fecha: new Date().toISOString(), quien, accion, ...(detalle ? { detalle } : {}) })

function avisar(areaId: number, actorId: number, e: EventoListado) {
  void avisarLideresDelArea({ areaId, texto: textoAvisoListado(e), actorId, url: `/sig-area?listado=${areaId}`, etiqueta: `sig-listado-${areaId}` })
}

// POST /api/listado-maestro — fila nueva
router.post("/", requireSigAccess, async (req: Request, res: Response) => {
  const parsed = FilaSchema.safeParse(req.body)
  if (!parsed.success) { invalido(res, parsed.error); return }
  const d = parsed.data
  const v = validarCodigo(d.tipo, d.codigo)
  if ("error" in v) { err(res, 400, v.error, v.campo); return }
  const area = await prisma.sigArea.findUnique({ where: { id: d.areaId }, select: { id: true } })
  if (!area) { err(res, 404, "Área no encontrada", "areaId"); return }
  const quien = await quienEs(req)

  const r = await sinRepetir(v.codigo, null, (tx) => tx.sigListadoMaestro.create({
    data: {
      ...d, tipo: v.tipo, codigo: v.codigo,
      creadoPor: quien.nombre, historial: [entrada(quien.nombre, "creado")],
    },
  }))
  if ("usa" in r) { err(res, 409, r.usa, "codigo"); return }
  avisar(d.areaId, quien.id, { accion: "creado", quien: quien.nombre, codigo: v.codigo, nombre: r.ok.nombre })
  await responderFila(res, r.ok.id, 201)
})

// PATCH /api/listado-maestro/:id — editar; cambiar código o área; un estado APROBADO|PENDIENTE reactiva una dada de baja
router.patch("/:id", requireSigAccess, async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const parsed = FilaSchema.partial().safeParse(req.body)
  if (!parsed.success) { invalido(res, parsed.error); return }
  const d = parsed.data
  // quién es se resuelve ANTES de leer la fila: es una llamada a la intranet y alargaría la ventana entre leer y escribir.
  // ponytail: sin bloqueo de fila; dos personas editando la MISMA fila en el mismo instante pueden pisarse el historial.
  const quien = await quienEs(req)
  const fila = Number.isInteger(id) ? await prisma.sigListadoMaestro.findUnique({ where: { id }, include: conArea }) : null
  if (!fila) { err(res, 404, "Fila no encontrada"); return }

  const tipoTexto = d.tipo ?? fila.tipo
  const codigoTexto = d.codigo ?? fila.codigo
  let tipo = fila.tipo
  let codigo = fila.codigo
  // solo se revisa el código si cambia el código o el tipo: una fila importada con un código malo se puede seguir editando
  if (tipoDeTexto(tipoTexto) !== fila.tipo || normalizarCodigo(codigoTexto) !== fila.codigo) {
    const v = validarCodigo(tipoTexto, codigoTexto)
    if ("error" in v) { err(res, 400, v.error, v.campo); return }
    ;({ tipo, codigo } = v)
  }
  const areaNueva = d.areaId !== undefined && d.areaId !== fila.areaId
    ? await prisma.sigArea.findUnique({ where: { id: d.areaId }, select: { id: true, nombre: true } })
    : null
  if (d.areaId !== undefined && d.areaId !== fila.areaId && !areaNueva) { err(res, 404, "Área no encontrada", "areaId"); return }

  const estaba = fila.estado !== "BAJA"
  const queda = (d.estado ?? fila.estado) !== "BAJA"
  const codigoCambia = codigo !== fila.codigo
  const historial = [...(fila.historial as HistorialItem[])]
  if (codigoCambia) historial.push(entrada(quien.nombre, "cambiado", `${fila.codigo} → ${codigo}`))
  if (areaNueva) historial.push(entrada(quien.nombre, "area", `${fila.area.nombre} → ${areaNueva.nombre}`))
  if (!estaba && queda) historial.push(entrada(quien.nombre, "reactivado"))

  // lo que no viene en el body queda undefined y Prisma no lo toca
  const escribir = (tx: Tx) => tx.sigListadoMaestro.update({
    where: { id },
    data: { ...d, areaId: areaNueva?.id ?? fila.areaId, tipo, codigo, editadoPor: quien.nombre, historial },
  })
  const r = queda && (codigoCambia || !estaba) ? await sinRepetir(codigo, id, escribir) : { ok: await escribir(prisma) }
  if ("usa" in r) { err(res, 409, r.usa, "codigo"); return }

  const nombre = r.ok.nombre
  if (areaNueva) {
    if (estaba) avisar(fila.areaId, quien.id, { accion: "baja", quien: quien.nombre, codigo: fila.codigo, nombre: fila.nombre, motivo: `Pasó al área ${areaNueva.nombre}` })
    if (queda) avisar(areaNueva.id, quien.id, { accion: "creado", quien: quien.nombre, codigo, nombre })
  } else if (!estaba && queda) {
    avisar(fila.areaId, quien.id, { accion: "creado", quien: quien.nombre, codigo, nombre })
  } else if (queda && codigoCambia) {
    avisar(fila.areaId, quien.id, { accion: "cambiado", quien: quien.nombre, codigo, codigoAnterior: fila.codigo, nombre })
  }
  await responderFila(res, id)
})

// POST /api/listado-maestro/:id/baja — dar de baja (la fila se conserva con su historial)
router.post("/:id/baja", requireSigAccess, async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const parsed = z.object({ motivo: texto(500) }).safeParse(req.body ?? {})
  if (!parsed.success) { invalido(res, parsed.error); return }
  const quien = await quienEs(req) // antes de leer la fila (ver PATCH)
  const fila = Number.isInteger(id) ? await prisma.sigListadoMaestro.findUnique({ where: { id } }) : null
  if (!fila) { err(res, 404, "Fila no encontrada"); return }
  const motivo = parsed.data.motivo ?? null
  const historial = [...(fila.historial as HistorialItem[]), entrada(quien.nombre, "baja", motivo ?? undefined)]
  // condicionado al estado: dos bajas a la vez no dejan dos entradas ni dos avisos
  const { count } = await prisma.sigListadoMaestro.updateMany({
    where: { id, estado: { not: "BAJA" } },
    data: { estado: "BAJA", editadoPor: quien.nombre, historial },
  })
  if (count === 0) { err(res, 409, `${fila.codigo} ya estaba dado de baja.`); return }
  avisar(fila.areaId, quien.id, { accion: "baja", quien: quien.nombre, codigo: fila.codigo, nombre: fila.nombre, motivo })
  await responderFila(res, id)
})

// PUT /api/listado-maestro/areas/:id/sigla — sigla del área en los códigos; null o vacío la borra
router.put("/areas/:id/sigla", requireSigAccess, async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const parsed = z.object({ sigla: z.string().max(20).nullable() }).safeParse(req.body)
  if (!parsed.success) { err(res, 400, "Manda la sigla como texto, o null para borrarla.", "sigla"); return }
  const sigla = (parsed.data.sigla ?? "").replace(/\s+/g, "").toUpperCase() || null
  if (sigla && !/^[A-Z]{2,5}$/.test(sigla)) { err(res, 400, "La sigla lleva de 2 a 5 letras, sin números ni símbolos (por ejemplo GAD).", "sigla"); return }
  const area = Number.isInteger(id) ? await prisma.sigArea.findUnique({ where: { id }, select: { id: true } }) : null
  if (!area) { err(res, 404, "Área no encontrada"); return }
  if (sigla) {
    const otra = await prisma.sigArea.findFirst({ where: { sigla, id: { not: id } }, select: { nombre: true } })
    if (otra) { err(res, 409, `La sigla ${sigla} ya es del área ${otra.nombre}.`, "sigla"); return }
  }
  res.json(await prisma.sigArea.update({ where: { id }, data: { sigla }, select: { id: true, sigla: true } }))
})

export default router
