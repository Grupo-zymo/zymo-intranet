import { useState } from "react"
import { Link } from "react-router-dom"
import { MesaNueva } from "@/components/mesa/MesaNueva"
import { useMesaPorRadicado, useMesaYo } from "@/hooks/useMesa"
import { ESTADO_TEXTO } from "@/lib/mesa"
import type { CentralCasoDetalle } from "@/types/centralTickets"

/**
 * Puente entre un caso de cliente y la mesa de ayuda interna: lista los tickets
 * internos que nacieron de este caso y, a Servicio al Cliente, le deja pedir
 * apoyo a otra área. El cliente nunca ve estos tickets.
 */
export function CentralApoyoInterno({ caso }: { caso: CentralCasoDetalle }) {
  const radicado = String(caso.radicado)
  const yo = useMesaYo()
  const enlazados = useMesaPorRadicado(radicado)
  const [abierto, setAbierto] = useState(false)
  const puedePedir = (yo.data?.esSac || yo.data?.esAdmin) && caso.estado !== "cerrado"
  const lista = enlazados.data ?? []

  // Sin tickets y sin poder crearlos, el bloque no aporta nada
  if (!puedePedir && lista.length === 0) return null

  const empresa = caso.cliente.empresa ? ` (${caso.cliente.empresa})` : ""
  return (
    // Misma tarjeta que el resto de la gestión del caso (Tarjeta en CentralDetalle)
    <section aria-labelledby="ct-apoyo" className="ct-card p-5">
      <h3 id="ct-apoyo" className="m-0 text-[15px] font-bold">Apoyo de otras áreas</h3>
      {lista.length === 0 ? (
        <p className="ct-muted m-0 mt-3 text-[13px]">Si este caso necesita a otra área, pídele apoyo con un ticket interno. El cliente no lo ve.</p>
      ) : (
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
          {lista.map((t) => (
            <li key={t.id} className="text-[13px]">
              <Link to={`/mesa-ayuda/solicitudes?ticket=${t.id}`} className="font-semibold underline underline-offset-2" translate="no">{t.codigo}</Link>
              <span className="ct-muted"> {t.areaNombre}, {ESTADO_TEXTO[t.estado].toLowerCase()}</span>
            </li>
          ))}
        </ul>
      )}
      {puedePedir && (
        <button type="button" className="ct-btn mt-3 !min-h-[48px] w-full" onClick={() => setAbierto(true)}>Pedir apoyo a otra área…</button>
      )}
      {abierto && (
        <MesaNueva
          abierto
          onCerrar={() => setAbierto(false)}
          onCreado={() => setAbierto(false)}
          inicial={{
            radicadoOrigen: radicado,
            asunto: caso.asunto.slice(0, 160),
            descripcion: `Caso ${radicado} de ${caso.cliente.nombre}${empresa}.\n\n${caso.descripcion}`.slice(0, 8000),
          }}
        />
      )}
    </section>
  )
}
