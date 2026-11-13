// Central de tickets — página de CHATS (/servicio-cliente/central/chats): bandeja de conversaciones con los
// clientes y, al abrir una, la conversación con su redactor y la gestión del caso. El caso abierto vive en la URL
// (?caso=): en el teléfono la conversación es una pantalla completa encima de la bandeja y «atrás» vuelve a ella.

import { useMemo, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { MessageSquare, Search } from "lucide-react"
import { TicketToastContainer } from "@/components/tickets/TicketToast"
import { useCentralCasos } from "@/hooks/useCentralTickets"
import { esperaRespuesta, estaAbierto, haceCuanto } from "@/lib/centralTickets"
import type { CentralCasoItem, CentralNivel } from "@/types/centralTickets"
import { CONSULTA_ABIERTOS, CentralCabecera } from "./CentralCabecera"
import { CentralDetalle, CentralDetalleVacio } from "./CentralDetalle"
import { Aviso, AvisoServicio, SeveridadChip, useAhora } from "./partes"
import "./central.css"

type Vista = "espera" | "todos" | "sin" | "mios"

const instante = (c: CentralCasoItem) => Date.parse(c.ultimoMensaje?.creadoEn ?? c.creadoEn) || 0
const sinNombre = (c: CentralCasoItem) => !c.asignado && !c.asumidoPor
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function Fila({ c, ahora, activa, onAbrir }: { c: CentralCasoItem; ahora: number; activa: boolean; onAbrir: (r: string) => void }) {
  const espera = esperaRespuesta(c)
  const sinLeer = c.noLeidos ?? 0
  return (
    <li className="border-t first:border-t-0">
      <button
        type="button"
        aria-current={activa}
        onClick={() => onAbrir(String(c.radicado))}
        className="relative block min-h-[44px] w-full cursor-pointer px-5 py-4 text-left transition-colors duration-150 hover:bg-[var(--ct-hover)] aria-[current=true]:bg-[var(--ct-red-soft)]"
      >
        {espera && <span className="ct-latido absolute left-2 top-1/2 size-2 -translate-y-1/2 rounded-full bg-[var(--ct-red)]" aria-hidden />}
        <span className="flex items-center justify-between gap-2">
          <span className="ct-mono text-[15px] font-medium" translate="no">#{c.radicado}</span>
          <span className="flex items-center gap-2">
            {sinLeer > 0 && (
              <span className="ct-insignia ct-mono" translate="no">
                {sinLeer > 99 ? "99+" : sinLeer}
                <span className="sr-only"> {sinLeer === 1 ? "mensaje sin leer" : "mensajes sin leer"}</span>
              </span>
            )}
            <span className={`text-xs ${sinLeer > 0 ? "font-bold text-[color:var(--ct-red)]" : "ct-faint"}`}>{haceCuanto(c.ultimoMensaje?.creadoEn ?? c.creadoEn, ahora)}</span>
          </span>
        </span>
        <span className={`mt-0.5 block truncate text-base ${sinLeer > 0 ? "font-extrabold" : "font-bold"}`}>
          {c.cliente.nombre}
          {c.cliente.empresa && <span className="ct-muted font-normal"> · {c.cliente.empresa}</span>}
        </span>
        <span className="ct-muted line-clamp-2 text-sm [overflow-wrap:anywhere]">{c.asunto}</span>
        <span className="mt-2 flex items-center gap-2">
          <SeveridadChip severidad={c.severidad} />
          <span className={`text-xs ${espera ? "font-bold text-[color:var(--ct-red)]" : "ct-faint"}`}>
            {espera ? "Espera respuesta" : c.ultimoMensaje ? (c.ultimoMensaje.deCliente ? "Del cliente" : "Respondido") : "Sin mensajes"}
          </span>
          {sinNombre(c) && <span className="rounded-full bg-[rgba(161,98,7,0.12)] px-2.5 py-0.5 text-xs font-bold text-[color:var(--ct-amber)]">Sin asignar</span>}
          <span className="ct-faint ml-auto flex items-center gap-1 text-xs">
            <MessageSquare className="size-3.5" aria-hidden />
            <span className="ct-mono">{c.mensajes}</span>
          </span>
        </span>
      </button>
    </li>
  )
}

export function CentralChats({ nivel, miCorreo }: { nivel: CentralNivel; miCorreo: string }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const ahora = useAhora()
  const director = nivel === "director"
  const casoAbierto = params.get("caso")

  const [vista, setVista] = useState<Vista>("espera")
  const [q, setQ] = useState("")

  const abiertos = useCentralCasos(CONSULTA_ABIERTOS)
  const casos = abiertos.data?.items.filter((c) => estaAbierto(c.estado))
  const esperan = useMemo(() => (casos ?? []).filter(esperaRespuesta), [casos])

  const filtros: { id: Vista; texto: string; cuenta: number; soloDirector?: boolean }[] = [
    { id: "espera", texto: esperan.length === 1 ? "Espera respuesta" : "Esperan respuesta", cuenta: esperan.length },
    { id: "todos", texto: "Abiertos", cuenta: casos?.length ?? 0 },
    { id: "sin", texto: "Sin asignar", cuenta: (casos ?? []).filter(sinNombre).length, soloDirector: true },
    { id: "mios", texto: "Mis casos", cuenta: (casos ?? []).filter((c) => (c.asignado ?? c.asumidoPor)?.email.toLowerCase() === miCorreo).length, soloDirector: true },
  ]

  const lista = useMemo(() => {
    const texto = sinTildes(q.trim())
    const base = (casos ?? []).filter((c) => {
      if (!estaAbierto(c.estado)) return false
      if (vista === "espera") return esperaRespuesta(c)
      if (vista === "sin") return sinNombre(c)
      if (vista === "mios") return (c.asignado ?? c.asumidoPor)?.email.toLowerCase() === miCorreo
      return true
    })
    const buscados = texto
      ? base.filter((c) => sinTildes(`${c.radicado} ${c.cliente.nombre} ${c.cliente.empresa ?? ""} ${c.asunto}`).includes(texto))
      : base
    return [...buscados].sort((a, b) => instante(b) - instante(a))
  }, [casos, vista, q, miCorreo])

  function abrirCaso(radicado: string) {
    setParams((p) => { const n = new URLSearchParams(p); n.set("caso", radicado); return n }, { state: { desdeBandeja: true } })
  }
  // Volver: si el caso se abrió desde la bandeja, es un «atrás» del historial; si se llegó por enlace directo, se quita de la URL.
  function cerrarCaso() {
    if ((location.state as { desdeBandeja?: boolean } | null)?.desdeBandeja) navigate(-1)
    else setParams((p) => { const n = new URLSearchParams(p); n.delete("caso"); return n }, { replace: true })
  }

  const bloqueado = !!abiertos.error && !abiertos.data
  const refrescar = () => void abiertos.refetch()

  return (
    <div className="central ct-web min-h-dvh lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <CentralCabecera nivel={nivel} esperan={esperan.length} actualizando={abiertos.isFetching} actualizadoEn={abiertos.dataUpdatedAt} ahora={ahora} onActualizar={refrescar} />

      {bloqueado ? (
        <main className="mx-auto w-full max-w-2xl px-4 pb-10 lg:max-w-none lg:px-6 xl:px-8">
          <div className="ct-card"><AvisoServicio error={abiertos.error} onReintentar={refrescar} /></div>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-2xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] lg:grid lg:min-h-0 lg:max-w-none lg:flex-1 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-5 lg:px-6 lg:pb-6 xl:grid-cols-[440px_minmax(0,1fr)] xl:px-8">
          <section aria-label="Conversaciones" className="ct-card flex flex-col overflow-hidden lg:min-h-0">
            <div className="flex flex-none flex-col gap-3 border-b p-4">
              <label className="relative block">
                <span className="sr-only">Buscar en las conversaciones</span>
                <Search className="ct-faint pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2" aria-hidden />
                <input
                  type="search"
                  name="q"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Buscar caso, cliente o #"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="ct-input !rounded-full !pl-10"
                />
              </label>
              <div role="group" aria-label="Vistas de la bandeja" className="ct-sin-barra -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
                {filtros.filter((f) => director || !f.soloDirector).map((f) => (
                  <button key={f.id} type="button" className="ct-vista" aria-pressed={vista === f.id} onClick={() => setVista(f.id)}>
                    {f.texto} <span className="ct-mono">{f.cuenta}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 lg:overflow-y-auto lg:overscroll-contain">
              {abiertos.isLoading ? (
                <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label="Cargando conversaciones">
                  {[0, 1, 2, 3, 4].map((i) => <div key={i} className="ct-skeleton h-24" />)}
                </div>
              ) : lista.length === 0 ? (
                <Aviso
                  icono={<MessageSquare className="size-6" aria-hidden />}
                  titulo={q.trim() ? "Nada coincide con esa búsqueda" : vista === "espera" ? "Ningún cliente espera respuesta" : "No hay conversaciones aquí"}
                >
                  {q.trim() ? "Prueba con otro nombre, asunto o radicado." : vista === "espera" ? "Cuando un cliente escriba, su caso aparecerá aquí." : "Cambia de vista para ver otros casos."}
                </Aviso>
              ) : (
                <ul className="m-0 list-none p-0">
                  {lista.map((c) => <Fila key={c.radicado} c={c} ahora={ahora} activa={casoAbierto === String(c.radicado)} onAbrir={abrirCaso} />)}
                </ul>
              )}
              {abiertos.error && abiertos.data && (
                <p role="alert" className="m-3 flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--ct-red-soft)] px-4 py-3 text-[13px]">
                  No pudimos actualizar la bandeja; ves la última que cargó.
                  <button type="button" className="ct-btn ct-btn-sm" onClick={refrescar}>Reintentar</button>
                </p>
              )}
            </div>
          </section>

          <div className="min-w-0 lg:min-h-0">
            {casoAbierto ? (
              <CentralDetalle key={casoAbierto} radicado={casoAbierto} nivel={nivel} miCorreo={miCorreo} ahora={ahora} onCerrar={cerrarCaso} />
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
