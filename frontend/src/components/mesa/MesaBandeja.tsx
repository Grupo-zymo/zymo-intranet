// Columna izquierda de «Solicitudes»: buscador, vistas y filtros con contador, y
// la lista de tickets. Misma organización que la bandeja de chats de la Central.
// La vista (?vista=), el filtro (?f=) y el ticket abierto (?ticket=) viven en la URL.

import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Search } from "lucide-react"
import { useMesaResumen, useMesaTickets, useMesaYo } from "@/hooks/useMesa"
import { mensajeDeError } from "@/lib/mesa"
import { formatFechaRelativa } from "@/lib/dates"
import type { MesaTicket, MesaVista } from "@/types/mesa"
import { Estado } from "./MesaLista"

type Filtro = "abierto" | "en_espera" | "cerrado" | "sinRespuesta" | "sinAsignar" | "mios"

const CONSULTA: Record<Filtro, Record<string, string>> = {
  abierto: { estado: "abierto" },
  en_espera: { estado: "en_espera" },
  cerrado: { estado: "cerrado" },
  sinRespuesta: { estado: "activos", sinRespuesta: "true" },
  sinAsignar: { estado: "activos", sinAsignar: "true" },
  mios: { estado: "activos", asignadoAMi: "true" },
}
const VISTA_TEXTO: Record<MesaVista, string> = { mias: "Mis solicitudes", area: "Mi área", todas: "Todas", eliminados: "Eliminados" }
const VACIO: Record<MesaVista, string> = {
  mias: "No tienes solicitudes con ese filtro. Si necesitas algo de otra área, crea una.",
  area: "Tu área no tiene tickets con ese filtro.",
  todas: "No hay tickets con ese filtro.",
  eliminados: "Nadie ha eliminado tickets.",
}

function responsablesDe(t: MesaTicket): string {
  if (t.responsables.length === 0) return "Sin asignar"
  const [primero, ...resto] = t.responsables
  return resto.length ? `${primero.nombre} y ${resto.length} más` : primero.nombre
}

export function MesaBandeja({ ticketId }: { ticketId: number | null }) {
  const [params, setParams] = useSearchParams()
  const yo = useMesaYo()
  const vistas: MesaVista[] = yo.data?.esAdmin ? ["mias", "area", "todas", "eliminados"] : ["mias", "area"]
  const pedida = params.get("vista") as MesaVista | null
  const vista: MesaVista = pedida && vistas.includes(pedida) ? pedida : "mias"
  const conGestion = vista === "area" || vista === "todas"
  const eliminados = vista === "eliminados"
  const filtros: Filtro[] = conGestion ? ["abierto", "en_espera", "sinRespuesta", "sinAsignar", "mios", "cerrado"] : ["abierto", "en_espera", "cerrado"]
  const pedido = params.get("f") as Filtro | null
  const filtro: Filtro = pedido && filtros.includes(pedido) ? pedido : "abierto"

  const [texto, setTexto] = useState("")
  const [q, setQ] = useState("")
  useEffect(() => {
    const t = window.setTimeout(() => setQ(texto.trim()), 300)
    return () => window.clearTimeout(t)
  }, [texto])

  const poner = (cambios: Record<string, string | null>) => {
    const sig = new URLSearchParams(params)
    for (const [k, v] of Object.entries(cambios)) { if (v === null) sig.delete(k); else sig.set(k, v) }
    setParams(sig, { replace: true })
  }
  const enlace = (id: number) => {
    const sig = new URLSearchParams(params)
    sig.set("ticket", String(id))
    return `?${sig}`
  }

  const lista = useMesaTickets({ vista, limite: 100, ...(eliminados ? {} : CONSULTA[filtro]), ...(q ? { q } : {}) })
  const r = useMesaResumen(vista).data
  const cuenta: Record<Filtro, number | undefined> = {
    abierto: r?.abierto, en_espera: r?.en_espera, cerrado: r?.cerrado, sinRespuesta: r?.sinRespuesta, sinAsignar: r?.sinAsignar, mios: r?.asignadosAMi,
  }
  const FILTRO_TEXTO: Record<Filtro, string> = { abierto: "Abiertos", en_espera: "En espera", cerrado: "Cerrados", sinRespuesta: "Sin respuesta", sinAsignar: "Sin asignar", mios: "Asignados a mí" }
  const items = lista.data?.items ?? []
  const total = lista.data?.total ?? 0

  return (
    <section aria-label="Solicitudes" className="mesa-card mesa-bandeja">
      <div className="mesa-bandeja-cab">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#767676]" aria-hidden />
          <label className="sr-only" htmlFor="mesa-buscar">Buscar por asunto o consecutivo</label>
          <input id="mesa-buscar" name="buscar" autoComplete="off" type="search" className="mesa-campo !rounded-full !pl-10" placeholder="Buscar asunto o código…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="mesa-segmento" role="group" aria-label="Qué solicitudes ver" style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "1fr" }}>
          {vistas.map((v) => (
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => poner({ vista: v === "mias" ? null : v, f: null })}>{VISTA_TEXTO[v]}</button>
          ))}
        </div>
        {!eliminados && (
          <div className="mesa-chips" role="group" aria-label="Filtrar por estado">
            {filtros.map((f) => (
              <button key={f} type="button" className="mesa-chip" aria-pressed={filtro === f} onClick={() => poner({ f: f === "abierto" ? null : f })}>
                {FILTRO_TEXTO[f]}
                {cuenta[f] !== undefined && <b className="mesa-num">{cuenta[f]}</b>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mesa-bandeja-lista">
        {lista.isError ? (
          <div className="mesa-card-pad" role="alert">
            <p className="mesa-error" style={{ marginTop: 0 }}>{mensajeDeError(lista.error)}</p>
            <button type="button" className="mesa-btn2" style={{ marginTop: "0.75rem" }} onClick={() => lista.refetch()}>Reintentar</button>
          </div>
        ) : lista.isPending ? (
          <div className="mesa-card-pad" aria-busy="true" aria-label="Cargando solicitudes">{[0, 1, 2, 3].map((i) => <div key={i} className="mesa-esqueleto" />)}</div>
        ) : items.length === 0 ? (
          <div className="mesa-card-pad">
            <div className="mesa-vacio">
              <h2>{q ? "Nada coincide con tu búsqueda" : "Nada por aquí"}</h2>
              <p>{q ? "Prueba con otra palabra o con el consecutivo completo." : VACIO[vista]}</p>
            </div>
          </div>
        ) : (
          <>
            {items.map((t) => (
              <Link key={t.id} to={enlace(t.id)} className="mesa-item" aria-current={t.id === ticketId ? "true" : undefined}>
                {conGestion && !t.primeraRespuestaEn && t.estado !== "cerrado" && <span className="mesa-punto" aria-hidden="true" />}
                <div className="mesa-item-cab">
                  <span className="mesa-cod" translate="no">{t.codigo}</span>
                  <span className="mesa-num text-xs text-[#5c5c5c]">{formatFechaRelativa(eliminados ? t.eliminadoEn : t.updatedAt)}</span>
                </div>
                <div className="mesa-item-asunto">{t.asunto}</div>
                <div className="mesa-item-pie">
                  <Estado ticket={t} />
                  <span>{vista === "mias" ? t.areaNombre : t.creadorNombre}</span>
                  <span>{eliminados ? `${t.eliminadoPorNombre ?? ""}: ${t.motivoEliminacion ?? ""}` : responsablesDe(t)}</span>
                  {conGestion && !t.primeraRespuestaEn && t.estado !== "cerrado" && <span className="sr-only">Sin respuesta</span>}
                </div>
              </Link>
            ))}
            {total > items.length && <p className="mesa-ayuda mesa-card-pad">Se muestran los {items.length} más recientes de {total}. Usa el buscador o un filtro para ver los demás.</p>}
          </>
        )}
      </div>
    </section>
  )
}
