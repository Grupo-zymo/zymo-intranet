import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query"
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

// El panel se refresca solo cada 30 s, pero únicamente con la pestaña a la
// vista. Si el servicio no está configurado o no responde (503/502) no se
// insiste en cada intervalo: se reintenta a mano.
const vivo = {
  staleTime: 10_000,
  refetchInterval: (query: { state: { error: unknown } }) => {
    const estado = estadoDeError(query.state.error)
    return estado === 503 || estado === 403 ? false : REFRESCO_MS
  },
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  retry: false,
} as const

export function useCentralResumen() {
  return useQuery<CentralResumen>({
    queryKey: ["central", "resumen"],
    queryFn: async () => (await zymoallyApi.get<CentralResumen>(`${BASE}/resumen`)).data,
    ...vivo,
  })
}

export function useCentralCasos(consulta: Record<string, string | number>) {
  return useQuery<CentralListaRespuesta>({
    queryKey: ["central", "casos", consulta],
    queryFn: async () => (await zymoallyApi.get<CentralListaRespuesta>(`${BASE}/casos`, { params: consulta })).data,
    placeholderData: keepPreviousData,
    ...vivo,
  })
}

export function useCentralCaso(radicado: string | null) {
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
