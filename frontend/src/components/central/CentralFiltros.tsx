// Búsqueda, filtros y orden. El estado vive en la URL (lo maneja CentralPanel).

import { useEffect, useId, useState } from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"
import {
  AREAS,
  AREA_TEXTO,
  ESTADOS,
  ESTADO_TEXTO,
  SEVERIDADES,
  SEVERIDAD_TEXTO,
  TIPOS,
  TIPO_TEXTO,
  diaCorto,
} from "@/lib/centralTickets"
import type { CentralCargaLider, CentralFiltros as Filtros, CentralNivel } from "@/types/centralTickets"

interface Props {
  filtros: Filtros
  nivel: CentralNivel
  lideres: CentralCargaLider[]
  onCambiar: (parcial: Partial<Filtros>) => void
  onLimpiar: () => void
}

function Campo({ etiqueta, children, className = "" }: { etiqueta: string; children: (id: string) => React.ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="ct-label">{etiqueta}</label>
      {children(id)}
    </div>
  )
}

function Interruptor({ activo, onChange, children }: { activo: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onChange(!activo)}
      className="ct-btn aria-checked:border-[color:var(--ct-red)] aria-checked:bg-[rgba(193,26,60,0.1)] aria-checked:text-[color:var(--ct-red)]"
    >
      {children}
    </button>
  )
}

/** Etiquetas de los filtros activos, cada una con su forma de quitarla. */
function chipsActivos(f: Filtros, lideres: CentralCargaLider[], nivel: CentralNivel): { clave: string; texto: string; quitar: Partial<Filtros> }[] {
  const chips: { clave: string; texto: string; quitar: Partial<Filtros> }[] = []
  if (f.q.trim()) chips.push({ clave: "q", texto: `“${f.q.trim()}”`, quitar: { q: "" } })
  if (f.estado) chips.push({ clave: "estado", texto: ESTADO_TEXTO[f.estado], quitar: { estado: "" } })
  if (f.severidad) chips.push({ clave: "severidad", texto: `Severidad ${SEVERIDAD_TEXTO[f.severidad].toLowerCase()}`, quitar: { severidad: "" } })
  if (f.area) chips.push({ clave: "area", texto: AREA_TEXTO[f.area], quitar: { area: "" } })
  if (f.tipo) chips.push({ clave: "tipo", texto: TIPO_TEXTO[f.tipo], quitar: { tipo: "" } })
  if (f.asignado && nivel === "director") {
    const texto =
      f.asignado === "sin"
        ? "Sin asignar"
        : f.asignado === "mios"
          ? "Mis casos"
          : (lideres.find((l) => l.email.toLowerCase() === f.asignado)?.nombre ?? f.asignado)
    chips.push({ clave: "asignado", texto, quitar: { asignado: "" } })
  }
  if (f.escalado) chips.push({ clave: "escalado", texto: "Escalados", quitar: { escalado: false } })
  if (f.vencido) chips.push({ clave: "vencido", texto: "Vencidos", quitar: { vencido: false } })
  if (f.urgente) chips.push({ clave: "urgente", texto: "Urgentes del cliente", quitar: { urgente: false } })
  if (f.sinRespuesta) chips.push({ clave: "sinRespuesta", texto: "Sin primera respuesta", quitar: { sinRespuesta: false } })
  if (f.desde) chips.push({ clave: "desde", texto: `Desde ${diaCorto(f.desde)}`, quitar: { desde: "" } })
  if (f.hasta) chips.push({ clave: "hasta", texto: `Hasta ${diaCorto(f.hasta)}`, quitar: { hasta: "" } })
  return chips
}

export function CentralFiltros({ filtros, nivel, lideres, onCambiar, onLimpiar }: Props) {
  // La búsqueda se aplica al dejar de escribir (o con Enter), no en cada tecla.
  const [texto, setTexto] = useState(filtros.q)
  useEffect(() => setTexto(filtros.q), [filtros.q])
  useEffect(() => {
    if (texto === filtros.q) return
    const t = setTimeout(() => onCambiar({ q: texto }), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  const [abierto, setAbierto] = useState(false) // solo afecta al teléfono
  const idPanel = useId()
  const chips = chipsActivos(filtros, lideres, nivel)
  const lideresOrdenados = [...lideres].sort((a, b) => a.nombre.localeCompare(b.nombre))
  const asignadoFuera =
    filtros.asignado && !["sin", "mios"].includes(filtros.asignado) && !lideres.some((l) => l.email.toLowerCase() === filtros.asignado)

  return (
    <section aria-label="Filtros" className="ct-surface rounded-xl border p-3 sm:p-4">
      <div className="flex gap-2">
        <form
          role="search"
          className="relative min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            onCambiar({ q: texto })
          }}
        >
          <Search className="ct-faint pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            name="q"
            autoComplete="off"
            spellCheck={false}
            aria-label="Buscar por asunto, cliente, empresa o radicado"
            placeholder="Buscar asunto, cliente, empresa o #radicado…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="ct-input !pl-9"
          />
        </form>
        {/* .ct-btn fija su propio display: el ocultamiento va en el contenedor */}
        <div className="lg:hidden">
          <button type="button" className="ct-btn" aria-expanded={abierto} aria-controls={idPanel} onClick={() => setAbierto((v) => !v)}>
            <SlidersHorizontal className="size-4" aria-hidden />
            Filtros
            {chips.length > 0 && <span className="ct-mono rounded-full bg-[var(--ct-red-solid)] px-1.5 text-[11px] text-white">{chips.length}</span>}
          </button>
        </div>
      </div>

      <div id={idPanel} className={`${abierto ? "grid" : "hidden"} mt-3 grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid ${nivel === "lider" ? "lg:grid-cols-[repeat(6,minmax(0,1fr))_auto]" : "lg:grid-cols-[repeat(7,minmax(0,1fr))_auto]"}`}>
        <Campo etiqueta="Estado">
          {(id) => (
            <select id={id} name="estado" className="ct-input" value={filtros.estado} onChange={(e) => onCambiar({ estado: e.target.value as Filtros["estado"] })}>
              <option value="">Todos</option>
              <option value="abierto">Abiertos</option>
              {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_TEXTO[e]}</option>)}
            </select>
          )}
        </Campo>
        <Campo etiqueta="Severidad">
          {(id) => (
            <select id={id} name="severidad" className="ct-input" value={filtros.severidad} onChange={(e) => onCambiar({ severidad: e.target.value as Filtros["severidad"] })}>
              <option value="">Todas</option>
              {SEVERIDADES.map((s) => <option key={s} value={s}>{SEVERIDAD_TEXTO[s]}</option>)}
            </select>
          )}
        </Campo>
        <Campo etiqueta="Área">
          {(id) => (
            <select id={id} name="area" className="ct-input" value={filtros.area} onChange={(e) => onCambiar({ area: e.target.value as Filtros["area"] })}>
              <option value="">Todas</option>
              {AREAS.map((a) => <option key={a} value={a}>{AREA_TEXTO[a]}</option>)}
            </select>
          )}
        </Campo>
        <Campo etiqueta="Tipo">
          {(id) => (
            <select id={id} name="tipo" className="ct-input" value={filtros.tipo} onChange={(e) => onCambiar({ tipo: e.target.value as Filtros["tipo"] })}>
              <option value="">Todos</option>
              {TIPOS.map((t) => <option key={t} value={t}>{TIPO_TEXTO[t]}</option>)}
            </select>
          )}
        </Campo>
        {nivel === "director" && (
          <Campo etiqueta="Responsable">
            {(id) => (
              <select id={id} name="asignado" className="ct-input" value={filtros.asignado} onChange={(e) => onCambiar({ asignado: e.target.value })}>
                <option value="">Todos</option>
                <option value="sin">Sin asignar</option>
                <option value="mios">Mis casos</option>
                {asignadoFuera && <option value={filtros.asignado}>{filtros.asignado}</option>}
                {lideresOrdenados.length > 0 && (
                  <optgroup label="Líderes">
                    {lideresOrdenados.map((l) => <option key={l.email} value={l.email.toLowerCase()}>{l.nombre}</option>)}
                  </optgroup>
                )}
              </select>
            )}
          </Campo>
        )}
        <Campo etiqueta="Creado desde">
          {(id) => <input id={id} name="desde" type="date" autoComplete="off" className="ct-input" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => onCambiar({ desde: e.target.value })} />}
        </Campo>
        <Campo etiqueta="Creado hasta">
          {(id) => <input id={id} name="hasta" type="date" autoComplete="off" className="ct-input" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => onCambiar({ hasta: e.target.value })} />}
        </Campo>
        <div className="col-span-2 flex flex-wrap items-end gap-2 sm:col-span-3 lg:col-span-1 lg:flex-nowrap">
          <Interruptor activo={filtros.escalado} onChange={(v) => onCambiar({ escalado: v })}>Solo escalados</Interruptor>
          <Interruptor activo={filtros.vencido} onChange={(v) => onCambiar({ vencido: v })}>Solo vencidos</Interruptor>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
          <span className="ct-faint mr-1 text-xs">Filtros activos</span>
          {chips.map((c) => (
            <button
              key={c.clave}
              type="button"
              onClick={() => onCambiar(c.quitar)}
              aria-label={`Quitar filtro ${c.texto}`}
              className="ct-raised inline-flex h-7 max-w-[220px] cursor-pointer items-center gap-1 rounded-full border border-[color:var(--ct-line-strong)] pl-2.5 pr-1.5 text-xs transition-colors hover:bg-[var(--ct-hover)]"
            >
              <span className="truncate">{c.texto}</span>
              <X className="ct-muted size-3.5 flex-none" aria-hidden />
            </button>
          ))}
          <button type="button" className="ct-btn ct-btn-ghost ct-btn-sm" onClick={onLimpiar}>Limpiar</button>
        </div>
      )}
    </section>
  )
}
