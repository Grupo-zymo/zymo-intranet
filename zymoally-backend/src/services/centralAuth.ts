// Central de tickets — decisiones de autorización, sin Express ni red, para
// poder probarlas una por una (ver central.selfcheck.ts).
//
// Dos niveles, siempre por PERMISO (nunca por nombre de persona):
//   director → mod_tickets_central (o admin): ve todo, asume, asigna, clasifica, cierra.
//   lider    → mod_tickets_central_lider: solo los casos asignados a su correo;
//              responde y marca en análisis / resuelto. Nada más.

export const PERM_CENTRAL = "mod_tickets_central"
export const PERM_CENTRAL_LIDER = "mod_tickets_central_lider"

export type NivelCentral = "director" | "lider"

export interface AccesoCentral {
  nivel: NivelCentral
  esAdmin: boolean
  /** Correo del usuario, siempre en minúsculas. */
  email: string
}

export type AccionCentral =
  | "listar"
  | "resumen"
  | "ver"
  | "lideres"
  | "asumir"
  | "asignar"
  | "liberar"
  | "mensaje"
  | "actualizar"

export interface CambiosCaso {
  severidad?: string
  area?: string
  estado?: string
}

export type Decision = { ok: true } | { ok: false; status: 403 | 404; error: string }

const PERMITIDO: Decision = { ok: true }
const NO_ENCONTRADO: Decision = { ok: false, status: 404, error: "No encontramos ese caso" }
const prohibido = (error: string): Decision => ({ ok: false, status: 403, error })

/** Los correos se comparan SIEMPRE así: sin espacios y en minúsculas. */
export function normalizarCorreo(valor: unknown): string {
  return typeof valor === "string" ? valor.trim().toLowerCase() : ""
}

interface UsuarioToken {
  role?: string
  app_permissions?: string[]
  email?: string
}

/** Nivel del usuario en la central, o null si no tiene acceso (o su sesión no trae correo). */
export function resolverAcceso(user: UsuarioToken | undefined): AccesoCentral | null {
  if (!user) return null
  const email = normalizarCorreo(user.email)
  if (!email.includes("@")) return null // sin correo no se puede firmar una acción ni filtrar "mis casos"
  const permisos = Array.isArray(user.app_permissions) ? user.app_permissions : []
  const esAdmin = user.role === "admin"
  if (esAdmin || permisos.includes(PERM_CENTRAL)) return { nivel: "director", esAdmin, email }
  if (permisos.includes(PERM_CENTRAL_LIDER)) return { nivel: "lider", esAdmin: false, email }
  return null
}

/** ¿El caso está asignado a este correo? */
export function esCasoPropio(acceso: AccesoCentral, asignadoEmail: string | null | undefined): boolean {
  return normalizarCorreo(asignadoEmail) === acceso.email
}

/**
 * Decide si `acceso` puede ejecutar `accion`.
 * - Para "ver", "mensaje" y "actualizar" el líder necesita el correo del
 *   responsable actual del caso (`asignadoEmail`); si el caso no es suyo se
 *   responde 404 para no revelar que existe.
 * - Para "actualizar", `cambios` es lo que quiere modificar.
 */
export function decidirAccion(
  acceso: AccesoCentral,
  accion: AccionCentral,
  asignadoEmail?: string | null,
  cambios?: CambiosCaso,
): Decision {
  if (acceso.nivel === "director") return PERMITIDO

  switch (accion) {
    case "listar":
    case "resumen":
      return PERMITIDO // el alcance se recorta aparte (filtrosParaNivel / resumenDeCasos)
    case "lideres":
    case "asumir":
    case "asignar":
    case "liberar":
      return prohibido("Solo la dirección de la central puede asumir, asignar o liberar casos")
    case "ver":
    case "mensaje":
      return esCasoPropio(acceso, asignadoEmail) ? PERMITIDO : NO_ENCONTRADO
    case "actualizar": {
      if (!esCasoPropio(acceso, asignadoEmail)) return NO_ENCONTRADO
      if (cambios?.severidad !== undefined || cambios?.area !== undefined) {
        return prohibido("Solo la dirección de la central puede cambiar la severidad o el área")
      }
      if (cambios?.estado !== "en_analisis" && cambios?.estado !== "resuelto") {
        return prohibido("Solo puedes marcar el caso en análisis o resuelto")
      }
      return PERMITIDO
    }
  }
}

/**
 * Filtros que de verdad se envían al servicio de casos.
 * - Líder: `asignado` SIEMPRE es su correo, sin importar lo que haya pedido.
 * - Director: `asignado=mios` se traduce a su correo.
 */
export function filtrosParaNivel<T extends { asignado?: string }>(acceso: AccesoCentral, filtros: T): T {
  if (acceso.nivel === "lider") return { ...filtros, asignado: acceso.email }
  if (filtros.asignado === undefined) return filtros
  const pedido = normalizarCorreo(filtros.asignado)
  if (pedido === "mios") return { ...filtros, asignado: acceso.email }
  return { ...filtros, asignado: pedido }
}

export interface PersonaAsignable {
  id: number
  nombre: string
  email: string
}

/**
 * A quién se le puede asignar un caso: a alguien de la lista de líderes de
 * operaciones. Un admin puede además asignar a cualquier cuenta activa
 * (`otrasCuentas`). Devuelve la persona con los datos del servidor: nunca se
 * confía en el nombre o el correo que mande el navegador.
 */
export function resolverAsignado(
  acceso: AccesoCentral,
  asignadoId: number,
  lideres: PersonaAsignable[],
  otrasCuentas: PersonaAsignable[] = [],
): PersonaAsignable | null {
  const limpio = (p: PersonaAsignable): PersonaAsignable => ({ id: p.id, nombre: p.nombre, email: normalizarCorreo(p.email) })
  const lider = lideres.find((p) => p.id === asignadoId)
  if (lider) return limpio(lider)
  if (!acceso.esAdmin) return null
  const cuenta = otrasCuentas.find((p) => p.id === asignadoId)
  return cuenta ? limpio(cuenta) : null
}

// ─── Resumen del líder (solo con SUS casos) ─────────────────────────────────

export interface CasoResumible {
  estado: string
  severidad: string
  area: string
  urgenteSolicitado?: boolean
  creadoEn: string
  primeraRespuestaEn?: string | null
  resueltoEn?: string | null
  sla?: { vencido?: boolean; escalamiento?: unknown | null } | null
}

const ESTADOS = ["recibido", "en_analisis", "resuelto", "cerrado"] as const
const SEVERIDADES = ["critica", "alta", "media", "baja"] as const
const AREAS = ["bodega", "administrativo"] as const
const HORA_MS = 3_600_000
const DIA_MS = 24 * HORA_MS

function contar<K extends string>(claves: readonly K[], valores: string[]): Record<K, number> {
  const salida = Object.fromEntries(claves.map((c) => [c, 0])) as Record<K, number>
  for (const v of valores) if (v in salida) salida[v as K] += 1
  return salida
}

function promedioHoras(pares: Array<[string, string | null | undefined]>): number | null {
  const horas = pares
    .map(([desde, hasta]) => (hasta ? (Date.parse(hasta) - Date.parse(desde)) / HORA_MS : NaN))
    .filter((h) => Number.isFinite(h) && h >= 0)
  if (horas.length === 0) return null
  return Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10
}

const diaDe = (fecha: Date): string => fecha.toISOString().slice(0, 10)

/**
 * Mismo contrato que `GET /resumen` del servicio de casos, pero calculado solo
 * con los casos del líder: así nunca se le muestran totales globales.
 * Los tiempos medios salen en horas de reloj (el servicio los da en horas hábiles).
 */
export function resumenDeCasos(
  casos: CasoResumible[],
  lider: { email: string; nombre: string },
  truncado: boolean,
  ahora: Date = new Date(),
) {
  const abiertos = casos.filter((c) => c.estado === "recibido" || c.estado === "en_analisis")
  const hace30d = ahora.getTime() - 30 * DIA_MS
  const vencidos = abiertos.filter((c) => c.sla?.vencido === true).length
  const escalados = abiertos.filter((c) => c.sla?.escalamiento != null).length

  const ultimos14dias = Array.from({ length: 14 }, (_, i) => {
    const fecha = diaDe(new Date(ahora.getTime() - (13 - i) * DIA_MS))
    return {
      fecha,
      creados: casos.filter((c) => c.creadoEn.slice(0, 10) === fecha).length,
      resueltos: casos.filter((c) => (c.resueltoEn ?? "").slice(0, 10) === fecha).length,
    }
  })

  return {
    total: casos.length,
    porEstado: contar(ESTADOS, casos.map((c) => c.estado)),
    porSeveridad: contar(SEVERIDADES, abiertos.map((c) => c.severidad)),
    porArea: contar(AREAS, abiertos.map((c) => c.area)),
    abiertos: abiertos.length,
    sinAsignar: 0,
    escalados,
    vencidos,
    urgentesSolicitados: abiertos.filter((c) => c.urgenteSolicitado === true).length,
    sinPrimeraRespuesta: abiertos.filter((c) => !c.primeraRespuestaEn).length,
    horasPrimeraRespuesta: promedioHoras(casos.map((c) => [c.creadoEn, c.primeraRespuestaEn])),
    horasResolucion: promedioHoras(casos.map((c) => [c.creadoEn, c.resueltoEn])),
    porLider: [
      {
        email: lider.email,
        nombre: lider.nombre,
        abiertos: abiertos.length,
        vencidos,
        escalados,
        resueltos30d: casos.filter((c) => c.resueltoEn && Date.parse(c.resueltoEn) >= hace30d).length,
      },
    ],
    ultimos14dias,
    truncado,
  }
}
