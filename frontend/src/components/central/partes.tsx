// Piezas pequeñas que comparten la lista, el tablero y el detalle.

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
    return <span className="text-xs font-semibold text-[color:var(--ct-amber)]">Sin asignar</span>
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar nombre={persona.nombre} />
      <span className="min-w-0">
        <span className="block truncate text-[13px]">{persona.nombre}</span>
        {!compacto && !asignado && <span className="ct-faint block text-[11px]">Lo asumió</span>}
      </span>
    </span>
  )
}

function tonoSla(sla: CentralSla, abierto: boolean): string {
  if (!abierto) return "var(--ct-gray)"
  if (sla.vencido || sla.consumido >= 100) return "var(--ct-red)"
  if (sla.consumido >= 75) return "var(--ct-orange)"
  return "var(--ct-green)"
}

/** Plazo de respuesta de fondo: barra con el % consumido y cuándo vence. */
export function SlaResumen({ sla, abierto, ahora }: { sla: CentralSla; abierto: boolean; ahora: number }) {
  const color = tonoSla(sla, abierto)
  const pct = Math.max(0, Math.min(100, Math.round(sla.consumido)))
  const texto = !abierto ? "Atendido" : sla.vencido ? "Vencido" : vencimiento(sla.respuestaFondoVence, ahora)
  return (
    <div className="min-w-[132px]">
      <div className="flex items-baseline justify-between gap-2 whitespace-nowrap">
        <span className="text-xs" style={{ color: abierto && sla.vencido ? color : undefined }}>
          {texto}
        </span>
        <span className="ct-mono ct-faint text-[11px]">{Math.round(sla.consumido)}%</span>
      </div>
      <div
        className="ct-sla-barra mt-1"
        role="progressbar"
        aria-label="Plazo consumido"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        style={tono(color)}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
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
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-14 text-center">
      <div className="ct-muted mb-4 grid size-11 place-items-center rounded-full border border-[color:var(--ct-line-strong)]">{icono}</div>
      <p className="m-0 text-[15px] font-semibold text-balance">{titulo}</p>
      {children && <p className="ct-muted m-0 mt-1.5 text-[13px] leading-relaxed text-pretty">{children}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  )
}
