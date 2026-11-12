// Vista de lista: tabla densa en escritorio, tarjetas en el teléfono.

import type { CSSProperties } from "react"
import { ArrowUpCircle, Flame, MessageSquare } from "lucide-react"
import { AREA_TEXTO, TIPO_TEXTO, esperaRespuesta, estaAbierto, haceCuanto } from "@/lib/centralTickets"
import type { CentralCasoItem } from "@/types/centralTickets"
import { EstadoChip, Responsable, SeveridadChip, SlaResumen } from "./partes"

interface Props {
  casos: CentralCasoItem[]
  /** El líder solo ve casos suyos: la columna «Responsable» sobra. */
  conResponsable: boolean
  ahora: number
  onAbrir: (radicado: string) => void
}

const orden = (i: number): CSSProperties => ({ "--i": i }) as CSSProperties

/** Marcas junto al radicado: el cliente pidió subir de nivel / el caso está escalado. */
export function Marcas({ caso }: { caso: CentralCasoItem }) {
  return (
    <>
      {caso.urgenteSolicitado && (
        <span title="El cliente pidió subir de nivel" className="inline-flex text-[color:var(--ct-orange)]">
          <Flame className="size-3.5" aria-hidden />
          <span className="sr-only">El cliente pidió subir de nivel</span>
        </span>
      )}
      {caso.sla.escalamiento && estaAbierto(caso.estado) && (
        <span title={`Escalado: ${caso.sla.escalamiento.motivo}`} className="inline-flex text-[color:var(--ct-red)]">
          <ArrowUpCircle className="size-3.5" aria-hidden />
          <span className="sr-only">Escalado</span>
        </span>
      )}
    </>
  )
}

export function UltimoMensaje({ caso, ahora }: { caso: CentralCasoItem; ahora: number }) {
  if (!caso.ultimoMensaje) return <span className="ct-faint text-xs">Sin mensajes</span>
  const espera = esperaRespuesta(caso)
  return (
    <span className="block">
      <span className={`flex items-center gap-1.5 text-xs font-semibold ${espera ? "text-[color:var(--ct-blue)]" : "ct-muted font-normal"}`}>
        {espera && <span className="ct-latido size-1.5 flex-none rounded-full bg-[var(--ct-blue)]" aria-hidden />}
        {espera ? "Espera respuesta" : caso.ultimoMensaje.deCliente ? "Del cliente" : "Del equipo"}
      </span>
      <span className="ct-faint block text-xs">{haceCuanto(caso.ultimoMensaje.creadoEn, ahora)}</span>
    </span>
  )
}

const TH = "ct-faint whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold"

export function CentralLista({ casos, conResponsable, ahora, onAbrir }: Props) {
  return (
    <>
      {/* Escritorio */}
      <div className="ct-surface hidden overflow-x-auto rounded-xl border lg:block">
        <table className="w-full min-w-[1040px] border-collapse text-[13px]">
          <caption className="sr-only">Casos de los clientes</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className={`${TH} pl-4`}>Radicado</th>
              <th scope="col" className={TH}>Asunto</th>
              <th scope="col" className={TH}>Cliente</th>
              <th scope="col" className={TH}>Severidad</th>
              <th scope="col" className={TH}>Estado</th>
              <th scope="col" className={TH}>Área</th>
              {conResponsable && <th scope="col" className={TH}>Responsable</th>}
              <th scope="col" className={TH}>Plazo</th>
              <th scope="col" className={`${TH} pr-4`}>Último mensaje</th>
            </tr>
          </thead>
          <tbody>
            {casos.map((c, i) => (
              <tr
                key={c.radicado}
                style={orden(i)}
                className="ct-entra relative border-b transition-colors duration-150 last:border-b-0 hover:bg-[var(--ct-hover)] focus-within:bg-[var(--ct-hover)]"
              >
                <td className="whitespace-nowrap py-3 pl-4 pr-3 align-top">
                  <span className="flex items-center gap-1.5">
                    <span className="ct-mono font-medium">#{c.radicado}</span>
                    <Marcas caso={c} />
                  </span>
                  <span className="ct-faint block text-xs">{haceCuanto(c.creadoEn, ahora)}</span>
                </td>
                <td className="max-w-[270px] px-3 py-3 align-top">
                  {/* El botón cubre toda la fila: un solo destino de clic y de teclado */}
                  <button
                    type="button"
                    onClick={() => onAbrir(String(c.radicado))}
                    className="block w-full cursor-pointer truncate text-left font-medium after:absolute after:inset-0 after:content-['']"
                  >
                    {c.asunto}
                  </button>
                  <span className="ct-faint flex items-center gap-2 text-xs">
                    {TIPO_TEXTO[c.tipo]}
                    <span className="flex items-center gap-1" title={`${c.mensajes} mensajes`}>
                      <MessageSquare className="size-3" aria-hidden />
                      <span className="ct-mono">{c.mensajes}</span>
                      <span className="sr-only">mensajes</span>
                    </span>
                  </span>
                </td>
                <td className="max-w-[176px] px-3 py-3 align-top">
                  <span className="block truncate">{c.cliente.nombre}</span>
                  {c.cliente.empresa && <span className="ct-faint block truncate text-xs">{c.cliente.empresa}</span>}
                </td>
                <td className="px-3 py-3 align-top"><SeveridadChip severidad={c.severidad} /></td>
                <td className="px-3 py-3 align-top"><EstadoChip estado={c.estado} /></td>
                <td className="ct-muted whitespace-nowrap px-3 py-3 align-top">{AREA_TEXTO[c.area]}</td>
                {conResponsable && (
                  <td className="max-w-[172px] px-3 py-3 align-top"><Responsable asignado={c.asignado} asumidoPor={c.asumidoPor} /></td>
                )}
                <td className="px-3 py-3 align-top"><SlaResumen sla={c.sla} abierto={estaAbierto(c.estado)} ahora={ahora} /></td>
                <td className="whitespace-nowrap py-3 pl-3 pr-4 align-top"><UltimoMensaje caso={c} ahora={ahora} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Teléfono y tableta */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 lg:hidden">
        {casos.map((c, i) => (
          <li key={c.radicado} style={orden(i)} className="ct-entra">
            <button
              type="button"
              onClick={() => onAbrir(String(c.radicado))}
              className="ct-surface block w-full cursor-pointer rounded-xl border p-3.5 text-left transition-colors duration-150 active:bg-[var(--ct-hover)]"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <span className="ct-mono text-[13px] font-medium">#{c.radicado}</span>
                  <Marcas caso={c} />
                </span>
                <span className="flex items-center gap-1.5">
                  <SeveridadChip severidad={c.severidad} />
                  <EstadoChip estado={c.estado} />
                </span>
              </span>
              <span className="mt-2 block text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{c.asunto}</span>
              <span className="ct-muted mt-0.5 block truncate text-[13px]">
                {c.cliente.nombre}{c.cliente.empresa ? ` · ${c.cliente.empresa}` : ""}
              </span>
              <span className="mt-3 flex items-end justify-between gap-3">
                {conResponsable ? <Responsable asignado={c.asignado} asumidoPor={c.asumidoPor} compacto /> : <span className="ct-faint text-xs">{haceCuanto(c.creadoEn, ahora)}</span>}
                <SlaResumen sla={c.sla} abierto={estaAbierto(c.estado)} ahora={ahora} />
              </span>
              {esperaRespuesta(c) && (
                <span className="mt-3 flex items-center gap-1.5 border-t pt-2.5 text-xs font-semibold text-[color:var(--ct-blue)]">
                  <span className="ct-latido size-1.5 rounded-full bg-[var(--ct-blue)]" aria-hidden />
                  El cliente espera respuesta · {haceCuanto(c.ultimoMensaje?.creadoEn, ahora)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

export function CentralListaCargando() {
  return (
    <div className="ct-surface rounded-xl border" aria-busy="true" aria-label="Cargando casos">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
          <div className="ct-skeleton h-4 w-14" />
          <div className="ct-skeleton h-4 flex-1" />
          <div className="ct-skeleton hidden h-4 w-28 sm:block" />
          <div className="ct-skeleton hidden h-5 w-16 rounded-full sm:block" />
          <div className="ct-skeleton hidden h-4 w-32 lg:block" />
        </div>
      ))}
    </div>
  )
}
