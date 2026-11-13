import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { useCentralEstadoStream } from "@/hooks/useCentralStream"
import { zymoallyApi } from "@/lib/zymoallyApi"
import { estadoDeError } from "@/lib/centralTickets"
import type {
  CentralAccion,
  CentralCasoDetalle,
  CentralLider,
  CentralListaRespuesta,
  CentralResumen,
} from "@/types/centralTickets"

const BASE = "/api/central-tickets"
const REFRESCO_MS = 30_000
/** Con el stream en vivo el sondeo es solo una red de seguridad. */
const REFRESCO_EN_VIVO_MS = 120_000

// El panel se refresca solo (cada 30 s, o cada 120 s si el stream está en vivo), pero únicamente con la pestaña
// a la vista. Si el servicio no está configurado o no responde (503/403) no se insiste en cada intervalo: se
// reintenta a mano.
function useVivo() {
  const enVivo = useCentralEstadoStream() === "en_vivo"
  return useMemo(
    () =>
      ({
        staleTime: 10_000,
        refetchInterval: (query: { state: { error: unknown } }) => {
          const estado = estadoDeError(query.state.error)
          return estado === 503 || estado === 403 ? false : enVivo ? REFRESCO_EN_VIVO_MS : REFRESCO_MS
        },
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        retry: false,
      }) as const,
    [enVivo],
  )
}

export function useCentralResumen() {
  const vivo = useVivo()
  return useQuery<CentralResumen>({
    queryKey: ["central", "resumen"],
    queryFn: async () => (await zymoallyApi.get<CentralResumen>(`${BASE}/resumen`)).data,
    ...vivo,
  })
}

export function useCentralCasos(consulta: Record<string, string | number>) {
  const vivo = useVivo()
  return useQuery<CentralListaRespuesta>({
    queryKey: ["central", "casos", consulta],
    queryFn: async () => (await zymoallyApi.get<CentralListaRespuesta>(`${BASE}/casos`, { params: consulta })).data,
    placeholderData: keepPreviousData,
    ...vivo,
  })
}

export function useCentralCaso(radicado: string | null) {
  const vivo = useVivo()
  return useQuery<CentralCasoDetalle>({
    queryKey: ["central", "caso", radicado],
    queryFn: async () =>
      (await zymoallyApi.get<CentralCasoDetalle>(`${BASE}/casos/${encodeURIComponent(radicado ?? "")}`)).data,
    enabled: radicado !== null,
    ...vivo,
  })
}

/** Personas a las que se puede asignar un caso. Solo dirección. */
export function useCentralLideres(activo: boolean) {
  return useQuery<CentralLider[]>({
    queryKey: ["central", "lideres"],
    queryFn: async () => (await zymoallyApi.get<CentralLider[]>(`${BASE}/lideres`)).data,
    enabled: activo,
    staleTime: 60_000,
    retry: false,
  })
}

async function ejecutar(accion: CentralAccion): Promise<void> {
  const caso = `${BASE}/casos/${encodeURIComponent(accion.radicado)}`
  switch (accion.tipo) {
    case "asumir":
      await zymoallyApi.post(`${caso}/asumir`, {})
      return
    case "asignar":
      await zymoallyApi.post(`${caso}/asignar`, { asignadoId: accion.asignadoId, ...(accion.nota ? { nota: accion.nota } : {}) })
      return
    case "liberar":
      await zymoallyApi.post(`${caso}/liberar`, accion.nota ? { nota: accion.nota } : {})
      return
    case "mensaje":
      await zymoallyApi.post(`${caso}/mensajes`, { texto: accion.texto, interno: accion.interno })
      return
    case "actualizar":
      await zymoallyApi.patch(caso, accion.cambios)
  }
}

/** Una sola mutación para todas las acciones: al terminar refresca lista, resumen y detalle. */
export function useCentralAccion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ejecutar,
    onSettled: () => qc.invalidateQueries({ queryKey: ["central"] }),
  })
}
