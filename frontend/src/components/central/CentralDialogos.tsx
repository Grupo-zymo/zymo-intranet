// Diálogos del detalle: asignar / reasignar a un líder y confirmar acciones
// que no se deshacen fácil (cerrar, liberar).

import { useId, useMemo, useState } from "react"
import { Check, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useCentralLideres } from "@/hooks/useCentralTickets"
import { mensajeDeError } from "@/lib/centralTickets"
import type { CentralLider } from "@/types/centralTickets"
import { Avatar } from "./partes"

const CONTENIDO = "central ct-panel max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg gap-0 overflow-hidden rounded-[1.5rem] p-0"

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function Opcion({ lider, elegido, actual, onElegir }: { lider: CentralLider; elegido: boolean; actual: boolean; onElegir: () => void }) {
  return (
    <li role="presentation">
      <button
        type="button"
        role="option"
        aria-selected={elegido}
        disabled={actual}
        onClick={onElegir}
        className="flex w-full cursor-pointer items-center gap-3 min-h-[52px] rounded-2xl px-2.5 py-2 text-left transition-colors duration-150 hover:bg-[var(--ct-hover)] disabled:cursor-not-allowed disabled:opacity-55 aria-selected:bg-[var(--ct-red-soft)]"
      >
        <Avatar nombre={lider.nombre} className="!size-8 !text-[11px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{lider.nombre}</span>
          <span className="ct-muted block truncate text-xs">
            {[lider.cargo ?? "Sin cargo en el directorio", lider.area].filter(Boolean).join(" · ")}
          </span>
        </span>
        {actual ? (
          <span className="ct-faint flex-none text-[11px]">Responsable actual</span>
        ) : (
          elegido && <Check className="size-4 flex-none text-[color:var(--ct-green)]" aria-hidden />
        )}
      </button>
    </li>
  )
}

export function DialogoAsignar({
  abierto,
  radicado,
  responsableEmail,
  enviando,
  onCerrar,
  onAsignar,
}: {
  abierto: boolean
  radicado: string
  /** Correo de quien tiene hoy el caso (no se le puede reasignar a sí mismo). */
  responsableEmail: string | null
  enviando: boolean
  onCerrar: () => void
  onAsignar: (lider: CentralLider, nota: string) => void
}) {
  const { data: lideres, isLoading, error, refetch } = useCentralLideres(abierto)
  const [busqueda, setBusqueda] = useState("")
  const [elegido, setElegido] = useState<CentralLider | null>(null)
  const [nota, setNota] = useState("")
  const idNota = useId()

  const { jefes, equipo } = useMemo(() => {
    const q = sinTildes(busqueda.trim())
    const visibles = (lideres ?? []).filter(
      (l) => !q || sinTildes(`${l.nombre} ${l.cargo ?? ""} ${l.area ?? ""} ${l.email}`).includes(q),
    )
    return { jefes: visibles.filter((l) => l.esLider), equipo: visibles.filter((l) => !l.esLider) }
  }, [lideres, busqueda])

  const esActual = (l: CentralLider) => !!responsableEmail && l.email.toLowerCase() === responsableEmail.toLowerCase()
  const grupo = (titulo: string, lista: CentralLider[]) =>
    lista.length > 0 && (
      <li role="presentation">
        <p className="ct-faint m-0 px-2.5 pb-1 pt-2.5 text-[11px] font-semibold">{titulo}</p>
        <ul role="group" aria-label={titulo} className="m-0 list-none p-0">
          {lista.map((l) => (
            <Opcion key={l.id} lider={l} elegido={elegido?.id === l.id} actual={esActual(l)} onElegir={() => setElegido(l)} />
          ))}
        </ul>
      </li>
    )

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (v) return
        setBusqueda("")
        setElegido(null)
        setNota("")
        onCerrar()
      }}
    >
      <DialogContent className={CONTENIDO}>
        <div className="border-b px-5 pb-4 pt-5">
          <DialogTitle className="pr-8 text-base">{responsableEmail ? "Reasignar" : "Asignar"} el caso <span className="ct-mono">#{radicado}</span></DialogTitle>
          <DialogDescription className="ct-muted mt-1.5 text-[13px]">
            La persona recibe el caso en «Mis casos asignados» y responde al cliente desde ahí.
          </DialogDescription>
          <div className="relative mt-4">
            <Search className="ct-faint pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
            <input
              type="search"
              name="buscar-lider"
              autoComplete="off"
              spellCheck={false}
              aria-label="Buscar por nombre, cargo o área"
              placeholder="Buscar por nombre, cargo o área…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="ct-input !rounded-full !pl-10"
            />
          </div>
        </div>

        <div className="max-h-[38dvh] min-h-[140px] overflow-y-auto overscroll-contain px-2.5 pb-2">
          {isLoading ? (
            <div className="space-y-2 p-2.5" aria-busy="true" aria-label="Cargando líderes">
              {[0, 1, 2, 3].map((i) => <div key={i} className="ct-skeleton h-11" />)}
            </div>
          ) : error ? (
            <div className="px-3 py-8 text-center">
              <p className="m-0 text-sm">{mensajeDeError(error, "No pudimos cargar la lista de líderes.")}</p>
              <button type="button" className="ct-btn ct-btn-sm mt-3" onClick={() => refetch()}>Reintentar</button>
            </div>
          ) : jefes.length + equipo.length === 0 ? (
            <p className="ct-muted m-0 px-3 py-8 text-center text-sm">
              {busqueda.trim() ? "Nadie coincide con esa búsqueda." : "No hay personas activas en las áreas de Operaciones."}
            </p>
          ) : (
            <ul role="listbox" aria-label="Personas a las que se puede asignar" className="m-0 list-none p-0">
              {grupo("Líderes", jefes)}
              {grupo("Equipo de operaciones", equipo)}
            </ul>
          )}
        </div>

        <div className="border-t px-5 py-4">
          <label htmlFor={idNota} className="ct-label">Nota para quien lo recibe (opcional)</label>
          <textarea
            id={idNota}
            name="nota"
            rows={2}
            maxLength={500}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Contexto, prioridad o lo que ya se habló con el cliente…"
            className="ct-input"
          />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="ct-muted m-0 min-w-0 truncate text-xs" aria-live="polite">
              {elegido ? <>Se asignará a <strong className="text-[color:var(--ct-text)]">{elegido.nombre}</strong></> : "Elige a una persona de la lista"}
            </p>
            <div className="flex flex-none gap-2">
              <button type="button" className="ct-btn flex-1 sm:flex-none" onClick={onCerrar}>Cancelar</button>
              <button
                type="button"
                className="ct-btn ct-btn-primary flex-1 sm:flex-none"
                disabled={!elegido || enviando}
                onClick={() => elegido && onAsignar(elegido, nota.trim())}
              >
                {enviando ? "Asignando…" : responsableEmail ? "Reasignar" : "Asignar"}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function DialogoConfirmar({
  abierto,
  titulo,
  descripcion,
  accion,
  conNota = false,
  enviando,
  onCerrar,
  onConfirmar,
}: {
  abierto: boolean
  titulo: string
  descripcion: string
  /** Texto del botón: dice lo que hace ("Cerrar caso"), no "Aceptar". */
  accion: string
  conNota?: boolean
  enviando: boolean
  onCerrar: () => void
  onConfirmar: (nota: string) => void
}) {
  const [nota, setNota] = useState("")
  const idNota = useId()
  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (v) return
        setNota("")
        onCerrar()
      }}
    >
      <DialogContent className={`${CONTENIDO} max-w-md`}>
        <div className="px-5 pb-5 pt-5">
          <DialogTitle className="pr-8 text-base">{titulo}</DialogTitle>
          <DialogDescription className="ct-muted mt-2 text-[13px] leading-relaxed">{descripcion}</DialogDescription>
          {conNota && (
            <div className="mt-4">
              <label htmlFor={idNota} className="ct-label">Motivo (opcional)</label>
              <textarea id={idNota} name="nota" rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} className="ct-input" />
            </div>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="ct-btn" onClick={onCerrar}>Cancelar</button>
            <button type="button" className="ct-btn ct-btn-primary" disabled={enviando} onClick={() => onConfirmar(nota.trim())}>
              {enviando ? "Un momento…" : accion}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
