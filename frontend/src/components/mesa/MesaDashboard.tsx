// Dashboard de la mesa de ayuda. Organización: franja de cifras, tabla de
// pendientes con su avance contra la meta, cola «Por hacer» y gráfica de lo que
// llegó frente a lo que se cerró. Todo sale de datos reales del área de quien mira.
// El líder ve además el tablero de su área; el admin, el panorama entre áreas.

import { useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { CircleUserRound, Clock3, Inbox, MessageSquareDashed, Send, UserRoundX, type LucideIcon } from "lucide-react"
import { useMesaAreas, useMesaResumen, useMesaSerie, useMesaTickets, useMesaYo } from "@/hooks/useMesa"
import { ESTADO_TEXTO, mensajeDeError } from "@/lib/mesa"
import type { MesaTicket } from "@/types/mesa"
import { RUTA_SOLICITUDES } from "./MesaCabecera"
import { MesaPanorama } from "./MesaPanorama"
import { TableroEquipo, TableroFranja, TableroMetas, TableroQuePiden, TableroTipos, useTablero, type Tablero } from "./MesaTablero"
import "./mesa-dash.css"

const enArea = (f?: string) => `${RUTA_SOLICITUDES}?vista=area${f ? `&f=${f}` : ""}`
const aTicket = (id: number) => `${RUTA_SOLICITUDES}?vista=area&ticket=${id}`
const horas = (h: number) => (h < 1 ? "menos de 1 h" : `${Math.round(h)} h`)
const iniciales = (nombre: string) => {
  const p = nombre.trim().split(/\s+/)
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase()
}

// ── Franja de cifras ──

function Celda({ icono: Icono, titulo, n, pie, extra, a, alerta }: { icono: LucideIcon; titulo: string; n: number | undefined; pie: string; extra?: ReactNode; a: string; alerta?: boolean }) {
  return (
    <Link to={a} className="mesa-franja-celda" data-alerta={(alerta && !!n) || undefined}>
      <span className="mesa-franja-titulo"><Icono aria-hidden="true" />{titulo}</span>
      <span className="mesa-franja-cifra" style={{ display: "block" }}>{n ?? "–"}</span>
      <span className="mesa-franja-pie"><span>{pie}</span>{extra && <b>{extra}</b>}</span>
    </Link>
  )
}

// ── Tabla de pendientes: cada ticket contra la meta de cierre de su área ──

/** Pendientes del área con su meta de cierre y cuánto de ella llevan consumido (1 = justo en la meta). */
function usePendientes() {
  const lista = useMesaTickets({ vista: "area", estado: "activos", limite: 100 })
  const areas = useMesaAreas()
  const meta = (t: MesaTicket) => areas.data?.find((a) => a.areaId === t.areaId)?.metaCierreH ?? null
  const consumo = (t: MesaTicket) => { const m = meta(t); return m && t.horasAbierto != null ? t.horasAbierto / m : null }
  // Primero lo que más cerca está (o ya pasó) de su meta
  const filas = [...(lista.data?.items ?? [])].sort((x, y) => (consumo(y) ?? -1) - (consumo(x) ?? -1))
  return { lista, filas, meta, consumo, fuera: filas.filter((t) => (consumo(t) ?? 0) > 1).length }
}

function Pendientes({ lista, filas, meta, consumo }: ReturnType<typeof usePendientes>) {
  const navigate = useNavigate()
  const total = lista.data?.total ?? 0

  return (
    <section className="mesa-card mesa-panel" aria-labelledby="mesa-d-pend">
      <div className="mesa-panel-cab">
        <div>
          <h2 id="mesa-d-pend">Pendientes de mi área</h2>
          <p>Cada ticket contra la meta de cierre</p>
        </div>
        <span className="mesa-etiqueta-n">{total} {total === 1 ? "ticket" : "tickets"}</span>
      </div>
      {lista.isError ? (
        <p className="mesa-error" role="alert" style={{ margin: "0 1.25rem 1.25rem" }}>{mensajeDeError(lista.error)}</p>
      ) : lista.isPending ? (
        <div style={{ padding: "0 1.25rem 1.25rem" }} aria-busy="true" aria-label="Cargando pendientes">{[0, 1, 2].map((i) => <div key={i} className="mesa-esqueleto" />)}</div>
      ) : filas.length === 0 ? (
        <div className="mesa-panel-pie"><span>Tu área no tiene tickets pendientes.</span></div>
      ) : (
        <div className="mesa-pend-scroll">
          <table className="mesa-pend">
            <thead>
              <tr>
                <th scope="col">Solicitud</th>
                <th scope="col">Meta de cierre</th>
                <th scope="col" className="mesa-der mesa-ocultar-estrecho">Abierto</th>
                <th scope="col" className="mesa-ocultar-estrecho">Responsable</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((t) => {
                const m = meta(t)
                const c = consumo(t)
                const pasada = c !== null && c > 1
                const nota = !t.primeraRespuestaEn ? "Sin respuesta" : t.responsables.length === 0 ? "Sin asignar" : "En curso"
                return (
                  <tr key={t.id} onClick={() => navigate(aTicket(t.id))}>
                    <td>
                      <div className="mesa-pend-quien">
                        <span className="mesa-avatar" aria-hidden="true">{iniciales(t.creadorNombre)}</span>
                        <span className="min-w-0">
                          <Link to={aTicket(t.id)} className="mesa-pend-asunto" onClick={(e) => e.stopPropagation()}>{t.asunto}</Link>
                          <span className="mesa-pend-sub"><span translate="no" className="mesa-num">{t.codigo}</span>, {t.creadorNombre}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="mesa-avance">
                        <div className="mesa-avance-cab">
                          <b>{c === null ? "Sin meta" : `${Math.round(c * 100)} %`}</b>
                          <span>{nota}</span>
                        </div>
                        {c !== null && m !== null && (
                          <div className="mesa-avance-barra" data-fuera={pasada || undefined} role="img" aria-label={`Lleva ${horas(t.horasAbierto ?? 0)} de una meta de ${m} h`}>
                            <i style={{ width: `${Math.min(100, c * 100)}%` }} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="mesa-der mesa-num mesa-ocultar-estrecho" style={{ whiteSpace: "nowrap" }}>{horas(t.horasAbierto ?? 0)}</td>
                    <td className="mesa-ocultar-estrecho">{t.responsables.length === 0 ? <span className="mesa-pend-sub">Nadie</span> : t.responsables.map((r) => r.nombre).join(", ")}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{pasada ? <span className="mesa-critico">Fuera de meta</span> : ESTADO_TEXTO[t.estado]}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {total > filas.length && <div className="mesa-panel-pie"><span>Se muestran {filas.length} de {total}.</span><Link className="mesa-enlace" to={enArea()}>Ver todos</Link></div>}
    </section>
  )
}

// ── Gráfica: llegaron frente a se cerraron, por día ──

const PERIODOS = [7, 14, 30] as const
const fechaCorta = (iso: string) => new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`))

function Grafica() {
  const [dias, setDias] = useState<number>(14)
  const [activo, setActivo] = useState<number | null>(null)
  const serie = useMesaSerie("area", dias)
  const datos = serie.data ?? []
  const llegaron = datos.reduce((n, d) => n + d.llegaron, 0)
  const cerrados = datos.reduce((n, d) => n + d.cerrados, 0)
  const tope = Math.max(1, ...datos.flatMap((d) => [d.llegaron, d.cerrados]))
  const neto = llegaron - cerrados
  const d = activo !== null ? datos[activo] : null
  const cadaCuanto = Math.ceil(datos.length / 7)

  return (
    <section className="mesa-card mesa-panel" aria-labelledby="mesa-d-graf">
      <div className="mesa-panel-cab">
        <div>
          <h2 id="mesa-d-graf">Llegaron y se cerraron</h2>
          <p>Tickets de mi área, por día</p>
        </div>
        <div className="mesa-segmento" role="group" aria-label="Período de la gráfica">
          {PERIODOS.map((p) => <button key={p} type="button" aria-pressed={dias === p} onClick={() => { setDias(p); setActivo(null) }}>{p} días</button>)}
        </div>
      </div>
      <div className="mesa-graf">
        <div className="mesa-graf-leyenda">
          <span className="mesa-graf-serie"><i className="mesa-c-llegaron" aria-hidden="true" />Llegaron <b>{llegaron}</b></span>
          <span className="mesa-graf-serie"><i className="mesa-c-cerrados" aria-hidden="true" />Se cerraron <b>{cerrados}</b></span>
          <span className="mesa-graf-nota" aria-live="polite">
            {d ? `${fechaCorta(d.fecha)}: ${d.llegaron} ${d.llegaron === 1 ? "llegó" : "llegaron"}, ${d.cerrados} ${d.cerrados === 1 ? "se cerró" : "se cerraron"}`
              : neto === 0 ? "Se cerró lo mismo que llegó" : neto > 0 ? `${neto} más de los que se cerraron` : `${-neto} cerrados de más: baja lo acumulado`}
          </span>
        </div>
        {serie.isError ? (
          <p className="mesa-error" role="alert">{mensajeDeError(serie.error)}</p>
        ) : (
          <>
            {/* La tabla oculta de abajo es la versión accesible de la gráfica */}
            <div className="mesa-graf-area" aria-hidden="true" onMouseLeave={() => setActivo(null)}>
              {datos.map((p, i) => (
                <div key={p.fecha} className="mesa-graf-dia" onMouseEnter={() => setActivo(i)}>
                  {p.llegaron > 0 && <i className="mesa-c-llegaron" style={{ height: `${(p.llegaron / tope) * 100}%` }} />}
                  {p.cerrados > 0 && <i className="mesa-c-cerrados" style={{ height: `${(p.cerrados / tope) * 100}%` }} />}
                </div>
              ))}
            </div>
            <div className="mesa-graf-ejes" aria-hidden="true">
              {datos.map((p, i) => <span key={p.fecha}>{i % cadaCuanto === 0 || i === datos.length - 1 ? fechaCorta(p.fecha) : ""}</span>)}
            </div>
            <table className="sr-only">
              <caption>Tickets que llegaron y se cerraron cada día</caption>
              <thead><tr><th scope="col">Día</th><th scope="col">Llegaron</th><th scope="col">Se cerraron</th></tr></thead>
              <tbody>{datos.map((p) => <tr key={p.fecha}><th scope="row">{fechaCorta(p.fecha)}</th><td>{p.llegaron}</td><td>{p.cerrados}</td></tr>)}</tbody>
            </table>
          </>
        )}
      </div>
    </section>
  )
}

// ── Cola «Por hacer»: lo pendiente, con el botón que lleva a resolverlo ──

function Cola({ items }: { items: { icono: LucideIcon; n: number | undefined; titulo: (n: number) => string; detalle: string; boton: string; a: string }[] }) {
  const visibles = items.filter((i) => (i.n ?? 0) > 0)
  const total = visibles.reduce((n, i) => n + (i.n ?? 0), 0)
  return (
    <section className="mesa-card mesa-panel" aria-labelledby="mesa-d-cola">
      <div className="mesa-panel-cab">
        <div>
          <h2 id="mesa-d-cola">Por hacer</h2>
          <p>{visibles.length === 0 ? "Nada pendiente por ahora" : `${visibles.length} ${visibles.length === 1 ? "frente abierto" : "frentes abiertos"}`}</p>
        </div>
      </div>
      {visibles.length > 0 && (
        <ul className="mesa-cola">
          {visibles.map(({ icono: Icono, ...i }) => (
            <li key={i.boton + i.a}>
              <Icono aria-hidden="true" />
              <span className="mesa-cola-texto"><b>{i.titulo(i.n ?? 0)}</b><span>{i.detalle}</span></span>
              <Link to={i.a} className="mesa-btn2">{i.boton}</Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mesa-panel-pie"><span>{visibles.length === 0 ? "Tu área está al día." : "Cada botón abre la lista ya filtrada."}</span>{total > 0 && <span className="mesa-num">{total} en total</span>}</div>
    </section>
  )
}

export function MesaDashboard() {
  const navigate = useNavigate()
  const yo = useMesaYo()
  const area = useMesaResumen("area").data
  const mias = useMesaResumen("mias").data
  const pendientes = usePendientes()
  const delLider = useTablero(yo.data?.esLider ? yo.data.areaIds : [])
  // Solo para quien es líder y tiene al menos un área activa en la mesa
  const tablero: Tablero | null = yo.data?.esLider && delLider.areaId !== undefined ? delLider : null
  const fuera = pendientes.fuera
  const activos = area ? area.abierto + area.en_espera : undefined

  return (
    <main className="mesa-pagina">
      <div className="mesa-card mesa-franja">
        <Celda icono={MessageSquareDashed} titulo="Sin respuesta" n={area?.sinRespuesta} pie="de mi área" extra={activos !== undefined ? `de ${activos} activos` : undefined} a={enArea("sinRespuesta")} alerta />
        <Celda icono={UserRoundX} titulo="Sin asignar" n={area?.sinAsignar} pie="nadie los ha tomado" a={enArea("sinAsignar")} alerta />
        <Celda icono={CircleUserRound} titulo="Asignados a mí" n={area?.asignadosAMi} pie="por atender" a={enArea("mios")} />
        <Celda icono={Inbox} titulo="Abiertos en mi área" n={area?.abierto} pie="en curso" extra={area ? `${area.en_espera} en espera` : undefined} a={enArea()} />
        <Celda icono={Send} titulo="Mis solicitudes" n={mias?.abierto} pie="abiertas" extra={mias ? `${mias.en_espera} en espera` : undefined} a={RUTA_SOLICITUDES} />
      </div>

      {tablero && <TableroFranja t={tablero} />}

      <div className="mesa-dash">
        <div className="mesa-dash-col">
          <Pendientes {...pendientes} />
          <Grafica />
          {tablero?.datos && <TableroEquipo d={tablero.datos} />}
          {tablero?.datos && <TableroQuePiden d={tablero.datos} />}
        </div>
        <div className="mesa-dash-col">
        <Cola
          items={[
            { icono: Clock3, n: fuera, titulo: (n) => `${n} fuera de meta`, detalle: "Pasaron la meta de cierre", boton: "Revisar", a: enArea() },
            { icono: MessageSquareDashed, n: area?.sinRespuesta, titulo: (n) => `${n} sin respuesta`, detalle: "Tu área aún no ha contestado", boton: "Responder", a: enArea("sinRespuesta") },
            { icono: UserRoundX, n: area?.sinAsignar, titulo: (n) => `${n} sin asignar`, detalle: "Nadie los ha tomado", boton: "Asignar", a: enArea("sinAsignar") },
            { icono: CircleUserRound, n: area?.asignadosAMi, titulo: (n) => `${n} ${n === 1 ? "asignado" : "asignados"} a mí`, detalle: "Están a tu nombre", boton: "Ver", a: enArea("mios") },
            { icono: Inbox, n: area?.en_espera, titulo: (n) => `${n} en espera`, detalle: "Detenidos a la espera de algo", boton: "Revisar", a: enArea("en_espera") },
            { icono: Send, n: mias?.abierto, titulo: (n) => `${n} ${n === 1 ? "solicitud mía abierta" : "solicitudes mías abiertas"}`, detalle: "Lo que tú le pediste a otras áreas", boton: "Ver", a: RUTA_SOLICITUDES },
          ]}
        />
          {tablero?.datos && <TableroMetas key={`${tablero.datos.area.areaId}-${tablero.datos.primeraRespuesta.metaH}-${tablero.datos.cierre.metaH}`} d={tablero.datos} />}
          {tablero?.area && <TableroTipos area={tablero.area} />}
        </div>
      </div>

      {yo.data?.esAdmin && (
        <section className="mesa-seccion">
          <h2>Todas las áreas</h2>
          <MesaPanorama onAbrir={(id) => navigate(`${RUTA_SOLICITUDES}?vista=todas&ticket=${id}`)} />
        </section>
      )}
    </main>
  )
}
