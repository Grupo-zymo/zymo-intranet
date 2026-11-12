// Vista de tablero: columnas por estado o por líder.

import type { CSSProperties } from "react"
import { ESTADOS, ESTADO_TEXTO, TONO_ESTADO, esperaRespuesta, estaAbierto, vencimiento } from "@/lib/centralTickets"
import type { CentralCasoItem } from "@/types/centralTickets"
import { Marcas } from "./CentralLista"
import { Avatar, EstadoChip, SeveridadChip } from "./partes"

export type GrupoTablero = "estado" | "lider"

interface Columna {
  clave: string
  titulo: string
  tono?: string
  casos: CentralCasoItem[]
}

function columnasPorEstado(casos: CentralCasoItem[]): Columna[] {
  return ESTADOS.map((e) => ({ clave: e, titulo: ESTADO_TEXTO[e], tono: TONO_ESTADO[e], casos: casos.filter((c) => c.estado === e) }))
}

function columnasPorLider(casos: CentralCasoItem[]): Columna[] {
  const sin: Columna = { clave: "sin", titulo: "Sin asignar", tono: "var(--ct-amber)", casos: [] }
  const porCorreo = new Map<string, Columna>()
  for (const c of casos) {
    const persona = c.asignado ?? c.asumidoPor
    if (!persona) {
      sin.casos.push(c)
      continue
    }
    const clave = persona.email.toLowerCase()
    const col = porCorreo.get(clave) ?? { clave, titulo: persona.nombre, casos: [] }
    col.casos.push(c)
    porCorreo.set(clave, col)
  }
  return [sin, ...[...porCorreo.values()].sort((a, b) => b.casos.length - a.casos.length || a.titulo.localeCompare(b.titulo))]
}

function Tarjeta({ caso, grupo, ahora, i, onAbrir }: { caso: CentralCasoItem; grupo: GrupoTablero; ahora: number; i: number; onAbrir: (r: string) => void }) {
  const abierto = estaAbierto(caso.estado)
  const persona = caso.asignado ?? caso.asumidoPor
  return (
    <li style={{ "--i": i } as CSSProperties} className="ct-entra">
      <button
        type="button"
        onClick={() => onAbrir(String(caso.radicado))}
        className="ct-raised block w-full cursor-pointer rounded-lg border p-3 text-left transition-colors duration-150 hover:border-[color:var(--ct-line-strong)] hover:bg-[var(--ct-hover)]"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span className="ct-mono text-xs font-medium">#{caso.radicado}</span>
            <Marcas caso={caso} />
          </span>
          <SeveridadChip severidad={caso.severidad} />
        </span>
        <span className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug [overflow-wrap:anywhere]">{caso.asunto}</span>
        <span className="ct-faint mt-1 block truncate text-xs">{caso.cliente.empresa || caso.cliente.nombre}</span>
        <span className="mt-2.5 flex items-center justify-between gap-2">
          {grupo === "estado" ? (
            persona ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Avatar nombre={persona.nombre} className="!size-5 !text-[9px]" />
                <span className="ct-muted truncate text-xs">{persona.nombre.split(" ")[0]}</span>
              </span>
            ) : (
              <span className="text-xs font-semibold text-[color:var(--ct-amber)]">Sin asignar</span>
            )
          ) : (
            <EstadoChip estado={caso.estado} />
          )}
          {abierto && (
            <span className="flex-none text-[11px]" style={{ color: caso.sla.vencido ? "var(--ct-red)" : "var(--ct-faint)" }}>
              {caso.sla.vencido ? "Vencido" : vencimiento(caso.sla.respuestaFondoVence, ahora)}
            </span>
          )}
        </span>
        {esperaRespuesta(caso) && (
          <span className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--ct-blue)]">
            <span className="ct-latido size-1.5 rounded-full bg-[var(--ct-blue)]" aria-hidden />
            El cliente espera respuesta
          </span>
        )}
      </button>
    </li>
  )
}

export function CentralTablero({
  casos,
  grupo,
  ahora,
  onAbrir,
}: {
  casos: CentralCasoItem[]
  grupo: GrupoTablero
  ahora: number
  onAbrir: (radicado: string) => void
}) {
  const columnas = grupo === "estado" ? columnasPorEstado(casos) : columnasPorLider(casos)
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:snap-none">
      {columnas.map((col) => (
        <section
          key={col.clave}
          aria-label={`${col.titulo}: ${col.casos.length} casos`}
          className="ct-surface flex max-h-[70dvh] w-[82vw] flex-none snap-center flex-col rounded-xl border sm:w-[300px] lg:min-w-[260px] lg:flex-1"
        >
          <header className="flex items-center gap-2 border-b px-3.5 py-3">
            {col.tono ? <span className="size-2 rounded-full" style={{ background: col.tono }} aria-hidden /> : <Avatar nombre={col.titulo} className="!size-5 !text-[9px]" />}
            <h3 className="m-0 min-w-0 flex-1 truncate text-[13px] font-semibold">{col.titulo}</h3>
            <span className="ct-mono ct-muted text-xs">{col.casos.length}</span>
          </header>
          {col.casos.length === 0 ? (
            <p className="ct-faint m-0 px-3.5 py-6 text-center text-xs">Nada por aquí</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 overflow-y-auto p-2.5">
              {col.casos.map((c, i) => <Tarjeta key={c.radicado} caso={c} grupo={grupo} ahora={ahora} i={i} onAbrir={onAbrir} />)}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
