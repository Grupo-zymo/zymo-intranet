// Huella/rostro con el Keystore de Android (plugin @capgo/capacitor-native-biometric). Solo en la app nativa.
// Las credenciales viven cifradas en el Keystore con una llave atada a la biometría registrada (BIOMETRY_CURRENT_SET):
// si cambian las huellas, la llave se invalida y se cae a la contraseña. Nada de esto toca localStorage salvo dos banderas sin secretos.
import { Capacitor } from "@capacitor/core"
import { AccessControl, NativeBiometric } from "@capgo/capacitor-native-biometric"

// Interruptor único (H1): en false se oculta por completo la oferta/interruptor de biometría y se borran las credenciales que hubiera
// en el Keystore. "Recordar sesión" y el botón atrás no dependen de esto. Motivo: la intranet carga JS remoto (zymointranet.com),
// que podría invocar el plugin si el sitio tuviera XSS.
// Decisión provisional (pendiente del usuario): APAGADA en la intranet. Poner true para volver a ofrecerla.
export const BIOMETRIA_CREDENCIALES_ACTIVA = false

const SERVIDOR = "com.zymo.intranet" // una clave distinta por app para no mezclar
const ACTIVA = "zymo-bio-activa"
const NO_PREGUNTAR = "zymo-bio-no-preguntar"

export type ResultadoBio = { ok: true } | { ok: false; bloqueado: boolean }

const esNativo = () => Capacitor.isNativePlatform()
const leer = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const guardar = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }
// El plugin rechaza con { code } (2 = bloqueo por intentos, 4 = bloqueo temporal, 21 = sin credenciales protegidas)
const codigo = (e: unknown) => Number((e as { code?: unknown } | null)?.code)

export const bioActivaGuardada = (): boolean => BIOMETRIA_CREDENCIALES_ACTIVA && esNativo() && leer(ACTIVA) === "1"
export const bioNoPreguntar = (): boolean => leer(NO_PREGUNTAR) === "1"
export const noVolverAPreguntar = () => guardar(NO_PREGUNTAR, "1")

/** "no" = permanente (sin hardware, sin huella registrada, sin bloqueo de pantalla, solo biometría débil); "transitorio" = error del plugin o bloqueo temporal del sensor. */
export type Disponibilidad = "si" | "no" | "transitorio"

// Códigos del plugin: 1 sin hardware, 3 sin biometría registrada, 14 sin bloqueo de pantalla = permanentes; 2/4 bloqueo por intentos y 0 desconocido = transitorios
const PERMANENTES = [1, 3, 14]

/** Hay huella o rostro registrado y seguro en el teléfono (clase fuerte, necesaria para atar la llave). */
export async function biometriaDisponible(): Promise<Disponibilidad> {
  if (!BIOMETRIA_CREDENCIALES_ACTIVA || !esNativo()) return "no"
  try {
    const r = await NativeBiometric.isAvailable({ useFallback: false })
    if (r.isAvailable) return r.strongBiometryIsAvailable ? "si" : "no"
    return r.errorCode !== undefined && PERMANENTES.includes(Number(r.errorCode)) ? "no" : "transitorio"
  } catch {
    return "transitorio"
  }
}

/** Con el interruptor apagado, quita lo que hubiera quedado guardado de una versión anterior. */
export async function limpiarSiApagada(): Promise<void> {
  if (!BIOMETRIA_CREDENCIALES_ACTIVA && esNativo() && leer(ACTIVA) === "1") await desactivarBiometria()
}

export async function activarBiometria(email: string, clave: string): Promise<boolean> {
  try {
    await NativeBiometric.setCredentials({
      username: email,
      password: clave,
      server: SERVIDOR,
      accessControl: AccessControl.BIOMETRY_CURRENT_SET,
      title: "Entrar con huella o rostro",
      negativeButtonText: "Cancelar",
    })
    guardar(ACTIVA, "1")
    return true
  } catch {
    return false
  }
}

/** Borra las credenciales del Keystore y la bandera. Se llama al cerrar sesión y cuando algo falla. */
export async function desactivarBiometria(): Promise<void> {
  guardar(ACTIVA, null)
  if (!esNativo()) return
  try { await NativeBiometric.deleteCredentials({ server: SERVIDOR }) } catch { /* ya no había */ }
}

export async function verificarBiometria(): Promise<ResultadoBio> {
  try {
    await NativeBiometric.verifyIdentity({ title: "Desbloquear", negativeButtonText: "Cancelar", maxAttempts: 3 })
    return { ok: true }
  } catch (e) {
    return { ok: false, bloqueado: [2, 4].includes(codigo(e)) }
  }
}

/** Pide huella/rostro y devuelve las credenciales guardadas. null si falla; si la llave se invalidó, desactiva todo. */
export async function leerCredencialesBiometria(): Promise<{ email: string; clave: string } | { bloqueado: boolean } | null> {
  try {
    const c = await NativeBiometric.getSecureCredentials({ server: SERVIDOR, title: "Desbloquear", negativeButtonText: "Cancelar", maxAttempts: 3 })
    return { email: c.username, clave: c.password }
  } catch (e) {
    const c = codigo(e)
    if (c === 21) {
      await desactivarBiometria()
      return null
    }
    return { bloqueado: [2, 4].includes(c) }
  }
}
