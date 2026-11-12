// Un ticket de la mesa de ayuda, organizado igual que un caso de la Central de
// tickets (CentralDetalle): cabecera, conversación con el redactor abajo y, al
// lado, la columna de gestión en tarjetas. Con poco ancho, conversación y
// gestión son dos pestañas; en el teléfono ocupa toda la pantalla.

import { useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowLeft, Lock, Paperclip, Send, X } from "lucide-react"
import { descargarEvidencia, useMesaAccion, useMesaTicket } from "@/hooks/useMesa"
import { estadoDeError, mensajeDeError, tamanoLegible } from "@/lib/mesa"
import { formatFechaHora, formatFechaRelativa } from "@/lib/dates"
import type { MesaDetalle, MesaEvidencia } from "@/types/mesa"
import { Estado } from "./MesaLista"
import { MesaGestion } from "./MesaGestion"

function Adjuntos({ lista }: { lista: MesaEvidencia[] }) {
  const [fallo, setFallo] = useState(false)
  if (lista.length === 0) return null
  return (
    <div>
      {lista.map((e) => (
        <button key={e.id} type="button" className="mesa-adjunto" title={`Descargar ${e.nombreArchivo}`} onClick={() => descargarEvidencia(e.id, e.nombreArchivo).then(() => setFallo(false), () => setFallo(true))}>
          <span>{e.nombreArchivo}</span> {tamanoLegible(e.tamano)}
        </button>
      ))}
      {fallo && <p className="mesa-ayuda" role="alert">No pudimos descargar el archivo. Intenta de nuevo.</p>}
    </div>
  )
}

/** Lo que se pidió va primero, como «Lo que radicó…» en un caso de la Central; después, las burbujas. */
function Conversacion({ t }: { t: MesaDetalle }) {
  const fin = useRef<HTMLDivElement>(null)
  useEffect(() => { fin.current?.scrollIntoView({ block: "end" }) }, [t.id, t.mensajes.length])
  return (
    <div role="log" aria-label="Conversación" className="mesa-log">
      <div className="mesa-card mesa-pedido">
        <p className="mesa-pedido-cab">Lo que pidió {t.creadorNombre}, <time dateTime={t.createdAt}>{formatFechaHora(t.createdAt)}</time></p>
        <p className="mesa-texto-largo">{t.descripcion}</p>
        <Adjuntos lista={t.evidencias.filter((e) => e.mensajeId === null)} />
      </div>
      {t.mensajes.map((m) => {
        const equipo = m.autorId !== t.creadorId
        return (
          <div key={m.id} className="mesa-burbuja-fila" data-equipo={equipo || undefined}>
            <div className="mesa-burbuja-caja">
              <div className="mesa-burbuja" data-interno={m.interno || undefined}>
                {m.interno && <p className="mesa-burbuja-interna"><Lock className="size-3" aria-hidden /> Nota interna, solo equipo</p>}
                <p className="mesa-texto-largo">{m.texto}</p>
                <Adjuntos lista={t.evidencias.filter((e) => e.mensajeId === m.id)} />
              </div>
              <p className="mesa-burbuja-pie">{m.autorNombre}, <time dateTime={m.createdAt}>{formatFechaHora(m.createdAt)}</time></p>
            </div>
          </div>
        )
      })}
      <div ref={fin} />
    </div>
  )
}

function Redactor({ t }: { t: MesaDetalle }) {
  const accion = useMesaAccion()
  const [texto, setTexto] = useState("")
  const [interno, setInterno] = useState(false)
  const [archivos, setArchivos] = useState<File[]>([])
  const p = t.permisos

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim() || accion.isPending) return
    const datos = new FormData()
    datos.set("texto", texto.trim())
    datos.set("interno", String(interno))
    for (const f of archivos) datos.append("evidencias", f)
    accion.mutate({ tipo: "mensaje", id: t.id, datos }, { onSuccess: () => { setTexto(""); setArchivos([]); setInterno(false) } })
  }

  if (t.eliminadoEn || !p.comentar) return null
  if (t.estado === "cerrado" && t.relacion !== "creador") {
    return <div className="mesa-redactor"><p className="mesa-ayuda" style={{ marginTop: 0 }}>El ticket está cerrado. Para responder, reábrelo en Gestión.</p></div>
  }
  const paraQuien = interno
    ? "Solo la ve el equipo que atiende el ticket"
    : t.estado === "cerrado" ? "Al responder, el ticket se vuelve a abrir" : `La ve ${t.relacion === "creador" ? "el área que atiende" : t.creadorNombre}`

  return (
    <form className="mesa-redactor" onSubmit={enviar}>
      <div className="mesa-redactor-barra">
        {p.nota_interna && (
          <button type="button" className="mesa-btn2 mesa-toggle" style={{ minHeight: 36 }} aria-pressed={interno} onClick={() => setInterno(!interno)}>
            <Lock className="size-3.5" aria-hidden /> Nota interna
          </button>
        )}
        {p.evidencia && (
          <>
            <label className="mesa-btn2" style={{ minHeight: 36 }} htmlFor="mesa-r-arch"><Paperclip className="size-3.5" aria-hidden /> Adjuntar</label>
            <input id="mesa-r-arch" className="sr-only" type="file" multiple onChange={(e) => { setArchivos([...archivos, ...Array.from(e.target.files ?? [])].slice(0, 10)); e.target.value = "" }} />
          </>
        )}
        <small id="mesa-r-ayuda">{paraQuien}. Ctrl + Enter para enviar</small>
      </div>
      {archivos.length > 0 && (
        <div style={{ marginBottom: "0.5rem" }}>
          {archivos.map((f, i) => (
            <button key={`${f.name}-${i}`} type="button" className="mesa-adjunto" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`}>
              <span>{f.name}</span> {tamanoLegible(f.size)} ✕
            </button>
          ))}
        </div>
      )}
      <div className="mesa-redactor-fila">
        <label className="sr-only" htmlFor="mesa-r-texto">{interno ? "Nota interna" : "Respuesta"}</label>
        <textarea
          id="mesa-r-texto" name="respuesta" autoComplete="off" className="mesa-campo" rows={1} maxLength={4000} value={texto}
          placeholder={interno ? "Escribe una nota para el equipo…" : "Escribe tu respuesta…"} aria-describedby="mesa-r-ayuda"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit() }}
        />
        <button type="submit" className="mesa-enviar" disabled={!texto.trim() || accion.isPending} aria-label={interno ? "Guardar nota interna" : "Enviar respuesta"}>
          <Send className="size-4" aria-hidden />
        </button>
      </div>
      {accion.isError && <p className="mesa-error" role="alert">{mensajeDeError(accion.error)}</p>}
    </form>
  )
}

/** Marcador de la columna derecha cuando no hay ticket elegido (solo escritorio). */
export function MesaTicketVacio() {
  return (
    <div className="mesa-card mesa-sin-ticket">
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <path fill="currentColor" stroke="currentColor" strokeWidth="8" strokeLinejoin="round" d="M94 6 L66 94 L50 54 L6 38 Z" />
      </svg>
      <h2>Elige una solicitud</h2>
      <p>Aquí verás la conversación y la gestión del ticket que elijas en la lista.</p>
    </div>
  )
}

export function MesaTicket({ id, onCerrar }: { id: number; onCerrar: () => void }) {
  const ticket = useMesaTicket(id)
  const [pestana, setPestana] = useState<"chat" | "gestion">("chat")
  const t = ticket.data
  const noExiste = estadoDeError(ticket.error) === 404

  return (
    <section aria-label={t ? `Ticket ${t.codigo}` : "Ticket"} data-pestana={pestana} className="mesa-t">
      <header className="mesa-t-cab">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onCerrar} className="mesa-btn2 mesa-redondo -ml-1 mt-0.5" aria-label="Volver a la lista de solicitudes">
            <ArrowLeft className="size-4 lg:hidden" aria-hidden />
            <X className="hidden size-4 lg:block" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            {t && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="mesa-cod" translate="no">{t.codigo}</span>
                <Estado ticket={t} />
              </div>
            )}
            <h2>{t?.asunto ?? (ticket.isError ? (noExiste ? "Solicitud no disponible" : "No pudimos abrir la solicitud") : "Cargando solicitud…")}</h2>
            <p className="mesa-t-meta">
              {t
                ? `${t.creadorNombre}${t.creadorArea ? `, ${t.creadorArea}` : ""}. Para ${t.areaNombre}${t.categoria ? `, ${t.categoria.nombre}` : ""}. Creada ${formatFechaRelativa(t.createdAt)}`
                : "Solicitud de la mesa de ayuda"}
            </p>
          </div>
        </div>
        {t && (
          <div role="tablist" aria-label="Secciones del ticket" className="mesa-t-tabs">
            <button type="button" role="tab" aria-selected={pestana === "chat"} onClick={() => setPestana("chat")}>Conversación ({t.mensajes.length})</button>
            <button type="button" role="tab" aria-selected={pestana === "gestion"} onClick={() => setPestana("gestion")}>Gestión</button>
          </div>
        )}
      </header>

      {!t ? (
        <div className="mesa-card-pad">
          {ticket.isError ? (
            <div className="mesa-vacio" role="alert">
              <h2>{noExiste ? "No encontramos esa solicitud" : "No pudimos abrir la solicitud"}</h2>
              <p>{noExiste ? "Puede que la hayan eliminado o que ya no esté en tu área." : mensajeDeError(ticket.error)}</p>
              <div className="mesa-acciones">
                <button type="button" className="mesa-btn2" onClick={noExiste ? onCerrar : () => ticket.refetch()}>{noExiste ? "Volver a la lista" : "Reintentar"}</button>
              </div>
            </div>
          ) : (
            <div aria-busy="true" aria-label="Cargando solicitud">{[0, 1, 2].map((i) => <div key={i} className="mesa-esqueleto" />)}</div>
          )}
        </div>
      ) : (
        <div className="mesa-t-cuerpo">
          <div className="mesa-t-chat">
            <Conversacion t={t} />
            <Redactor key={t.id} t={t} />
          </div>
          <div className="mesa-t-gestion">
            <MesaGestion key={t.id} ticket={t} onEliminado={onCerrar} />
          </div>
        </div>
      )}
    </section>
  )
}
