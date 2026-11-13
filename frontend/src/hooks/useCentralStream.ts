// Tiempo real de la Central: UN stream SSE por sesión (provider en la página de la Central) que mantiene fresca la
// caché de React Query. El stream solo AVISA; la verdad está en el servicio, así que ante cualquier duda se
// invalida y se vuelve a pedir. Contrato: docs/chat-tiempo-real/PLAN.md de la app de autogestión, (b), (e), (f).

import { createContext, createElement, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { App as CapacitorApp } from "@capacitor/app"
import { useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { urlRecurso } from "@/lib/entorno"
import { aMensaje, conMensaje, conMensajeEnItem } from "@/lib/centralChat"
import type { MensajeCable } from "@/lib/centralChat"
import { abrirStream } from "@/lib/sse"
import type { EstadoStream, EventoSse } from "@/lib/sse"
import { zymoallyApi } from "@/lib/zymoallyApi"
import { useAuthStore } from "@/store/authStore"
import type { CentralCasoDetalle, CentralListaRespuesta } from "@/types/centralTickets"

export type EventoCentral = { tipo: string; datos: Record<string, unknown> }
type Oyente = (e: EventoCentral) => void

interface Contexto {
  estado: EstadoStream
  /** `reconectado` (el stream volvió tras un corte) y `resync` además de los eventos del servicio. */
  suscribir: (cb: Oyente) => () => void
}

const SIN_PROVIDER: Contexto = { estado: "sin_stream", suscribir: () => () => {} }
const Ctx = createContext<Contexto>(SIN_PROVIDER)

/** Estado de la conexión en vivo («sin_stream» si no hay provider: la página sondea sola). */
export const useCentralEstadoStream = (): EstadoStream => useContext(Ctx).estado
export const useCentralSuscribir = (): Contexto["suscribir"] => useContext(Ctx).suscribir

// ─── Estado efímero (escribiendo / leído por el cliente) ────────────────────
// Va fuera de React Query porque no es dato del servicio: caduca solo. Un store mínimo con useSyncExternalStore.

const ESCRIBIENDO_MS = 5000
const escribiendo = new Map<string, string>()
const leidoCliente = new Map<string, number>()
const temporizadores = new Map<string, ReturnType<typeof setTimeout>>()
const avisar = new Set<() => void>()
const emitirCambio = () => avisar.forEach((f) => f())
const subscribirStore = (f: () => void) => {
  avisar.add(f)
  return () => void avisar.delete(f)
}

function marcarEscribiendo(radicado: string, nombre: string) {
  escribiendo.set(radicado, nombre)
  clearTimeout(temporizadores.get(radicado))
  temporizadores.set(
    radicado,
    setTimeout(() => {
      escribiendo.delete(radicado)
      temporizadores.delete(radicado)
      emitirCambio()
    }, ESCRIBIENDO_MS),
  )
  emitirCambio()
}

function limpiarEfimero() {
  temporizadores.forEach((t) => clearTimeout(t))
  temporizadores.clear()
  escribiendo.clear()
  leidoCliente.clear()
  emitirCambio()
}

/** Nombre de quien está escribiendo en ese caso (5 s sin repetirse y se apaga), o null. */
export function useCentralEscribiendo(radicado: string): string | null {
  return useSyncExternalStore(subscribirStore, () => escribiendo.get(radicado) ?? null)
}

/** Hasta qué mensaje leyó el cliente (para los ticks). 0 si no se sabe. */
export function useCentralLeidoCliente(radicado: string): number {
  return useSyncExternalStore(subscribirStore, () => leidoCliente.get(radicado) ?? 0)
}

/** El chat lo alimenta con `leidoOtroLadoHasta` de GET /mensajes. */
export function fijarLeidoCliente(radicado: string, hasta: number) {
  if (hasta > (leidoCliente.get(radicado) ?? 0)) {
    leidoCliente.set(radicado, hasta)
    emitirCambio()
  }
}

// ─── Parche de caché ─────────────────────────────────────────────────────────

const abierto = (qc: QueryClient, radicado: string) =>
  (qc.getQueryCache().find({ queryKey: ["central", "caso", radicado] })?.getObserversCount() ?? 0) > 0

function parchearLista(qc: QueryClient, radicado: string, cambiar: (item: CentralListaRespuesta["items"][number]) => CentralListaRespuesta["items"][number]) {
  qc.setQueriesData<CentralListaRespuesta>({ queryKey: ["central", "casos"] }, (lista) =>
    lista?.items ? { ...lista, items: lista.items.map((c) => (String(c.radicado) === radicado ? cambiar(c) : c)) } : lista,
  )
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "")

function enCache(qc: QueryClient, radicado: string, mensaje: MensajeCable): boolean {
  const m = aMensaje(mensaje)
  const vistoAbierto = abierto(qc, radicado)
  const detalle = qc.getQueryData<CentralCasoDetalle>(["central", "caso", radicado])
  if (detalle) qc.setQueryData<CentralCasoDetalle>(["central", "caso", radicado], conMensaje(detalle, m))
  parchearLista(qc, radicado, (c) => conMensajeEnItem(c, m, vistoAbierto))
  return detalle !== undefined
}

// ─── Provider ────────────────────────────────────────────────────────────────

function alVolverAPrimerPlano(cb: () => void): () => void {
  const visible = () => {
    if (document.visibilityState === "visible") cb()
  }
  document.addEventListener("visibilitychange", visible)
  let quitar: (() => void) | null = null
  let fuera = false
  try {
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) cb()
    }).then((h) => {
      if (fuera) void h.remove()
      else quitar = () => void h.remove()
    })
  } catch {
    /* sin plugin: queda visibilitychange */
  }
  return () => {
    fuera = true
    document.removeEventListener("visibilitychange", visible)
    quitar?.()
  }
}

export function CentralStreamProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [estadoLocal, setEstadoLocal] = useState<EstadoStream>("conectando")
  const oyentes = useMemo(() => new Set<Oyente>(), [])

  useEffect(() => {
    const base = (zymoallyApi.defaults.baseURL ?? "").replace(/\/$/, "")
    const miNombre = () => (useAuthStore.getState().user?.full_name ?? "").trim().toLowerCase()
    const difundir = (e: EventoCentral) => oyentes.forEach((f) => f(e))

    // Refresco de las consultas con tope de una cada 500 ms (la última petición siempre se atiende).
    let espera: ReturnType<typeof setTimeout> | null = null
    let pendiente: "nada" | "listas" | "todo" = "nada"
    const refrescar = (alcance: "listas" | "todo") => {
      if (espera) {
        if (alcance === "todo" || pendiente === "nada") pendiente = alcance
        return
      }
      if (alcance === "todo") void qc.invalidateQueries({ queryKey: ["central"] })
      else {
        void qc.invalidateQueries({ queryKey: ["central", "casos"] })
        void qc.invalidateQueries({ queryKey: ["central", "resumen"] })
      }
      espera = setTimeout(() => {
        espera = null
        const p = pendiente
        pendiente = "nada"
        if (p !== "nada") refrescar(p)
      }, 500)
    }

    let estuvoVivo = false
    const onEvento = (e: EventoSse) => {
      if (e.evento === "hello") return
      let datos: Record<string, unknown> = {}
      try {
        const v: unknown = JSON.parse(e.datos || "{}")
        if (v && typeof v === "object") datos = v as Record<string, unknown>
      } catch {
        return // dato ilegible: se descarta
      }
      const radicado = datos.radicado !== undefined ? String(datos.radicado) : ""
      difundir({ tipo: e.evento, datos })

      switch (e.evento) {
        case "mensaje.nuevo": {
          const m = datos.mensaje as MensajeCable | undefined
          refrescar(m && radicado && enCache(qc, radicado, m) ? "listas" : "todo")
          return
        }
        case "escribiendo": {
          const nombre = texto(datos.nombre)
          // El servicio puede devolverme mi propio aviso: no me muestro a mí mismo.
          if (radicado && nombre && !(datos.lado === "personal" && nombre.trim().toLowerCase() === miNombre())) marcarEscribiendo(radicado, nombre)
          return
        }
        case "mensaje.leido": {
          const hasta = Number(datos.hasta)
          if (radicado && Number.isFinite(hasta)) {
            if (datos.lado === "cliente") fijarLeidoCliente(radicado, hasta)
            else parchearLista(qc, radicado, (c) => (typeof c.noLeidos === "number" ? { ...c, noLeidos: 0 } : c))
          }
          refrescar("listas")
          return
        }
        default:
          // caso.actualizado, resync y lo que venga: se vuelve a pedir todo.
          refrescar("todo")
      }
    }

    const control = abrirStream({
      url: urlRecurso(`${base}/api/central-tickets/stream`),
      token: () => useAuthStore.getState().token,
      onEvento,
      onEstado: (s) => {
        setEstadoLocal(s)
        if (s === "en_vivo") {
          if (estuvoVivo) {
            // Volvió tras un corte: pudo perderse algo, así que se recupera todo desde el servicio.
            refrescar("todo")
            difundir({ tipo: "reconectado", datos: {} })
          }
          estuvoVivo = true
        }
      },
      onNoAutorizado: () => {
        // Misma salida que el interceptor 401 de lib/api.ts.
        useAuthStore.getState().clearAuth()
        window.location.href = "/login"
      },
      suscribirPrimerPlano: alVolverAPrimerPlano,
    })

    return () => {
      control.cerrar()
      if (espera) clearTimeout(espera)
      limpiarEfimero()
    }
  }, [qc, oyentes, setEstadoLocal])

  const valor = useMemo<Contexto>(
    () => ({
      estado: estadoLocal,
      suscribir: (cb) => {
        oyentes.add(cb)
        return () => void oyentes.delete(cb)
      },
    }),
    [estadoLocal, oyentes],
  )
  return createElement(Ctx.Provider, { value: valor }, children)
}
