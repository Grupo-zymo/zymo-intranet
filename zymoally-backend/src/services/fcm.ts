// Push nativo de Android (Firebase Cloud Messaging). Llega con la app cerrada.
// Sin credenciales (FCM_SERVICE_ACCOUNT_FILE / FCM_SERVICE_ACCOUNT_JSON) queda
// APAGADO y nada falla, igual que VAPID. Nunca lanza: un push que no sale no
// debe tumbar la acción que lo originó.

import { readFileSync } from "fs"
import { prisma } from "../config/prisma"
import { env } from "../config/env"
import type { MensajePush } from "./mesaPush"

/** Manda un mensaje a un token. Lanza con `code` (estilo Firebase) si falla. */
export type Enviador = (token: string, mensaje: MensajePush) => Promise<void>

const TOKEN_MUERTO = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"])

/** Cuerpo FCM del mensaje (sin el token). Solo título, texto corto y datos de apertura. */
export function armarMensajeFcm(m: MensajePush) {
  return {
    notification: { title: m.titulo, body: m.texto },
    data: { url: m.url, etiqueta: m.etiqueta },
    android: { priority: "high" as const, notification: { channelId: "zymo_general", tag: m.etiqueta } },
  }
}

/**
 * Reparte el mensaje entre los tokens. Los que Firebase marca como inexistentes
 * se pasan a `borrar`; cualquier otro error solo se cuenta en el log, sin datos.
 */
export async function despacharFcm(
  tokens: string[],
  mensaje: MensajePush,
  enviar: Enviador,
  borrar: (tokens: string[]) => Promise<unknown>,
): Promise<number> {
  let enviados = 0
  const muertos: string[] = []
  await Promise.all(tokens.map(async (t) => {
    try {
      await enviar(t, mensaje)
      enviados++
    } catch (err) {
      const code = (err as { code?: string }).code ?? ""
      if (TOKEN_MUERTO.has(code)) muertos.push(t)
      else console.error(`[fcm] push no enviado (${code || "sin código"})`)
    }
  }))
  if (muertos.length > 0) await Promise.resolve(borrar(muertos)).catch(() => {})
  return enviados
}

// ─── Firebase real (lazy) ───────────────────────────────────────────────────

let enviadorReal: Enviador | null | undefined // undefined = aún no inicializado

/** Lee las credenciales del entorno; null si faltan o no son válidas. Registra una sola vez. */
export function leerCredenciales(archivo: string, json: string, leer: (ruta: string) => string = (r) => readFileSync(r, "utf8")): object | null {
  try {
    if (json) return JSON.parse(json) as object
    if (archivo) return JSON.parse(leer(archivo)) as object
  } catch {
    console.error("[fcm] las credenciales de Firebase no se pudieron leer; push nativo apagado")
    return null
  }
  return null
}

async function obtenerEnviador(): Promise<Enviador | null> {
  if (enviadorReal !== undefined) return enviadorReal
  enviadorReal = null
  const cred = leerCredenciales(env.FCM_SERVICE_ACCOUNT_FILE, env.FCM_SERVICE_ACCOUNT_JSON)
  if (!cred) {
    if (!env.FCM_SERVICE_ACCOUNT_FILE && !env.FCM_SERVICE_ACCOUNT_JSON) console.log("[fcm] sin credenciales: push nativo apagado")
    return null
  }
  try {
    const { initializeApp, cert } = await import("firebase-admin/app")
    const { getMessaging } = await import("firebase-admin/messaging")
    const app = initializeApp({ credential: cert(cred as Parameters<typeof cert>[0]) }, "zymoally-fcm")
    const messaging = getMessaging(app)
    enviadorReal = async (token, m) => { await messaging.send({ token, ...armarMensajeFcm(m) }) }
  } catch {
    console.error("[fcm] no se pudo iniciar Firebase; push nativo apagado")
  }
  return enviadorReal
}

const borrarTokens = (tokens: string[]) => prisma.pushDispositivo.deleteMany({ where: { token: { in: tokens } } })

async function enviarA(filtro: { email: { in: string[] } } | { userId: { in: number[] } }, mensaje: MensajePush, enviadorPrueba?: Enviador): Promise<number> {
  try {
    const enviar = enviadorPrueba ?? (await obtenerEnviador())
    if (!enviar) return 0
    const filas = await prisma.pushDispositivo.findMany({ where: filtro, select: { token: true } })
    if (filas.length === 0) return 0
    return await despacharFcm(filas.map((f) => f.token), mensaje, enviar, borrarTokens)
  } catch {
    console.error("[fcm] fallo al enviar push nativo")
    return 0
  }
}

export function enviarFcmPorCorreo(correos: string[], mensaje: MensajePush, enviador?: Enviador): Promise<number> {
  const lista = [...new Set(correos.map((c) => c.trim().toLowerCase()).filter(Boolean))]
  return lista.length === 0 ? Promise.resolve(0) : enviarA({ email: { in: lista } }, mensaje, enviador)
}

export function enviarFcmPorUserId(ids: number[], mensaje: MensajePush, enviador?: Enviador): Promise<number> {
  return ids.length === 0 ? Promise.resolve(0) : enviarA({ userId: { in: ids } }, mensaje, enviador)
}
