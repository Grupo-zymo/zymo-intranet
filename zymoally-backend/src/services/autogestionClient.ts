// Cliente HTTP de la API de la app de autogestión del cliente (`/api/central`),
// servidor a servidor con X-Service-Key.
//
// Reglas de seguridad de este archivo:
//   - Nunca se llama sin URL y clave configuradas (503).
//   - La clave no se loguea ni viaja en ningún mensaje de error.
//   - No se loguean los cuerpos (traen texto de clientes): solo método, ruta y estado.
//   - Un 401/403/429 del servicio es un problema NUESTRO de configuración, no del
//     usuario: se responde un 502 genérico sin detalles.

import { env } from "../config/env"

export const ERROR_NO_CONFIGURADA = "La central de tickets no está configurada"
export const ERROR_SERVICIO = "No pudimos hablar con el servicio de casos"

/** Error con el estado HTTP y el texto que debe ver el usuario de la intranet. */
export class CentralError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "CentralError"
  }
}

export interface ConfigAutogestion {
  baseUrl: string
  serviceKey: string
  timeoutMs?: number
}

export type Consulta = Record<string, string | number | boolean | undefined | null>

export interface RespuestaAutogestion<T> {
  status: number
  data: T
}

// Estados del servicio cuyo texto SÍ es para el usuario (regla de negocio o dato no encontrado).
const ESTADOS_DE_NEGOCIO = new Set([400, 404, 409, 422])
const TEXTO_POR_DEFECTO: Record<number, string> = {
  400: "La solicitud no es válida",
  404: "No encontramos ese caso",
  409: "No se puede hacer esa acción en el estado actual del caso",
  422: "La solicitud no es válida",
}

function textoDeError(cuerpo: unknown, status: number, serviceKey: string): string {
  const crudo =
    cuerpo && typeof cuerpo === "object" && typeof (cuerpo as { error?: unknown }).error === "string"
      ? ((cuerpo as { error: string }).error).trim()
      : ""
  // Defensa extra: si por lo que sea el servicio devolviera la clave en el texto, no se propaga.
  if (!crudo || crudo.includes(serviceKey)) return TEXTO_POR_DEFECTO[status]
  return crudo.slice(0, 300)
}

export function crearClienteAutogestion(config: ConfigAutogestion) {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "")
  const serviceKey = config.serviceKey.trim()
  const timeoutMs = config.timeoutMs ?? 15_000

  async function pedir<T>(method: string, ruta: string, opciones: { query?: Consulta; body?: unknown } = {}): Promise<RespuestaAutogestion<T>> {
    if (!baseUrl || !serviceKey) throw new CentralError(503, ERROR_NO_CONFIGURADA)

    const url = new URL(`${baseUrl}/api/central${ruta}`)
    for (const [clave, valor] of Object.entries(opciones.query ?? {})) {
      if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(clave, String(valor))
    }

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: {
          "X-Service-Key": serviceKey,
          Accept: "application/json",
          ...(opciones.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      // Solo el nombre del error (TimeoutError, TypeError…): el mensaje podría traer la URL completa.
      console.error(`[central] sin respuesta del servicio de casos: ${method} ${ruta} (${err instanceof Error ? err.name : "error"})`)
      throw new CentralError(502, ERROR_SERVICIO)
    }

    const cuerpo: unknown = await res.json().catch(() => null)
    if (res.ok) return { status: res.status, data: cuerpo as T }

    if (ESTADOS_DE_NEGOCIO.has(res.status)) {
      throw new CentralError(res.status, textoDeError(cuerpo, res.status, serviceKey))
    }
    console.error(`[central] el servicio de casos respondió ${res.status}: ${method} ${ruta}`)
    throw new CentralError(502, ERROR_SERVICIO)
  }

  return {
    get: <T>(ruta: string, query?: Consulta) => pedir<T>("GET", ruta, { query }),
    post: <T>(ruta: string, body: unknown) => pedir<T>("POST", ruta, { body }),
    patch: <T>(ruta: string, body: unknown) => pedir<T>("PATCH", ruta, { body }),
  }
}

export type ClienteAutogestion = ReturnType<typeof crearClienteAutogestion>

/** Cliente real, con la configuración del entorno. */
export const autogestion: ClienteAutogestion = crearClienteAutogestion({
  baseUrl: env.AUTOGESTION_API_URL,
  serviceKey: env.AUTOGESTION_SERVICE_KEY,
})
