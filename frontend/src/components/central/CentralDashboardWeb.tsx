// Central de tickets — DASHBOARD de escritorio (/servicio-cliente/central): indicadores, tendencia, carga por líder y
// pendientes con buscador y filtros. Abrir un caso lleva a la página de Chats.

import { useNavigate, useSearchParams } from "react-router-dom"
import { AlertTriangle, Inbox } from "lucide-react"
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
  mensajeDeError,
} from "@/lib/centralTickets"
import type { CentralCasoItem, CentralFiltros as Filtros, CentralNivel } from "@/types/centralTickets"
import { CONSULTA_ABIERTOS, CentralCabecera, RUTA_CHATS } from "./CentralCabecera"
import { CentralBarraFiltros } from "./CentralFiltros"
import { CentralCargaLideres, CentralKpisWeb, CentralTendencia } from "./CentralPulso"
import { Aviso, AvisoServicio, EstadoChip, Responsable, SeveridadChip, SlaResumen, useAhora } from "./partes"
import "./central.css"

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
  ahora,
  incompleto,
  total,
  onAbrir,
  onLimpiar,
}: {
  casos: CentralCasoItem[]
  cargando: boolean
  conFiltros: boolean
  ahora: number
  incompleto: boolean
  total: number
  onAbrir: (radicado: string) => void
  onLimpiar: () => void
}) {
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
        <div className="ct-pend">
          <div className="ct-pend-cabecera ct-faint border-y bg-[var(--ct-raised)] px-6 py-3 text-xs font-semibold" aria-hidden>
            <span>Radicado</span>
            <span>Caso</span>
            <span>Plazo</span>
            <span>Responsable</span>
          </div>
          <ul className="m-0 list-none p-0" aria-label="Casos que requieren acción">
            {casos.map((c) => {
              const id = String(c.radicado)
              const ms = motivos(c)
              return (
                <li key={c.radicado} className="ct-fila ct-pend-fila">
                  <div>
                    <span className="ct-mono font-medium" translate="no">#{c.radicado}</span>
                    <span className="ct-faint block text-xs">{haceCuanto(c.creadoEn, ahora)}</span>
                  </div>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onAbrir(id)}
                      className="line-clamp-2 w-full cursor-pointer text-left text-[15px] font-bold leading-snug [overflow-wrap:anywhere] after:absolute after:inset-0 after:content-['']"
                    >
                      {c.asunto}
                    </button>
                    <span className="ct-muted mt-0.5 block truncate text-sm">
                      {c.cliente.nombre}
                      {c.cliente.empresa ? ` · ${c.cliente.empresa}` : ""}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5">
                      <SeveridadChip severidad={c.severidad} />
                      <EstadoChip estado={c.estado} />
                      {ms.map((m) => (
                        <span key={m} className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-bold ${COLOR_MOTIVO[m]}`}>
                          {TEXTO_MOTIVO[m]}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="ct-pend-extra">
                    <SlaResumen sla={c.sla} abierto={estaAbierto(c.estado)} ahora={ahora} grande />
                    <div className="min-w-0">
                      <Responsable asignado={c.asignado} asumidoPor={c.asumidoPor} compacto />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}

export function CentralDashboardWeb({ nivel }: { nivel: CentralNivel; miCorreo: string }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const ahora = useAhora()
  const director = nivel === "director"

  const filtros = filtrosDesdeUrl(params)
  const conFiltros = hayFiltros(filtros)

  const resumen = useCentralResumen()
  // Todos los casos abiertos: sin filtros, los pendientes salen de esta misma consulta (y de ella el contador de «esperan respuesta»).
  const abiertos = useCentralCasos(CONSULTA_ABIERTOS)
  const filtrada = useCentralCasos(conFiltros ? consultaCasos(filtros, true) : CONSULTA_ABIERTOS)
  const esperan = (abiertos.data?.items ?? []).filter(esperaRespuesta).length

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

  function escribir(mutar: (p: URLSearchParams) => URLSearchParams) {
    setParams((actual) => mutar(new URLSearchParams(actual)), { replace: true })
  }
  const cambiar = (parcial: Partial<Filtros>) => escribir((p) => filtrosAUrl({ ...filtros, pagina: 1, ...parcial }, p))
  const limpiar = () => escribir((p) => filtrosAUrl(FILTROS_VACIOS, p))
  const aplicarIndicador = (parcial: Partial<Filtros> | null) => escribir((p) => filtrosAUrl({ ...FILTROS_VACIOS, ...(parcial ?? {}) }, p))
  const abrirChat = (radicado?: string) =>
    navigate(radicado ? `${RUTA_CHATS}?caso=${encodeURIComponent(radicado)}` : RUTA_CHATS, { state: { desdeBandeja: true } })

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
      <CentralCabecera nivel={nivel} esperan={esperan} actualizando={actualizando} actualizadoEn={abiertos.dataUpdatedAt} ahora={ahora} onActualizar={refrescar} />

      {bloqueado ? (
        <main className="px-6 pb-10 xl:px-8">
          <div className="ct-card"><AvisoServicio error={errorGeneral} onReintentar={refrescar} /></div>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-8 xl:px-8 [&>*]:shrink-0">
          {!(resumen.error && !resumen.data) && <CentralKpisWeb resumen={resumen.data} nivel={nivel} filtros={filtros} esperan={esperan} onEsperan={() => abrirChat()} onFiltrar={aplicarIndicador} />}

          {resumen.error && !resumen.data && (
            <p role="alert" className="m-0 flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--ct-red-soft)] px-4 py-3 text-sm">
              No pudimos traer los indicadores. {mensajeDeError(resumen.error, "")}
              <button type="button" className="ct-btn ct-btn-sm" onClick={() => void resumen.refetch()}>Reintentar</button>
            </p>
          )}

          {resumen.data && (
            <div className="grid gap-5" style={{ gridTemplateColumns: director ? "repeat(auto-fit, minmax(420px, 1fr))" : "1fr" }}>
              <div className="ct-card p-6">
                <CentralTendencia dias={resumen.data.ultimos14dias} alto={240} />
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
            {filtrada.error && !filtrada.data ? (
              <AvisoServicio error={filtrada.error} onReintentar={() => void filtrada.refetch()} />
            ) : (
              <Pendientes
                casos={pendientes}
                cargando={filtrada.isLoading}
                conFiltros={conFiltros}
                ahora={ahora}
                incompleto={(filtrada.data?.total ?? 0) > LIMITE_AMPLIO}
                total={filtrada.data?.total ?? 0}
                onAbrir={abrirChat}
                onLimpiar={limpiar}
              />
            )}
          </section>
        </main>
      )}
      <TicketToastContainer />
    </div>
  )
}
