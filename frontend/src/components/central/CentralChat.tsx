// Zona de chats del escritorio: bandeja de conversaciones con los clientes y, al abrir una, la conversación con su
// redactor y la gestión. Se pliega a una barra vertical delgada con el contador de casos que esperan respuesta.

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react"
import { esperaRespuesta, haceCuanto } from "@/lib/centralTickets"
import type { CentralCasoItem, CentralNivel } from "@/types/centralTickets"
import { CentralDetalle } from "./CentralDetalle"
import { SeveridadChip } from "./partes"

interface Props {
  abierto: boolean
  onAlternar: (abierto: boolean) => void
  /** Casos abiertos (la bandeja de conversaciones). */
  casos: CentralCasoItem[] | undefined
  cargando: boolean
  fallo: boolean
  seleccionado: string | null
  onAbrir: (radicado: string) => void
  onCerrarCaso: () => void
  nivel: CentralNivel
  miCorreo: string
  ahora: number
}

const instante = (c: CentralCasoItem) => Date.parse(c.ultimoMensaje?.creadoEn ?? c.creadoEn) || 0

export function CentralChat({ abierto, onAlternar, casos, cargando, fallo, seleccionado, onAbrir, onCerrarCaso, nivel, miCorreo, ahora }: Props) {
  const [vista, setVista] = useState<"espera" | "todos">("espera")
  const esperan = useMemo(() => (casos ?? []).filter(esperaRespuesta), [casos])
  const lista = useMemo(
    () => [...(vista === "espera" ? esperan : (casos ?? []))].sort((a, b) => instante(b) - instante(a)),
    [vista, esperan, casos],
  )

  if (!abierto) {
    return (
      <aside
        aria-label="Chats con los clientes"
        className="ct-chat-panel ct-card flex w-16 flex-none cursor-pointer flex-col items-center gap-4 py-4"
        onClick={() => onAlternar(true)}
      >
        <button type="button" className="ct-btn ct-btn-redondo" aria-label="Abrir los chats" aria-expanded={false}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="relative grid size-11 place-items-center rounded-full bg-[var(--ct-red-soft)] text-[color:var(--ct-red)]">
          <MessageSquare className="size-5" aria-hidden />
          {esperan.length > 0 && (
            <span className="ct-mono absolute -right-1.5 -top-1.5 grid min-w-[22px] place-items-center rounded-full bg-[var(--ct-red-solid)] px-1 text-xs font-medium text-white">
              {esperan.length}
              <span className="sr-only"> casos esperan respuesta</span>
            </span>
          )}
        </span>
        <span className="ct-muted text-sm font-bold tracking-wide [writing-mode:vertical-rl]">Chats</span>
      </aside>
    )
  }

  return (
    <aside
      aria-label="Chats con los clientes"
      data-caso={seleccionado !== null}
      className="ct-chat-panel ct-chat ct-card flex min-h-0 flex-none flex-col overflow-hidden"
      style={{ width: "max(640px, 45%)" }}
    >
      <div className="flex flex-none items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="m-0 flex items-center gap-2 text-lg font-bold">
          Chats
          {esperan.length > 0 && (
            <span className="ct-mono rounded-full bg-[var(--ct-red-soft)] px-2.5 py-0.5 text-sm font-medium text-[color:var(--ct-red)]">
              {esperan.length} esperan respuesta
            </span>
          )}
        </h2>
        <button type="button" className="ct-btn ct-btn-redondo" aria-label="Plegar los chats" aria-expanded onClick={() => onAlternar(false)}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <section className="ct-bandeja flex min-h-0 flex-col" aria-label="Conversaciones">
          <div className="flex flex-none gap-2 px-4 py-3">
            <button type="button" className="ct-vista" aria-pressed={vista === "espera"} onClick={() => setVista("espera")}>
              Esperan respuesta <span className="ct-mono">{esperan.length}</span>
            </button>
            <button type="button" className="ct-vista" aria-pressed={vista === "todos"} onClick={() => setVista("todos")}>
              Todos <span className="ct-mono">{casos?.length ?? 0}</span>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {cargando ? (
              <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label="Cargando conversaciones">
                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="ct-skeleton h-20" />)}
              </div>
            ) : fallo && !casos ? (
              <p className="ct-muted m-0 p-6 text-center text-sm">No pudimos traer las conversaciones.</p>
            ) : lista.length === 0 ? (
              <p className="ct-muted m-0 p-6 text-center text-[15px]">
                {vista === "espera" ? "Ningún cliente espera respuesta. Buen trabajo." : "No hay conversaciones abiertas."}
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {lista.map((c) => {
                  const espera = esperaRespuesta(c)
                  const id = String(c.radicado)
                  return (
                    <li key={c.radicado} className="border-t first:border-t-0">
                      <button
                        type="button"
                        aria-current={seleccionado === id}
                        onClick={() => onAbrir(id)}
                        className="relative block w-full cursor-pointer px-5 py-3.5 text-left transition-colors duration-150 hover:bg-[var(--ct-hover)] aria-[current=true]:bg-[var(--ct-red-soft)]"
                      >
                        {espera && <span className="ct-latido absolute left-2 top-1/2 size-2 -translate-y-1/2 rounded-full bg-[var(--ct-red)]" aria-hidden />}
                        <span className="flex items-center justify-between gap-2">
                          <span className="ct-mono text-[15px] font-medium" translate="no">#{c.radicado}</span>
                          <span className="ct-faint text-xs">{haceCuanto(c.ultimoMensaje?.creadoEn ?? c.creadoEn, ahora)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[15px] font-bold">
                          {c.cliente.nombre}
                          {c.cliente.empresa && <span className="ct-muted font-normal"> · {c.cliente.empresa}</span>}
                        </span>
                        <span className="ct-muted block truncate text-sm">{c.asunto}</span>
                        <span className="mt-2 flex items-center gap-2">
                          <SeveridadChip severidad={c.severidad} />
                          <span className={`text-xs ${espera ? "font-bold text-[color:var(--ct-red)]" : "ct-faint"}`}>
                            {espera ? "Espera respuesta" : c.ultimoMensaje ? (c.ultimoMensaje.deCliente ? "Del cliente" : "Respondido") : "Sin mensajes"}
                          </span>
                          <span className="ct-faint ml-auto flex items-center gap-1 text-xs">
                            <MessageSquare className="size-3.5" aria-hidden />
                            <span className="ct-mono">{c.mensajes}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="ct-conv min-h-0 min-w-0 flex-1 flex-col" aria-label="Conversación abierta">
          {seleccionado ? (
            <CentralDetalle key={seleccionado} radicado={seleccionado} nivel={nivel} miCorreo={miCorreo} ahora={ahora} onCerrar={onCerrarCaso} sinMarco />
          ) : (
            <div className="grid h-full place-items-center px-8 text-center">
              <div>
                <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[var(--ct-red-soft)] text-[color:var(--ct-red)]">
                  <MessageSquare className="size-6" aria-hidden />
                </div>
                <p className="m-0 text-base font-bold">Elige una conversación</p>
                <p className="ct-muted m-0 mt-1 text-sm">Aquí verás el chat con el cliente y la gestión del caso.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  )
}
