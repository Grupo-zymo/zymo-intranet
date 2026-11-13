import { useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { MesaBandeja } from "@/components/mesa/MesaBandeja"
import { MesaCabecera, RUTA_CONFIG, RUTA_SOLICITUDES } from "@/components/mesa/MesaCabecera"
import { MesaConfig } from "@/components/mesa/MesaConfig"
import { MesaDashboard } from "@/components/mesa/MesaDashboard"
import { MesaNueva } from "@/components/mesa/MesaNueva"
import { MesaTicket, MesaTicketVacio } from "@/components/mesa/MesaTicket"
import { useMesaYo } from "@/hooks/useMesa"

// Mesa de ayuda interna por áreas (docs/mesa-ayuda.md). Misma organización que la
// Central de tickets: pantalla completa, cabecera con selector y tres páginas:
//   /mesa-ayuda                 Dashboard
//   /mesa-ayuda/solicitudes     lista + conversación + gestión (?vista=, ?f=, ?ticket=)
//   /mesa-ayuda/configuracion   solo administración

function Solicitudes() {
  const [params, setParams] = useSearchParams()
  const ticketId = Number(params.get("ticket")) || null
  const cerrar = () => {
    const sig = new URLSearchParams(params)
    sig.delete("ticket")
    setParams(sig)
  }
  return (
    <main className="mesa-pagina" data-dos>
      <MesaBandeja ticketId={ticketId} />
      <div className="min-w-0 lg:min-h-0">
        {ticketId ? <MesaTicket key={ticketId} id={ticketId} onCerrar={cerrar} /> : <MesaTicketVacio />}
      </div>
    </main>
  )
}

export function MesaAyudaPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const yo = useMesaYo()
  const [nueva, setNueva] = useState(false)
  const seccion = pathname.startsWith(RUTA_SOLICITUDES) ? "solicitudes" : pathname.startsWith(RUTA_CONFIG) && yo.data?.esAdmin ? "config" : "dashboard"

  return (
    <div className="mesa mesa-web">
      <MesaCabecera onNueva={() => setNueva(true)} />
      {seccion === "solicitudes" ? (
        <Solicitudes />
      ) : seccion === "config" ? (
        <main className="mesa-pagina"><MesaConfig /></main>
      ) : (
        <MesaDashboard />
      )}
      <MesaNueva abierto={nueva} onCerrar={() => setNueva(false)} onCreado={(t) => { setNueva(false); navigate(`${RUTA_SOLICITUDES}?ticket=${t.id}`) }} />
    </div>
  )
}
