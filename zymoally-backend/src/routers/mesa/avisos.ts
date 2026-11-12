// Mesa de ayuda — campana de avisos. Cada persona solo ve y marca los suyos.

import { Router } from "express"
import { z } from "zod"
import { prisma } from "../../config/prisma"
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

export default router
