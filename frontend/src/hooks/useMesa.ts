import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { zymoallyApi } from "@/lib/zymoallyApi"
import type { MesaArea, MesaDetalle, MesaEnlazado, MesaLista, MesaPanorama, MesaPersona, MesaResumen, MesaTableroDatos, MesaTicket, MesaVista, MesaYo } from "@/types/mesa"

const BASE = "/api/mesa"

// La bandeja se refresca sola cada 30 s, solo con la pestaña a la vista.
const vivo = { staleTime: 10_000, refetchInterval: 30_000, refetchIntervalInBackground: false, retry: false } as const

export function useMesaAreas() {
  return useQuery<MesaArea[]>({
    queryKey: ["mesa", "areas"],
    queryFn: async () => (await zymoallyApi.get<MesaArea[]>(`${BASE}/areas`)).data,
    staleTime: 5 * 60_000,
  })
}

export function useMesaYo() {
  return useQuery<MesaYo>({
    queryKey: ["mesa", "yo"],
    queryFn: async () => (await zymoallyApi.get<MesaYo>(`${BASE}/yo`)).data,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** Tickets internos que nacieron de un caso de la Central (solo los que esta persona puede ver). */
export function useMesaPorRadicado(radicado: string | null) {
  return useQuery<MesaEnlazado[]>({
    queryKey: ["mesa", "radicado", radicado],
    queryFn: async () => (await zymoallyApi.get<MesaEnlazado[]>(`${BASE}/por-radicado/${encodeURIComponent(radicado ?? "")}`)).data,
    enabled: radicado !== null,
    ...vivo,
  })
}

export function useMesaTickets(consulta: Record<string, string | number>) {
  return useQuery<MesaLista>({
    queryKey: ["mesa", "tickets", consulta],
    queryFn: async () => (await zymoallyApi.get<MesaLista>(`${BASE}/tickets`, { params: consulta })).data,
    placeholderData: keepPreviousData,
    ...vivo,
  })
}

export function useMesaResumen(vista: MesaVista, areaId?: number) {
  return useQuery<MesaResumen>({
    queryKey: ["mesa", "resumen", vista, areaId ?? null],
    queryFn: async () => (await zymoallyApi.get<MesaResumen>(`${BASE}/resumen`, { params: areaId ? { vista, areaId } : { vista } })).data,
    ...vivo,
  })
}

/** Cuántos tickets llegaron y se cerraron cada día (para la gráfica del dashboard). */
export function useMesaSerie(vista: MesaVista, dias: number) {
  return useQuery<{ fecha: string; llegaron: number; cerrados: number }[]>({
    queryKey: ["mesa", "serie", vista, dias],
    queryFn: async () => (await zymoallyApi.get(`${BASE}/serie`, { params: { vista, dias } })).data,
    placeholderData: keepPreviousData,
    ...vivo,
  })
}

export function useMesaTicket(id: number | null) {
  return useQuery<MesaDetalle>({
    queryKey: ["mesa", "ticket", id],
    queryFn: async () => (await zymoallyApi.get<MesaDetalle>(`${BASE}/tickets/${id}`)).data,
    enabled: id !== null,
    ...vivo,
  })
}

// ── Administración ──

export function useMesaPanorama() {
  return useQuery<MesaPanorama>({
    queryKey: ["mesa", "panorama"],
    queryFn: async () => (await zymoallyApi.get<MesaPanorama>(`${BASE}/panorama`)).data,
    ...vivo,
  })
}

export function useMesaTablero(areaId: number | null, dias: number) {
  return useQuery<MesaTableroDatos>({
    queryKey: ["mesa", "tablero", areaId, dias],
    queryFn: async () => (await zymoallyApi.get<MesaTableroDatos>(`${BASE}/areas/${areaId}/tablero`, { params: { dias } })).data,
    enabled: areaId !== null,
    placeholderData: keepPreviousData,
    ...vivo,
  })
}

/** Áreas de la mesa con sus categorías inactivas: todas para el admin; para el líder, las de sus áreas. */
export function useMesaAreasTodas() {
  return useQuery<MesaArea[]>({
    queryKey: ["mesa", "areas", "todas"],
    queryFn: async () => (await zymoallyApi.get<MesaArea[]>(`${BASE}/areas`, { params: { todas: "true" } })).data,
  })
}

/** Áreas del panel de administración de la intranet (las que se pueden activar en la mesa). */
export function useMesaAreasPanel() {
  return useQuery<{ id: number; name: string }[]>({
    queryKey: ["mesa", "areas-panel"],
    queryFn: async () => (await zymoallyApi.get<{ id: number; name: string }[]>(`${BASE}/areas-panel`)).data,
    staleTime: 5 * 60_000,
  })
}

export type MesaAjuste =
  | { tipo: "area"; areaId: number; prefijo: string; recibeTickets: boolean; esSac: boolean }
  | { tipo: "categoria-nueva"; areaId: number; nombre: string }
  | { tipo: "categoria"; id: number; cambios: { nombre?: string; activa?: boolean } }
  | { tipo: "metas"; areaId: number; metaPrimeraRespuestaH: number | null; metaCierreH: number | null }

export function useMesaAjuste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: MesaAjuste) => {
      if (a.tipo === "area") return (await zymoallyApi.put(`${BASE}/areas/${a.areaId}`, { prefijo: a.prefijo, recibeTickets: a.recibeTickets, esSac: a.esSac })).data
      if (a.tipo === "metas") return (await zymoallyApi.put(`${BASE}/areas/${a.areaId}/metas`, { metaPrimeraRespuestaH: a.metaPrimeraRespuestaH, metaCierreH: a.metaCierreH })).data
      if (a.tipo === "categoria-nueva") return (await zymoallyApi.post(`${BASE}/areas/${a.areaId}/categorias`, { nombre: a.nombre })).data
      return (await zymoallyApi.patch(`${BASE}/categorias/${a.id}`, a.cambios)).data
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["mesa"] }),
  })
}

/** Personas asignables: el equipo del área, o todas las cuentas (`areaId` null, solo SAC y admin). */
export function useMesaPersonas(areaId: number | null, activo: boolean) {
  return useQuery<MesaPersona[]>({
    queryKey: ["mesa", "personas", areaId],
    queryFn: async () => (await zymoallyApi.get<MesaPersona[]>(`${BASE}/usuarios`, { params: areaId === null ? {} : { areaId } })).data,
    enabled: activo,
    staleTime: 60_000,
  })
}

export type MesaOrden =
  | { tipo: "crear"; datos: FormData }
  | { tipo: "mensaje"; id: number; datos: FormData }
  | { tipo: "actualizar"; id: number; cambios: { estado?: string; categoriaId?: number | null; prioridad?: string | null } }
  | { tipo: "asignar"; id: number; userId: number }
  | { tipo: "desasignar"; id: number; userId: number }
  | { tipo: "redirigir"; id: number; areaId: number; nota?: string; responsableId?: number }
  | { tipo: "eliminar"; id: number; motivo: string }

async function ejecutar(o: MesaOrden): Promise<unknown> {
  switch (o.tipo) {
    case "crear": return (await zymoallyApi.post<MesaTicket>(`${BASE}/tickets`, o.datos)).data
    case "mensaje": return (await zymoallyApi.post(`${BASE}/tickets/${o.id}/mensajes`, o.datos)).data
    case "actualizar": return (await zymoallyApi.patch(`${BASE}/tickets/${o.id}`, o.cambios)).data
    case "asignar": return (await zymoallyApi.post(`${BASE}/tickets/${o.id}/responsables`, { userId: o.userId })).data
    case "desasignar": return (await zymoallyApi.delete(`${BASE}/tickets/${o.id}/responsables/${o.userId}`)).data
    case "redirigir": return (await zymoallyApi.post(`${BASE}/tickets/${o.id}/redirigir`, { areaId: o.areaId, nota: o.nota || undefined, responsableId: o.responsableId })).data
    case "eliminar": return (await zymoallyApi.delete(`${BASE}/tickets/${o.id}`, { data: { motivo: o.motivo } })).data
  }
}

/** Una sola mutación para todas las acciones: al terminar se refresca todo lo de la mesa. */
export function useMesaAccion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ejecutar,
    onSettled: () => qc.invalidateQueries({ queryKey: ["mesa"] }),
  })
}

/** Descarga un adjunto con la sesión (no tiene URL pública). */
export async function descargarEvidencia(id: number, nombre: string): Promise<void> {
  const { data } = await zymoallyApi.get(`${BASE}/evidencias/${id}`, { responseType: "blob" })
  const url = URL.createObjectURL(data as Blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
