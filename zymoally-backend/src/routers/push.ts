// Push nativo de Android. Dos routers (ver app.ts):
//   dispositivoRouter → tras authenticate: registrar / quitar el token del teléfono.
//   internoRouter     → ANTES de authenticate: servicio a servicio, con X-Internal-Key.

import { Router, type Request, type Response } from "express"
import { prisma } from "../config/prisma"
import { env } from "../config/env"
import { enviarFcmPorCorreo } from "../services/fcm"
import { enviarPush } from "../services/mesaPush"
import { avisoInternoSchema, borrarSchema, claveValida, correosEnMinuscula, datosDispositivo, internoSchema, registrarSchema } from "../services/pushApi"
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

// Aviso de la campana que manda otro servicio (el SIG le avisa al líder de área que aprobaron o rechazaron algo):
// una fila por cuenta, sin ticket y con la ruta a la que lleva, y además al teléfono de quien lo tenga activado.
internoRouter.post("/api/avisos/interno", async (req: Request, res: Response) => {
  if (!claveValida(req.headers["x-internal-key"], env.INTERNAL_KEY)) { res.status(403).json({ error: "No autorizado" }); return }
  const b = avisoInternoSchema.safeParse(req.body)
  if (!b.success) { res.status(400).json({ error: "Revisa los datos enviados" }); return }
  const { tipo, titulo, texto, url, etiqueta } = b.data
  const userIds = [...new Set(b.data.userIds)]
  await prisma.mesaAviso.createMany({ data: userIds.map((userId) => ({ userId, tipo, texto, url })) })
  // Al teléfono también, sin esperar: no debe demorar la respuesta. Con su propio catch: un fallo aquí (p. ej. la BD
  // al leer los dispositivos) quedaría como promesa rechazada sin atender y tumbaría el proceso.
  enviarPush(userIds, { titulo, texto: texto.slice(0, 200), url, etiqueta })
    .catch((err) => console.error(`[avisos] push no enviado: ${err instanceof Error ? err.message : "error"}`))
  res.status(201).json({ creados: userIds.length })
})
