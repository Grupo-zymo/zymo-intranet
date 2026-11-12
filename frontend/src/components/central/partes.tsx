// Piezas pequeñas que comparten la lista, el detalle y los filtros.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { PlugZap, RefreshCw, ShieldAlert, Unplug } from "lucide-react"
import { ESTADO_TEXTO, SEVERIDAD_TEXTO, TONO_ESTADO, estadoDeError, iniciales, mensajeDeError, vencimiento } from "@/lib/centralTickets"
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
      <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full bg-[rgba(161,98,7,0.12)] px-3 text-xs font-bold text-[color:var(--ct-amber)]">
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
export function SlaResumen({ sla, abierto, ahora, grande = false }: { sla: CentralSla; abierto: boolean; ahora: number; grande?: boolean }) {
  const color = colorSla(sla, abierto)
  const texto = !abierto ? "Atendido" : sla.vencido ? "Vencido" : vencimiento(sla.respuestaFondoVence, ahora)
  return (
    <div className="min-w-0">
      <div className={`flex items-baseline justify-between gap-2 whitespace-nowrap ${grande ? "text-sm" : "text-xs"}`}>
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

/** Reloj del panel: basta con refrescar los "hace 5 min" cada medio minuto. */
export function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return ahora
}

/** El servicio no está conectado, no responde o la sesión no tiene acceso. */
export function AvisoServicio({ error, onReintentar }: { error: unknown; onReintentar: () => void }) {
  const estado = estadoDeError(error)
  const reintentar = (
    <button type="button" className="ct-btn" onClick={onReintentar}>
      <RefreshCw className="size-3.5" aria-hidden />
      Reintentar
    </button>
  )
  if (estado === 503) {
    return (
      <Aviso icono={<Unplug className="size-6" aria-hidden />} titulo="La central todavía no está conectada" accion={reintentar}>
        Falta enlazar la intranet con la app donde los clientes radican sus casos. Avísale al equipo de Innovación y Desarrollo para que la active.
      </Aviso>
    )
  }
  if (estado === 403 || estado === 401) {
    return (
      <Aviso icono={<ShieldAlert className="size-6" aria-hidden />} titulo="Tu sesión no tiene acceso a la central">
        Si te acaban de dar el permiso, cierra sesión y vuelve a entrar para que se aplique.
      </Aviso>
    )
  }
  return (
    <Aviso icono={<PlugZap className="size-6" aria-hidden />} titulo="No pudimos traer los casos" accion={reintentar}>
      {mensajeDeError(error, "El servicio de casos no respondió. Intenta de nuevo en un momento.")}
    </Aviso>
  )
}
