// Cabecera compartida de las páginas de la mesa de ayuda. Misma organización que
// la de la Central de tickets (CentralCabecera): volver a la intranet, título,
// selector de secciones y actualizar; aquí además van la campana y «Nueva solicitud».

import { Link, NavLink } from "react-router-dom"
import { ArrowLeft, Plus, RefreshCw } from "lucide-react"
import { useIsFetching, useQueryClient } from "@tanstack/react-query"
import { MesaCampana } from "@/components/layout/MesaCampana"
import { useMesaResumen, useMesaYo } from "@/hooks/useMesa"
import "./mesa.css"
import "./mesa-bandeja.css"
import "./mesa-admin.css"
import "./mesa-web.css"

export const RUTA_MESA = "/mesa-ayuda"
export const RUTA_SOLICITUDES = "/mesa-ayuda/solicitudes"
export const RUTA_CONFIG = "/mesa-ayuda/configuracion"

export function MesaCabecera({ onNueva }: { onNueva: () => void }) {
  const qc = useQueryClient()
  const actualizando = useIsFetching({ queryKey: ["mesa"] }) > 0
  const yo = useMesaYo()
  // Lo que llegó a mi área y nadie ha respondido: el equivalente a «esperan respuesta» de la Central
  const sinRespuesta = useMesaResumen("area").data?.sinRespuesta ?? 0

  return (
    <header className="mesa-cab">
      <Link to="/dashboard" className="mesa-btn2 mesa-redondo" aria-label="Volver a la intranet">
        <ArrowLeft className="size-4" aria-hidden />
      </Link>
      <div className="min-w-0 flex-1">
        <h1>Mesa de ayuda</h1>
        <p className="mesa-cab-sub">Solicitudes entre áreas</p>
      </div>
      <MesaCampana />
      <button type="button" className="mesa-btn2 mesa-redondo mesa-crece max-lg:hidden" onClick={() => qc.invalidateQueries({ queryKey: ["mesa"] })} disabled={actualizando} aria-label="Actualizar ahora">
        <RefreshCw className={`size-4 ${actualizando ? "animate-spin" : ""}`} aria-hidden />
        <span className="mesa-solo-ancho">Actualizar</span>
      </button>
      <button type="button" className="mesa-btn max-lg:!w-[44px] max-lg:!px-0" onClick={onNueva} aria-label="Nueva solicitud">
        <Plus className="size-4 lg:hidden" aria-hidden />
        <span className="max-lg:sr-only">Nueva solicitud</span>
      </button>
      <nav aria-label="Secciones de la mesa de ayuda" className="mesa-nav">
        <NavLink to={RUTA_MESA} end>Dashboard</NavLink>
        <NavLink to={RUTA_SOLICITUDES}>
          Solicitudes
          {sinRespuesta > 0 && (
            <span className="mesa-cuenta">
              {sinRespuesta}
              <span className="sr-only"> sin respuesta en tu área</span>
            </span>
          )}
        </NavLink>
        {yo.data?.esAdmin && <NavLink to={RUTA_CONFIG}>Configuración</NavLink>}
      </nav>
    </header>
  )
}
