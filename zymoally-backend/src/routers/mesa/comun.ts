// Piezas compartidas por los routers de la mesa de ayuda.

import type { Request, Response, NextFunction, RequestHandler } from "express"
import { z } from "zod"
import type { AccesoMesa, Decision } from "../../services/mesaAuth"
import { MesaError } from "../../services/mesaIntranet"
import { resolveActorName } from "../../utils/userNames"

export function acceso(req: Request): AccesoMesa {
  return req.mesa as AccesoMesa
}

export function validar<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, dato: unknown): T {
  const r = schema.safeParse(dato)
  if (!r.success) throw new MesaError(400, "Revisa los datos enviados")
  return r.data
}

export function exigir(d: Decision): void {
  if (!d.ok) throw new MesaError(d.status, d.error)
}

export const idSchema = z.coerce.number().int().positive()

/** Quien ejecuta la acción, con su nombre real (el JWT no trae full_name). */
export async function actorDe(req: Request): Promise<{ id: number; nombre: string; email: string }> {
  const email = (req.user?.email ?? "").trim().toLowerCase()
  const id = acceso(req).userId
  return { id, nombre: (await resolveActorName(id, email)).slice(0, 120), email }
}

/** Envuelve un handler async: los MesaError salen con su estado; lo demás va al manejador global (500). */
export function ruta(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((err) => {
      if (err instanceof MesaError) {
        res.status(err.status).json({ error: err.message })
        return
      }
      next(err)
    })
  }
}
