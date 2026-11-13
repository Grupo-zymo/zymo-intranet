// Aviso de versión mínima del APK. Funciones puras (las ejecuta también el autotest con node); sin imports estáticos de Capacitor.

export type EstadoVersion = "obligatoria" | "sugerida" | "al-dia"

export interface InfoVersionServidor {
  minVersionCode: number
  latestVersionCode: number
  latestVersionName: string
  apkUrl: string
  mensaje: string
}

export interface VersionInstalada {
  code: number
  name: string
}

export function compararVersion(actual: number, minimo: number, ultimo: number): EstadoVersion {
  if (![actual, minimo, ultimo].every(Number.isFinite)) return "al-dia"
  if (actual < minimo) return "obligatoria"
  if (actual < ultimo) return "sugerida"
  return "al-dia"
}

const entero = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 0
}
const texto = (v: unknown): string => (typeof v === "string" ? v : "")

/** Tolerante: cualquier campo faltante o raro deja valores que resultan en "al-dia". */
export function parsearRespuesta(json: unknown): InfoVersionServidor {
  const a = (json && typeof json === "object" ? (json as { android?: unknown }).android : null) as Record<string, unknown> | null
  const o = a && typeof a === "object" ? a : {}
  const apkUrl = texto(o.apkUrl).trim()
  return {
    minVersionCode: entero(o.minVersionCode),
    latestVersionCode: entero(o.latestVersionCode),
    latestVersionName: texto(o.latestVersionName),
    apkUrl: /^https?:\/\//i.test(apkUrl) ? apkUrl : "",
    mensaje: texto(o.mensaje),
  }
}

/** Versión del APK instalado; null en web o ante cualquier error (entonces no se hace nada). */
export async function leerVersionInstalada(): Promise<VersionInstalada | null> {
  try {
    const { Capacitor } = await import("@capacitor/core")
    if (!Capacitor.isNativePlatform()) return null
    const { App } = await import("@capacitor/app")
    const info = await App.getInfo()
    const code = Number(info.build)
    return Number.isInteger(code) && code > 0 ? { code, name: info.version } : null
  } catch {
    return null
  }
}
