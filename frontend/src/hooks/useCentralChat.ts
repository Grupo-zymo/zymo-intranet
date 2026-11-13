// Chat de un caso en la Central: envío con clienteMsgId (idempotente), estados enviando|enviado|leido|error,
// reconciliación sin duplicados, catch-up por ?desde=, «leído» con debounce y «escribiendo» con tope.
// Los mensajes confirmados viven en la caché de React Query (["central","caso",radicado]); aquí solo se guardan
// los que aún no tienen respuesta del servicio. Contrato: docs/chat-tiempo-real/PLAN.md (b), (f).

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { fijarLeidoCliente, useCentralEscribiendo, useCentralLeidoCliente, useCentralSuscribir } from "@/hooks/useCentralStream"
import { aMensaje, conMensaje, fusionarMensajes, idMaximo } from "@/lib/centralChat"
import type { MensajeCable } from "@/lib/centralChat"
import { mensajeDeError } from "@/lib/centralTickets"
import { zymoallyApi } from "@/lib/zymoallyApi"
import type { CentralCasoDetalle, CentralListaRespuesta, CentralMensaje } from "@/types/centralTickets"

const BASE = "/api/central-tickets"
const LEIDO_DEBOUNCE_MS = 500
const ESCRIBIENDO_CADA_MS = 3000

export interface Pendiente {
  clienteMsgId: string
  texto: string
  interno: boolean
  creadoEn: string
  estado: "enviando" | "error"
  error?: string
}

const nuevoId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`

export function useCentralChat(radicado: string, caso: CentralCasoDetalle | undefined) {
  const qc = useQueryClient()
  const suscribir = useCentralSuscribir()
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const pendientesRef = useRef<Pendiente[]>([])
  pendientesRef.current = pendientes
  const clave = ["central", "caso", radicado] as const
  const escribiendo = useCentralEscribiendo(radicado)
  const leidoCliente = useCentralLeidoCliente(radicado)

  const mensajes: CentralMensaje[] = caso?.mensajes ?? []
  const idMax = idMaximo(mensajes)

  // ── Catch-up: GET /mensajes?desde=<último id>; trae también hasta dónde leyó el cliente.
  const alDia = useRef<() => void>(() => {})
  alDia.current = () => {
    if (!caso) return
    const desde = idMaximo(qc.getQueryData<CentralCasoDetalle>(clave)?.mensajes ?? caso.mensajes)
    zymoallyApi
      .get<{ mensajes?: MensajeCable[]; leidoOtroLadoHasta?: number }>(`${BASE}/casos/${encodeURIComponent(radicado)}/mensajes`, { params: { desde } })
      .then(({ data }) => {
        const nuevos = (data.mensajes ?? []).map(aMensaje)
        if (nuevos.length > 0) {
          qc.setQueryData<CentralCasoDetalle>(clave, (c) => (c ? { ...c, mensajes: fusionarMensajes(c.mensajes, nuevos) } : c))
        }
        if (typeof data.leidoOtroLadoHasta === "number") fijarLeidoCliente(radicado, data.leidoOtroLadoHasta)
      })
      .catch(() => {
        // Servicio viejo sin esta ruta, o sin red: el refresco normal cubre.
      })
  }
  const listo = caso !== undefined
  // Al abrir el caso, y al volver el stream tras un corte o un resync.
  useEffect(() => {
    if (listo) alDia.current()
  }, [listo, radicado])
  useEffect(
    () =>
      suscribir((e) => {
        if (e.tipo === "reconectado" || e.tipo === "resync") alDia.current()
      }),
    [suscribir],
  )
  // Dato que el detalle ya traiga (servicio nuevo).
  useEffect(() => {
    if (typeof caso?.leidoClienteHasta === "number") fijarLeidoCliente(radicado, caso.leidoClienteHasta)
  }, [caso?.leidoClienteHasta, radicado])

  // Si la pestaña estaba oculta cuando llegó el mensaje, se marca al volver a verla (el efecto depende de visible).
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const f = () => setVisible(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", f)
    return () => document.removeEventListener("visibilitychange", f)
  }, [])

  // ── Leído: POST /leido con debounce; solo cuando el caso está a la vista y hay algo nuevo.
  const leidoEnviado = useRef(0)
  useEffect(() => {
    if (!listo || !visible || idMax <= leidoEnviado.current) return
    const t = setTimeout(() => {
      leidoEnviado.current = idMax
      // La bandeja baja el contador al instante; el servicio lo confirma al refrescar.
      qc.setQueriesData<CentralListaRespuesta>({ queryKey: ["central", "casos"] }, (l) =>
        l?.items
          ? { ...l, items: l.items.map((c) => (String(c.radicado) === radicado && typeof c.noLeidos === "number" ? { ...c, noLeidos: 0 } : c)) }
          : l,
      )
      zymoallyApi.post(`${BASE}/casos/${encodeURIComponent(radicado)}/leido`, { hasta: idMax }).catch(() => {
        leidoEnviado.current = 0 // que se reintente con el próximo mensaje o al volver a primer plano
      })
    }, LEIDO_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [listo, visible, idMax, radicado, qc])
  // ── Escribiendo: máx. 1 aviso cada 3 s.
  const ultimoAviso = useRef(0)
  const avisarEscribiendo = useCallback(
    (interno: boolean) => {
      const ahora = Date.now()
      if (ahora - ultimoAviso.current < ESCRIBIENDO_CADA_MS) return
      ultimoAviso.current = ahora
      zymoallyApi.post(`${BASE}/casos/${encodeURIComponent(radicado)}/escribiendo`, { interno }).catch(() => {})
    },
    [radicado],
  )

  // ── Envío
  const transmitir = useCallback(
    async (p: Pendiente) => {
      setPendientes((l) => l.map((x) => (x.clienteMsgId === p.clienteMsgId ? { ...x, estado: "enviando", error: undefined } : x)))
      const quitar = () => setPendientes((l) => l.filter((x) => x.clienteMsgId !== p.clienteMsgId))
      try {
        const { data } = await zymoallyApi.post<{ ok?: boolean; mensaje?: MensajeCable }>(`${BASE}/casos/${encodeURIComponent(radicado)}/mensajes`, {
          texto: p.texto,
          interno: p.interno,
          clienteMsgId: p.clienteMsgId,
        })
        if (data?.mensaje) {
          const m = aMensaje({ ...data.mensaje, clienteMsgId: data.mensaje.clienteMsgId ?? p.clienteMsgId })
          qc.setQueryData<CentralCasoDetalle>(clave, (c) => (c ? conMensaje(c, m) : c))
        } else {
          // Relay viejo: confirmó pero no devolvió el mensaje; se vuelve a pedir el caso.
          await qc.refetchQueries({ queryKey: clave })
        }
        quitar()
        void qc.invalidateQueries({ queryKey: ["central", "casos"] })
        void qc.invalidateQueries({ queryKey: ["central", "resumen"] })
      } catch (err) {
        setPendientes((l) => l.map((x) => (x.clienteMsgId === p.clienteMsgId ? { ...x, estado: "error", error: mensajeDeError(err, "No se pudo enviar.") } : x)))
      }
    },
    // clave cambia de identidad en cada render pero depende solo de radicado
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, radicado],
  )

  const enviar = useCallback(
    (texto: string, interno: boolean) => {
      const p: Pendiente = { clienteMsgId: nuevoId(), texto, interno, creadoEn: new Date().toISOString(), estado: "enviando" }
      setPendientes((l) => [...l, p])
      void transmitir(p)
    },
    [transmitir],
  )

  const reintentar = useCallback(
    (clienteMsgId: string) => {
      // Mismo clienteMsgId: si el primer intento sí llegó, el servicio devuelve ese mismo mensaje y no lo duplica.
      const p = pendientesRef.current.find((x) => x.clienteMsgId === clienteMsgId)
      if (p) void transmitir(p)
    },
    [transmitir],
  )
  const descartar = useCallback((clienteMsgId: string) => setPendientes((l) => l.filter((x) => x.clienteMsgId !== clienteMsgId)), [])

  // Un pendiente cuyo mensaje ya llegó por el stream (mismo clienteMsgId) deja de ser pendiente.
  const confirmados = new Set(mensajes.map((m) => m.clienteMsgId).filter((x): x is string => !!x))
  const visibles = pendientes.filter((p) => !confirmados.has(p.clienteMsgId))

  return { mensajes, pendientes: visibles, enviar, reintentar, descartar, avisarEscribiendo, escribiendo, leidoCliente, idMax }
}
