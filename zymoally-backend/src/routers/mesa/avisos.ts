// Campana de avisos de la intranet. Cada persona solo ve y marca los suyos.
// No exige acceso a la mesa de ayuda (se monta antes de esa puerta en app.ts): por la campana llegan también
// los avisos de otros módulos — el SIG le avisa al líder de área — a cuentas que no tienen mesa.

import { Router, type Request } from "express"
import { z } from "zod"
import { prisma } from "../../config/prisma"
import { puedeEntrarMesa } from "../../services/mesaAuth"
import { MesaError } from "../../services/mesaIntranet"
import { clavePublicaPush } from "../../services/mesaPush"
import { idSchema, ruta, validar } from "./comun"

const router = Router()

/** La cuenta de la sesión (el `id` del JWT, el mismo que usa la mesa). Sin un id válido no hay campana. */
function yo(req: Request): number {
  const id = Number(req.user?.id)
  if (!Number.isInteger(id) || id <= 0) throw new MesaError(403, "Tu sesión no trae un usuario válido. Cierra sesión y vuelve a entrar.")
  return id
}

/**
 * Los avisos que ve quien llama: los suyos, y sin acceso a la mesa solo los que NO son de un ticket. La mesa avisa
 * a toda el área, también a quien un admin aún no ha habilitado: esos avisos se guardan pero no se le muestran
 * ni los marca hasta que tenga acceso (igual que antes de que la campana trajera avisos de otros módulos).
 */
const mios = (req: Request) => ({ userId: yo(req), ...(puedeEntrarMesa(req.user) ? {} : { ticketId: null }) })

// La campana es una lista corta, no un buzón: los sin leer primero (con tope, para no
// llenar la ventana) y, si son pocos, se completa con los últimos leídos.
export const MAX_SIN_LEER = 8
export const FILAS_MINIMAS = 5

// GET /avisos — cuántos hay sin leer y la lista corta que muestra la campana
router.get("/avisos", ruta(async (req, res) => {
  const where = mios(req)
  // ticketId: aviso de un ticket de la mesa · url: aviso de otro módulo, con la ruta a la que lleva
  const select = { id: true, ticketId: true, url: true, tipo: true, texto: true, leidoEn: true, createdAt: true } as const
  const [sinLeer, pendientes] = await Promise.all([
    prisma.mesaAviso.count({ where: { ...where, leidoEn: null } }),
    prisma.mesaAviso.findMany({ where: { ...where, leidoEn: null }, orderBy: { id: "desc" }, take: MAX_SIN_LEER, select }),
  ])
  const faltan = FILAS_MINIMAS - pendientes.length
  const leidos = faltan > 0 ? await prisma.mesaAviso.findMany({ where: { ...where, leidoEn: { not: null } }, orderBy: { id: "desc" }, take: faltan, select }) : []
  // masSinLeer: los que no caben en la lista (se muestran como un número, no como filas)
  res.json({ sinLeer, masSinLeer: sinLeer - pendientes.length, items: [...pendientes, ...leidos] })
}))

// POST /avisos/leer — marca como leídos los ids dados, o todos si no se manda ninguno
router.post("/avisos/leer", ruta(async (req, res) => {
  const { ids } = validar(z.object({ ids: z.array(idSchema).max(100).optional() }), req.body ?? {})
  const r = await prisma.mesaAviso.updateMany({
    where: { ...mios(req), leidoEn: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { leidoEn: new Date() },
  })
  res.json({ marcados: r.count })
}))

// ── Notificaciones del teléfono (Web Push) ──
// ponytail: siguen siendo de quien tiene acceso a la mesa. Un dispositivo suscrito recibe TODO lo que la mesa le
// avise a su área (services/mesaAvisos.ts no mira permisos), y eso no debe llegarle a quien aún no puede abrirla.
// Para abrirlas a quien solo recibe avisos de otros módulos: filtrar antes por permiso los destinatarios de la mesa.

// GET /push — la clave pública para suscribirse (null si el push está apagado en el servidor o la cuenta no tiene mesa)
router.get("/push", ruta(async (req, res) => {
  res.json({ clave: puedeEntrarMesa(req.user) ? clavePublicaPush() : null })
}))

const suscripcionSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "https"),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(100) }),
})

// POST /push/suscripcion — activa las notificaciones en este dispositivo. Si el dispositivo
// ya estaba a nombre de otra cuenta (cambio de sesión), pasa a quien lo activa ahora.
router.post("/push/suscripcion", ruta(async (req, res) => {
  if (!puedeEntrarMesa(req.user)) throw new MesaError(403, "Las notificaciones del teléfono se activan con acceso a la Mesa de ayuda.")
  const s = validar(suscripcionSchema, req.body)
  const datos = { userId: yo(req), p256dh: s.keys.p256dh, auth: s.keys.auth }
  await prisma.mesaPushSub.upsert({ where: { endpoint: s.endpoint }, create: { endpoint: s.endpoint, ...datos }, update: datos })
  res.status(201).json({ ok: true })
}))

// DELETE /push/suscripcion — las desactiva en este dispositivo (solo si es de quien llama)
router.delete("/push/suscripcion", ruta(async (req, res) => {
  const { endpoint } = validar(z.object({ endpoint: z.string().url().max(1000) }), req.body)
  const r = await prisma.mesaPushSub.deleteMany({ where: { endpoint, userId: yo(req) } })
  res.json({ borradas: r.count })
}))

export default router
