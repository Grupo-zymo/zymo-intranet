// Central de tickets — panel de control de los casos que radican los clientes
// en la app de autogestión. Dirección ve y reparte todo; el líder ve solo lo
// suyo (el servidor lo fuerza; aquí solo se oculta lo que no puede hacer).

import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ArrowLeft, ChevronLeft, ChevronRight, Columns3, Inbox, List, PlugZap, RefreshCw, ShieldAlert, Unplug } from "lucide-react"
import { TicketToastContainer } from "@/components/tickets/TicketToast"
import { useCentralCasos, useCentralResumen } from "@/hooks/useCentralTickets"
import {
  FILTROS_VACIOS,
  LIMITE_AMPLIO,
  LIMITE_LISTA,
  aplicarFiltroLocal,
  consultaCasos,
  estadoDeError,
  filtrosAUrl,
  filtrosDesdeUrl,
  haceCuanto,
  hayFiltros,
  mensajeDeError,
  usaFiltroLocal,
} from "@/lib/centralTickets"
import type { CentralFiltros as Filtros, CentralNivel } from "@/types/centralTickets"
import { CentralDetalle } from "./CentralDetalle"
import { CentralFiltros } from "./CentralFiltros"
import { CentralLista, CentralListaCargando } from "./CentralLista"
import { CentralCargaLideres, CentralIndicadores, CentralTendencia } from "./CentralPulso"
import { CentralTablero, type GrupoTablero } from "./CentralTablero"
import { Aviso } from "./partes"
import "./central.css"

/** Reloj del panel: basta con refrescar los "hace 5 min" cada medio minuto. */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return ahora
}

function Segmento<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string
  valor: T
  opciones: { valor: T; texto: string; icono?: React.ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex rounded-lg border border-[color:var(--ct-line-strong)] p-0.5">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className="ct-muted flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors duration-150 hover:text-[color:var(--ct-text)] aria-checked:bg-[var(--ct-hover)] aria-checked:text-[color:var(--ct-text)]"
        >
          {o.icono}
          {o.texto}
        </button>
      ))}
    </div>
  )
}

/** El servicio no está conectado, no responde o la sesión no tiene acceso. */
function AvisoServicio({ error, onReintentar }: { error: unknown; onReintentar: () => void }) {
  const estado = estadoDeError(error)
  const reintentar = (
    <button type="button" className="ct-btn" onClick={onReintentar}>
      <RefreshCw className="size-3.5" aria-hidden />
      Reintentar
    </button>
  )
  if (estado === 503) {
    return (
      <Aviso icono={<Unplug className="size-5" aria-hidden />} titulo="La central todavía no está conectada" accion={reintentar}>
        Falta enlazar la intranet con la app donde los clientes radican sus casos. Avísale al equipo de Innovación y Desarrollo para que la active.
      </Aviso>
    )
  }
  if (estado === 403 || estado === 401) {
    return (
      <Aviso icono={<ShieldAlert className="size-5" aria-hidden />} titulo="Tu sesión no tiene acceso a la central">
        Si te acaban de dar el permiso, cierra sesión y vuelve a entrar para que se aplique.
      </Aviso>
    )
  }
  return (
    <Aviso icono={<PlugZap className="size-5" aria-hidden />} titulo="No pudimos traer los casos" accion={reintentar}>
      {mensajeDeError(error, "El servicio de casos no respondió. Intenta de nuevo en un momento.")}
    </Aviso>
  )
}

export function CentralPanel({ nivel, miCorreo }: { nivel: CentralNivel; miCorreo: string }) {
  const [params, setParams] = useSearchParams()
  const ahora = useAhora()
  const director = nivel === "director"

  // El resto de la intranet es claro: mientras la central está abierta, el fondo
  // de la página también es oscuro (se nota al rebotar el scroll en el teléfono).
  useEffect(() => {
    const anterior = document.body.style.backgroundColor
    document.body.style.backgroundColor = "#0b0d11"
    return () => {
      document.body.style.backgroundColor = anterior
    }
  }, [])

  const filtros = filtrosDesdeUrl(params)
  const vista: "lista" | "tablero" = params.get("vista") === "tablero" ? "tablero" : "lista"
  const grupo: GrupoTablero = params.get("grupo") === "lider" && director ? "lider" : "estado"
  const casoAbierto = params.get("caso")

  const amplio = vista === "tablero" || usaFiltroLocal(filtros)
  const resumen = useCentralResumen()
  const lista = useCentralCasos(consultaCasos(filtros, amplio))

  const casos = lista.data ? (usaFiltroLocal(filtros) ? aplicarFiltroLocal(lista.data.items, filtros) : lista.data.items) : []
  const total = lista.data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / LIMITE_LISTA))
  const incompleto = amplio && total > LIMITE_AMPLIO
  const cuenta = usaFiltroLocal(filtros) ? casos.length : total

  function escribir(mutar: (p: URLSearchParams) => URLSearchParams, reemplazar = true) {
    setParams((actual) => mutar(new URLSearchParams(actual)), { replace: reemplazar })
  }
  // Cualquier cambio de filtro vuelve a la primera página.
  const cambiar = (parcial: Partial<Filtros>) => escribir((p) => filtrosAUrl({ ...filtros, pagina: 1, ...parcial }, p))
  const limpiar = () => escribir((p) => filtrosAUrl(FILTROS_VACIOS, p))
  // Un indicador reemplaza los filtros que haya (null = quitarlo).
  const aplicarIndicador = (parcial: Partial<Filtros> | null) => escribir((p) => filtrosAUrl({ ...FILTROS_VACIOS, ...(parcial ?? {}) }, p))
  const poner = (clave: string, valor: string | null) =>
    escribir((p) => {
      if (valor) p.set(clave, valor)
      else p.delete(clave)
      return p
    }, clave !== "caso") // abrir un caso sí entra al historial: «atrás» lo cierra

  const errorGeneral = lista.error ?? resumen.error
  const bloqueado = !!errorGeneral && !lista.data
  const actualizando = lista.isFetching || resumen.isFetching

  function refrescar() {
    void resumen.refetch()
    void lista.refetch()
  }

  return (
    <div className="central min-h-dvh">
      <a href="#ct-casos" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--ct-raised)] focus:px-3 focus:py-2 focus:text-sm">
        Ir a los casos
      </a>

      <header className="sticky top-0 z-20 border-b bg-[var(--ct-bg)] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/dashboard" className="ct-btn ct-btn-ghost -ml-2 !px-2" aria-label="Volver a la intranet">
            <ArrowLeft className="size-4" aria-hidden />
            <span className="max-sm:hidden">Intranet</span>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]">
              {director ? "Central de tickets" : "Mis casos asignados"}
            </h1>
            <p className="ct-muted m-0 truncate text-xs">
              {director ? "Servicio al cliente" : "Central de tickets · Servicio al cliente"}
            </p>
          </div>
          <p className="ct-faint m-0 hidden text-xs sm:block" aria-live="off">
            {lista.dataUpdatedAt ? `Actualizado ${haceCuanto(new Date(lista.dataUpdatedAt).toISOString(), ahora)}` : bloqueado ? "" : "Conectando…"}
          </p>
          <button type="button" className="ct-btn" onClick={refrescar} disabled={actualizando} aria-label="Actualizar ahora">
            <RefreshCw className={`size-3.5 ${actualizando ? "animate-spin" : ""}`} aria-hidden />
            <span className="max-sm:hidden">Actualizar</span>
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-5 [&>*]:min-w-0">
        {bloqueado ? (
          <div className="ct-surface rounded-xl border">
            <AvisoServicio error={errorGeneral} onReintentar={refrescar} />
          </div>
        ) : (
          <>
            <CentralIndicadores resumen={resumen.data} nivel={nivel} filtros={filtros} onFiltrar={aplicarIndicador} />

            {resumen.data && (
              <div className={`grid gap-4 ${director ? "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
                {director && (
                  <CentralCargaLideres
                    lideres={resumen.data.porLider}
                    asignadoActivo={filtros.asignado}
                    onFiltrar={(email) => cambiar({ asignado: email ?? "" })}
                  />
                )}
                <CentralTendencia dias={resumen.data.ultimos14dias} />
              </div>
            )}

            <CentralFiltros filtros={filtros} nivel={nivel} lideres={resumen.data?.porLider ?? []} onCambiar={cambiar} onLimpiar={limpiar} />

            <section id="ct-casos" aria-labelledby="ct-casos-titulo" className="flex scroll-mt-20 flex-col gap-3 [&>*]:min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h2 id="ct-casos-titulo" className="m-0 text-sm font-semibold" aria-live="polite">
                  {lista.data ? (
                    <>
                      <span className="ct-mono">{cuenta}</span> {cuenta === 1 ? "caso" : "casos"}
                      {hayFiltros(filtros) && <span className="ct-muted font-normal"> con estos filtros</span>}
                    </>
                  ) : (
                    "Casos"
                  )}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Orden de los casos"
                    name="orden"
                    className="ct-input !w-auto"
                    value={filtros.orden}
                    onChange={(e) => cambiar({ orden: e.target.value as Filtros["orden"] })}
                  >
                    <option value="recientes">Más recientes primero</option>
                    <option value="vencimiento">Por vencimiento</option>
                  </select>
                  {vista === "tablero" && director && (
                    <Segmento
                      etiqueta="Agrupar el tablero"
                      valor={grupo}
                      onChange={(v) => poner("grupo", v === "lider" ? "lider" : null)}
                      opciones={[
                        { valor: "estado", texto: "Por estado" },
                        { valor: "lider", texto: "Por líder" },
                      ]}
                    />
                  )}
                  <Segmento
                    etiqueta="Vista"
                    valor={vista}
                    onChange={(v) => poner("vista", v === "tablero" ? "tablero" : null)}
                    opciones={[
                      { valor: "lista", texto: "Lista", icono: <List className="size-3.5" aria-hidden /> },
                      { valor: "tablero", texto: "Tablero", icono: <Columns3 className="size-3.5" aria-hidden /> },
                    ]}
                  />
                </div>
              </div>

              {(incompleto || lista.data?.truncado || resumen.data?.truncado) && (
                <p className="ct-muted m-0 rounded-lg border border-dashed border-[color:var(--ct-line-strong)] px-3 py-2 text-xs">
                  {incompleto
                    ? `Esta vista trae los ${LIMITE_AMPLIO} casos más ${filtros.orden === "vencimiento" ? "próximos a vencer" : "recientes"} de ${total}. Usa los filtros para acotar.`
                    : "Hay más casos de los que el servicio entrega de una vez; los totales pueden quedarse cortos."}
                </p>
              )}

              {lista.error && lista.data && (
                <p role="alert" className="m-0 flex flex-wrap items-center gap-2 rounded-lg bg-[rgba(255,92,104,0.1)] px-3 py-2 text-[13px]">
                  No pudimos actualizar la lista; ves la última que cargó.
                  <button type="button" className="ct-btn ct-btn-sm" onClick={refrescar}>Reintentar</button>
                </p>
              )}

              {lista.isLoading ? (
                <CentralListaCargando />
              ) : casos.length === 0 ? (
                <div className="ct-surface rounded-xl border">
                  <Aviso
                    icono={<Inbox className="size-5" aria-hidden />}
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
              ) : vista === "tablero" ? (
                <CentralTablero casos={casos} grupo={grupo} ahora={ahora} onAbrir={(r) => poner("caso", r)} />
              ) : (
                <CentralLista casos={casos} conResponsable={director} ahora={ahora} onAbrir={(r) => poner("caso", r)} />
              )}

              {vista === "lista" && !amplio && paginas > 1 && (
                <nav aria-label="Páginas de casos" className="flex items-center justify-between gap-3 pt-1">
                  <p className="ct-muted m-0 text-xs">
                    Página <span className="ct-mono text-[color:var(--ct-text)]">{filtros.pagina}</span> de <span className="ct-mono">{paginas}</span>
                  </p>
                  <div className="flex gap-2">
                    <button type="button" className="ct-btn" disabled={filtros.pagina <= 1} onClick={() => cambiar({ pagina: filtros.pagina - 1 })}>
                      <ChevronLeft className="size-4" aria-hidden />
                      Anterior
                    </button>
                    <button type="button" className="ct-btn" disabled={filtros.pagina >= paginas} onClick={() => cambiar({ pagina: filtros.pagina + 1 })}>
                      Siguiente
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  </div>
                </nav>
              )}
            </section>
          </>
        )}
      </main>

      <CentralDetalle radicado={casoAbierto} nivel={nivel} miCorreo={miCorreo} ahora={ahora} onCerrar={() => poner("caso", null)} />
      <TicketToastContainer />
    </div>
  )
}
