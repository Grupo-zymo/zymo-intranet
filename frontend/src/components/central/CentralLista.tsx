// Lista de casos: tarjetas grandes, iguales en teléfono y escritorio.

import type { CSSProperties } from "react"
import { AlertTriangle, Flame, MessageSquare } from "lucide-react"
import { AREA_TEXTO, TIPO_TEXTO, esperaRespuesta, estaAbierto, haceCuanto } from "@/lib/centralTickets"
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
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {casos.map((c, i) => {
        const abierto = estaAbierto(c.estado)
        const escalado = abierto ? c.sla.escalamiento : null
        return (
          <li key={c.radicado} style={orden(i)} className="ct-entra">
            <button
              type="button"
              className="ct-caso"
              onClick={() => onAbrir(String(c.radicado))}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="ct-mono text-base font-medium" translate="no">#{c.radicado}</span>
                  {c.urgenteSolicitado && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--ct-orange)]" title="El cliente pidió subir de nivel">
                      <Flame className="size-3.5" aria-hidden />
                      Urgente
                    </span>
                  )}
                </span>
                <span className="ct-faint flex-none text-xs">{haceCuanto(c.creadoEn, ahora)}</span>
              </span>

              <span className="mt-2 block text-base font-bold leading-snug [overflow-wrap:anywhere]">{c.asunto}</span>
              <span className="ct-muted mt-0.5 block truncate text-sm">
                {c.cliente.nombre}
                {c.cliente.empresa ? ` · ${c.cliente.empresa}` : ""}
              </span>

              <span className="mt-3 flex flex-wrap items-center gap-1.5">
                <SeveridadChip severidad={c.severidad} />
                <EstadoChip estado={c.estado} />
                <span className="ct-faint text-xs">
                  {TIPO_TEXTO[c.tipo]} · {AREA_TEXTO[c.area]}
                </span>
                <span className="ct-faint ml-auto flex items-center gap-1 text-xs" title={`${c.mensajes} mensajes`}>
                  <MessageSquare className="size-3.5" aria-hidden />
                  <span className="ct-mono">{c.mensajes}</span>
                  <span className="sr-only">mensajes</span>
                </span>
              </span>

              <span className="mt-3.5 block">
                <SlaResumen sla={c.sla} abierto={abierto} ahora={ahora} />
              </span>

              {escalado && (
                <span className="mt-3 flex items-start gap-1.5 text-sm font-semibold text-[color:var(--ct-red)]">
                  <AlertTriangle className="mt-0.5 size-4 flex-none" aria-hidden />
                  <span className="min-w-0 [overflow-wrap:anywhere]">Escalar: {escalado.motivo}</span>
                </span>
              )}

              <span className="mt-3.5 flex items-center justify-between gap-3 border-t pt-3">
                <Responsable asignado={c.asignado} asumidoPor={c.asumidoPor} compacto />
              </span>

              {esperaRespuesta(c) && (
                <span className="mt-3 flex items-center gap-2 rounded-full bg-[var(--ct-red-soft)] px-3 py-1.5 text-xs font-bold text-[color:var(--ct-red)]">
                  <span className="ct-latido size-1.5 flex-none rounded-full bg-[var(--ct-red)]" aria-hidden />
                  El cliente espera respuesta · {haceCuanto(c.ultimoMensaje?.creadoEn, ahora)}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function CentralListaCargando() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando casos">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="ct-card p-5">
          <div className="flex justify-between">
            <div className="ct-skeleton h-5 w-20" />
            <div className="ct-skeleton h-4 w-14" />
          </div>
          <div className="ct-skeleton mt-3 h-5 w-4/5" />
          <div className="ct-skeleton mt-2 h-4 w-1/2" />
          <div className="mt-4 flex gap-2">
            <div className="ct-skeleton h-6 w-16 !rounded-full" />
            <div className="ct-skeleton h-6 w-20 !rounded-full" />
          </div>
          <div className="ct-skeleton mt-4 h-2 w-full !rounded-full" />
        </div>
      ))}
    </div>
  )
}
