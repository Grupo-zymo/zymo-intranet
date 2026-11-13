import { Download, FileText } from "lucide-react"

/** Tarjeta que sustituye al visor embebido (iframe) dentro del APK: el WebView de Android no pinta PDF/archivos en iframe. */
export function ArchivoNoVisible({ nombre, detalle, onDescargar, etiqueta = "Descargar / compartir", cargando = false }: {
  nombre: string
  /** Tipo y/o tamaño si se conocen. */
  detalle?: string
  onDescargar: () => void
  etiqueta?: string
  cargando?: boolean
}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-zinc-50 p-4 font-['DM_Sans',system-ui,sans-serif]">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#C11A3C]/10 text-[#C11A3C]">
          <FileText className="h-6 w-6" aria-hidden />
        </div>
        <p className="break-words text-sm font-semibold text-zinc-900">{nombre}</p>
        {detalle && <p className="mt-0.5 text-xs text-zinc-500">{detalle}</p>}
        <p className="mt-2 text-xs text-zinc-500">Este archivo no se puede ver dentro de la app. Guárdalo o compártelo para abrirlo.</p>
        <button
          type="button"
          onClick={onDescargar}
          disabled={cargando}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#C11A3C] px-4 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          <Download className="h-4 w-4" aria-hidden />
          {cargando ? "Preparando…" : etiqueta}
        </button>
      </div>
    </div>
  )
}
