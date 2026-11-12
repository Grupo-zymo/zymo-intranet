// Piezas pequeñas que comparten la lista, el detalle y los filtros.

import type { CSSProperties, ReactNode } from "react"
import { ESTADO_TEXTO, SEVERIDAD_TEXTO, TONO_ESTADO, iniciales, vencimiento } from "@/lib/centralTickets"
import type { CentralEstado, CentralSeveridad, CentralSla } from "@/types/centralTickets"

const TONO_SEVERIDAD: Record<CentralSeveridad, string> = {
  critica: "var(--ct-red)",
  alta: "var(--ct-orange)",
  media: "var(--ct-amber)",
  baja: "var(--ct-gray)",
}

const tono = (color: string): CSSProperties => ({ "--tono": color }) as CSSProperties

export function SeveridadChip({ severidad }: { severidad: CentralSeveridad }) {
  return (
    <span className="ct-chip" data-solido="true" style={tono(TONO_SEVERIDAD[severidad])}>
      {SEVERIDAD_TEXTO[severidad]}
    </span>
  )
}

export function EstadoChip({ estado }: { estado: CentralEstado }) {
  return (
    <span className="ct-chip" style={tono(TONO_ESTADO[estado])}>
      {ESTADO_TEXTO[estado]}
    </span>
  )
}

export function Avatar({ nombre, className = "" }: { nombre: string; className?: string }) {
  return (
    <span className={`ct-avatar ${className}`} aria-hidden>
      {iniciales(nombre)}
    </span>
  )
}

/** Responsable del caso: quien lo tiene asignado, o quien lo asumió, o nadie. */
export function Responsable({
  asignado,
  asumidoPor,
  compacto = false,
}: {
  asignado: { nombre: string } | null
  asumidoPor: { nombre: string } | null
  compacto?: boolean
}) {
  const persona = asignado ?? asumidoPor
  if (!persona) {
    return (
      <span className="inline-flex h-[26px] items-center rounded-full bg-[rgba(161,98,7,0.12)] px-3 text-xs font-bold text-[color:var(--ct-amber)]">
        Sin asignar
      </span>
    )
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar nombre={persona.nombre} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{persona.nombre}</span>
        {!compacto && !asignado && <span className="ct-faint block text-[11px]">Lo asumió</span>}
      </span>
    </span>
  )
}

export function colorSla(sla: CentralSla, abierto: boolean): string {
  if (!abierto) return "var(--ct-gray)"
  if (sla.vencido || sla.consumido >= 100) return "var(--ct-red)"
  if (sla.consumido >= 75) return "var(--ct-orange)"
  return "var(--ct-green)"
}

/** Barra de plazo: el relleno es el % consumido. */
export function BarraSla({ pct, color, className = "" }: { pct: number; color: string; className?: string }) {
  const valor = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div
      className={`ct-sla-barra ${className}`}
      role="progressbar"
      aria-label="Plazo consumido"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valor}
      style={tono(color)}
    >
      <span style={{ width: `${valor}%` }} />
    </div>
  )
}

/** Plazo de respuesta de fondo: cuándo vence y cuánto se ha consumido. */
export function SlaResumen({ sla, abierto, ahora }: { sla: CentralSla; abierto: boolean; ahora: number }) {
  const color = colorSla(sla, abierto)
  const texto = !abierto ? "Atendido" : sla.vencido ? "Vencido" : vencimiento(sla.respuestaFondoVence, ahora)
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 whitespace-nowrap text-xs">
        <span className="font-medium" style={{ color: abierto && sla.vencido ? color : undefined }}>
          {texto}
        </span>
        <span className="ct-mono ct-faint text-[11px]">{Math.round(sla.consumido)}%</span>
      </div>
      <BarraSla pct={sla.consumido} color={color} className="mt-1.5" />
    </div>
  )
}

/** Estado vacío / de error: dice qué pasa y qué se puede hacer. */
export function Aviso({
  icono,
  titulo,
  children,
  accion,
}: {
  icono: ReactNode
  titulo: string
  children?: ReactNode
  accion?: ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-[var(--ct-red-soft)] text-[color:var(--ct-red)]">{icono}</div>
      <p className="m-0 text-base font-bold text-balance">{titulo}</p>
      {children && <p className="ct-muted m-0 mt-1.5 text-sm leading-relaxed text-pretty">{children}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  )
}
