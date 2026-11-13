// Mesa de ayuda — campana de avisos. Cada persona solo ve y marca los suyos.

import { Router } from "express"
import { z } from "zod"
import { prisma } from "../../config/prisma"
import { clavePublicaPush } from "../../services/mesaPush"
import { acceso, idSchema, ruta, validar } from "./comun"

const router = Router()

// La campana es una lista corta, no un buzón: los sin leer primero (con tope, para no
// llenar la ventana) y, si son pocos, se completa con los últimos leídos.
export const MAX_SIN_LEER = 8
export const FILAS_MINIMAS = 5

// GET /avisos — cuántos hay sin leer y la lista corta que muestra la campana
router.get("/avisos", ruta(async (req, res) => {
  const userId = acceso(req).userId
  const select = { id: true, ticketId: true, tipo: true, texto: true, leidoEn: true, createdAt: true } as const
  const [sinLeer, pendientes] = await Promise.all([
    prisma.mesaAviso.count({ where: { userId, leidoEn: null } }),
    prisma.mesaAviso.findMany({ where: { userId, leidoEn: null }, orderBy: { id: "desc" }, take: MAX_SIN_LEER, select }),
  ])
  const faltan = FILAS_MINIMAS - pendientes.length
  const leidos = faltan > 0 ? await prisma.mesaAviso.findMany({ where: { userId, leidoEn: { not: null } }, orderBy: { id: "desc" }, take: faltan, select }) : []
  // masSinLeer: los que no caben en la lista (se muestran como un número, no como filas)
  res.json({ sinLeer, masSinLeer: sinLeer - pendientes.length, items: [...pendientes, ...leidos] })
}))

// POST /avisos/leer — marca como leídos los ids dados, o todos si no se manda ninguno
router.post("/avisos/leer", ruta(async (req, res) => {
  const { ids } = validar(z.object({ ids: z.array(idSchema).max(100).optional() }), req.body ?? {})
  const r = await prisma.mesaAviso.updateMany({
    where: { userId: acceso(req).userId, leidoEn: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { leidoEn: new Date() },
  })
  res.json({ marcados: r.count })
}))

// ── Notificaciones del teléfono (Web Push) ──

// GET /push — la clave pública para suscribirse (null si el push está apagado en el servidor)
router.get("/push", ruta(async (_req, res) => {
  res.json({ clave: clavePublicaPush() })
}))

const suscripcionSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "https"),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(100) }),
})

// POST /push/suscripcion — activa las notificaciones en este dispositivo. Si el dispositivo
// ya estaba a nombre de otra cuenta (cambio de sesión), pasa a quien lo activa ahora.
router.post("/push/suscripcion", ruta(async (req, res) => {
  const s = validar(suscripcionSchema, req.body)
  const datos = { userId: acceso(req).userId, p256dh: s.keys.p256dh, auth: s.keys.auth }
  await prisma.mesaPushSub.upsert({ where: { endpoint: s.endpoint }, create: { endpoint: s.endpoint, ...datos }, update: datos })
  res.status(201).json({ ok: true })
}))

// DELETE /push/suscripcion — las desactiva en este dispositivo (solo si es de quien llama)
router.delete("/push/suscripcion", ruta(async (req, res) => {
  const { endpoint } = validar(z.object({ endpoint: z.string().url().max(1000) }), req.body)
  const r = await prisma.mesaPushSub.deleteMany({ where: { endpoint, userId: acceso(req).userId } })
  res.json({ borradas: r.count })
}))

export default router
