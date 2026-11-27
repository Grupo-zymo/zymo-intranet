import { useCallback, useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs"
import { Loader, Maximize2, Minus, Plus } from "lucide-react"

/**
 * Visor de PDF de solo lectura para el líder de área: dibuja cada página en un <canvas> con pdf.js, EN EL NAVEGADOR
 * del líder (el servidor envía el mismo archivo que antes). Sin el lector del navegador no hay barra ni menú de
 * «Guardar» o «Imprimir»; el clic derecho y Ctrl+P/S los bloquea `useSoloLectura` (sinDescarga.ts).
 * Las páginas se dibujan solo cuando se acercan a la vista.
 */

type Pagina = { ancho: number; alto: number } // tamaño de la página a escala 1, en puntos

const ZOOM_MIN = 0.4
const ZOOM_MAX = 3
const MARGEN = 32 // px a los lados al ajustar al ancho
const MAX_PIXELES = 16_000_000 // tope por página: a más zoom se dibuja con menos detalle en vez de agotar la memoria

/** Recursos que copia scripts/copiar-pdfjs.mjs: sin los wasm, las imágenes escaneadas (CCITT, JBIG2, JPEG2000) salen en blanco. */
const RECURSOS = { wasmUrl: "/pdfjs/wasm/", standardFontDataUrl: "/pdfjs/standard_fonts/", iccUrl: "/pdfjs/iccs/" }

/** Build «legacy» de pdf.js: trae los polyfills que necesita en navegadores sin actualizar (p. ej. Chrome 109 de Windows 7). */
async function cargarPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).href
  return pdfjs
}

function PaginaPdf({ pdf, numero, pagina, escala }: { pdf: PDFDocumentProxy; numero: number; pagina: Pagina; escala: number }) {
  const caja = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = caja.current
    if (!el) return
    // la raíz es el recuadro con scroll del visor: con la ventana como raíz, el margen no cuenta dentro del recuadro
    const raiz = el.closest<HTMLElement>("[role=document]")
    // entra y sale: una página lejos de la vista suelta su dibujo (si no, recorrer un PDF largo agota la memoria)
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { root: raiz, rootMargin: "800px 0px" })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const canvas = lienzo.current
    if (!canvas) return
    if (!visible) { canvas.width = 0; canvas.height = 0; return } // libera la memoria del lienzo
    let tarea: RenderTask | null = null
    let cancelado = false
    pdf.getPage(numero).then((page) => {
      if (cancelado) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const base = page.getViewport({ scale: 1 })
      // escala pedida, sin pasar del tope de píxeles por página
      const escalaReal = Math.min(escala * dpr, Math.sqrt(MAX_PIXELES / (base.width * base.height)))
      const viewport = page.getViewport({ scale: escalaReal })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      tarea = page.render({ canvas, viewport })
      tarea.promise.catch(() => { /* cancelada al cambiar el zoom o al salir */ })
    }).catch(() => { /* el documento se cerró mientras se pedía la página */ })
    return () => { cancelado = true; tarea?.cancel() }
  }, [visible, pdf, numero, escala])

  return (
    <div
      ref={caja}
      className="mx-auto bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
      style={{ width: pagina.ancho * escala, height: pagina.alto * escala }}
    >
      <canvas ref={lienzo} aria-hidden className="block h-full w-full select-none" />
    </div>
  )
}

/** Escala que hace caber la página más ancha en un marco de ese ancho. */
const escalaAjustada = (anchoMarco: number, paginas: Pagina[]) =>
  Math.min(Math.max((anchoMarco - MARGEN) / Math.max(...paginas.map((p) => p.ancho), 1), ZOOM_MIN), ZOOM_MAX)

/** Un documento nuevo (otro `src`) arranca de cero: la `key` reinicia todo el estado del visor. */
export function PdfLectura({ src, title }: { src: string; title: string }) {
  return <VisorPdf key={src} src={src} title={title} />
}

function VisorPdf({ src, title }: { src: string; title: string }) {
  const marco = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [paginas, setPaginas] = useState<Pagina[]>([])
  const [escala, setEscala] = useState<number | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    let liberar: (() => Promise<void>) | null = null
    ;(async () => {
      try {
        const pdfjs = await cargarPdfjs()
        const datos = new Uint8Array(await (await fetch(src)).arrayBuffer())
        if (!vivo) return // se cerró antes de crear el worker de pdf.js: no se crea
        const carga = pdfjs.getDocument({ data: datos, ...RECURSOS })
        liberar = () => carga.destroy()
        const doc = await carga.promise
        const tam: Pagina[] = []
        for (let n = 1; n <= doc.numPages; n++) {
          if (!vivo) break
          const v = (await doc.getPage(n)).getViewport({ scale: 1 })
          tam.push({ ancho: v.width, alto: v.height })
        }
        if (!vivo) { void carga.destroy(); return } // se cerró a mitad de la carga: el worker no queda vivo
        setPaginas(tam)
        setEscala(escalaAjustada(marco.current?.clientWidth ?? 800, tam)) // al abrir, ajustado al ancho
        setPdf(doc)
      } catch {
        if (vivo) setError(true)
      }
    })()
    return () => { vivo = false; void liberar?.() }
  }, [src])

  const ajustar = useCallback(() => {
    const ancho = marco.current?.clientWidth ?? 0
    if (ancho > 0) setEscala(escalaAjustada(ancho, paginas))
  }, [paginas])

  const zoom = (factor: number) => setEscala((e) => Math.min(Math.max((e ?? 1) * factor, ZOOM_MIN), ZOOM_MAX))

  if (error) {
    return <div className="flex h-full items-center justify-center p-6 text-center text-xs text-zinc-600" role="alert">No se pudo mostrar el documento.</div>
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-300 bg-white px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-700" title={title}>{title}</span>
        {pdf && <span className="font-mono text-[11px] text-zinc-600">{paginas.length} pág.</span>}
        <div className="flex items-center gap-0.5" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoom(1 / 1.2)} disabled={!pdf} aria-label="Alejar" title="Alejar" className="rounded p-1 text-zinc-600 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-helix-accent/40 disabled:opacity-40">
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="w-11 text-center font-mono text-[11px] tabular-nums text-zinc-700" aria-live="polite">{escala ? `${Math.round(escala * 100)}%` : "—"}</span>
          <button type="button" onClick={() => zoom(1.2)} disabled={!pdf} aria-label="Acercar" title="Acercar" className="rounded p-1 text-zinc-600 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-helix-accent/40 disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button type="button" onClick={ajustar} disabled={!pdf} aria-label="Ajustar al ancho" title="Ajustar al ancho" className="rounded p-1 text-zinc-600 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-helix-accent/40 disabled:opacity-40">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <div ref={marco} className="min-h-0 flex-1 overflow-auto bg-zinc-200 py-4" aria-label={title} role="document">
        {!pdf || escala === null ? (
          <div className="flex h-full items-center justify-center gap-2 text-zinc-600" role="status">
            <Loader className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            <span className="font-mono text-xs">Preparando vista previa…</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-4">
            {paginas.map((p, i) => <PaginaPdf key={i} pdf={pdf} numero={i + 1} pagina={p} escala={escala} />)}
          </div>
        )}
      </div>
    </div>
  )
}
