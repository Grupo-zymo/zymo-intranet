import { useCallback, useEffect, useState } from "react"
import { zymoallyApi } from "@/lib/zymoallyApi"

// Notificaciones del teléfono de la mesa de ayuda (Web Push). El aviso llega
// aunque la intranet esté cerrada; lo muestra el service worker (public/sw.js).

export type EstadoPush =
  | "no_disponible" // el navegador no lo soporta, o el servidor no tiene claves
  | "bloqueado"     // la persona negó el permiso en el navegador
  | "apagado"
  | "activo"

const soportado = typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window && "Notification" in window

/** La clave pública VAPID llega en base64url; el navegador la pide en bytes. */
function aBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  const crudo = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length))
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i)
  return bytes
}

export function useMesaPush() {
  const [estado, setEstado] = useState<EstadoPush>("no_disponible")
  const [clave, setClave] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!soportado) return
    let vivo = true
    ;(async () => {
      try {
        const { data } = await zymoallyApi.get<{ clave: string | null }>("/api/mesa/push")
        if (!vivo || !data.clave) return
        setClave(data.clave)
        if (Notification.permission === "denied") { setEstado("bloqueado"); return }
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        // El dispositivo ya estaba suscrito: se reafirma a nombre de quien tiene la sesión ahora.
        // Sin esto, en un equipo compartido seguirían llegando los avisos de la cuenta anterior.
        if (sub) await zymoallyApi.post("/api/mesa/push/suscripcion", sub.toJSON())
        if (vivo) setEstado(sub ? "activo" : "apagado")
      } catch {
        // sin servicio no hay push: se queda "no_disponible" y la campana sigue igual
      }
    })()
    return () => { vivo = false }
  }, [])

  const activar = useCallback(async () => {
    if (!clave) return
    setOcupado(true); setError("")
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== "granted") { setEstado(permiso === "denied" ? "bloqueado" : "apagado"); return }
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave) }))
      await zymoallyApi.post("/api/mesa/push/suscripcion", sub.toJSON())
      setEstado("activo")
    } catch {
      setError("No pudimos activar las notificaciones en este dispositivo. Intenta de nuevo.")
    } finally {
      setOcupado(false)
    }
  }, [clave])

  const desactivar = useCallback(async () => {
    setOcupado(true); setError("")
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await zymoallyApi.delete("/api/mesa/push/suscripcion", { data: { endpoint: sub.endpoint } })
        await sub.unsubscribe()
      }
      setEstado("apagado")
    } catch {
      setError("No pudimos desactivarlas. Intenta de nuevo.")
    } finally {
      setOcupado(false)
    }
  }, [])

  return { estado, ocupado, error, activar, desactivar }
}
