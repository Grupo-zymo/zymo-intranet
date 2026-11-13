import { useState, type FormEvent } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useMesaAccion, useMesaAreas } from "@/hooks/useMesa"
import { mensajeDeError, tamanoLegible } from "@/lib/mesa"
import type { MesaTicket } from "@/types/mesa"
import "./mesa.css"
import "./mesa-bandeja.css"

const MAX_ARCHIVOS = 10
const MAX_BYTES = 15 * 1024 * 1024

/** Datos con los que arranca el formulario cuando SAC lo abre desde un caso de la Central. */
export interface MesaNuevaInicial {
  radicadoOrigen: string
  asunto: string
  descripcion: string
}

interface Props {
  abierto: boolean
  onCerrar: () => void
  onCreado: (ticket: MesaTicket) => void
  inicial?: MesaNuevaInicial
}

export function MesaNueva({ abierto, onCerrar, onCreado, inicial }: Props) {
  const areas = useMesaAreas()
  const accion = useMesaAccion()
  const [areaId, setAreaId] = useState("")
  const [categoriaId, setCategoriaId] = useState("")
  const [asunto, setAsunto] = useState(inicial?.asunto ?? "")
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "")
  const [archivos, setArchivos] = useState<File[]>([])
  const [aviso, setAviso] = useState("")

  const categorias = areas.data?.find((a) => String(a.areaId) === areaId)?.categorias ?? []

  function limpiar() {
    setAreaId(""); setCategoriaId(""); setAsunto(inicial?.asunto ?? ""); setDescripcion(inicial?.descripcion ?? ""); setArchivos([]); setAviso("")
    accion.reset()
  }

  function elegirArchivos(lista: FileList | null) {
    const nuevos = [...archivos, ...Array.from(lista ?? [])]
    const pesado = nuevos.find((f) => f.size > MAX_BYTES)
    if (pesado) { setAviso(`"${pesado.name}" pesa más de 15 MB. Adjunta un archivo más liviano.`); return }
    if (nuevos.length > MAX_ARCHIVOS) { setAviso(`Puedes adjuntar hasta ${MAX_ARCHIVOS} archivos por solicitud. Quita alguno e intenta de nuevo.`); return }
    setAviso("")
    setArchivos(nuevos)
  }

  function enviar(e: FormEvent) {
    e.preventDefault()
    const datos = new FormData()
    datos.set("areaId", areaId)
    if (categoriaId) datos.set("categoriaId", categoriaId)
    datos.set("asunto", asunto.trim())
    datos.set("descripcion", descripcion.trim())
    if (inicial) datos.set("radicadoOrigen", inicial.radicadoOrigen)
    for (const f of archivos) datos.append("evidencias", f)
    accion.mutate({ tipo: "crear", datos }, {
      onSuccess: (ticket) => { limpiar(); onCreado(ticket as MesaTicket) },
    })
  }

  const error = aviso || (accion.isError ? mensajeDeError(accion.error) : "")

  // Con algo escrito, cerrar (Esc, clic afuera o Cancelar) pregunta antes de perderlo
  const conBorrador = asunto.trim() !== (inicial?.asunto ?? "").trim() || descripcion.trim() !== (inicial?.descripcion ?? "").trim() || archivos.length > 0
  function cerrar() {
    if (conBorrador && !window.confirm("¿Descartar lo que escribiste? La solicitud no se ha enviado.")) return
    limpiar()
    onCerrar()
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o && !accion.isPending) cerrar() }}>
      <DialogContent className="mesa-capa max-h-[92dvh] overflow-y-auto overscroll-contain sm:max-w-xl">
        <DialogTitle asChild><h2>{inicial ? "Pedir apoyo a otra área" : "Nueva solicitud"}</h2></DialogTitle>
        <DialogDescription className="mesa-ayuda">
          {inicial
            ? <>Crea un ticket interno enlazado al caso <strong translate="no">{inicial.radicadoOrigen}</strong>. El cliente no lo ve.</>
            : "Elige el área que debe atenderla. Al enviarla recibe un consecutivo y le llega a esa área."}
        </DialogDescription>

        <form className="mesa-form" onSubmit={enviar}>
          <div>
            <label className="mesa-etiqueta" htmlFor="mesa-n-area">Área que la atiende</label>
            <select id="mesa-n-area" name="area" className="mesa-campo" required value={areaId} onChange={(e) => { setAreaId(e.target.value); setCategoriaId("") }}>
              <option value="" disabled>{areas.isPending ? "Cargando áreas…" : "Elige un área"}</option>
              {areas.data?.map((a) => <option key={a.areaId} value={a.areaId}>{a.nombre}</option>)}
            </select>
            {areas.isError && <p className="mesa-ayuda" role="alert">No pudimos cargar las áreas. Cierra y vuelve a intentar.</p>}
          </div>

          {categorias.length > 0 && (
            <div>
              <label className="mesa-etiqueta" htmlFor="mesa-n-cat">Tipo de solicitud (opcional)</label>
              <select id="mesa-n-cat" name="categoria" className="mesa-campo" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">No estoy seguro</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="mesa-etiqueta" htmlFor="mesa-n-asunto">Asunto</label>
            <input id="mesa-n-asunto" name="asunto" autoComplete="off" className="mesa-campo" required minLength={3} maxLength={160} value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Ej.: La impresora del piso 2 no imprime…" />
          </div>

          <div>
            <label className="mesa-etiqueta" htmlFor="mesa-n-desc">Qué necesitas</label>
            <textarea id="mesa-n-desc" name="descripcion" autoComplete="off" className="mesa-campo" required maxLength={8000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} aria-describedby="mesa-n-desc-ayuda" />
            <p id="mesa-n-desc-ayuda" className="mesa-ayuda">Cuenta qué pasa, desde cuándo y qué esperas que hagan.</p>
          </div>

          <div>
            <label className="mesa-etiqueta" htmlFor="mesa-n-arch">Evidencias (opcional)</label>
            <input id="mesa-n-arch" className="mesa-campo" type="file" multiple onChange={(e) => { elegirArchivos(e.target.files); e.target.value = "" }} aria-describedby="mesa-n-arch-ayuda" />
            <p id="mesa-n-arch-ayuda" className="mesa-ayuda">Fotos, capturas o documentos. Hasta {MAX_ARCHIVOS} archivos de 15 MB cada uno.</p>
            {archivos.map((f, i) => (
              <button key={`${f.name}-${i}`} type="button" className="mesa-adjunto" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`}>
                <span>{f.name}</span> {tamanoLegible(f.size)} ✕
              </button>
            ))}
          </div>

          {error && <p className="mesa-error" role="alert">{error}</p>}

          <div className="mesa-fila-acc" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="mesa-btn2" disabled={accion.isPending} onClick={cerrar}>Cancelar</button>
            <button type="submit" className="mesa-btn" disabled={accion.isPending}>{accion.isPending ? "Enviando…" : "Enviar solicitud"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
