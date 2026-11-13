import { esNativo } from "@/lib/entorno"
import { crearGuardador, esCancelacion, rutaUnica, sanearNombre } from "@/lib/archivosCore"

export { nombreDesdeDisposition, sanearNombre } from "@/lib/archivosCore"

const CARPETA = "descargas"
const MAX_BYTES = 60 * 1024 * 1024
const TROZO = 3 * 1024 * 1024 // múltiplo de 3 para que cada trozo en base64 no lleve relleno
const UN_DIA = 24 * 60 * 60 * 1000

function aviso(mensaje: string, error = false): void {
  if (typeof document === "undefined") return
  const el = document.createElement("div")
  el.setAttribute("role", "status")
  el.textContent = mensaje
  el.style.cssText =
    "position:fixed;left:16px;right:16px;bottom:calc(24px + env(safe-area-inset-bottom));z-index:99999;padding:12px 16px;border-radius:12px;" +
    `font:500 14px "DM Sans",system-ui,sans-serif;background:#fff;color:#18181b;border:1px solid ${error ? "#C11A3C" : "#e4e4e7"};` +
    "box-shadow:0 8px 24px rgba(0,0,0,.15);text-align:center"
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 4000)
}

function leerBase64(trozo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(r.error ?? new Error("No se pudo leer el archivo"))
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "")
    r.readAsDataURL(trozo)
  })
}

async function guardarYCompartir(blob: Blob, nombre: string): Promise<void> {
  if (blob.size > MAX_BYTES) {
    aviso("El archivo es demasiado grande para guardarlo desde la app (máx. 60 MB). Ábrelo desde la intranet web.", true)
    return
  }
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")])
    const path = rutaUnica(CARPETA, nombre)
    for (let i = 0; i < Math.max(blob.size, 1); i += TROZO) {
      const data = await leerBase64(blob.slice(i, i + TROZO))
      if (i === 0) await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true })
      else await Filesystem.appendFile({ path, data, directory: Directory.Cache })
    }
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
    try {
      await Share.share({ title: nombre, url: uri, dialogTitle: "Guardar o compartir" })
    } catch (e) {
      if (!esCancelacion(e)) throw e
    }
  } catch (e) {
    console.error("guardarArchivo", e)
    aviso("No se pudo guardar el archivo. Inténtalo de nuevo.", true)
  }
}

function descargaWeb(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Descarga un blob. Web: <a download>. APK: lo guarda en caché y abre el selector de compartir (Guardar en Descargas, Drive, WhatsApp...). */
export const guardarArchivo: (blob: Blob, nombre: string) => Promise<void> = crearGuardador({
  esNativo,
  web: descargaWeb,
  nativo: guardarYCompartir,
})

/** Reemplazo de window.open(blobUrl). Web: pestaña nueva (devuelve false si el navegador la bloqueó). APK: guardar y compartir. */
export async function abrirBlobEnNuevaVentana(blob: Blob, nombre = "archivo"): Promise<boolean> {
  if (esNativo) {
    await guardarYCompartir(blob, sanearNombre(nombre))
    return true
  }
  const url = URL.createObjectURL(blob)
  const win = window.open(url, "_blank", "noopener,noreferrer")
  if (!win) {
    URL.revokeObjectURL(url)
    return false
  }
  // Margen para no romper la carga del visor PDF en la pestaña nueva
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
  return true
}

/** Borra de la caché del APK los archivos guardados hace más de 24 h. Llamar al iniciar. */
export async function limpiarArchivosTemporales(): Promise<void> {
  if (!esNativo) return
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem")
    const { files } = await Filesystem.readdir({ path: CARPETA, directory: Directory.Cache })
    const limite = Date.now() - UN_DIA
    await Promise.all(
      files
        .filter((f) => (f.mtime ?? Date.now()) < limite)
        .map((f) =>
          f.type === "directory"
            ? Filesystem.rmdir({ path: `${CARPETA}/${f.name}`, directory: Directory.Cache, recursive: true }).catch(() => undefined)
            : Filesystem.deleteFile({ path: `${CARPETA}/${f.name}`, directory: Directory.Cache }).catch(() => undefined),
        ),
    )
  } catch {
    /* la carpeta aún no existe: nada que limpiar */
  }
}

/** Guarda lo que hay detrás de una URL blob: (la que ya se cargó para previsualizar). */
export async function guardarDesdeBlobUrl(blobUrl: string, nombre: string): Promise<void> {
  await guardarArchivo(await (await fetch(blobUrl)).blob(), nombre)
}
