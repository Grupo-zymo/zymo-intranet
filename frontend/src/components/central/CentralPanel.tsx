// Central de tickets — panel de control de los casos que radican los clientes en la app de autogestión.
// Dirección ve y reparte todo; el líder ve solo lo suyo (el servidor lo fuerza; aquí solo se oculta lo que no puede hacer).
// Diseño de app: en el teléfono una columna y el detalle como pantalla encima; en lg+ lista a la izquierda y detalle a la derecha.

import { useEffect, useSyncExternalStore } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ArrowLeft, ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react"
import { TicketToastContainer } from "@/components/tickets/TicketToast"
import { useCentralCasos, useCentralResumen } from "@/hooks/useCentralTickets"
import {
  FILTROS_VACIOS,
  LIMITE_AMPLIO,
  LIMITE_LISTA,
  aplicarFiltroLocal,
  consultaCasos,
  filtrosAUrl,
  filtrosDesdeUrl,
  haceCuanto,
  hayFiltros,
  usaFiltroLocal,
} from "@/lib/centralTickets"
import type { CentralFiltros as Filtros, CentralNivel } from "@/types/centralTickets"
import { CentralDetalle, CentralDetalleVacio } from "./CentralDetalle"
import { CentralFiltros } from "./CentralFiltros"
import { CentralLista, CentralListaCargando } from "./CentralLista"
import { CentralIndicadores, CentralResumenPlegable } from "./CentralPulso"
import { Aviso, AvisoServicio, useAhora } from "./partes"
import { CentralWeb } from "./CentralWeb"
import "./central.css"

function CentralMovil({ nivel, miCorreo }: { nivel: CentralNivel; miCorreo: string }) {
  const [params, setParams] = useSearchParams()
  const ahora = useAhora()
  const director = nivel === "director"

  // Mientras la central está abierta, el fondo de la página usa el gris claro de la intranet
  // (se nota al rebotar el scroll en el teléfono).
  useEffect(() => {
    const anterior = document.body.style.backgroundColor
    document.body.style.backgroundColor = "#f4f4f5"
    return () => {
      document.body.style.backgroundColor = anterior
    }
  }, [])

  const filtros = filtrosDesdeUrl(params)
  const casoAbierto = params.get("caso")

  const amplio = usaFiltroLocal(filtros)
  const resumen = useCentralResumen()
  const lista = useCentralCasos(consultaCasos(filtros, amplio))

  const casos = lista.data ? (amplio ? aplicarFiltroLocal(lista.data.items, filtros) : lista.data.items) : []
  const total = lista.data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / LIMITE_LISTA))
  const incompleto = amplio && total > LIMITE_AMPLIO
  const cuenta = lista.data ? (amplio ? casos.length : total) : null

  function escribir(mutar: (p: URLSearchParams) => URLSearchParams, reemplazar = true) {
    setParams((actual) => mutar(new URLSearchParams(actual)), { replace: reemplazar })
  }
  // Cualquier cambio de filtro vuelve a la primera página.
  const cambiar = (parcial: Partial<Filtros>) => escribir((p) => filtrosAUrl({ ...filtros, pagina: 1, ...parcial }, p))
  const limpiar = () => escribir((p) => filtrosAUrl(FILTROS_VACIOS, p))
  // Un indicador reemplaza los filtros que haya (null = quitarlo).
  const aplicarIndicador = (parcial: Partial<Filtros> | null) => escribir((p) => filtrosAUrl({ ...FILTROS_VACIOS, ...(parcial ?? {}) }, p))
  const abrirCaso = (radicado: string | null) =>
    escribir((p) => {
      if (radicado) p.set("caso", radicado)
      else p.delete("caso")
      return p
    }, false) // abrir y cerrar entran al historial: «atrás» del teléfono cierra el caso

  const errorGeneral = lista.error ?? resumen.error
  const bloqueado = !!errorGeneral && !lista.data
  const actualizando = lista.isFetching || resumen.isFetching

  function refrescar() {
    void resumen.refetch()
    void lista.refetch()
  }

  return (
    <div className="central min-h-dvh lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <a href="#ct-casos" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm">
        Ir a los casos
      </a>

      <header className="mx-auto flex w-full max-w-2xl flex-none items-center gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] lg:max-w-[1280px] lg:px-6">
        <Link to="/dashboard" className="ct-btn ct-btn-redondo" aria-label="Volver a la intranet">
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-[26px] font-bold leading-tight tracking-[-0.02em]">
            {director ? "Central de tickets" : "Mis casos asignados"}
          </h1>
          <p className="ct-muted m-0 truncate text-[13px]">
            {director ? "Servicio al cliente" : "Central de tickets · Servicio al cliente"}
            {lista.dataUpdatedAt ? <span className="max-sm:hidden">{` · actualizado ${haceCuanto(new Date(lista.dataUpdatedAt).toISOString(), ahora)}`}</span> : null}
          </p>
        </div>
        <button type="button" className="ct-btn ct-btn-redondo" onClick={refrescar} disabled={actualizando} aria-label="Actualizar ahora">
          <RefreshCw className={`size-4 ${actualizando ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </header>

      {bloqueado ? (
        <main className="mx-auto w-full max-w-2xl px-4 pb-10 lg:max-w-[1280px] lg:px-6">
          <div className="ct-card">
            <AvisoServicio error={errorGeneral} onReintentar={refrescar} />
          </div>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-2xl lg:grid lg:min-h-0 lg:max-w-[1280px] lg:flex-1 lg:grid-cols-[440px_minmax(0,1fr)] lg:gap-5 lg:px-6 lg:pb-5">
          <div className="flex min-w-0 flex-col gap-4 px-4 [&>*]:shrink-0 pb-[calc(3rem+env(safe-area-inset-bottom))] lg:min-h-0 lg:overflow-y-auto lg:px-0 lg:pb-2 lg:pr-1">
            <CentralIndicadores resumen={resumen.data} nivel={nivel} filtros={filtros} onFiltrar={aplicarIndicador} />

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
                <CentralLista casos={casos} seleccionado={casoAbierto} ahora={ahora} onAbrir={abrirCaso} />
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
          </div>

          <div className="min-w-0 lg:min-h-0">
            {casoAbierto ? (
              <CentralDetalle key={casoAbierto} radicado={casoAbierto} nivel={nivel} miCorreo={miCorreo} ahora={ahora} onCerrar={() => abrirCaso(null)} />
            ) : (
              <CentralDetalleVacio />
            )}
          </div>
        </main>
      )}

      <TicketToastContainer />
    </div>
  )
}

const ESCRITORIO = "(min-width: 1024px)"

/** ¿Pantalla de escritorio (≥ 1024 px)? Reacciona al cambio de tamaño. */
function useEscritorio(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(ESCRITORIO)
      mq.addEventListener("change", avisar)
      return () => mq.removeEventListener("change", avisar)
    },
    () => window.matchMedia(ESCRITORIO).matches,
    () => false,
  )
}

/** Escritorio: dashboard + chats lado a lado. Teléfono y tableta: la app de una columna. */
export function CentralPanel(props: { nivel: CentralNivel; miCorreo: string }) {
  return useEscritorio() ? <CentralWeb {...props} /> : <CentralMovil {...props} />
}
