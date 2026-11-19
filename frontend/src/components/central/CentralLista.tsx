// Lista de casos del teléfono: filas compactas. Lo que ocupa espacio (plazo, escalamiento, «espera respuesta»)
// solo aparece si el caso sigue abierto; uno cerrado se queda en tres líneas.

import type { CSSProperties } from "react"
import { AlertTriangle, MessageSquare } from "lucide-react"
import { esperaRespuesta, estaAbierto, haceCuanto } from "@/lib/centralTickets"
import type { CentralCasoItem } from "@/types/centralTickets"
import { EstadoChip, Responsable, SeveridadChip, SlaResumen } from "./partes"

interface Props {
  casos: CentralCasoItem[]
  ahora: number
  onAbrir: (radicado: string) => void
}

const orden = (i: number): CSSProperties => ({ "--i": i }) as CSSProperties

export function CentralLista({ casos, ahora, onAbrir }: Props) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {casos.map((c, i) => {
        const abierto = estaAbierto(c.estado)
        const escalado = abierto ? c.sla.escalamiento : null
        return (
          <li key={c.radicado} style={orden(i)} className="ct-entra">
            <button type="button" className="ct-caso !px-3.5 !py-3" onClick={() => onAbrir(String(c.radicado))}>
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="ct-mono text-sm font-medium" translate="no">#{c.radicado}</span>
                  <SeveridadChip severidad={c.severidad} />
                  <span className="ct-faint truncate text-xs">{haceCuanto(c.creadoEn, ahora)}</span>
                </span>
                <EstadoChip estado={c.estado} />
              </span>

              <span className="mt-1.5 line-clamp-2 block text-[15px] font-bold leading-snug [overflow-wrap:anywhere]">{c.asunto}</span>

              <span className="mt-1 flex items-center justify-between gap-3">
                <span className="ct-muted min-w-0 truncate text-[13px]">
                  {c.cliente.nombre}
                  {c.cliente.empresa ? ` · ${c.cliente.empresa}` : ""}
                </span>
                <span className="ct-faint flex flex-none items-center gap-1 text-xs" title={`${c.mensajes} mensajes`}>
                  <MessageSquare className="size-3.5" aria-hidden />
                  <span className="ct-mono">{c.mensajes}</span>
                  <span className="sr-only">mensajes</span>
                </span>
              </span>

              {abierto && (
                <span className="mt-2.5 block">
                  <SlaResumen sla={c.sla} abierto ahora={ahora} />
                </span>
              )}

              {escalado && (
                <span className="mt-2 flex items-start gap-1.5 text-[13px] font-semibold text-[color:var(--ct-red)]">
                  <AlertTriangle className="mt-0.5 size-4 flex-none" aria-hidden />
                  <span className="min-w-0 [overflow-wrap:anywhere]">Escalar: {escalado.motivo}</span>
                </span>
              )}

              <span className="mt-2.5 flex items-center justify-between gap-3 border-t pt-2.5">
                <Responsable asignado={c.asignado} asumidoPor={c.asumidoPor} compacto />
                {esperaRespuesta(c) && (
                  <span className="flex flex-none items-center gap-1.5 rounded-full bg-[var(--ct-red-soft)] px-2.5 py-1 text-[11px] font-bold text-[color:var(--ct-red)]">
                    <span className="ct-latido size-1.5 flex-none rounded-full bg-[var(--ct-red)]" aria-hidden />
                    Espera respuesta
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function CentralListaCargando() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando casos">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="ct-card p-3.5">
          <div className="flex justify-between">
            <div className="ct-skeleton h-4 w-24" />
            <div className="ct-skeleton h-5 w-16 !rounded-full" />
          </div>
          <div className="ct-skeleton mt-2.5 h-4 w-4/5" />
          <div className="ct-skeleton mt-2 h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  )
}
