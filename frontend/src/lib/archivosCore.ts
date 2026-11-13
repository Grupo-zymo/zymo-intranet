// Parte pura (sin Capacitor ni DOM de la app) del manejo de archivos: nombres y decisión web/nativo.
// Se prueba en scripts/archivos.selfcheck.ts; el cableado real vive en archivos.ts.

const PELIGROSOS = /[\u0000-\u001f\u007f<>:"|?*\\/]/g

/** Nombre seguro para guardar en el teléfono: sin rutas ni caracteres peligrosos, extensión conservada, máx. 100 caracteres. */
export function sanearNombre(nombre: string | null | undefined, respaldo = "archivo"): string {
  let n = String(nombre ?? "").split(/[\\/]/).pop() ?? ""
  n = n.replace(PELIGROSOS, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "").replace(/[. ]+$/, "")
  if (!n) n = respaldo
  const punto = n.lastIndexOf(".")
  const ext = punto > 0 && n.length - punto <= 10 ? n.slice(punto) : ""
  const base = ext ? n.slice(0, punto) : n
  return `${base.slice(0, 100 - ext.length)}${ext}`
}

/** Subcarpeta única por archivo: el nombre visible al compartir queda limpio y no se pisan descargas previas. */
export function idUnico(marca: number = Date.now(), azar: string = Math.random().toString(36).slice(2, 8)): string {
  return `${marca.toString(36)}${azar}`
}

/** Ruta `<carpeta>/<id-único>/<nombre-limpio>`: el nombre se usa tal cual (ya saneado). */
export function rutaUnica(carpeta: string, nombre: string, marca?: number, azar?: string): string {
  return `${carpeta}/${idUnico(marca, azar)}/${nombre}`
}

/** Nombre de archivo según Content-Disposition (soporta filename*=UTF-8''...); si no hay, el respaldo. */
export function nombreDesdeDisposition(cabecera: string | null | undefined, respaldo: string): string {
  if (cabecera) {
    const ext = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(cabecera)
    if (ext?.[1]) {
      try {
        return sanearNombre(decodeURIComponent(ext[1].trim().replace(/^"|"$/g, "")), respaldo)
      } catch {
        /* cae al siguiente formato */
      }
    }
    const simple = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(cabecera)
    const v = simple?.[1] ?? simple?.[2]
    if (v) return sanearNombre(v.trim(), respaldo)
  }
  return sanearNombre(respaldo)
}

export interface DepsArchivos {
  esNativo: boolean
  web: (blob: Blob, nombre: string) => void
  nativo: (blob: Blob, nombre: string) => Promise<void>
}

/** Decide la ruta: en web se conserva el comportamiento de siempre; en el APK se guarda y comparte. */
export function crearGuardador(deps: DepsArchivos) {
  return async (blob: Blob, nombre: string): Promise<void> => {
    if (!deps.esNativo) {
      deps.web(blob, nombre)
      return
    }
    await deps.nativo(blob, sanearNombre(nombre))
  }
}

/** true si el error del diálogo de compartir es solo que la persona lo cerró. */
export function esCancelacion(e: unknown): boolean {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : String((e as { message?: unknown })?.message ?? "")
  return /cancel/i.test(m)
}
