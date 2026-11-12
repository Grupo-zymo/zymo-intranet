// Dashboard de la central: versión de escritorio (≥ 1024 px) o de teléfono según el ancho de la ventana.
// Los filtros viven en la URL, así que cambiar de una a otra no pierde nada.

import { useSyncExternalStore } from "react"
import type { CentralNivel } from "@/types/centralTickets"
import { CentralDashboardWeb } from "./CentralDashboardWeb"
import { CentralMovil } from "./CentralMovil"

const ESCRITORIO = "(min-width: 1024px)"

function useEscritorio(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(ESCRITORIO)
      mq.addEventListener("change", avisar)
      return () => mq.removeEventListener("change", avisar)
    },
    () => window.matchMedia(ESCRITORIO).matches,
    () => false,
  )
}

export function CentralDashboard(props: { nivel: CentralNivel; miCorreo: string }) {
  return useEscritorio() ? <CentralDashboardWeb {...props} /> : <CentralMovil {...props} />
}
