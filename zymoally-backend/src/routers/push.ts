// Push nativo de Android. Dos routers (ver app.ts):
//   dispositivoRouter → tras authenticate: registrar / quitar el token del teléfono.
//   internoRouter     → ANTES de authenticate: servicio a servicio, con X-Internal-Key.

import { Router, type Request, type Response } from "express"
import { prisma } from "../config/prisma"
import { env } from "../config/env"
import { enviarFcmPorCorreo } from "../services/fcm"
import { borrarSchema, claveValida, correosEnMinuscula, datosDispositivo, internoSchema, registrarSchema } from "../services/pushApi"
import { getUserId } from "../middleware/auth"

export const dispositivoRouter = Router()

function quien(req: Request): { userId: number; email: string } | null {
  const email = (req.user?.email ?? "").trim().toLowerCase()
  try {
    const userId = getUserId(req.user ?? {})
    return email.includes("@") ? { userId, email } : null
  } catch {
    return null
  }
}

dispositivoRouter.post("/dispositivo", async (req: Request, res: Response) => {
  const yo = quien(req)
  if (!yo) { res.status(403).json({ error: "Tu sesión no trae correo o identificador válido" }); return }
  const b = registrarSchema.safeParse(req.body)
  if (!b.success) { res.status(400).json({ error: "Revisa los datos enviados" }); return }
  const { create, update } = datosDispositivo(yo.userId, yo.email, b.data)
  await prisma.pushDispositivo.upsert({ where: { token: b.data.token }, create, update })
  res.status(204).end()
})

dispositivoRouter.delete("/dispositivo", async (req: Request, res: Response) => {
  const yo = quien(req)
  if (!yo) { res.status(403).json({ error: "Tu sesión no trae correo o identificador válido" }); return }
  const b = borrarSchema.safeParse(req.body)
  if (!b.success) { res.status(400).json({ error: "Revisa los datos enviados" }); return }
  await prisma.pushDispositivo.deleteMany({ where: { token: b.data.token, userId: yo.userId } })
  res.status(204).end()
})

export const internoRouter = Router()

internoRouter.post("/api/push/interno", async (req: Request, res: Response) => {
  if (!claveValida(req.headers["x-internal-key"], env.INTERNAL_KEY)) { res.status(403).json({ error: "No autorizado" }); return }
  const b = internoSchema.safeParse(req.body)
  if (!b.success) { res.status(400).json({ error: "Revisa los datos enviados" }); return }
  const { correos, ...mensaje } = b.data
  const enviados = await enviarFcmPorCorreo(correosEnMinuscula(correos), mensaje)
  res.json({ enviados })
})
