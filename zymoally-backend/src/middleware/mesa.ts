import { Request, Response, NextFunction } from "express"
import { prisma } from "../config/prisma"
import { puedeEntrarMesa, resolverAccesoMesa, type AccesoMesa } from "../services/mesaAuth"

declare global {
  namespace Express {
    interface Request {
      mesa?: AccesoMesa
    }
  }
}

/**
 * Mesa de ayuda: entra el admin y quien tenga el permiso de acceso (mod_tickets_mesa) o el de
 * líder (mod_tickets_lider). Deja en req.mesa a qué áreas pertenece y qué permisos tiene; lo que ve y
 * puede hacer lo deciden las reglas de services/mesaAuth.ts en cada handler.
 * Va detrás de `authenticate`.
 */
export async function requireMesaAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!puedeEntrarMesa(req.user)) {
    res.status(403).json({ error: "Todavía no tienes acceso a la Mesa de ayuda. Pídele a un administrador que te lo active." })
    return
  }
  try {
    // ponytail: lee MesaArea en cada petición (≈15 filas); cachear si llega a pesar.
    const areas = await prisma.mesaArea.findMany({ select: { areaId: true, nombre: true, esSac: true } })
    const acceso = resolverAccesoMesa(req.user, areas)
    if (!acceso) {
      res.status(403).json({ error: "Tu sesión no trae un usuario válido. Cierra sesión y vuelve a entrar." })
      return
    }
    req.mesa = acceso
    next()
  } catch (err) {
    next(err)
  }
}
