// Parte alta del panel: tarjetas-indicador que filtran y, plegable, el resumen (tiempos, carga por líder, tendencia).

import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { diaCorto, partesDeHoras } from "@/lib/centralTickets"
import type { CentralCargaLider, CentralFiltros, CentralNivel, CentralResumen } from "@/types/centralTickets"
import { Avatar } from "./partes"

// ─── Indicadores ────────────────────────────────────────────────────────────

interface Indicador {
  id: string
  titulo: string
  ayuda: string
  valor: number
  /** Color del número cuando es mayor que cero. */
  tono?: string
  /** Filtros que aplica al tocar (sobre filtros limpios). */
  filtro: Partial<CentralFiltros>
  activo: (f: CentralFiltros) => boolean
}

function indicadores(r: CentralResumen, nivel: CentralNivel): Indicador[] {
  const lista: Indicador[] = [
    {
      id: "sin-asignar",
      titulo: "Sin asignar",
      ayuda: "Nadie responde por ellos todavía",
      valor: r.sinAsignar,
      tono: "var(--ct-amber)",
      filtro: { estado: "abierto", asignado: "sin" },
      activo: (f) => f.asignado === "sin",
    },
    {
      id: "escalados",
      titulo: "Escalados",
      ayuda: "Subieron de nivel por plazo o severidad",
      valor: r.escalados,
      tono: "var(--ct-orange)",
      filtro: { escalado: true },
      activo: (f) => f.escalado,
    },
    {
      id: "vencidos",
      titulo: "Vencidos",
      ayuda: "Se pasaron del plazo de respuesta",
      valor: r.vencidos,
      tono: "var(--ct-red)",
      filtro: { vencido: true, orden: "vencimiento" },
      activo: (f) => f.vencido,
    },
    {
      id: "sin-respuesta",
      titulo: "Sin 1ª respuesta",
      ayuda: "El cliente aún no ha recibido respuesta",
      valor: r.sinPrimeraRespuesta,
      tono: "var(--ct-blue)",
      filtro: { sinRespuesta: true },
      activo: (f) => f.sinRespuesta,
    },
    {
      id: "urgentes",
      titulo: "Urgentes pedidos",
      ayuda: "El cliente pidió subir de nivel",
      valor: r.urgentesSolicitados,
      tono: "var(--ct-orange)",
      filtro: { urgente: true },
      activo: (f) => f.urgente,
    },
  ]
  // El líder solo ve casos que ya le asignaron: "Sin asignar" no le dice nada.
  return nivel === "lider" ? lista.filter((i) => i.id !== "sin-asignar") : lista
}

/** Tiempo medio: las cifras en DM Mono, las unidades en texto. */
function Horas({ valor }: { valor: number | null }) {
  const partes = partesDeHoras(valor)
  return (
    <span className="mt-1.5 flex items-baseline gap-1.5">
      {partes.length === 0 && <span className="ct-mono ct-faint text-2xl font-medium leading-none">—</span>}
      {partes.map(([cifra, unidad]) => (
        <span key={unidad} className="flex items-baseline gap-0.5">
          <span className="ct-mono text-2xl font-medium leading-none">{cifra}</span>
          <span className="ct-muted text-[13px]">{unidad}</span>
        </span>
      ))}
    </span>
  )
}

export function CentralIndicadores({
  resumen,
  nivel,
  filtros,
  onFiltrar,
}: {
  resumen: CentralResumen | undefined
  nivel: CentralNivel
  filtros: CentralFiltros
  onFiltrar: (parcial: Partial<CentralFiltros> | null) => void
}) {
  const franja = "ct-sin-barra -mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 scroll-px-4 sm:mx-0 sm:px-0"

  if (!resumen) {
    return (
      <div className={franja} aria-busy="true" aria-label="Cargando indicadores">
        {Array.from({ length: nivel === "lider" ? 4 : 5 }, (_, i) => (
          <div key={i} className="ct-indicador pointer-events-none">
            <div className="ct-skeleton h-3 w-20" />
            <div className="ct-skeleton mt-3 h-8 w-12" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <section aria-label="Indicadores" className={franja}>
      {indicadores(resumen, nivel).map((ind) => {
        const activo = ind.activo(filtros)
        return (
          <button
            key={ind.id}
            type="button"
            className="ct-indicador"
            aria-pressed={activo}
            title={ind.ayuda}
            onClick={() => onFiltrar(activo ? null : ind.filtro)}
          >
            <span className="ct-muted block truncate text-xs font-semibold">{ind.titulo}</span>
            <span
              className="ct-mono mt-1.5 block text-[32px] font-medium leading-none"
              style={{ color: ind.valor > 0 && ind.tono ? ind.tono : undefined }}
            >
              {ind.valor}
            </span>
          </button>
        )
      })}
    </section>
  )
}

/** Sección plegable «Resumen»: tiempos medios, tendencia y carga por líder (solo dirección). */
export function CentralResumenPlegable({
  resumen,
  nivel,
  asignadoActivo,
  onFiltrarLider,
}: {
  resumen: CentralResumen
  nivel: CentralNivel
  asignadoActivo: string
  onFiltrarLider: (email: string | null) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const id = useId()
  return (
    <section aria-label="Resumen" className="ct-card overflow-hidden">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((v) => !v)}
        className="flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-3 px-5 text-left"
      >
        <span className="text-[15px] font-bold">Resumen</span>
        <span className="ct-muted flex items-center gap-2 text-xs">
          <span><span className="ct-mono">{resumen.abiertos}</span> abiertos · <span className="ct-mono">{resumen.total}</span> en total</span>
          <ChevronDown className={`size-4 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>
      {abierto && (
        <div id={id} className="ct-entra flex flex-col gap-5 border-t px-5 pb-5 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[var(--ct-raised)] p-3.5">
              <span className="ct-muted block text-xs font-semibold">Primera respuesta</span>
              <Horas valor={resumen.horasPrimeraRespuesta} />
            </div>
            <div className="rounded-2xl bg-[var(--ct-raised)] p-3.5">
              <span className="ct-muted block text-xs font-semibold">Resolución</span>
              <Horas valor={resumen.horasResolucion} />
            </div>
          </div>
          <CentralTendencia dias={resumen.ultimos14dias} />
          {nivel === "director" && (
            <CentralCargaLideres lideres={resumen.porLider} asignadoActivo={asignadoActivo} onFiltrar={onFiltrarLider} />
          )}
        </div>
      )}
    </section>
  )
}

// ─── Carga por líder ────────────────────────────────────────────────────────

function FilaLider({
  lider,
  maximo,
  activo,
  onClick,
}: {
  lider: CentralCargaLider
  maximo: number
  activo: boolean
  onClick: () => void
}) {
  const ancho = (n: number) => `${maximo > 0 ? (n / maximo) * 100 : 0}%`
  const alDia = Math.max(0, lider.abiertos - lider.vencidos)
  return (
    <li>
      <button
        type="button"
        aria-pressed={activo}
        onClick={onClick}
        aria-label={`${lider.nombre}: ${lider.abiertos} abiertos, ${lider.vencidos} vencidos, ${lider.escalados} escalados, ${lider.resueltos30d} resueltos en 30 días. ${activo ? "Quitar filtro" : "Filtrar por este líder"}`}
        className="grid min-h-[48px] w-full cursor-pointer grid-cols-[minmax(0,1fr)_repeat(4,2.1rem)] items-center gap-x-2 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-[var(--ct-hover)] aria-pressed:bg-[var(--ct-red-soft)]"
      >
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar nombre={lider.nombre} className="!size-6 !text-[10px]" />
            <span className="truncate text-[13px] font-medium">{lider.nombre}</span>
          </span>
          <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-[var(--ct-line)]" aria-hidden>
            <span className="h-full bg-[var(--ct-red)]" style={{ width: ancho(lider.vencidos) }} />
            <span className="h-full bg-[var(--ct-muted)]" style={{ width: ancho(alDia) }} />
          </span>
        </span>
        <span className="ct-mono text-right text-[13px]">{lider.abiertos}</span>
        <span className="ct-mono text-right text-[13px]" style={{ color: lider.vencidos ? "var(--ct-red)" : "var(--ct-faint)" }}>
          {lider.vencidos}
        </span>
        <span className="ct-mono text-right text-[13px]" style={{ color: lider.escalados ? "var(--ct-orange)" : "var(--ct-faint)" }}>
          {lider.escalados}
        </span>
        <span className="ct-mono text-right text-[13px]" style={{ color: lider.resueltos30d ? "var(--ct-green)" : "var(--ct-faint)" }}>
          {lider.resueltos30d}
        </span>
      </button>
    </li>
  )
}

export function CentralCargaLideres({
  lideres,
  asignadoActivo,
  onFiltrar,
}: {
  lideres: CentralCargaLider[]
  asignadoActivo: string
  onFiltrar: (email: string | null) => void
}) {
  const ordenados = [...lideres].sort((a, b) => b.abiertos - a.abiertos || a.nombre.localeCompare(b.nombre))
  const maximo = Math.max(1, ...ordenados.map((l) => l.abiertos))
  return (
    <section aria-labelledby="ct-carga" className="flex min-w-0 flex-col">
      <h3 id="ct-carga" className="m-0 text-sm font-bold">Carga por líder</h3>
      {ordenados.length === 0 ? (
        <p className="ct-muted m-0 mt-3 text-[13px]">Todavía no hay casos asignados a un líder.</p>
      ) : (
        <>
          <p className="ct-faint m-0 mt-0.5 text-xs">Abiertos, vencidos, escalados y resueltos en 30 días</p>
          <div className="ct-faint mt-2 grid grid-cols-[minmax(0,1fr)_repeat(4,2.1rem)] gap-x-2 px-2 text-right text-[11px]" aria-hidden>
            <span />
            <span>Ab.</span>
            <span>Venc.</span>
            <span>Esc.</span>
            <span>30 d</span>
          </div>
          <ul className="m-0 mt-1 max-h-[240px] list-none overflow-y-auto p-0">
            {ordenados.map((l) => {
              const activo = asignadoActivo === l.email.toLowerCase()
              return (
                <FilaLider key={l.email} lider={l} maximo={maximo} activo={activo} onClick={() => onFiltrar(activo ? null : l.email.toLowerCase())} />
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

// ─── Tendencia de 14 días ───────────────────────────────────────────────────

interface PuntoTooltip {
  active?: boolean
  label?: string
  payload?: { dataKey?: string | number; value?: number }[]
}

function TooltipTendencia({ active, label, payload }: PuntoTooltip) {
  if (!active || !payload?.length || !label) return null
  const valor = (clave: string) => payload.find((p) => p.dataKey === clave)?.value ?? 0
  return (
    <div className="rounded-xl border border-[color:var(--ct-line-strong)] bg-white px-3 py-2 text-xs shadow-[0_8px_24px_-8px_rgba(0,0,0,0.18)]">
      <p className="m-0 mb-1 font-semibold">{diaCorto(label)}</p>
      <p className="ct-mono m-0">{valor("creados")} creados</p>
      <p className="ct-mono m-0 text-[color:var(--ct-green)]">{valor("resueltos")} resueltos</p>
    </div>
  )
}

export function CentralTendencia({ dias }: { dias: CentralResumen["ultimos14dias"] }) {
  const creados = dias.reduce((n, d) => n + d.creados, 0)
  const resueltos = dias.reduce((n, d) => n + d.resueltos, 0)
  return (
    <section aria-labelledby="ct-tendencia" className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="ct-tendencia" className="m-0 text-sm font-bold">Últimos 14 días</h3>
        <p className="m-0 flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-[var(--ct-muted)]" aria-hidden />
            <span className="ct-mono">{creados}</span> <span className="ct-muted">creados</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-[var(--ct-green)]" aria-hidden />
            <span className="ct-mono">{resueltos}</span> <span className="ct-muted">resueltos</span>
          </span>
        </p>
      </div>
      <div className="mt-3 h-[170px] min-w-0" role="img" aria-label={`Casos de los últimos 14 días: ${creados} creados y ${resueltos} resueltos`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dias} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
            <CartesianGrid vertical={false} stroke="var(--ct-line)" />
            <XAxis
              dataKey="fecha"
              tickFormatter={diaCorto}
              tick={{ fill: "var(--ct-faint)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--ct-line)" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tick={{ fill: "var(--ct-faint)", fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
            <Tooltip content={<TooltipTendencia />} cursor={{ fill: "var(--ct-hover)" }} />
            <Bar dataKey="creados" fill="var(--ct-muted)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="resueltos" fill="var(--ct-green)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* La misma información para lectores de pantalla */}
      <table className="sr-only">
        <caption>Casos creados y resueltos por día</caption>
        <thead>
          <tr><th scope="col">Día</th><th scope="col">Creados</th><th scope="col">Resueltos</th></tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.fecha}><th scope="row">{diaCorto(d.fecha)}</th><td>{d.creados}</td><td>{d.resueltos}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
