import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { RUTA_SOLICITUDES } from "./MesaCabecera"
import { useMesaResumen, useMesaTickets } from "@/hooks/useMesa"
import { ESTADO_TEXTO, mensajeDeError } from "@/lib/mesa"
import { formatFechaRelativa } from "@/lib/dates"
import type { MesaTicket, MesaVista } from "@/types/mesa"

type Filtro = "abierto" | "en_espera" | "cerrado" | "sinRespuesta" | "sinAsignar" | "mios"
const FILTROS: Filtro[] = ["abierto", "en_espera", "cerrado", "sinRespuesta", "sinAsignar", "mios"]

const CONSULTA: Record<Filtro, Record<string, string>> = {
  abierto: { estado: "abierto" },
  en_espera: { estado: "en_espera" },
  cerrado: { estado: "cerrado" },
  sinRespuesta: { estado: "activos", sinRespuesta: "true" },
  sinAsignar: { estado: "activos", sinAsignar: "true" },
  mios: { estado: "activos", asignadoAMi: "true" },
}

const VACIO: Record<MesaVista, Partial<Record<Filtro, string>> & { base: string }> = {
  mias: { base: "No tienes solicitudes aquí.", abierto: "No tienes solicitudes abiertas. Si necesitas algo de otra área, crea una." },
  area: { base: "No hay tickets aquí.", abierto: "Tu área no tiene tickets abiertos.", sinAsignar: "Todo lo que llegó a tu área ya tiene responsable.", sinRespuesta: "Tu área ya respondió todo lo que le llegó." },
  todas: { base: "No hay tickets con ese filtro." },
  eliminados: { base: "Nadie ha eliminado tickets." },
}

export function Estado({ ticket }: { ticket: Pick<MesaTicket, "estado" | "eliminadoEn"> }) {
  const eliminado = ticket.eliminadoEn !== null
  return (
    <span className="mesa-estado" data-estado={eliminado ? "eliminado" : ticket.estado}>
      <i aria-hidden="true" />
      {eliminado ? "Eliminado" : ESTADO_TEXTO[ticket.estado]}
    </span>
  )
}

function responsablesDe(t: MesaTicket): string {
  if (t.responsables.length === 0) return "Sin asignar"
  const [primero, ...resto] = t.responsables
  return resto.length ? `${primero.nombre} y ${resto.length} más` : primero.nombre
}

interface Props {
  vista: MesaVista
  onAbrir: (id: number) => void
  /** Solo en la vista de administración: limita la lista a un área. */
  areaId?: number
}

export function MesaLista({ vista, onAbrir, areaId }: Props) {
  // El filtro vive en la URL (?f=) para que el enlace abra la misma bandeja
  const [params, setParams] = useSearchParams()
  const pedido = params.get("f") as Filtro | null
  const filtro: Filtro = pedido && FILTROS.includes(pedido) ? pedido : "abierto"
  const setFiltro = (f: Filtro) => {
    const sig = new URLSearchParams(params)
    if (f === "abierto") sig.delete("f"); else sig.set("f", f)
    setParams(sig, { replace: true })
  }
  const enlace = (id: number) => `${RUTA_SOLICITUDES}?vista=${vista}&ticket=${id}`
  const [texto, setTexto] = useState("")
  const [q, setQ] = useState("")
  const [pagina, setPagina] = useState(1)
  const conGestion = vista === "area" || vista === "todas"
  const eliminados = vista === "eliminados"

  useEffect(() => {
    const t = window.setTimeout(() => { setQ(texto.trim()); setPagina(1) }, 300)
    return () => window.clearTimeout(t)
  }, [texto])

  const consulta: Record<string, string | number> = { vista, pagina, ...(eliminados ? {} : CONSULTA[filtro]), ...(q ? { q } : {}), ...(areaId ? { areaId } : {}) }
  const lista = useMesaTickets(consulta)
  const resumen = useMesaResumen(vista, areaId)
  const r = resumen.data

  const chips: { clave: Filtro; texto: string; n?: number }[] = [
    { clave: "abierto", texto: "Abiertos", n: r?.abierto },
    { clave: "en_espera", texto: "En espera", n: r?.en_espera },
    ...(conGestion
      ? [
          { clave: "sinRespuesta" as const, texto: "Sin respuesta", n: r?.sinRespuesta },
          { clave: "sinAsignar" as const, texto: "Sin asignar", n: r?.sinAsignar },
          { clave: "mios" as const, texto: "Asignados a mí", n: r?.asignadosAMi },
        ]
      : []),
    { clave: "cerrado", texto: "Cerrados", n: r?.cerrado },
  ]

  const items = lista.data?.items ?? []
  const total = lista.data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / (lista.data?.limite ?? 50)))
  const quien = vista === "mias" ? "Área que atiende" : "Solicitante"
  const deQuien = (t: MesaTicket) => (vista === "mias" ? t.areaNombre : t.creadorNombre)

  return (
    <section>
      <div className="mesa-barra">
        {!eliminados && (
          <div className="mesa-chips" role="group" aria-label="Filtrar por estado">
            {chips.map((c) => (
              <button key={c.clave} type="button" className="mesa-chip" aria-pressed={filtro === c.clave} onClick={() => { setFiltro(c.clave); setPagina(1) }}>
                {c.texto}
                {c.n !== undefined && <b className="mesa-num">{c.n}</b>}
              </button>
            ))}
          </div>
        )}
        <div className="mesa-buscar">
          <label className="sr-only" htmlFor="mesa-buscar">Buscar por asunto o consecutivo</label>
          <input id="mesa-buscar" className="mesa-campo" type="search" name="buscar" autoComplete="off" placeholder="Buscar asunto o código…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
      </div>

      {lista.isError ? (
        <div className="mesa-vacio" role="alert">
          <h2>No pudimos cargar los tickets</h2>
          <p>{mensajeDeError(lista.error)}</p>
          <div className="mesa-acciones"><button type="button" className="mesa-btn2" onClick={() => lista.refetch()}>Reintentar</button></div>
        </div>
      ) : lista.isPending ? (
        <div aria-busy="true" aria-label="Cargando tickets">
          {[0, 1, 2, 3].map((i) => <div key={i} className="mesa-esqueleto" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="mesa-vacio">
          <h2>{q ? "Nada coincide con tu búsqueda" : "Nada por aquí"}</h2>
          <p>{q ? "Prueba con otra palabra o con el consecutivo completo." : (VACIO[vista][filtro] ?? VACIO[vista].base)}</p>
        </div>
      ) : (
        <>
          <table className="mesa-tabla">
            <thead>
              <tr>
                <th scope="col">Consecutivo</th>
                <th scope="col">Asunto</th>
                <th scope="col">{quien}</th>
                <th scope="col">Responsable</th>
                <th scope="col">Estado</th>
                <th scope="col">{eliminados ? "Eliminado" : "Actualizado"}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="mesa-fila" onClick={() => onAbrir(t.id)}>
                  <td className="mesa-cod" translate="no">{t.codigo}</td>
                  <td>
                    {/* El enlace da teclado y Ctrl+clic; el clic en el resto de la fila es comodidad para el ratón */}
                    <Link className="mesa-asunto" to={enlace(t.id)} onClick={(e) => e.stopPropagation()}>{t.asunto}</Link>
                    <div className="mesa-sub">
                      {eliminados ? `${t.eliminadoPorNombre ?? ""}: ${t.motivoEliminacion ?? ""}` : (t.categoria?.nombre ?? "Sin categoría")}
                      {vista === "todas" || eliminados ? `, ${t.areaNombre}` : ""}
                    </div>
                  </td>
                  <td>{deQuien(t)}</td>
                  <td>{responsablesDe(t)}</td>
                  <td><Estado ticket={t} /></td>
                  <td className="mesa-num" style={{ whiteSpace: "nowrap" }}>{formatFechaRelativa(eliminados ? t.eliminadoEn : t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mesa-tarjetas">
            {items.map((t) => (
              <Link key={t.id} className="mesa-tarjeta" to={enlace(t.id)}>
                <div className="mesa-tarjeta-cab">
                  <span className="mesa-cod" translate="no">{t.codigo}</span>
                  <Estado ticket={t} />
                </div>
                <div className="mesa-asunto">{t.asunto}</div>
                <div className="mesa-sub">{deQuien(t)}, {responsablesDe(t).toLowerCase() === "sin asignar" ? "sin asignar" : responsablesDe(t)}</div>
                <div className="mesa-sub mesa-num">{formatFechaRelativa(eliminados ? t.eliminadoEn : t.updatedAt)}</div>
              </Link>
            ))}
          </div>

          {paginas > 1 && (
            <div className="mesa-pie">
              <span className="mesa-num">Página {pagina} de {paginas}, {total} en total</span>
              <span className="mesa-fila-acc">
                <button type="button" className="mesa-btn2" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
                <button type="button" className="mesa-btn2" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
              </span>
            </div>
          )}
        </>
      )}
    </section>
  )
}
