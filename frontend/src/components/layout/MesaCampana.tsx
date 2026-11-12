import { Bell } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { zymoallyApi } from "@/lib/zymoallyApi"
import { formatFechaRelativa } from "@/lib/dates"

interface Aviso {
  id: number
  ticketId: number
  tipo: string
  texto: string
  leidoEn: string | null
  createdAt: string
}

const CLAVE = ["mesa", "avisos"]

/**
 * Campana de avisos de la mesa de ayuda. Vive en la barra superior de la
 * intranet (no en la mesa) porque reemplaza al correo: tiene que verse desde
 * cualquier módulo. Se refresca cada 30 s con la pestaña a la vista.
 */
export function MesaCampana() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const avisos = useQuery<{ sinLeer: number; masSinLeer: number; items: Aviso[] }>({
    queryKey: CLAVE,
    queryFn: async () => (await zymoallyApi.get("/api/mesa/avisos")).data,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    retry: false,
  })
  const leer = useMutation({
    mutationFn: async (ids?: number[]) => (await zymoallyApi.post("/api/mesa/avisos/leer", ids ? { ids } : {})).data,
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  })

  // Si el servicio no responde, la campana no estorba: simplemente no aparece
  if (!avisos.data) return null
  const { sinLeer, masSinLeer, items } = avisos.data
  const etiqueta = sinLeer === 0 ? "Avisos" : `Avisos, ${sinLeer} sin leer`

  function abrir(a: Aviso) {
    if (!a.leidoEn) leer.mutate([a.id])
    navigate(`/mesa-ayuda/solicitudes?ticket=${a.ticketId}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-10 w-10 shrink-0" aria-label={etiqueta}>
          <Bell className="h-5 w-5" aria-hidden="true" />
          {sinLeer > 0 && (
            <span aria-hidden="true" className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground tabular-nums">
              {sinLeer > 99 ? "99+" : sinLeer}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      {/* Anuncia el cambio del contador sin mover el foco */}
      <span className="sr-only" role="status" aria-live="polite">{sinLeer > 0 ? `${sinLeer} avisos sin leer` : ""}</span>

      <DropdownMenuContent align="end" className="max-h-[85dvh] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Avisos</span>
          {sinLeer > 0 && (
            <button type="button" className="whitespace-nowrap text-xs font-medium text-primary underline-offset-2 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => leer.mutate(undefined)}>
              Marcar todo como leído
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin avisos. Cuando pase algo en tus tickets, aparecerá aquí.</p>
        ) : (
          items.map((a) => (
            <DropdownMenuItem key={a.id} className="flex cursor-pointer items-start gap-2 py-2.5" onSelect={() => abrir(a)}>
              <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.leidoEn ? "bg-transparent" : "bg-primary"}`} />
              <span className="min-w-0">
                <span className={`block text-sm leading-snug [overflow-wrap:anywhere] ${a.leidoEn ? "text-muted-foreground" : "font-medium text-foreground"}`}>
                  {a.texto}
                  {!a.leidoEn && <span className="sr-only"> (sin leer)</span>}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{formatFechaRelativa(a.createdAt)}</span>
              </span>
            </DropdownMenuItem>
          ))
        )}
        {/* La lista es corta a propósito: lo que no cabe se dice con un número y se ve en la bandeja */}
        {masSinLeer > 0 && (
          <p className="px-3 py-2 text-sm font-medium text-foreground">
            y {masSinLeer} {masSinLeer === 1 ? "aviso más" : "avisos más"} sin leer
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer justify-center py-2.5 text-sm font-medium text-primary" onSelect={() => navigate("/mesa-ayuda/solicitudes?vista=area")}>
          Ver la bandeja de la mesa de ayuda
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
