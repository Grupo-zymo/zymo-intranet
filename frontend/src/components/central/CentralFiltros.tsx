// Búsqueda, vistas rápidas y «Más filtros» (hoja inferior). El estado vive en la URL (lo maneja CentralPanel).

import { useEffect, useId, useState } from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import {
  AREAS,
  AREA_TEXTO,
  ESTADOS,
  ESTADO_TEXTO,
  FILTROS_VACIOS,
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
  /** Casos que muestra la lista con los filtros actuales (para el botón «Ver N casos»). */
  cuenta: number | null
  onCambiar: (parcial: Partial<Filtros>) => void
  onLimpiar: () => void
}

interface Vista {
  id: string
  texto: string
  /** Filtros que pone (sobre filtros limpios; la búsqueda y el orden se conservan). */
  filtro: Partial<Filtros>
  activa: (f: Filtros) => boolean
  /** Clave del filtro que esta vista ya explica (no se repite como chip). */
  clave: keyof Filtros | null
  soloDirector?: boolean
}

const SIN_EXTRAS = (f: Filtros) => !f.escalado && !f.vencido && !f.sinRespuesta && !f.severidad && !f.area && !f.tipo && !f.desde && !f.hasta

const VISTAS: Vista[] = [
  { id: "abiertos", texto: "Abiertos", filtro: { estado: "abierto" }, clave: "estado", activa: (f) => f.estado === "abierto" && !f.asignado && SIN_EXTRAS(f) },
  { id: "escalados", texto: "Escalados", filtro: { escalado: true }, clave: "escalado", activa: (f) => f.escalado && !f.estado && !f.asignado && !f.vencido && !f.sinRespuesta },
  { id: "sin", texto: "Sin asignar", filtro: { estado: "abierto", asignado: "sin" }, clave: "asignado", soloDirector: true, activa: (f) => f.asignado === "sin" && SIN_EXTRAS(f) },
  { id: "mios", texto: "Mis casos", filtro: { asignado: "mios" }, clave: "asignado", soloDirector: true, activa: (f) => f.asignado === "mios" && !f.estado && SIN_EXTRAS(f) },
  { id: "todos", texto: "Todos", filtro: {}, clave: null, activa: (f) => !f.estado && !f.asignado && SIN_EXTRAS(f) },
]

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
      className="ct-btn flex-1 aria-checked:border-[color:var(--ct-red)] aria-checked:bg-[var(--ct-red-soft)] aria-checked:text-[color:var(--ct-red)]"
    >
      {children}
    </button>
  )
}

interface ChipActivo {
  clave: keyof Filtros
  texto: string
  quitar: Partial<Filtros>
}

/** Etiquetas de los filtros activos, cada una con su forma de quitarla. */
function chipsActivos(f: Filtros, lideres: CentralCargaLider[], nivel: CentralNivel): ChipActivo[] {
  const chips: ChipActivo[] = []
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
  if (f.sinRespuesta) chips.push({ clave: "sinRespuesta", texto: "Sin 1ª respuesta", quitar: { sinRespuesta: false } })
  if (f.desde) chips.push({ clave: "desde", texto: `Desde ${diaCorto(f.desde)}`, quitar: { desde: "" } })
  if (f.hasta) chips.push({ clave: "hasta", texto: `Hasta ${diaCorto(f.hasta)}`, quitar: { hasta: "" } })
  return chips
}

export function CentralFiltros({ filtros, nivel, lideres, cuenta, onCambiar, onLimpiar }: Props) {
  // La búsqueda se aplica al dejar de escribir (o con Enter), no en cada tecla.
  const [texto, setTexto] = useState(filtros.q)
  useEffect(() => setTexto(filtros.q), [filtros.q])
  useEffect(() => {
    if (texto === filtros.q) return
    const t = setTimeout(() => onCambiar({ q: texto }), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  const [hoja, setHoja] = useState(false)
  const director = nivel === "director"
  const vistas = VISTAS.filter((v) => director || !v.soloDirector)
  const vistaActiva = vistas.find((v) => v.activa(filtros)) ?? null
  const chips = chipsActivos(filtros, lideres, nivel).filter((c) => c.clave !== vistaActiva?.clave || vistaActiva.id === "todos")
  const lideresOrdenados = [...lideres].sort((a, b) => a.nombre.localeCompare(b.nombre))
  const asignadoFuera =
    filtros.asignado && !["sin", "mios"].includes(filtros.asignado) && !lideres.some((l) => l.email.toLowerCase() === filtros.asignado)

  const elegirVista = (v: Vista) => onCambiar({ ...FILTROS_VACIOS, q: filtros.q, orden: filtros.orden, ...v.filtro })

  return (
    <section aria-label="Búsqueda y filtros" className="flex flex-col gap-3">
      <div className="flex gap-2">
        <form
          role="search"
          className="relative min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            onCambiar({ q: texto })
          }}
        >
          <Search className="ct-faint pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            name="q"
            autoComplete="off"
            spellCheck={false}
            aria-label="Buscar por asunto, cliente, empresa o radicado"
            placeholder="Buscar caso, cliente o #"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="ct-input !rounded-full !pl-10"
          />
        </form>
        <button type="button" className="ct-btn ct-btn-redondo relative" aria-label="Más filtros" onClick={() => setHoja(true)}>
          <SlidersHorizontal className="size-4" aria-hidden />
          {chips.length > 0 && (
            <span className="ct-mono absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[var(--ct-red-solid)] text-[11px] text-white">
              {chips.length}
            </span>
          )}
        </button>
      </div>

      <div role="group" aria-label="Vistas rápidas" className="ct-sin-barra -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {vistas.map((v) => (
          <button key={v.id} type="button" className="ct-vista" aria-pressed={vistaActiva?.id === v.id} onClick={() => elegirVista(v)}>
            {v.texto}
          </button>
        ))}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros activos" role="group">
          {chips.map((c) => (
            <button
              key={c.clave}
              type="button"
              onClick={() => onCambiar(c.quitar)}
              aria-label={`Quitar filtro ${c.texto}`}
              className="inline-flex h-9 max-w-[220px] cursor-pointer items-center gap-1 rounded-full border border-[color:var(--ct-line-strong)] bg-white pl-3.5 pr-2.5 text-xs font-medium transition-colors hover:bg-[var(--ct-hover)]"
            >
              <span className="truncate">{c.texto}</span>
              <X className="ct-muted size-3.5 flex-none" aria-hidden />
            </button>
          ))}
          <button type="button" className="ct-btn ct-btn-ghost ct-btn-sm" onClick={onLimpiar}>Limpiar</button>
        </div>
      )}

      <Sheet open={hoja} onOpenChange={setHoja}>
        <SheetContent side="bottom" className="central ct-panel ct-hoja mx-auto flex w-full max-w-xl flex-col gap-0 p-0">
          <div className="flex-none px-5 pb-3 pt-5">
            <SheetTitle className="text-lg font-bold">Más filtros</SheetTitle>
            <SheetDescription className="ct-muted text-[13px]">Los cambios se aplican al instante.</SheetDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-4">
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
              {director && (
                <Campo etiqueta="Responsable" className="col-span-2">
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
              <Campo etiqueta="Orden" className="col-span-2">
                {(id) => (
                  <select id={id} name="orden" className="ct-input" value={filtros.orden} onChange={(e) => onCambiar({ orden: e.target.value as Filtros["orden"] })}>
                    <option value="recientes">Más recientes primero</option>
                    <option value="vencimiento">Por vencimiento</option>
                  </select>
                )}
              </Campo>
              <div className="col-span-2 flex gap-2">
                <Interruptor activo={filtros.escalado} onChange={(v) => onCambiar({ escalado: v })}>Solo escalados</Interruptor>
                <Interruptor activo={filtros.vencido} onChange={(v) => onCambiar({ vencido: v })}>Solo vencidos</Interruptor>
              </div>
            </div>
          </div>
          <div className="flex flex-none gap-2 border-t bg-[var(--ct-surface)] px-5 py-3">
            <button type="button" className="ct-btn flex-1" onClick={onLimpiar}>Limpiar</button>
            <button type="button" className="ct-btn ct-btn-primary flex-[2]" onClick={() => setHoja(false)}>
              {cuenta === null ? "Listo" : `Ver ${cuenta} ${cuenta === 1 ? "caso" : "casos"}`}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}

/** Escritorio: buscador, vistas rápidas y todos los filtros en una barra siempre visible. */
export function CentralBarraFiltros({ filtros, nivel, lideres, onCambiar, onLimpiar }: Omit<Props, "cuenta">) {
  const [texto, setTexto] = useState(filtros.q)
  useEffect(() => setTexto(filtros.q), [filtros.q])
  useEffect(() => {
    if (texto === filtros.q) return
    const t = setTimeout(() => onCambiar({ q: texto }), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  const [mas, setMas] = useState(false)
  const idMas = useId()
  const director = nivel === "director"
  const vistas = VISTAS.filter((v) => director || !v.soloDirector)
  const vistaActiva = vistas.find((v) => v.activa(filtros)) ?? null
  const chips = chipsActivos(filtros, lideres, nivel).filter((c) => c.clave !== vistaActiva?.clave || vistaActiva.id === "todos")
  const lideresOrdenados = [...lideres].sort((a, b) => a.nombre.localeCompare(b.nombre))
  const asignadoFuera =
    filtros.asignado && !["sin", "mios"].includes(filtros.asignado) && !lideres.some((l) => l.email.toLowerCase() === filtros.asignado)
  const elegirVista = (v: Vista) => onCambiar({ ...FILTROS_VACIOS, q: filtros.q, orden: filtros.orden, ...v.filtro })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <form
          role="search"
          className="relative min-w-[260px] flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            onCambiar({ q: texto })
          }}
        >
          <Search className="ct-faint pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            name="q"
            autoComplete="off"
            spellCheck={false}
            aria-label="Buscar por asunto, cliente, empresa o radicado"
            placeholder="Buscar caso, cliente o #"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="ct-input !rounded-full !pl-10"
          />
        </form>
        <div role="group" aria-label="Vistas rápidas" className="flex flex-wrap gap-2">
          {vistas.map((v) => (
            <button key={v.id} type="button" className="ct-vista" aria-pressed={vistaActiva?.id === v.id} onClick={() => elegirVista(v)}>
              {v.texto}
            </button>
          ))}
          <button type="button" className="ct-btn" aria-expanded={mas} aria-controls={idMas} onClick={() => setMas((v) => !v)}>
            <SlidersHorizontal className="size-4" aria-hidden />
            Más filtros
            {chips.length > 0 && <span className="ct-mono rounded-full bg-[var(--ct-red-solid)] px-1.5 text-[11px] text-white">{chips.length}</span>}
          </button>
        </div>
      </div>

      {mas && (
      <div id={idMas} className="ct-entra grid gap-x-3 gap-y-3 rounded-2xl bg-[var(--ct-raised)] p-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
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
        {director && (
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
        <Campo etiqueta="Orden">
          {(id) => (
            <select id={id} name="orden" className="ct-input" value={filtros.orden} onChange={(e) => onCambiar({ orden: e.target.value as Filtros["orden"] })}>
              <option value="recientes">Recientes</option>
              <option value="vencimiento">Por vencimiento</option>
            </select>
          )}
        </Campo>
      </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros activos" role="group">
          {chips.map((c) => (
            <button
              key={c.clave}
              type="button"
              onClick={() => onCambiar(c.quitar)}
              aria-label={`Quitar filtro ${c.texto}`}
              className="inline-flex h-9 max-w-[240px] cursor-pointer items-center gap-1 rounded-full border border-[color:var(--ct-line-strong)] bg-white pl-3.5 pr-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--ct-hover)]"
            >
              <span className="truncate">{c.texto}</span>
              <X className="ct-muted size-3.5 flex-none" aria-hidden />
            </button>
          ))}
          <button type="button" className="ct-btn ct-btn-ghost ct-btn-sm" onClick={onLimpiar}>Limpiar</button>
        </div>
      )}
    </div>
  )
}
