import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { App } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import {
  cancelarDialogoSalida, cerrarDialogo, confirmarSalida, decidir, hayDialogoAbierto, hayOperacion,
  instalarSeguimiento, limpiarFormularios, mostrarAviso,
} from "@/lib/botonAtras"

/** Botón atrás de Android (solo en el APK). Montar una vez, dentro del Router. `esInicio` decide si la ruta actual es la pantalla de inicio. */
export function useBotonAtras(inicio: string, esInicio: (pathname: string) => boolean) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const ref = useRef({ pathname, inicio, esInicio, navigate })
  ref.current = { pathname, inicio, esInicio, navigate }

  useEffect(() => {
    limpiarFormularios() // cambiar de ruta descarta lo que quedó sin enviar en la anterior
  }, [pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    instalarSeguimiento()
    const escucha = App.addListener("backButton", () => {
      if (cancelarDialogoSalida()) return
      const { pathname: ruta, inicio: casa, esInicio: enCasa, navigate: ir } = ref.current
      if (document.querySelector("[data-bloqueo]")) { // pantalla de bloqueo biométrico: atrás solo ofrece salir
        void confirmarSalida().then((salir) => { if (salir) void App.exitApp() })
        return
      }
      const estaEnInicio = enCasa(ruta)
      const accion = decidir({ estaEnInicio, hayDialogo: hayDialogoAbierto(), hayOperacion: hayOperacion(estaEnInicio) })
      if (accion === "cerrar-dialogo") cerrarDialogo()
      else if (accion === "quedarse") mostrarAviso("Termina o cancela lo que estás haciendo")
      else if (accion === "ir-inicio") ir(casa, { replace: true })
      else void confirmarSalida().then((salir) => { if (salir) void App.exitApp() })
    })
    return () => {
      void escucha.then((h) => h.remove())
    }
  }, [])
}
