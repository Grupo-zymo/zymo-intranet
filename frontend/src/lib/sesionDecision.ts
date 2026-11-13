// Lógica pura de la sesión recordada + biometría (sin dependencias; la ejecuta también el autotest con node).

/** Vigencia del JWT por su claim exp. El payload va en base64url (con - y _, sin relleno): atob a secas falla con ellos. */
export function jwtVigente(token: string | null | undefined, ahora: number = Date.now(), margenSeg = 60): boolean {
  if (!token) return false
  try {
    const parte = token.split(".")[1]
    if (!parte) return false
    const b64 = parte.replace(/-/g, "+").replace(/_/g, "/")
    const { exp } = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="))) as { exp?: number }
    return typeof exp !== "number" || exp * 1000 - margenSeg * 1000 > ahora
  } catch {
    return false
  }
}

export type PasoArranque = "entrar" | "pedir-biometria" | "login-silencioso" | "login-manual"

/**
 * Qué hace la app al abrirse. bloqueoOk: null = aún no se pidió la huella/rostro, true = pasó, false = falló o se canceló.
 * Con biometría activa y disponible nadie entra sin pasar el bloqueo; sin ella, entra quien tenga token vigente.
 */
export function decidirArranque(e: {
  tokenVigente: boolean
  biometriaActiva: boolean
  biometriaDisponible: boolean
  bloqueoOk: boolean | null
}): PasoArranque {
  if (!(e.biometriaActiva && e.biometriaDisponible)) return e.tokenVigente ? "entrar" : "login-manual"
  if (e.bloqueoOk === null) return "pedir-biometria"
  if (!e.bloqueoOk) return "login-manual"
  return e.tokenVigente ? "entrar" : "login-silencioso"
}
