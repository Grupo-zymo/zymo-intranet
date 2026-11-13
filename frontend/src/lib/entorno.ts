import { Capacitor } from "@capacitor/core"

/** true dentro del APK (Capacitor); false en el navegador. */
export const esNativo: boolean = (() => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
})()

/** Origen público de la intranet: en web el propio origen; en el APK el servidor (el WebView corre en https://localhost). */
export const ORIGEN_PUBLICO: string = (
  (import.meta.env.VITE_PUBLIC_URL as string | undefined) ||
  (esNativo ? "https://zymointranet.com" : typeof window !== "undefined" ? window.location.origin : "")
).replace(/\/$/, "")

const ABSOLUTA = /^(https?:|data:|blob:)/i

/** Ruta de un recurso del servidor (imágenes, archivos, fetch). En web no cambia nada; en el APK antepone el servidor. */
export function urlRecurso<T extends string | null | undefined>(path: T): T {
  if (!path || !esNativo || ABSOLUTA.test(path) || !path.startsWith("/")) return path
  return `${ORIGEN_PUBLICO}${path}` as T
}

/** Enlace que se comparte con otras personas: siempre el origen público, nunca https://localhost. */
export function urlPublica(path: string): string {
  if (ABSOLUTA.test(path)) return path
  return `${ORIGEN_PUBLICO}${path.startsWith("/") ? path : `/${path}`}`
}

/** Abre una dirección fuera de la app: navegador del sistema en el APK; pestaña nueva en web. */
export function abrirExterno(url: string): void {
  if (esNativo) {
    void import("@capacitor/browser")
      .then(({ Browser }) => Browser.open({ url }))
      .catch(() => { window.open(url, "_system") })
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}
