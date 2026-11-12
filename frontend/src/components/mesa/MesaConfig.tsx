import { useState, type FormEvent } from "react"
import { useMesaAjuste, useMesaAreasPanel, useMesaAreasTodas } from "@/hooks/useMesa"
import { mensajeDeError } from "@/lib/mesa"
import type { MesaArea } from "@/types/mesa"

/** Sugerencia de prefijo: iniciales del nombre ("Talento y Cultura" → "TYC"). */
function sugerirPrefijo(nombre: string): string {
  const palabras = nombre.normalize("NFD").replace(/\p{Mn}/gu, "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
  const base = palabras.length === 1 ? palabras[0].slice(0, 3) : palabras.map((p) => p[0]).join("")
  return base.slice(0, 6).padEnd(2, "X")
}

/** Tipos de solicitud de un área: agregar, desactivar y reactivar. Lo usan el admin y el líder del área. */
export function MesaTipos({ area }: { area: MesaArea }) {
  const ajuste = useMesaAjuste()
  const [categoria, setCategoria] = useState("")
  const id = area.areaId
  function agregar(e: FormEvent) {
    e.preventDefault()
    ajuste.mutate({ tipo: "categoria-nueva", areaId: id, nombre: categoria.trim() }, { onSuccess: () => setCategoria("") })
  }
  return (
    <>
      <span className="mesa-etiqueta">Tipos de solicitud</span>
      {area.categorias.length === 0 && <p className="mesa-ayuda" style={{ marginTop: 0 }}>Sin tipos todavía: quien pida algo a esta área no tendrá que clasificarlo.</p>}
      <div className="mesa-chips">
        {area.categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            className="mesa-chip"
            aria-pressed={c.activa}
            disabled={ajuste.isPending}
            title={c.activa ? "Desactivar: deja de ofrecerse en solicitudes nuevas" : "Volver a activar"}
            onClick={() => ajuste.mutate({ tipo: "categoria", id: c.id, cambios: { activa: !c.activa } })}
          >
            {c.nombre}{!c.activa && " (inactivo)"}
          </button>
        ))}
      </div>
      <form className="mesa-fila-acc" style={{ marginTop: "0.6rem" }} onSubmit={agregar}>
        <label className="sr-only" htmlFor={`mesa-c-cat-${id}`}>Nuevo tipo de solicitud para {area.nombre}</label>
        <input id={`mesa-c-cat-${id}`} name={`categoria-${id}`} autoComplete="off" className="mesa-campo" style={{ maxWidth: "16rem" }} required minLength={2} maxLength={60} placeholder="Ej.: Impresora…" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
        <button type="submit" className="mesa-btn2" disabled={ajuste.isPending}>Agregar tipo</button>
      </form>
      {ajuste.isError && <p className="mesa-error" role="alert">{mensajeDeError(ajuste.error)}</p>}
    </>
  )
}

function FilaArea({ id, nombre, area }: { id: number; nombre: string; area?: MesaArea }) {
  const ajuste = useMesaAjuste()
  const [prefijo, setPrefijo] = useState(area?.prefijo ?? sugerirPrefijo(nombre))
  const [recibe, setRecibe] = useState(area?.recibeTickets ?? true)
  const [sac, setSac] = useState(area?.esSac ?? false)
  const cambio = !area || prefijo !== area.prefijo || recibe !== area.recibeTickets || sac !== area.esSac

  function guardar(e: FormEvent) {
    e.preventDefault()
    ajuste.mutate({ tipo: "area", areaId: id, prefijo: prefijo.trim().toUpperCase(), recibeTickets: recibe, esSac: sac })
  }

  return (
    <li className="mesa-conf">
      <form className="mesa-conf-cab" onSubmit={guardar}>
        <h3>{nombre}</h3>
        {!area && <span className="mesa-sub">Todavía no está en la mesa de ayuda</span>}
        <div className="mesa-fila-acc">
          <label className="mesa-conf-campo">
            <span className="mesa-etiqueta">Prefijo</span>
            <input className="mesa-campo mesa-num" name={`prefijo-${id}`} autoComplete="off" spellCheck={false} required pattern="[A-Za-z0-9]{2,6}" maxLength={6} value={prefijo} onChange={(e) => setPrefijo(e.target.value.toUpperCase())} aria-describedby={`mesa-c-pref-${id}`} />
          </label>
          <label className="mesa-check"><input type="checkbox" checked={recibe} onChange={(e) => setRecibe(e.target.checked)} /> Recibe solicitudes</label>
          <label className="mesa-check"><input type="checkbox" checked={sac} onChange={(e) => setSac(e.target.checked)} /> Es Servicio al Cliente</label>
          <button type="submit" className={area ? "mesa-btn2" : "mesa-btn"} disabled={ajuste.isPending || !cambio}>
            {ajuste.isPending ? "Guardando…" : area ? "Guardar" : "Activar en la mesa"}
          </button>
        </div>
        <p id={`mesa-c-pref-${id}`} className="mesa-ayuda">
          Los consecutivos se verán así: <span className="mesa-num" translate="no">{(prefijo || "XX").toUpperCase()}-{new Date().getFullYear()}-0001</span>. De 2 a 6 letras o números.
        </p>
      </form>

      {area && <div className="mesa-conf-cats"><MesaTipos area={area} /></div>}
      {ajuste.isError && <p className="mesa-error" role="alert">{mensajeDeError(ajuste.error)}</p>}
    </li>
  )
}

/** Configuración (solo admin): qué áreas del panel reciben solicitudes, con qué prefijo y qué tipos ofrecen. */
export function MesaConfig() {
  const panel = useMesaAreasPanel()
  const mesa = useMesaAreasTodas()
  if (panel.isError || mesa.isError) {
    return <p className="mesa-error" role="alert">{mensajeDeError(panel.error ?? mesa.error)}</p>
  }
  if (!panel.data || !mesa.data) {
    return <div aria-busy="true" aria-label="Cargando áreas">{[0, 1, 2].map((i) => <div key={i} className="mesa-esqueleto" />)}</div>
  }
  const activas = new Map(mesa.data.map((a) => [a.areaId, a]))
  // Primero las que ya están en la mesa; luego las del panel que faltan por activar
  const orden = [...panel.data].sort((a, b) => Number(activas.has(b.id)) - Number(activas.has(a.id)) || a.name.localeCompare(b.name, "es"))
  return (
    <section>
      <p className="mesa-ayuda" style={{ marginTop: 0, marginBottom: "1rem", maxWidth: "70ch" }}>
        Las áreas salen del panel de administración de la intranet. Aquí decides cuáles reciben solicitudes, con qué prefijo se numeran y qué tipos de solicitud ofrecen.
        Las metas las define el líder de cada área.
      </p>
      <ul className="mesa-conf-lista">
        {orden.map((a) => <FilaArea key={`${a.id}-${activas.get(a.id)?.prefijo ?? ""}`} id={a.id} nombre={a.name} area={activas.get(a.id)} />)}
      </ul>
    </section>
  )
}
