import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query"
import { taskApi } from "@/lib/taskApi"
import { useAuthStore } from "@/store/authStore"
import { useMyTeams } from "@/hooks/useTaskTeams"
import { countPendingForMe } from "@/lib/taskWork"
import type { Task, CreateTaskInput, UpdateTaskInput, ActivityLog, ListsGrouped } from "@/types/task"

export interface TaskListFilters {
  teamId?: number
  search?: string
  estado?: string
  etiqueta?: string
  plataforma?: string
  fechaDesde?: string
  fechaHasta?: string
  responsableId?: number
  subidoPorId?: number
  prioridad?: string
  soloSinAsignar?: boolean
  page?: number
  limit?: number
}

export interface TaskListResult {
  tasks: Task[]
  total: number
  page: number
  limit: number
}

// ─── List tasks ───────────────────────────────────────────────────────────────

export function useTasks(filters: TaskListFilters) {
  return useQuery<TaskListResult>({
    queryKey: ["tasks", filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.teamId) params.set("teamId", String(filters.teamId))
      if (filters.search) params.set("search", filters.search)
      if (filters.estado) params.set("estado", filters.estado)
      if (filters.etiqueta) params.set("etiqueta", filters.etiqueta)
      if (filters.plataforma) params.set("plataforma", filters.plataforma)
      if (filters.fechaDesde) params.set("fechaDesde", filters.fechaDesde)
      if (filters.fechaHasta) params.set("fechaHasta", filters.fechaHasta)
      if (filters.responsableId) params.set("responsableId", String(filters.responsableId))
      if (filters.subidoPorId) params.set("subidoPorId", String(filters.subidoPorId))
      if (filters.prioridad) params.set("prioridad", filters.prioridad)
      if (filters.soloSinAsignar) params.set("soloSinAsignar", "true")
      if (filters.page) params.set("page", String(filters.page))
      if (filters.limit) params.set("limit", String(filters.limit))

      const { data, headers } = await taskApi.get<Task[]>(`/api/tasks?${params}`)
      const total = Number(headers["x-total-count"] ?? data.length)
      const page = Number(headers["x-page"] ?? filters.page ?? 1)
      const limit = Number(headers["x-limit"] ?? filters.limit ?? 50)
      return { tasks: data, total, page, limit }
    },
    enabled:
      filters.teamId !== undefined ||
      filters.subidoPorId !== undefined ||
      filters.responsableId !== undefined,
  })
}

// ─── My work (cross-team personal inbox) ───────────────────────────────────────
// Sin teamId: el backend scopea a todos los equipos del usuario (getMemberTeamIds).
// El filtro responsableId hace OR: [{asignadoAId: me}, {asignadoAId: null, subidoPorId: me}].
// Query compartida (mismo queryKey) entre la vista "Mi trabajo" y el badge del sidebar.

export function useMyTasks() {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const query = useTasks({ responsableId: userId ?? undefined, limit: 200 })
  return { ...query, userId }
}

// Estados de cada equipo del usuario, para saber si una tarea ya terminó (estado final o cancelado).
// Lo comparten la vista "Mi trabajo" y el contador del menú: así nunca cuentan distinto.
export function useMyTaskLists() {
  const { data: teams = [] } = useMyTeams()
  const results = useQueries({
    queries: teams.map((t) => ({
      queryKey: ["taskLists", t.id],
      queryFn: async () => (await taskApi.get<ListsGrouped>(`/api/teams/${t.id}/lists`)).data,
    })),
  })
  const listsByTeam = new Map<number, ListsGrouped>()
  teams.forEach((t, i) => {
    const d = results[i]?.data
    if (d) listsByTeam.set(t.id, d)
  })
  const isDone = (t: Task) => {
    const c = listsByTeam.get(t.teamId)?.estado?.find((e) => e.value === t.estado)
    return !!(c?.isFinal || c?.isCanceled)
  }
  return { teams, listsByTeam, isDone }
}

/** Contador del menú: tareas asignadas a mí, sin aceptar y que siguen abiertas. */
export function useMyPendingCount(): number {
  const { data, userId } = useMyTasks()
  const { isDone } = useMyTaskLists()
  return countPendingForMe(data?.tasks ?? [], userId, isDone)
}

// ─── Single task ──────────────────────────────────────────────────────────────

export function useTask(taskId: number | null) {
  return useQuery<Task>({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const { data } = await taskApi.get<Task>(`/api/tasks/${taskId}`)
      return data
    },
    enabled: taskId !== null,
  })
}

// ─── Task history ─────────────────────────────────────────────────────────────

export function useTaskHistory(taskId: number | null) {
  return useQuery<ActivityLog[]>({
    queryKey: ["task", taskId, "history"],
    queryFn: async () => {
      const { data } = await taskApi.get<ActivityLog[]>(`/api/tasks/${taskId}/history`)
      return data
    },
    enabled: taskId !== null,
  })
}

// ─── Create task ──────────────────────────────────────────────────────────────

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const { data } = await taskApi.post<Task>("/api/tasks", input)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
  })
}

// ─── Update task ──────────────────────────────────────────────────────────────

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, input }: { taskId: number; input: UpdateTaskInput }) => {
      const { data } = await taskApi.patch<Task>(`/api/tasks/${taskId}`, input)
      return data
    },
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["tasks"] })
      qc.invalidateQueries({ queryKey: ["task", taskId] })
    },
  })
}

// ─── Delete task ──────────────────────────────────────────────────────────────

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (taskId: number) => {
      await taskApi.delete(`/api/tasks/${taskId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
  })
}

// ─── Accept/reject task ───────────────────────────────────────────────────────

export function useAcceptTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      taskId,
      aceptacion,
    }: {
      taskId: number
      aceptacion: "aceptada" | "rechazada"
    }) => {
      await taskApi.patch(`/api/tasks/${taskId}/accept`, { aceptacion })
    },
    onSuccess: (_data, { taskId, aceptacion }) => {
      // Parchea de inmediato cualquier lista en caché (Mi trabajo, Lista, Tablero)
      // para que el cambio se vea al instante, sin esperar el round-trip de red del
      // refetch — antes solo invalidaba y la UI tardaba en reflejar el aceptar/rechazar.
      qc.setQueriesData<TaskListResult>({ queryKey: ["tasks"] }, (old) => {
        if (!old) return old
        return {
          ...old,
          tasks: old.tasks.map((t) => (t.id === taskId ? { ...t, aceptacion } : t)),
        }
      })
      qc.invalidateQueries({ queryKey: ["tasks"] })
      qc.invalidateQueries({ queryKey: ["task", taskId] })
    },
  })
}
