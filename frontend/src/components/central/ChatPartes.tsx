// Piezas visuales del chat de la Central: separador de día, divisor «Mensajes nuevos», «escribiendo», estado de
// envío (reloj / un tick / dos ticks / error) e indicador de conexión.

import { AlertCircle, Check, CheckCheck, Clock, WifiOff } from "lucide-react"
import { useCentralEstadoStream } from "@/hooks/useCentralStream"

export function SeparadorDia({ texto }: { texto: string }) {
  return (
    <li className="ct-divisor ct-divisor-dia" aria-label={texto}>
      <span className="capitalize">{texto}</span>
    </li>
  )
}

export function DivisorNuevos() {
  return (
    <li className="ct-divisor" role="separator" aria-label="Mensajes nuevos">
      <span>Mensajes nuevos</span>
    </li>
  )
}

export function Escribiendo({ nombre }: { nombre: string | null }) {
  // La región vive siempre en el DOM para que el lector de pantalla anuncie el cambio.
  return (
    <div role="status" aria-live="polite" className="min-h-6 px-1 pt-2">
      {nombre && (
        <p className="ct-muted m-0 flex items-center gap-2 text-[13px]">
          <span className="ct-puntos" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {nombre} está escribiendo…
        </p>
      )}
    </div>
  )
}

export type EstadoEnvio = "enviando" | "enviado" | "leido" | "error"

export function EstadoEnvioIcono({ estado }: { estado: EstadoEnvio }) {
  switch (estado) {
    case "enviando":
      return (
        <span className="inline-flex items-center gap-1 text-[color:var(--ct-faint)]">
          <Clock className="size-3 ct-latido" aria-hidden />
          <span className="sr-only">Enviando</span>
        </span>
      )
    case "enviado":
      return (
        <span className="inline-flex items-center text-[color:var(--ct-faint)]">
          <Check className="size-3.5" aria-hidden />
          <span className="sr-only">Enviado</span>
        </span>
      )
    case "leido":
      return (
        <span className="inline-flex items-center text-[color:var(--ct-blue)]">
          <CheckCheck className="size-3.5" aria-hidden />
          <span className="sr-only">Leído por el cliente</span>
        </span>
      )
    case "error":
      return (
        <span className="inline-flex items-center text-[color:var(--ct-red)]">
          <AlertCircle className="size-3.5" aria-hidden />
          <span className="sr-only">No se envió</span>
        </span>
      )
  }
}

/** «Reconectando…» o «Actualizando cada 30 s»; en vivo (o conectando) no muestra nada. */
export function IndicadorConexion({ className = "" }: { className?: string }) {
  const estado = useCentralEstadoStream()
  const texto = estado === "reconectando" ? "Reconectando…" : estado === "sin_stream" ? "Actualizando cada 30 s" : null
  return (
    <span role="status" aria-live="polite" className={className}>
      {texto && (
        <span className="ct-aviso-conexion">
          <WifiOff className="size-3" aria-hidden />
          {texto}
        </span>
      )}
    </span>
  )
}
