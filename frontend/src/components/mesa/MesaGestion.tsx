import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { RUTA_CHATS } from "@/components/central/CentralCabecera"
import { useMesaAccion, useMesaAreas, useMesaPersonas, type MesaOrden } from "@/hooks/useMesa"
import { mensajeDeError, textoHistorial } from "@/lib/mesa"
import { formatFechaHora } from "@/lib/dates"
import { nivelTicketsCentral } from "@/lib/permissions"
import { useAuthStore } from "@/store/authStore"
import type { MesaDetalle, MesaEstado } from "@/types/mesa"

/** Tarjeta de la columna de gestión: mismo formato que las de un caso de la Central. */
function Tarjeta({ titulo, id, children }: { titulo: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mesa-card">
      <h3 id={id}>{titulo}</h3>
      {children}
    </section>
  )
}

// Avance: como en la Central, botones con la acción que sigue (no un selector de estado)
const AVANCE: Record<MesaEstado, { a: MesaEstado; texto: string; principal?: boolean }[]> = {
  abierto: [{ a: "en_espera", texto: "Poner en espera" }, { a: "cerrado", texto: "Cerrar ticket", principal: true }],
  en_espera: [{ a: "abierto", texto: "Reanudar" }, { a: "cerrado", texto: "Cerrar ticket", principal: true }],
  cerrado: [{ a: "abierto", texto: "Reabrir ticket" }],
}

/**
 * Columna lateral del ticket, organizada como la de un caso de la Central:
 * Responsable, Avance, Clasificación, Servicio al Cliente, Datos e Historial.
 * Cada bloque aparece solo si el servidor le permite esa acción a quien mira.
 */
export function MesaGestion({ ticket, onEliminado }: { ticket: MesaDetalle; onEliminado: () => void }) {
  const user = useAuthStore((s) => s.user)
  const yo = user?.id
  const entraALaCentral = !!user && nivelTicketsCentral(user.role, user.app_permissions) !== null
  const eliminado = ticket.eliminadoEn !== null
  const p = eliminado ? ({} as Partial<MesaDetalle["permisos"]>) : ticket.permisos
  const accion = useMesaAccion()
  const areas = useMesaAreas()
  const equipo = useMesaPersonas(ticket.areaId, !!p.asignar)
  const todas = useMesaPersonas(null, !!p.sumar_responsable)
  const [destino, setDestino] = useState("")
  const [nota, setNota] = useState("")
  const [paraQuien, setParaQuien] = useState("")
  const delDestino = useMesaPersonas(destino ? Number(destino) : null, !!p.redirigir && destino !== "")
  const [eliminando, setEliminando] = useState(false)
  const [motivo, setMotivo] = useState("")

  const hacer = (orden: MesaOrden, alTerminar?: () => void) => accion.mutate(orden, { onSuccess: alTerminar })
  const ocupado = accion.isPending
  const yaEsta = new Set(ticket.responsables.map((r) => r.userId))
  const categorias = areas.data?.find((a) => a.areaId === ticket.areaId)?.categorias ?? []
  const delEquipo = (equipo.data ?? []).filter((c) => !yaEsta.has(c.id))
  const deOtras = (todas.data ?? []).filter((c) => !yaEsta.has(c.id) && !(equipo.data ?? []).some((e) => e.id === c.id))
  const otrasAreas = (areas.data ?? []).filter((a) => a.areaId !== ticket.areaId)

  return (
    <>
      <Tarjeta titulo="Responsable" id="mesa-g-resp">
        {ticket.responsables.length === 0 && <p className="mesa-ayuda" style={{ marginTop: 0 }}>Nadie lo ha tomado todavía.</p>}
        {ticket.responsables.map((r) => (
          <div key={r.userId} className="mesa-persona">
            <span>{r.nombre}</span>
            {p.asignar && <button type="button" className="mesa-btn2" style={{ minHeight: 36 }} disabled={ocupado} onClick={() => hacer({ tipo: "desasignar", id: ticket.id, userId: r.userId })} aria-label={`Quitar a ${r.nombre}`}>Quitar</button>}
          </div>
        ))}
        {p.asignar && (
          <div className="mesa-fila-acc" style={{ marginTop: "0.75rem" }}>
            {yo !== undefined && !yaEsta.has(yo) && (
              <button type="button" className={`${ticket.responsables.length ? "mesa-btn2" : "mesa-btn"} mesa-ancho`} disabled={ocupado} onClick={() => hacer({ tipo: "asignar", id: ticket.id, userId: yo })}>Tomarlo yo</button>
            )}
            {delEquipo.length > 0 && (
              <>
                <label className="sr-only" htmlFor="mesa-g-asignar">Asignar a alguien del área</label>
                <select id="mesa-g-asignar" className="mesa-campo" disabled={ocupado} value="" onChange={(e) => e.target.value && hacer({ tipo: "asignar", id: ticket.id, userId: Number(e.target.value) })}>
                  <option value="">Asignar a alguien del área…</option>
                  {delEquipo.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.cargo ? `, ${c.cargo}` : ""}</option>)}
                </select>
              </>
            )}
          </div>
        )}
      </Tarjeta>

      {p.estado && (
        <Tarjeta titulo="Avance" id="mesa-g-avance">
          <div className="mesa-fila-acc">
            {AVANCE[ticket.estado].map((o) => (
              <button key={o.a} type="button" className={`${o.principal ? "mesa-btn" : "mesa-btn2"} mesa-ancho`} disabled={ocupado} onClick={() => hacer({ tipo: "actualizar", id: ticket.id, cambios: { estado: o.a } })}>
                {o.texto}
              </button>
            ))}
          </div>
        </Tarjeta>
      )}

      {p.categoria && categorias.length > 0 && (
        <Tarjeta titulo="Clasificación" id="mesa-g-clas">
          <label className="mesa-etiqueta" htmlFor="mesa-g-cat">Tipo de solicitud</label>
          <select id="mesa-g-cat" className="mesa-campo" disabled={ocupado} value={ticket.categoria?.id ?? ""} onChange={(e) => hacer({ tipo: "actualizar", id: ticket.id, cambios: { categoriaId: e.target.value ? Number(e.target.value) : null } })}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Tarjeta>
      )}

      {(p.sumar_responsable || p.redirigir) && (
        <Tarjeta titulo="Servicio al Cliente" id="mesa-g-sac">
          {p.sumar_responsable && deOtras.length > 0 && (
            <div style={{ marginBottom: "0.9rem" }}>
              <label className="mesa-etiqueta" htmlFor="mesa-g-sumar">Sumar a alguien de otra área</label>
              <select id="mesa-g-sumar" className="mesa-campo" disabled={ocupado} value="" onChange={(e) => e.target.value && hacer({ tipo: "asignar", id: ticket.id, userId: Number(e.target.value) })}>
                <option value="">Elige a la persona…</option>
                {deOtras.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          {p.redirigir && (
            <form onSubmit={(e) => { e.preventDefault(); hacer({ tipo: "redirigir", id: ticket.id, areaId: Number(destino), nota: nota.trim(), responsableId: paraQuien ? Number(paraQuien) : undefined }, () => { setDestino(""); setNota(""); setParaQuien("") }) }}>
              <label className="mesa-etiqueta" htmlFor="mesa-g-area">Redirigir a otra área</label>
              <select id="mesa-g-area" className="mesa-campo" required disabled={ocupado} value={destino} onChange={(e) => { setDestino(e.target.value); setParaQuien("") }}>
                <option value="" disabled>Elige el área…</option>
                {otrasAreas.map((a) => <option key={a.areaId} value={a.areaId}>{a.nombre}</option>)}
              </select>
              {destino && (
                <>
                  <label className="mesa-etiqueta" htmlFor="mesa-g-quien" style={{ marginTop: "0.6rem" }}>Para quién (opcional)</label>
                  <select id="mesa-g-quien" className="mesa-campo" disabled={ocupado} value={paraQuien} onChange={(e) => setParaQuien(e.target.value)}>
                    <option value="">Toda el área: que lo tome quien pueda</option>
                    {(delDestino.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.cargo ? `, ${c.cargo}` : ""}</option>)}
                  </select>
                  <p className="mesa-ayuda">Con nombre, el aviso le llega solo a esa persona. Sin nombre, a toda el área.</p>
                  <label className="mesa-etiqueta" htmlFor="mesa-g-nota" style={{ marginTop: "0.6rem" }}>Por qué (opcional)</label>
                  <input id="mesa-g-nota" name="nota" autoComplete="off" className="mesa-campo" maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
                  <p className="mesa-ayuda">Conserva el consecutivo. Se quitan el tipo y los responsables actuales, que eran del área anterior.</p>
                  <button type="submit" className="mesa-btn2 mesa-ancho" style={{ marginTop: "0.75rem" }} disabled={ocupado}>Redirigir</button>
                </>
              )}
            </form>
          )}
        </Tarjeta>
      )}

      {accion.isError && <p className="mesa-error" role="alert">{mensajeDeError(accion.error)}</p>}

      <Tarjeta titulo="Datos" id="mesa-g-datos">
        <dl className="mesa-datos">
          <dt>Área que atiende</dt><dd>{ticket.areaNombre}</dd>
          <dt>Tipo</dt><dd>{ticket.categoria?.nombre ?? "Sin categoría"}</dd>
          <dt>Solicitante</dt><dd>{ticket.creadorNombre}{ticket.creadorArea ? `, ${ticket.creadorArea}` : ""}{ticket.creadorSede ? ` (${ticket.creadorSede})` : ""}</dd>
          <dt>Creada</dt><dd className="mesa-num">{formatFechaHora(ticket.createdAt)}</dd>
          {ticket.primeraRespuestaEn && <><dt>Primera respuesta</dt><dd className="mesa-num">{formatFechaHora(ticket.primeraRespuestaEn)}</dd></>}
          {ticket.cerradoEn && <><dt>Cerrada</dt><dd className="mesa-num">{formatFechaHora(ticket.cerradoEn)}</dd></>}
          {ticket.radicadoOrigen && (
            <>
              <dt>Caso de cliente</dt>
              <dd className="mesa-num" translate="no">
                {entraALaCentral
                  ? <Link className="mesa-enlace" to={`${RUTA_CHATS}?caso=${encodeURIComponent(ticket.radicadoOrigen)}`}>{ticket.radicadoOrigen}</Link>
                  : ticket.radicadoOrigen}
              </dd>
            </>
          )}
          {eliminado && <><dt>Eliminada</dt><dd>{formatFechaHora(ticket.eliminadoEn)} por {ticket.eliminadoPorNombre}: {ticket.motivoEliminacion}</dd></>}
        </dl>
      </Tarjeta>

      <Tarjeta titulo="Historial" id="mesa-g-hist">
        <ul className="mesa-historial">
          {ticket.historial.map((h) => (
            <li key={h.id}><span className="mesa-num">{formatFechaHora(h.createdAt)}</span>, {h.actorNombre} {textoHistorial(h)}</li>
          ))}
        </ul>
      </Tarjeta>

      {p.eliminar && (
        <section className="mesa-card">
          {!eliminando ? (
            <button type="button" className="mesa-btn2 mesa-ancho" data-peligro onClick={() => setEliminando(true)}>Eliminar solicitud</button>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); hacer({ tipo: "eliminar", id: ticket.id, motivo: motivo.trim() }, onEliminado) }}>
              <label className="mesa-etiqueta" htmlFor="mesa-e-motivo">Por qué la eliminas</label>
              <input id="mesa-e-motivo" name="motivo" autoComplete="off" className="mesa-campo" required minLength={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <p className="mesa-ayuda">Deja de aparecer para ti y para el área. Queda un registro con tu nombre y este motivo para administración.</p>
              <div className="mesa-fila-acc" style={{ marginTop: "0.75rem" }}>
                <button type="submit" className="mesa-btn2 mesa-ancho" data-peligro disabled={ocupado}>{ocupado ? "Eliminando…" : "Eliminar"}</button>
                <button type="button" className="mesa-btn2 mesa-ancho" disabled={ocupado} onClick={() => setEliminando(false)}>Conservarla</button>
              </div>
            </form>
          )}
        </section>
      )}
    </>
  )
}
