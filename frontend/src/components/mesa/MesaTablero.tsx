// Tablero del líder: su área contra las metas que él define. No es una sección
// aparte: son piezas que el Dashboard coloca en su misma organización (franja de
// cifras, tablas con barra en la columna principal, formularios a la derecha).
// Los tiempos van en horas laborales de la mesa.

import { useState, type FormEvent, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { ArchiveRestore, CheckCheck, Clock3, Inbox, Timer, type LucideIcon } from "lucide-react"
import { useMesaAjuste, useMesaAreasTodas, useMesaTablero } from "@/hooks/useMesa"
import { mensajeDeError } from "@/lib/mesa"
import { formatFecha } from "@/lib/dates"
import type { MesaArea, MesaIndicador, MesaTableroDatos } from "@/types/mesa"
import { MesaTipos } from "./MesaConfig"

const PERIODOS = [7, 30, 90] as const
// La mediana llega redondeada a 0,1 h: un 0 significa "casi inmediato", no "cero"
const horas = (h: number) => (h === 0 ? "< 0,1 h" : `${Number.isInteger(h) ? h : h.toFixed(1).replace(".", ",")} h`)
const iniciales = (nombre: string) => {
  const p = nombre.trim().split(/\s+/)
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase()
}

/** Área y período elegidos (en la URL: ?area=, ?dias=) y los datos del tablero. */
export function useTablero(areaIds: number[]) {
  const [params, setParams] = useSearchParams()
  const areas = useMesaAreasTodas()
  const pedida = Number(params.get("area"))
  const areaId = areaIds.includes(pedida) ? pedida : areaIds[0]
  const pedidos = Number(params.get("dias"))
  const dias = (PERIODOS as readonly number[]).includes(pedidos) ? pedidos : 30
  const consulta = useMesaTablero(areaId ?? null, dias)
  const poner = (clave: string, valor: string | null) => {
    const sig = new URLSearchParams(params)
    if (valor === null) sig.delete(clave); else sig.set(clave, valor)
    setParams(sig, { replace: true })
  }
  const misAreas = (areas.data ?? []).filter((a) => areaIds.includes(a.areaId))
  return { areaId, dias, poner, consulta, datos: consulta.data, misAreas, area: misAreas.find((a) => a.areaId === areaId) }
}
export type Tablero = ReturnType<typeof useTablero>

// ── Franja del área ──

function Dato({ icono: Icono, titulo, cifra, pie, extra, alerta, medidor }: { icono: LucideIcon; titulo: string; cifra: ReactNode; pie: string; extra?: ReactNode; alerta?: boolean; medidor?: { valor: number; meta: number } }) {
  // Medidor: el relleno es la mediana y llega hasta la meta (se pasa a rojo si la supera)
  const fuera = medidor ? medidor.valor > medidor.meta : false
  return (
    <div className="mesa-franja-celda" data-alerta={alerta || undefined}>
      <span className="mesa-franja-titulo"><Icono aria-hidden="true" />{titulo}</span>
      <span className="mesa-franja-cifra" style={{ display: "block" }}>{cifra}</span>
      <span className="mesa-franja-pie"><span>{pie}</span>{extra && <b>{extra}</b>}</span>
      {medidor && (
        <div className="mesa-avance-barra" data-fuera={fuera || undefined} style={{ marginTop: "0.6rem" }} role="img" aria-label={`Mediana ${horas(medidor.valor)} frente a una meta de ${horas(medidor.meta)}`}>
          <i style={{ width: `${Math.min(100, (medidor.valor / medidor.meta) * 100)}%` }} />
        </div>
      )}
    </div>
  )
}

function Tiempo({ icono, titulo, i }: { icono: LucideIcon; titulo: string; i: MesaIndicador }) {
  return (
    <Dato
      icono={icono}
      titulo={titulo}
      cifra={i.medianaH === null ? "–" : horas(i.medianaH)}
      pie={i.metaH === null ? "sin meta definida" : `meta ${horas(i.metaH)}`}
      extra={i.cumplimiento !== null ? `${i.cumplimiento} % la cumplió` : i.medianaH === null ? "sin tickets medidos" : undefined}
      alerta={i.medianaH !== null && i.metaH !== null && i.medianaH > i.metaH}
      medidor={i.medianaH !== null && i.metaH !== null ? { valor: i.medianaH, meta: i.metaH } : undefined}
    />
  )
}

/** Encabezado «Mi área» (área y período) y la franja con los tiempos contra la meta y el movimiento del período. */
export function TableroFranja({ t }: { t: Tablero }) {
  const d = t.datos
  return (
    <section className="mesa-seccion" aria-labelledby="mesa-t-titulo">
      <div className="mesa-barra" style={{ marginBottom: "0.75rem" }}>
        <h2 id="mesa-t-titulo" style={{ fontWeight: 800, fontSize: "1.25rem", marginRight: "auto" }}>Mi área{d ? `: ${d.area.nombre}` : ""}</h2>
        {t.misAreas.length > 1 && (
          <div>
            <label className="sr-only" htmlFor="mesa-t-area">Área</label>
            <select id="mesa-t-area" className="mesa-campo" value={t.areaId} onChange={(e) => t.poner("area", e.target.value)}>
              {t.misAreas.map((a) => <option key={a.areaId} value={a.areaId}>{a.nombre}</option>)}
            </select>
          </div>
        )}
        <div className="mesa-segmento" role="group" aria-label="Período de los indicadores del área">
          {PERIODOS.map((p) => <button key={p} type="button" aria-pressed={t.dias === p} onClick={() => t.poner("dias", p === 30 ? null : String(p))}>{p} días</button>)}
        </div>
      </div>
      {t.consulta.isError ? (
        <p className="mesa-error" role="alert">{mensajeDeError(t.consulta.error)}</p>
      ) : !d ? (
        <div className="mesa-esqueleto" aria-busy="true" aria-label="Cargando indicadores del área" style={{ height: "7.5rem" }} />
      ) : (
        <div className="mesa-card mesa-franja">
          <Tiempo icono={Timer} titulo="Primera respuesta" i={d.primeraRespuesta} />
          <Tiempo icono={CheckCheck} titulo="Cierre" i={d.cierre} />
          <Dato
            icono={Clock3}
            titulo="Fuera de meta"
            // La cifra grande es lo más urgente: tickets que nadie ha respondido a tiempo
            cifra={d.primeraRespuesta.fueraDeMetaAhora}
            pie="sin respuesta a tiempo"
            extra={`${d.cierre.fueraDeMetaAhora} sin cerrar a tiempo`}
            alerta={d.cierre.fueraDeMetaAhora + d.primeraRespuesta.fueraDeMetaAhora > 0}
          />
          <Dato icono={Inbox} titulo="Llegaron" cifra={d.creados} pie={`en ${d.dias} días`} />
          <Dato icono={ArchiveRestore} titulo="Se cerraron" cifra={d.cerrados} pie={`en ${d.dias} días`} extra={d.creados - d.cerrados > 0 ? `${d.creados - d.cerrados} siguen abiertos` : undefined} />
        </div>
      )}
    </section>
  )
}

// ── Columna principal: equipo y qué piden ──

/** Quién atiende: una fila por persona, con la carga (sus abiertos frente a la persona más cargada). */
export function TableroEquipo({ d }: { d: MesaTableroDatos }) {
  const filas = d.porResponsable
  const max = Math.max(1, ...filas.map((f) => f.abiertos))
  const abiertos = filas.reduce((n, f) => n + f.abiertos, 0)
  return (
    <section className="mesa-card mesa-panel" aria-labelledby="mesa-t-equipo">
      <div className="mesa-panel-cab">
        <div>
          <h2 id="mesa-t-equipo">Equipo</h2>
          <p>Quién atiende y cuánto tiene encima</p>
        </div>
        <span className="mesa-etiqueta-n">{filas.length} {filas.length === 1 ? "persona" : "personas"}</span>
      </div>
      {filas.length === 0 ? (
        <div className="mesa-panel-pie"><span>Nadie ha tomado tickets todavía.</span></div>
      ) : (
        <div className="mesa-pend-scroll">
          <table className="mesa-pend mesa-pend-quieta">
            <thead>
              <tr>
                <th scope="col">Responsable</th>
                <th scope="col">Carga</th>
                <th scope="col" className="mesa-der">Abiertos</th>
                <th scope="col" className="mesa-der">Cerrados en {d.dias} días</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.nombre}>
                  <td>
                    <div className="mesa-pend-quien">
                      <span className="mesa-avatar" aria-hidden="true">{iniciales(f.nombre)}</span>
                      <span className="mesa-pend-asunto">{f.nombre}</span>
                    </div>
                  </td>
                  <td>
                    <div className="mesa-avance">
                      <div className="mesa-avance-cab">
                        <b>{abiertos ? `${Math.round((f.abiertos / abiertos) * 100)} %` : "0 %"}</b>
                        <span>{f.abiertos === 0 ? "Sin pendientes" : f.abiertos === max && filas.length > 1 ? "La más alta" : "de lo asignado"}</span>
                      </div>
                      <div className="mesa-avance-barra" aria-hidden="true"><i style={{ width: `${(f.abiertos / max) * 100}%` }} /></div>
                    </div>
                  </td>
                  <td className="mesa-der mesa-num">{f.abiertos}</td>
                  <td className="mesa-der mesa-num">{f.cerrados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mesa-panel-pie"><span>Sin asignar en el área</span><span className="mesa-num">{d.pendientes.sinAsignar}</span></div>
    </section>
  )
}

/** Qué piden: tipos de solicitud del período, de mayor a menor. Barras de un solo tono (miden cantidad). */
export function TableroQuePiden({ d }: { d: MesaTableroDatos }) {
  const max = Math.max(1, ...d.porCategoria.map((c) => c.creados))
  return (
    <section className="mesa-card mesa-panel" aria-labelledby="mesa-t-piden">
      <div className="mesa-panel-cab">
        <div>
          <h2 id="mesa-t-piden">Qué piden</h2>
          <p>Tipos de solicitud en {d.dias} días</p>
        </div>
        <span className="mesa-etiqueta-n">{d.creados} {d.creados === 1 ? "ticket" : "tickets"}</span>
      </div>
      {d.porCategoria.length === 0 ? (
        <div className="mesa-panel-pie"><span>No llegaron tickets en este período.</span></div>
      ) : (
        <table className="mesa-pend mesa-pend-quieta">
          <thead>
            <tr><th scope="col">Tipo de solicitud</th><th scope="col">Parte del total</th><th scope="col" className="mesa-der">Llegaron</th></tr>
          </thead>
          <tbody>
            {d.porCategoria.map((c) => (
              <tr key={c.nombre}>
                <td><span className="mesa-pend-asunto">{c.nombre}</span></td>
                <td>
                  <div className="mesa-avance">
                    <div className="mesa-avance-cab"><b>{Math.round((c.creados / d.creados) * 100)}&nbsp;%</b></div>
                    <div className="mesa-avance-barra" aria-hidden="true"><i style={{ width: `${(c.creados / max) * 100}%` }} /></div>
                  </div>
                </td>
                <td className="mesa-der mesa-num">{c.creados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

// ── Columna derecha: metas y tipos de solicitud ──

export function TableroMetas({ d }: { d: MesaTableroDatos }) {
  const ajuste = useMesaAjuste()
  const [respuesta, setRespuesta] = useState(d.primeraRespuesta.metaH?.toString() ?? "")
  const [cierre, setCierre] = useState(d.cierre.metaH?.toString() ?? "")
  const aNumero = (v: string) => (v.trim() === "" ? null : Number(v))
  const cambio = aNumero(respuesta) !== d.primeraRespuesta.metaH || aNumero(cierre) !== d.cierre.metaH

  function guardar(e: FormEvent) {
    e.preventDefault()
    ajuste.mutate({ tipo: "metas", areaId: d.area.areaId, metaPrimeraRespuestaH: aNumero(respuesta), metaCierreH: aNumero(cierre) })
  }
  return (
    <section className="mesa-card mesa-panel" aria-labelledby="mesa-t-metas">
      <div className="mesa-panel-cab">
        <div>
          <h2 id="mesa-t-metas">Metas del área</h2>
          <p>En horas laborales</p>
        </div>
      </div>
      <form onSubmit={guardar} style={{ padding: "0 1.25rem 1.1rem", display: "grid", gap: "0.75rem" }}>
        <label>
          <span className="mesa-etiqueta">Primera respuesta (h)</span>
          <input className="mesa-campo mesa-num" name="meta-respuesta" autoComplete="off" type="number" inputMode="numeric" min={1} max={2160} step={1} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
        </label>
        <label>
          <span className="mesa-etiqueta">Cierre (h)</span>
          <input className="mesa-campo mesa-num" name="meta-cierre" autoComplete="off" type="number" inputMode="numeric" min={1} max={2160} step={1} value={cierre} onChange={(e) => setCierre(e.target.value)} />
        </label>
        <button type="submit" className="mesa-btn2" disabled={ajuste.isPending || !cambio}>{ajuste.isPending ? "Guardando…" : "Guardar metas"}</button>
        {ajuste.isError && <p className="mesa-error" role="alert" style={{ marginTop: 0 }}>{mensajeDeError(ajuste.error)}</p>}
      </form>
      <div className="mesa-panel-pie" style={{ display: "block" }}>
        Lunes a viernes de 7&nbsp;a.&nbsp;m. a 7&nbsp;p.&nbsp;m. y sábados hasta mediodía. Un campo vacío deja esa meta sin definir.
        {d.area.metasActualizadasPor && <> Última actualización: {d.area.metasActualizadasPor}, {formatFecha(d.area.metasActualizadasEn)}.</>}
      </div>
    </section>
  )
}

export function TableroTipos({ area }: { area: MesaArea }) {
  return (
    <section className="mesa-card mesa-panel" aria-label="Tipos de solicitud del área">
      <div style={{ padding: "1.1rem 1.25rem" }}><MesaTipos area={area} /></div>
    </section>
  )
}
