// Central de tickets — DASHBOARD en teléfono y tableta (< 1024 px): una columna con indicadores en fila, resumen
// plegable, buscador, vistas rápidas y tarjetas de casos. Tocar un caso abre su conversación en la página de Chats.

import { useNavigate, useSearchParams } from "react-router-dom"
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react"
import { TicketToastContainer } from "@/components/tickets/TicketToast"
import { useCentralCasos, useCentralResumen } from "@/hooks/useCentralTickets"
import {
  FILTROS_VACIOS,
  LIMITE_AMPLIO,
  LIMITE_LISTA,
  aplicarFiltroLocal,
  consultaCasos,
  esperaRespuesta,
  filtrosAUrl,
  filtrosDesdeUrl,
  hayFiltros,
  usaFiltroLocal,
} from "@/lib/centralTickets"
import type { CentralFiltros as Filtros, CentralNivel } from "@/types/centralTickets"
import { CONSULTA_ABIERTOS, CentralCabecera, RUTA_CHATS } from "./CentralCabecera"
import { CentralFiltros } from "./CentralFiltros"
import { CentralLista, CentralListaCargando } from "./CentralLista"
import { CentralIndicadores, CentralResumenPlegable } from "./CentralPulso"
import { Aviso, AvisoServicio, useAhora } from "./partes"
import "./central.css"

export function CentralMovil({ nivel }: { nivel: CentralNivel; miCorreo: string }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const ahora = useAhora()
  const director = nivel === "director"

  const filtros = filtrosDesdeUrl(params)
  const amplio = usaFiltroLocal(filtros)
  const resumen = useCentralResumen()
  const lista = useCentralCasos(consultaCasos(filtros, amplio))
  // Mismo listado que usa Chats: de ahí sale el contador de «esperan respuesta» del selector.
  const abiertos = useCentralCasos(CONSULTA_ABIERTOS)
  const esperan = (abiertos.data?.items ?? []).filter(esperaRespuesta).length

  const casos = lista.data ? (amplio ? aplicarFiltroLocal(lista.data.items, filtros) : lista.data.items) : []
  const total = lista.data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / LIMITE_LISTA))
  const incompleto = amplio && total > LIMITE_AMPLIO
  const cuenta = lista.data ? (amplio ? casos.length : total) : null

  function escribir(mutar: (p: URLSearchParams) => URLSearchParams) {
    setParams((actual) => mutar(new URLSearchParams(actual)), { replace: true })
  }
  // Cualquier cambio de filtro vuelve a la primera página.
  const cambiar = (parcial: Partial<Filtros>) => escribir((p) => filtrosAUrl({ ...filtros, pagina: 1, ...parcial }, p))
  const limpiar = () => escribir((p) => filtrosAUrl(FILTROS_VACIOS, p))
  // Un indicador reemplaza los filtros que haya (null = quitarlo).
  const aplicarIndicador = (parcial: Partial<Filtros> | null) => escribir((p) => filtrosAUrl({ ...FILTROS_VACIOS, ...(parcial ?? {}) }, p))
  const abrirChat = (radicado: string) => navigate(`${RUTA_CHATS}?caso=${encodeURIComponent(radicado)}`, { state: { desdeBandeja: true } })

  const errorGeneral = lista.error ?? resumen.error
  const bloqueado = !!errorGeneral && !lista.data
  const actualizando = lista.isFetching || resumen.isFetching || abiertos.isFetching

  function refrescar() {
    void resumen.refetch()
    void lista.refetch()
    void abiertos.refetch()
  }

  return (
    <div className="central min-h-dvh">
      <a href="#ct-casos" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm">
        Ir a los casos
      </a>

      <CentralCabecera nivel={nivel} esperan={esperan} actualizando={actualizando} actualizadoEn={lista.dataUpdatedAt} ahora={ahora} onActualizar={refrescar} />

      {bloqueado ? (
        <main className="mx-auto w-full max-w-2xl px-4 pb-10">
          <div className="ct-card">
            <AvisoServicio error={errorGeneral} onReintentar={refrescar} />
          </div>
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] [&>*]:min-w-0 [&>*]:shrink-0">
          {!(resumen.error && !resumen.data) && <CentralIndicadores resumen={resumen.data} nivel={nivel} filtros={filtros} onFiltrar={aplicarIndicador} />}

          {resumen.data && (
            <CentralResumenPlegable
              resumen={resumen.data}
              nivel={nivel}
              asignadoActivo={filtros.asignado}
              onFiltrarLider={(email) => cambiar({ asignado: email ?? "" })}
            />
          )}

          <CentralFiltros filtros={filtros} nivel={nivel} lideres={resumen.data?.porLider ?? []} cuenta={cuenta} onCambiar={cambiar} onLimpiar={limpiar} />

          <section id="ct-casos" aria-labelledby="ct-casos-titulo" className="flex scroll-mt-4 flex-col gap-3 [&>*]:min-w-0">
            <h2 id="ct-casos-titulo" className="m-0 px-1 text-sm font-bold" aria-live="polite">
              {cuenta !== null ? (
                <>
                  <span className="ct-mono">{cuenta}</span> {cuenta === 1 ? "caso" : "casos"}
                  {hayFiltros(filtros) && <span className="ct-muted font-normal"> con estos filtros</span>}
                </>
              ) : (
                "Casos"
              )}
            </h2>

            {(incompleto || lista.data?.truncado || resumen.data?.truncado) && (
              <p className="ct-muted m-0 rounded-2xl border border-dashed border-[color:var(--ct-line-strong)] px-4 py-2.5 text-xs">
                {incompleto
                  ? `Esta vista trae los ${LIMITE_AMPLIO} casos más ${filtros.orden === "vencimiento" ? "próximos a vencer" : "recientes"} de ${total}. Usa los filtros para acotar.`
                  : "Hay más casos de los que el servicio entrega de una vez; los totales pueden quedarse cortos."}
              </p>
            )}

            {resumen.error && resumen.data === undefined && (
              <p role="alert" className="m-0 flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--ct-red-soft)] px-4 py-3 text-[13px]">
                No pudimos traer los indicadores.
                <button type="button" className="ct-btn ct-btn-sm" onClick={() => void resumen.refetch()}>Reintentar</button>
              </p>
            )}

            {lista.error && lista.data && (
              <p role="alert" className="m-0 flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--ct-red-soft)] px-4 py-3 text-[13px]">
                No pudimos actualizar la lista; ves la última que cargó.
                <button type="button" className="ct-btn ct-btn-sm" onClick={refrescar}>Reintentar</button>
              </p>
            )}

            {lista.isLoading ? (
              <CentralListaCargando />
            ) : casos.length === 0 ? (
              <div className="ct-card">
                <Aviso
                  icono={<Inbox className="size-6" aria-hidden />}
                  titulo={hayFiltros(filtros) ? "Ningún caso coincide con estos filtros" : director ? "No hay casos todavía" : "No tienes casos asignados"}
                  accion={hayFiltros(filtros) ? <button type="button" className="ct-btn" onClick={limpiar}>Limpiar filtros</button> : undefined}
                >
                  {hayFiltros(filtros)
                    ? "Quita alguno o limpia todo para ver más casos."
                    : director
                      ? "Cuando un cliente radique un caso en su app aparecerá aquí, listo para asumirlo o asignarlo."
                      : "Cuando la dirección de la central te asigne un caso aparecerá aquí."}
                </Aviso>
              </div>
            ) : (
              <CentralLista casos={casos} ahora={ahora} onAbrir={abrirChat} />
            )}

            {!amplio && paginas > 1 && (
              <nav aria-label="Páginas de casos" className="flex items-center justify-between gap-3 pt-1">
                <button type="button" className="ct-btn ct-btn-redondo" aria-label="Página anterior" disabled={filtros.pagina <= 1} onClick={() => cambiar({ pagina: filtros.pagina - 1 })}>
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <p className="ct-muted m-0 text-[13px]">
                  Página <span className="ct-mono text-[color:var(--ct-text)]">{filtros.pagina}</span> de <span className="ct-mono">{paginas}</span>
                </p>
                <button type="button" className="ct-btn ct-btn-redondo" aria-label="Página siguiente" disabled={filtros.pagina >= paginas} onClick={() => cambiar({ pagina: filtros.pagina + 1 })}>
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </nav>
            )}
          </section>
        </main>
      )}
      <TicketToastContainer />
    </div>
  )
}
