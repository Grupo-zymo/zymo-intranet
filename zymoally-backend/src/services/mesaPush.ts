// Mesa de ayuda — notificaciones del teléfono (Web Push). Cada aviso de la
// campana se manda también a los dispositivos donde la persona lo activó; llega
// aunque la intranet esté cerrada. Sin claves VAPID configuradas, queda apagado
// y la campana sigue funcionando igual.

import webpush from "web-push"
import { prisma } from "../config/prisma"
import { env } from "../config/env"

const activo = env.VAPID_PUBLIC_KEY !== "" && env.VAPID_PRIVATE_KEY !== ""
if (activo) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)

/** Clave pública para que el navegador se suscriba, o null si el push está apagado. */
export function clavePublicaPush(): string | null {
  return activo ? env.VAPID_PUBLIC_KEY : null
}

export interface MensajePush {
  titulo: string
  texto: string
  /** Ruta de la intranet que se abre al tocar la notificación. */
  url: string
  /** Agrupa: un aviso nuevo del mismo ticket reemplaza al anterior en el teléfono. */
  etiqueta: string
}

/**
 * Manda la notificación a todos los dispositivos de esas personas. Nunca lanza:
 * si un dispositivo ya no existe (el navegador revocó la suscripción) se borra;
 * cualquier otro error solo se registra.
 */
export async function enviarPush(userIds: number[], mensaje: MensajePush): Promise<number> {
  if (!activo || userIds.length === 0) return 0
  const subs = await prisma.mesaPushSub.findMany({ where: { userId: { in: userIds } } })
  let enviados = 0
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(mensaje), { TTL: 3600 })
      enviados++
    } catch (err) {
      const estado = (err as { statusCode?: number }).statusCode
      if (estado === 404 || estado === 410) {
        await prisma.mesaPushSub.delete({ where: { id: s.id } }).catch(() => {})
      } else {
        console.error(`[mesa] push no enviado (estado ${estado ?? "sin respuesta"})`)
      }
    }
  }))
  return enviados
}
