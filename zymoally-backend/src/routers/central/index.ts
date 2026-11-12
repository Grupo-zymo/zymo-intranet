// Central de tickets — puente entre la intranet y la API de casos de la app de
// autogestión del cliente. Aquí no hay base de datos: se valida la entrada, se
// decide por nivel (centralAuth.ts) y se reenvía con la identidad del usuario.
//
// Montado en app.ts como /api/central-tickets, detrás de authenticate +
// requireCentralAccess (req.central siempre existe en estos handlers).

import { Router, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { getUserId } from "../../middleware/auth"
import { autogestion, CentralError } from "../../services/autogestionClient"
import {
  decidirAccion,
  filtrosParaNivel,
  resolverAsignado,
  resumenDeCasos,
  type AccesoCentral,
  type AccionCentral,
  type CambiosCaso,
  type CasoResumible,
} from "../../services/centralAuth"
import { listarLideres } from "../../services/centralLideres"
import { listarCuentas, resolveActorName } from "../../utils/userNames"

const router = Router()

// ─── Validación ─────────────────────────────────────────────────────────────

const FECHA = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/
const verdadero = z.literal("true").optional()

const listaSchema = z.object({
  estado: z.enum(["recibido", "en_analisis", "resuelto", "cerrado", "abierto"]).optional(),
  severidad: z.enum(["critica", "alta", "media", "baja"]).optional(),
  area: z.enum(["bodega", "administrativo"]).optional(),
  tipo: z.enum(["peticion", "queja", "reclamo", "sugerencia"]).optional(),
  // sin | cualquiera | mios | un correo
  asignado: z.string().trim().min(1).max(160).optional(),
  escalado: verdadero,
  vencido: verdadero,
  q: z.string().trim().min(1).max(120).optional(),
  desde: z.string().regex(FECHA).optional(),
  hasta: z.string().regex(FECHA).optional(),
  pagina: z.coerce.number().int().min(1).max(10_000).optional(),
  limite: z.coerce.number().int().min(1).max(100).optional(),
  orden: z.enum(["recientes", "vencimiento"]).optional(),
})

const radicadoSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)
const notaSchema = z.string().trim().min(1).max(500).optional()

const asignarSchema = z.object({ asignadoId: z.coerce.number().int().positive(), nota: notaSchema })
const liberarSchema = z.object({ nota: notaSchema })
const mensajeSchema = z.object({ texto: z.string().trim().min(1).max(4000), interno: z.boolean().optional() })
const actualizarSchema = z
  .object({
    severidad: z.enum(["critica", "alta", "media", "baja"]).optional(),
    area: z.enum(["bodega", "administrativo"]).optional(),
    estado: z.enum(["en_analisis", "resuelto", "cerrado"]).optional(),
  })
  .refine((v) => v.severidad !== undefined || v.area !== undefined || v.estado !== undefined, {
    message: "Indica qué quieres cambiar",
  })

function validar<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, dato: unknown): T {
  const r = schema.safeParse(dato)
  if (!r.success) throw new CentralError(400, "Revisa los datos enviados")
  return r.data
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface CasoAsignado {
  estado?: string | null
  asignado?: { email?: string | null } | null
}

const rutaCaso = (radicado: string): string => `/casos/${encodeURIComponent(radicado)}`

function acceso(req: Request): AccesoCentral {
  return req.central as AccesoCentral
}

/** Identidad de quien ejecuta la acción, con su nombre real (nunca "Usuario N"). */
async function actorDe(req: Request) {
  const { email } = acceso(req)
  let id: number
  try {
    id = getUserId(req.user ?? {})
  } catch {
    throw new CentralError(403, "Tu sesión no trae un identificador válido. Vuelve a iniciar sesión.")
  }
  return { id, nombre: (await resolveActorName(id, email)).slice(0, 120), email }
}

/**
 * Aplica la regla del nivel. El líder solo toca casos asignados a su correo,
 * así que para él se consulta primero el caso; si no es suyo, 404.
 */
async function exigir(req: Request, accion: AccionCentral, radicado?: string, cambios?: CambiosCaso): Promise<void> {
  const quien = acceso(req)
  let asignadoEmail: string | null = null
  let estadoCaso: string | null = null
  const dependeDelCaso = accion === "ver" || accion === "mensaje" || accion === "actualizar"
  if (quien.nivel === "lider" && dependeDelCaso && radicado) {
    const { data } = await autogestion.get<CasoAsignado>(rutaCaso(radicado))
    asignadoEmail = data?.asignado?.email ?? null
    estadoCaso = data?.estado ?? null
  }
  const decision = decidirAccion(quien, accion, asignadoEmail, cambios)
  if (!decision.ok) throw new CentralError(decision.status, decision.error)
  // Un caso cerrado solo lo reabre la dirección: el líder no puede devolverlo a análisis ni volver a resolverlo.
  if (quien.nivel === "lider" && accion === "actualizar" && estadoCaso === "cerrado") throw new CentralError(409, "El caso está cerrado")
}

// ─── Rutas ──────────────────────────────────────────────────────────────────

router.get("/casos", async (req, res) => {
  const filtros = filtrosParaNivel(acceso(req), validar(listaSchema, req.query))
  const { data } = await autogestion.get("/casos", filtros)
  res.json(data)
})

const PAGINAS_RESUMEN_LIDER = 5 // 5 × 100 casos; si tiene más, el resumen avisa `truncado`

router.get("/resumen", async (req, res) => {
  const quien = acceso(req)
  if (quien.nivel === "director") {
    const { data } = await autogestion.get("/resumen")
    res.json(data)
    return
  }
  // Líder: nada de totales globales. Se arma el resumen con SUS casos.
  const casos: CasoResumible[] = []
  let total = 0
  for (let pagina = 1; pagina <= PAGINAS_RESUMEN_LIDER; pagina += 1) {
    const { data } = await autogestion.get<{ total: number; items: CasoResumible[] }>("/casos", {
      asignado: quien.email,
      limite: 100,
      pagina,
    })
    total = data?.total ?? 0
    casos.push(...(data?.items ?? []))
    if (!data?.items?.length || casos.length >= total) break
  }
  const actor = await actorDe(req)
  res.json(resumenDeCasos(casos, { email: actor.email, nombre: actor.nombre }, casos.length < total))
})

router.get("/lideres", async (req, res) => {
  await exigir(req, "lideres")
  res.json(await listarLideres())
})

router.get("/casos/:radicado", async (req, res) => {
  const radicado = validar(radicadoSchema, req.params.radicado)
  const { data } = await autogestion.get<CasoAsignado>(rutaCaso(radicado))
  const decision = decidirAccion(acceso(req), "ver", data?.asignado?.email)
  if (!decision.ok) throw new CentralError(decision.status, decision.error)
  res.json(data)
})

router.post("/casos/:radicado/asumir", async (req, res) => {
  const radicado = validar(radicadoSchema, req.params.radicado)
  await exigir(req, "asumir")
  const { data } = await autogestion.post(`${rutaCaso(radicado)}/asumir`, { actor: await actorDe(req) })
  res.json(data ?? { ok: true })
})

router.post("/casos/:radicado/asignar", async (req, res) => {
  const radicado = validar(radicadoSchema, req.params.radicado)
  await exigir(req, "asignar")
  const { asignadoId, nota } = validar(asignarSchema, req.body)
  const quien = acceso(req)
  const lideres = await listarLideres()
  const asignado = resolverAsignado(quien, asignadoId, lideres, quien.esAdmin ? await listarCuentas() : [])
  if (!asignado) throw new CentralError(400, "Esa persona no está en la lista de líderes de operaciones")
  const { data } = await autogestion.post(`${rutaCaso(radicado)}/asignar`, {
    actor: await actorDe(req),
    asignado: { ...asignado, nombre: asignado.nombre.slice(0, 120) },
    ...(nota ? { nota } : {}),
  })
  res.json(data ?? { ok: true })
})

router.post("/casos/:radicado/liberar", async (req, res) => {
  const radicado = validar(radicadoSchema, req.params.radicado)
  await exigir(req, "liberar")
  const { nota } = validar(liberarSchema, req.body ?? {})
  const { data } = await autogestion.post(`${rutaCaso(radicado)}/liberar`, {
    actor: await actorDe(req),
    ...(nota ? { nota } : {}),
  })
  res.json(data ?? { ok: true })
})

router.post("/casos/:radicado/mensajes", async (req, res) => {
  const radicado = validar(radicadoSchema, req.params.radicado)
  const { texto, interno } = validar(mensajeSchema, req.body)
  await exigir(req, "mensaje", radicado)
  const { data } = await autogestion.post(`${rutaCaso(radicado)}/mensajes`, {
    actor: await actorDe(req),
    texto,
    interno: interno === true,
  })
  res.status(201).json(data ?? { ok: true })
})

router.patch("/casos/:radicado", async (req, res) => {
  const radicado = validar(radicadoSchema, req.params.radicado)
  const cambios = validar(actualizarSchema, req.body)
  await exigir(req, "actualizar", radicado, cambios)
  const { data } = await autogestion.patch(rutaCaso(radicado), { actor: await actorDe(req), ...cambios })
  res.json(data ?? { ok: true })
})

// Los errores previstos salen con su estado y su texto; el resto sigue al
// manejador general de app.ts (500 sin detalles).
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof CentralError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  next(err)
})

export default router
