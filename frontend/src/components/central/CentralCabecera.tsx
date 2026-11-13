// Cabecera compartida de las dos páginas de la central: volver a la intranet, título, selector
// «Dashboard | Chats» (con los casos que esperan respuesta) y botón de actualizar.

import { Link, NavLink } from "react-router-dom"
import { ArrowLeft, RefreshCw } from "lucide-react"
import { MesaCampana } from "@/components/layout/MesaCampana"
import { useCentralCasos } from "@/hooks/useCentralTickets"
import { FILTROS_VACIOS, consultaCasos, haceCuanto } from "@/lib/centralTickets"
import type { CentralNivel } from "@/types/centralTickets"
import { IndicadorConexion } from "./ChatPartes"
import "./central.css"

export const RUTA_DASHBOARD = "/servicio-cliente/central"
export const RUTA_CHATS = "/servicio-cliente/central/chats"

/** Todos los casos abiertos: bandeja de chats, pendientes del dashboard y contador de «esperan respuesta». */
export const CONSULTA_ABIERTOS = consultaCasos({ ...FILTROS_VACIOS, estado: "abierto" }, true)

export function CentralCabecera({
  nivel,
  esperan,
  actualizando,
  actualizadoEn,
  ahora,
  onActualizar,
}: {
  nivel: CentralNivel
  /** Casos abiertos donde el cliente escribió de último. */
  esperan: number
  actualizando: boolean
  actualizadoEn: number
  ahora: number
  onActualizar: () => void
}) {
  const director = nivel === "director"
  // Misma consulta que usan las páginas: React Query la comparte, no hay petición extra.
  const items = useCentralCasos(CONSULTA_ABIERTOS).data?.items
  const conContador = !!items?.some((c) => typeof c.noLeidos === "number")
  // Con el servicio nuevo el contador son los mensajes sin leer del cliente (la nota interna no cuenta); con el viejo, los casos que esperan.
  const pendientes = conContador ? (items ?? []).reduce((n, c) => n + (c.noLeidos ?? 0), 0) : esperan
  return (
    <header className="mx-auto flex w-full max-w-2xl flex-none flex-wrap items-center gap-x-3 gap-y-2.5 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] lg:max-w-none lg:flex-nowrap lg:gap-x-5 lg:px-6 lg:pb-4 lg:pt-6 xl:px-8">
      <Link to="/dashboard" className="ct-btn ct-btn-redondo" aria-label="Volver a la intranet">
        <ArrowLeft className="size-4" aria-hidden />
      </Link>
      <div className="order-2 min-w-0 basis-full lg:order-none lg:flex-1 lg:basis-auto">
        <h1 className="m-0 text-[24px] font-bold leading-tight tracking-[-0.02em] lg:truncate lg:text-[32px]">
          {director ? "Central de tickets" : "Mis casos asignados"}
        </h1>
        <p className="ct-muted m-0 truncate text-[13px] lg:text-[15px]">
          Servicio al cliente
          <IndicadorConexion className="ml-2 align-middle" />
          {actualizadoEn ? <span className="max-sm:hidden">{` · actualizado ${haceCuanto(new Date(actualizadoEn).toISOString(), ahora)}`}</span> : null}
        </p>
      </div>
      {/* Avisos de la mesa de ayuda: quien pasa el día en la central también tiene que verlos */}
      <div className="order-1 ml-auto flex items-center gap-2 lg:order-3 lg:ml-0 lg:gap-3">
        <MesaCampana />
        <button type="button" className="ct-btn ct-btn-redondo lg:!w-auto lg:!px-4" onClick={onActualizar} disabled={actualizando} aria-label="Actualizar ahora">
          <RefreshCw className={`size-4 ${actualizando ? "animate-spin" : ""}`} aria-hidden />
          <span className="max-lg:hidden">Actualizar</span>
        </button>
      </div>
      <nav aria-label="Secciones de la central" className="ct-segmento order-last w-full lg:order-2 lg:w-[340px]">
        <NavLink to={RUTA_DASHBOARD} end className="ct-seg-enlace">
          Dashboard
        </NavLink>
        <NavLink to={RUTA_CHATS} className="ct-seg-enlace">
          Chats
          {pendientes > 0 && (
            <span className="ct-mono ml-1.5 rounded-full bg-[var(--ct-red-solid)] px-2 text-xs font-medium text-white">
              {pendientes > 99 ? "99+" : pendientes}
              <span className="sr-only">
                {conContador ? (pendientes === 1 ? " mensaje sin leer" : " mensajes sin leer") : pendientes === 1 ? " espera respuesta" : " esperan respuesta"}
              </span>
            </span>
          )}
        </NavLink>
      </nav>
    </header>
  )
}
