import { useEffect } from "react"
import { sigSoloLectura } from "@/lib/permissions"
import { useAuthStore } from "@/store/authStore"

/** True para el líder de área: los visores y listas del SIG no le ofrecen descargar ni imprimir (ver `sigSoloLectura`). */
export function useSinDescarga(): boolean {
  return useAuthStore((s) => (s.user ? sigSoloLectura(s.user.role, s.user.app_permissions) : false))
}

const esCampo = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable)

/**
 * Mientras el líder de área está en el SIG: sin menú de clic derecho (salvo en los campos de texto, para pegar),
 * sin Ctrl+P ni Ctrl+S, y lo que imprima desde el menú del navegador sale en blanco. Con el visor propio de PDF
 * (PdfLectura) ya no hay lector del navegador con su propio menú.
 * ponytail: disuade, no protege: el archivo llega al navegador para mostrarse (herramientas de desarrollador,
 * captura de pantalla). Protección real = no enviar el original (p. ej., páginas como imagen desde el servidor).
 */
export function useSoloLectura(activo: boolean): void {
  useEffect(() => {
    if (!activo) return
    const menu = (e: MouseEvent) => { if (!esCampo(e.target)) e.preventDefault() }
    const teclas = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "p" || e.key.toLowerCase() === "s")) e.preventDefault()
    }
    const estilo = document.createElement("style")
    estilo.textContent = "@media print { body { visibility: hidden !important; } }"
    document.addEventListener("contextmenu", menu, true)
    window.addEventListener("keydown", teclas, true)
    document.head.appendChild(estilo)
    return () => {
      document.removeEventListener("contextmenu", menu, true)
      window.removeEventListener("keydown", teclas, true)
      estilo.remove()
    }
  }, [activo])
}
