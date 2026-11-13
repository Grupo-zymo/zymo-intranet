import type { ReactNode } from "react"
import { guardarDesdeBlobUrl } from "@/lib/archivos"
import { abrirExterno, esNativo } from "@/lib/entorno"

/** Enlace de descarga. Web: <a download> (igual que siempre). APK: guarda/comparte el blob, o abre en el navegador del sistema si es una URL del servidor. */
export function EnlaceDescarga({ href, download, className, title, children }: {
  href: string
  download: string
  className?: string
  title?: string
  children: ReactNode
}) {
  if (!esNativo) {
    return <a href={href} download={download} className={className} title={title}>{children}</a>
  }
  const alClick = () => {
    if (/^(blob:|data:)/i.test(href)) void guardarDesdeBlobUrl(href, download)
    else abrirExterno(href)
  }
  return <button type="button" onClick={alClick} className={className} title={title}>{children}</button>
}
