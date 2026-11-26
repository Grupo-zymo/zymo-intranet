// Validación y reglas puras del push nativo: sin Express ni red, para probarlas
// solas (ver push.selfcheck.ts). El router solo las conecta a Prisma.

import { createHash, timingSafeEqual } from "crypto"
import { z } from "zod"

export const registrarSchema = z.object({
  token: z.string().min(20).max(4096),
  plataforma: z.literal("android"),
  version: z.string().max(40).optional(),
})
export const borrarSchema = z.object({ token: z.string().min(20).max(4096) })

/**
 * Ruta interna de la intranet: empieza por "/" y no por "//" (nada de saltar a otro sitio). Tampoco lleva "\" ni
 * espacios o caracteres de control: el navegador descarta tabuladores y saltos de línea al resolver una ruta, así que
 * "/\t/evil.com" terminaría en https://evil.com.
 */
const urlRelativa = z.string().max(300).refine((u) => u.startsWith("/") && !u.startsWith("//") && !u.includes("\\") && !/[\u0000- \u007f]/.test(u), "url relativa")

export const internoSchema = z.object({
  correos: z.array(z.string().max(254)).max(200),
  titulo: z.string().min(1).max(80),
  texto: z.string().min(1).max(180),
  url: urlRelativa,
  etiqueta: z.string().min(1).max(60),
})

/** Aviso de la campana que manda otro servicio (el SIG): a cuentas concretas, con la ruta a la que lleva. */
export const avisoInternoSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1).max(200),
  tipo: z.string().min(1).max(40),
  titulo: z.string().min(1).max(80),
  texto: z.string().min(1).max(300),
  url: urlRelativa,
  etiqueta: z.string().min(1).max(60),
})

/** Datos del upsert por token: si el token era de otra persona, pasa a quien llama. */
export function datosDispositivo(userId: number, email: string, b: z.infer<typeof registrarSchema>) {
  const datos = { userId, email: email.trim().toLowerCase(), plataforma: b.plataforma, version: b.version ?? null }
  return { create: { token: b.token, ...datos }, update: datos }
}

/** Comparación en tiempo constante de la clave de servicio; sin cabecera o vacía = false. */
export function claveValida(recibida: unknown, esperada: string): boolean {
  if (typeof recibida !== "string" || recibida === "" || esperada === "") return false
  const a = createHash("sha256").update(recibida).digest()
  const b = createHash("sha256").update(esperada).digest()
  return timingSafeEqual(a, b)
}

export const correosEnMinuscula = (correos: string[]): string[] =>
  [...new Set(correos.map((c) => c.trim().toLowerCase()).filter((c) => c.includes("@")))]
