// Central de tickets — versión de ESCRITORIO (≥ 1024 px). Dos zonas lado a lado: el dashboard (indicadores,
// tendencia, carga por líder y pendientes) y los chats con los clientes, que se pliegan a una barra vertical.

import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, Inbox, RefreshCw } from "lucide-react"
import { TicketToastContainer } from "@/components/tickets/TicketToast"
import { useCentralCasos, useCentralResumen } from "@/hooks/useCentralTickets"
import {
  FILTROS_VACIOS,
  LIMITE_AMPLIO,
  aplicarFiltroLocal,
  consultaCasos,
  esperaRespuesta,
  estaAbierto,
  filtrosAUrl,
  filtrosDesdeUrl,
  haceCuanto,
  hayFiltros,
} from "@/lib/centralTickets"
import type { CentralCasoItem, CentralFiltros as Filtros, CentralNivel } from "@/types/centralTickets"
import { CentralChat } from "./CentralChat"
import { CentralBarraFiltros } from "./CentralFiltros"
import { CentralCargaLideres, CentralKpisWeb, CentralTendencia } from "./CentralPulso"
import { Aviso, AvisoServicio, EstadoChip, Responsable, SeveridadChip, SlaResumen, useAhora } from "./partes"
import "./central.css"

const CLAVE_CHAT = "central-chat-abierto"

/** El estado del chat (plegado o no) se recuerda en este navegador. */
function useChatAbierto(): [boolean, (v: boolean) => void] {
  const [abierto, setAbierto] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_CHAT) !== "0"
    } catch {
      return true
    }
  })
  const cambiar = (v: boolean) => {
    setAbierto(v)
    try {
      localStorage.setItem(CLAVE_CHAT, v ? "1" : "0")
    } catch {
      /* sin almacenamiento: solo vale para esta visita */
    }
  }
  return [abierto, cambiar]
}

type Motivo = "sin" | "escalado" | "vencido" | "espera"

/** Por qué un caso abierto pide acción. */
function motivos(c: CentralCasoItem): Motivo[] {
  if (!estaAbierto(c.estado)) return []
  const lista: Motivo[] = []
  if (c.sla.vencido) lista.push("vencido")
  if (c.sla.escalamiento) lista.push("escalado")
  if (!c.asignado && !c.asumidoPor) lista.push("sin")
  if (esperaRespuesta(c)) lista.push("espera")
  return lista
}

const TEXTO_MOTIVO: Record<Motivo, string> = { sin: "Sin asignar", escalado: "Escalado", vencido: "Vencido", espera: "Espera respuesta" }
const COLOR_MOTIVO: Record<Motivo, string> = {
  sin: "text-[color:var(--ct-amber)] bg-[rgba(161,98,7,0.12)]",
  escalado: "text-[color:var(--ct-orange)] bg-[rgba(194,87,12,0.12)]",
  vencido: "text-[color:var(--ct-red)] bg-[var(--ct-red-soft)]",
  espera: "text-[color:var(--ct-blue)] bg-[rgba(29,95,191,0.1)]",
}

const PESO: Record<Motivo, number> = { vencido: 8, escalado: 4, sin: 2, espera: 1 }
const prioridad = (c: CentralCasoItem) => motivos(c).reduce((n, m) => n + PESO[m], 0)

function Pendientes({
  casos,
  cargando,
  conFiltros,
  seleccionado,
  ahora,
  incompleto,
  total,
  onAbrir,
  onLimpiar,
}: {
  casos: CentralCasoItem[]
  cargando: boolean
  conFiltros: boolean
  seleccionado: string | null
  ahora: number
  incompleto: boolean
  total: number
  onAbrir: (radicado: string) => void
  onLimpiar: () => void
}) {
  const TH = "ct-faint whitespace-nowrap px-4 py-3 text-left text-xs font-semibold"
  return (
    <>
      {incompleto && (
        <p className="ct-muted m-0 mx-6 mb-3 rounded-2xl border border-dashed border-[color:var(--ct-line-strong)] px-4 py-2.5 text-sm">
          Se muestran los {LIMITE_AMPLIO} casos más recientes de {total}. Usa los filtros para acotar.
        </p>
      )}
      {cargando ? (
        <div className="flex flex-col gap-3 px-6 pb-6" aria-busy="true" aria-label="Cargando pendientes">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="ct-skeleton h-14" />)}
        </div>
      ) : casos.length === 0 ? (
        <Aviso
          icono={<Inbox className="size-6" aria-hidden />}
          titulo={conFiltros ? "Ningún caso coincide con estos filtros" : "No hay pendientes"}
          accion={conFiltros ? <button type="button" className="ct-btn" onClick={onLimpiar}>Limpiar filtros</button> : undefined}
        >
          {conFiltros ? "Quita alguno o limpia todo para ver más casos." : "Ningún caso abierto está sin asignar, escalado, vencido ni esperando respuesta."}
        </Aviso>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-[15px]">
            <caption className="sr-only">Casos que requieren acción</caption>
            <thead>
              <tr className="border-y bg-[var(--ct-raised)]">
                <th scope="col" className={`${TH} pl-6`}>Radicado</th>
                <th scope="col" className={TH}>Cliente y asunto</th>
                <th scope="col" className={TH}>Severidad / estado</th>
                <th scope="col" className={TH}>Plazo</th>
                <th scope="col" className={`${TH} pr-6`}>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {casos.map((c) => {
                const id = String(c.radicado)
                const ms = motivos(c)
                return (
                  <tr key={c.radicado} className="ct-fila" aria-current={seleccionado === id}>
                    <td className="whitespace-nowrap py-4 pl-6 pr-4 align-top">
                      <span className="ct-mono font-medium" translate="no">#{c.radicado}</span>
                      <span className="ct-faint block text-xs">{haceCuanto(c.creadoEn, ahora)}</span>
                    </td>
                    <td className="w-full max-w-0 px-4 py-4 align-top">
                      <button
                        type="button"
                        onClick={() => onAbrir(id)}
                        className="block w-full cursor-pointer truncate text-left font-bold after:absolute after:inset-0 after:content-['']"
                      >
                        {c.asunto}
                      </button>
                      <span className="ct-muted block truncate text-sm">
                        {c.cliente.nombre}
                        {c.cliente.empresa ? ` · ${c.cliente.empresa}` : ""}
                      </span>
                      {ms.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {ms.map((m) => (
                            <span key={m} className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold ${COLOR_MOTIVO[m]}`}>
                              {TEXTO_MOTIVO[m]}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className="flex flex-col items-start gap-1.5">
                        <SeveridadChip severidad={c.severidad} />
                        <EstadoChip estado={c.estado} />
                      </span>
                    </td>
                    <td className="w-[150px] px-3 py-4 align-top">
                      <SlaResumen sla={c.sla} abierto={estaAbierto(c.estado)} ahora={ahora} grande />
                    </td>
                    <td className="w-[160px] py-4 pl-3 pr-6 align-top">
                      <Responsable asignado={c.asignado} asumidoPor={c.asumidoPor} compacto />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export function CentralWeb({ nivel, miCorreo }: { nivel: CentralNivel; miCorreo: string }) {
  const [params, setParams] = useSearchParams()
  const ahora = useAhora()
  const [chatAbierto, setChatAbierto] = useChatAbierto()
  const director = nivel === "director"

  const filtros = filtrosDesdeUrl(params)
  const casoAbierto = params.get("caso")
  const conFiltros = hayFiltros(filtros)

  const resumen = useCentralResumen()
  // Bandeja de chats: todos los casos abiertos. Sin filtros, los pendientes salen de esta misma consulta.
  const consultaBase = consultaCasos({ ...FILTROS_VACIOS, estado: "abierto" }, true)
  const abiertos = useCentralCasos(consultaBase)
  const filtrada = useCentralCasos(conFiltros ? consultaCasos(filtros, true) : consultaBase)

  const origen = filtrada.data?.items ?? []
  const pendientes = conFiltros
    ? aplicarFiltroLocal(origen, filtros)
    : origen
        .filter((c) => motivos(c).length > 0)
        .sort((a, b) =>
          filtros.orden === "vencimiento"
            ? (Date.parse(a.sla.respuestaFondoVence ?? "") || Infinity) - (Date.parse(b.sla.respuestaFondoVence ?? "") || Infinity)
            : prioridad(b) - prioridad(a) || Date.parse(b.creadoEn) - Date.parse(a.creadoEn),
        )

  function escribir(mutar: (p: URLSearchParams) => URLSearchParams, reemplazar = true) {
    setParams((actual) => mutar(new URLSearchParams(actual)), { replace: reemplazar })
  }
  const cambiar = (parcial: Partial<Filtros>) => escribir((p) => filtrosAUrl({ ...filtros, pagina: 1, ...parcial }, p))
  const limpiar = () => escribir((p) => filtrosAUrl(FILTROS_VACIOS, p))
  const aplicarIndicador = (parcial: Partial<Filtros> | null) => escribir((p) => filtrosAUrl({ ...FILTROS_VACIOS, ...(parcial ?? {}) }, p))
  const abrirCaso = (radicado: string | null) => {
    if (radicado) setChatAbierto(true) // si el chat estaba plegado, se expande
    escribir((p) => {
      if (radicado) p.set("caso", radicado)
      else p.delete("caso")
      return p
    }, false)
  }

  const errorGeneral = abiertos.error ?? resumen.error
  const bloqueado = !!errorGeneral && !abiertos.data
  const actualizando = abiertos.isFetching || filtrada.isFetching || resumen.isFetching
  function refrescar() {
    void resumen.refetch()
    void abiertos.refetch()
    void filtrada.refetch()
  }

  return (
    <div className="central ct-web flex h-dvh flex-col overflow-hidden">
      <header className="flex flex-none items-center gap-4 px-8 pb-4 pt-6">
        <Link to="/dashboard" className="ct-btn ct-btn-redondo" aria-label="Volver a la intranet">
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-[32px] font-bold leading-tight tracking-[-0.02em]">
            {director ? "Central de tickets" : "Mis casos asignados"}
          </h1>
          <p className="ct-muted m-0 text-[15px]">
            Servicio al cliente
            {abiertos.dataUpdatedAt ? ` · actualizado ${haceCuanto(new Date(abiertos.dataUpdatedAt).toISOString(), ahora)}` : ""}
          </p>
        </div>
        <button type="button" className="ct-btn" onClick={refrescar} disabled={actualizando}>
          <RefreshCw className={`size-4 ${actualizando ? "animate-spin" : ""}`} aria-hidden />
          Actualizar
        </button>
      </header>

      {bloqueado ? (
        <main className="px-8 pb-10">
          <div className="ct-card"><AvisoServicio error={errorGeneral} onReintentar={refrescar} /></div>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 gap-5 px-8 pb-6">
          <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-1 [&>*]:shrink-0">
            <CentralKpisWeb resumen={resumen.data} nivel={nivel} filtros={filtros} onFiltrar={aplicarIndicador} />

            {resumen.data && (
              <div className="grid gap-5" style={{ gridTemplateColumns: director ? "repeat(auto-fit, minmax(380px, 1fr))" : "1fr" }}>
                <div className="ct-card p-6">
                  <CentralTendencia dias={resumen.data.ultimos14dias} alto={220} />
                </div>
                {director && (
                  <div className="ct-card p-6">
                    <CentralCargaLideres
                      lideres={resumen.data.porLider}
                      asignadoActivo={filtros.asignado}
                      onFiltrar={(email) => cambiar({ asignado: email ?? "" })}
                    />
                  </div>
                )}
              </div>
            )}

            <section aria-labelledby="ct-pendientes" className="ct-card overflow-hidden pb-2">
              <div className="flex flex-col gap-4 p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="ct-pendientes" className="m-0 flex items-center gap-2 text-xl font-bold">
                    {conFiltros ? "Casos con estos filtros" : "Pendientes"}
                    {!conFiltros && <AlertTriangle className="size-4 text-[color:var(--ct-orange)]" aria-hidden />}
                  </h2>
                  <p className="ct-muted m-0 text-[15px]" aria-live="polite">
                    {filtrada.data ? (
                      <>
                        <span className="ct-mono">{pendientes.length}</span> {pendientes.length === 1 ? "caso" : "casos"}
                      </>
                    ) : null}
                  </p>
                </div>
                <CentralBarraFiltros filtros={filtros} nivel={nivel} lideres={resumen.data?.porLider ?? []} onCambiar={cambiar} onLimpiar={limpiar} />
              </div>
              {filtrada.error && filtrada.data && (
                <p role="alert" className="m-0 mx-6 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--ct-red-soft)] px-4 py-3 text-sm">
                  No pudimos actualizar la lista; ves la última que cargó.
                  <button type="button" className="ct-btn ct-btn-sm" onClick={refrescar}>Reintentar</button>
                </p>
              )}
              <Pendientes
                casos={pendientes}
                cargando={filtrada.isLoading}
                conFiltros={conFiltros}
                seleccionado={casoAbierto}
                ahora={ahora}
                incompleto={(filtrada.data?.total ?? 0) > LIMITE_AMPLIO}
                total={filtrada.data?.total ?? 0}
                onAbrir={abrirCaso}
                onLimpiar={limpiar}
              />
            </section>
          </div>

          <CentralChat
            abierto={chatAbierto}
            onAlternar={setChatAbierto}
            casos={abiertos.data?.items}
            cargando={abiertos.isLoading}
            fallo={!!abiertos.error}
            seleccionado={casoAbierto}
            onAbrir={abrirCaso}
            onCerrarCaso={() => abrirCaso(null)}
            nivel={nivel}
            miCorreo={miCorreo}
            ahora={ahora}
          />
        </main>
      )}
      <TicketToastContainer />
    </div>
  )
}

