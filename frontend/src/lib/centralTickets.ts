// Central de tickets — textos, formatos y filtros ↔ URL. Sin React.

import type {
  CentralArea,
  CentralCasoItem,
  CentralEstado,
  CentralFiltros,
  CentralSeveridad,
  CentralTipo,
} from "@/types/centralTickets"

export const ESTADOS: CentralEstado[] = ["recibido", "en_analisis", "resuelto", "cerrado"]
export const SEVERIDADES: CentralSeveridad[] = ["critica", "alta", "media", "baja"]
export const AREAS: CentralArea[] = ["bodega", "administrativo"]
export const TIPOS: CentralTipo[] = ["peticion", "queja", "reclamo", "sugerencia"]

export const ESTADO_TEXTO: Record<CentralEstado | "abierto", string> = {
  recibido: "Recibido",
  en_analisis: "En análisis",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
  abierto: "Abiertos",
}
export const SEVERIDAD_TEXTO: Record<CentralSeveridad, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
}
export const AREA_TEXTO: Record<CentralArea, string> = { bodega: "Bodega", administrativo: "Administrativo" }
export const TIPO_TEXTO: Record<CentralTipo, string> = {
  peticion: "Petición",
  queja: "Queja",
  reclamo: "Reclamo",
  sugerencia: "Sugerencia",
}

/** Color de cada estado (variables de components/central/central.css). */
export const TONO_ESTADO: Record<CentralEstado, string> = {
  recibido: "var(--ct-blue)",
  en_analisis: "var(--ct-amber)",
  resuelto: "var(--ct-green)",
  cerrado: "var(--ct-gray)",
}

export const FILTROS_VACIOS: CentralFiltros = {
  estado: "",
  severidad: "",
  area: "",
  tipo: "",
  asignado: "",
  escalado: false,
  vencido: false,
  sinRespuesta: false,
  q: "",
  desde: "",
  hasta: "",
  orden: "recientes",
  pagina: 1,
}

export const LIMITE_LISTA = 20
/** Tope del servicio por página: lo que se trae para el tablero y los filtros locales. */
export const LIMITE_AMPLIO = 100

function uno<T extends string>(valor: string | null, permitidos: readonly T[]): T | "" {
  return permitidos.includes(valor as T) ? (valor as T) : ""
}

export function filtrosDesdeUrl(params: URLSearchParams): CentralFiltros {
  const pagina = Number(params.get("pagina"))
  return {
    estado: uno(params.get("estado"), [...ESTADOS, "abierto"] as const),
    severidad: uno(params.get("severidad"), SEVERIDADES),
    area: uno(params.get("area"), AREAS),
    tipo: uno(params.get("tipo"), TIPOS),
    asignado: (params.get("asignado") ?? "").trim().toLowerCase(),
    escalado: params.get("escalado") === "true",
    vencido: params.get("vencido") === "true",
    sinRespuesta: params.get("sinRespuesta") === "true",
    q: params.get("q") ?? "",
    desde: params.get("desde") ?? "",
    hasta: params.get("hasta") ?? "",
    orden: params.get("orden") === "vencimiento" ? "vencimiento" : "recientes",
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  }
}

/** Escribe los filtros en `params` sin tocar las demás claves (vista, caso…). */
export function filtrosAUrl(filtros: CentralFiltros, params: URLSearchParams): URLSearchParams {
  const salida = new URLSearchParams(params)
  for (const clave of Object.keys(FILTROS_VACIOS) as (keyof CentralFiltros)[]) {
    const valor = filtros[clave]
    if (valor === FILTROS_VACIOS[clave] || valor === "" || valor === false) salida.delete(clave)
    else salida.set(clave, String(valor))
  }
  return salida
}

/** ¿Hay algún filtro puesto? (el orden y la página no cuentan) */
export function hayFiltros(f: CentralFiltros): boolean {
  return (Object.keys(FILTROS_VACIOS) as (keyof CentralFiltros)[]).some(
    (k) => k !== "orden" && k !== "pagina" && f[k] !== FILTROS_VACIOS[k],
  )
}

/** Los filtros locales (sin equivalente en el servicio) se resuelven sobre los casos abiertos. */
export function usaFiltroLocal(f: CentralFiltros): boolean {
  return f.sinRespuesta
}

/** Consulta para GET /casos. `amplio` trae la página más grande posible (tablero y filtros locales). */
export function consultaCasos(f: CentralFiltros, amplio: boolean): Record<string, string | number> {
  const q: Record<string, string | number> = {}
  const estado = f.estado || (usaFiltroLocal(f) ? "abierto" : "")
  if (estado) q.estado = estado
  if (f.severidad) q.severidad = f.severidad
  if (f.area) q.area = f.area
  if (f.tipo) q.tipo = f.tipo
  if (f.asignado) q.asignado = f.asignado
  if (f.escalado) q.escalado = "true"
  if (f.vencido) q.vencido = "true"
  if (f.q.trim()) q.q = f.q.trim()
  if (f.desde) q.desde = f.desde
  if (f.hasta) q.hasta = f.hasta
  q.orden = f.orden
  q.limite = amplio ? LIMITE_AMPLIO : LIMITE_LISTA
  q.pagina = amplio ? 1 : f.pagina
  return q
}

export function aplicarFiltroLocal(items: CentralCasoItem[], f: CentralFiltros): CentralCasoItem[] {
  return items.filter((c) => !f.sinRespuesta || !c.primeraRespuestaEn)
}

export function estaAbierto(estado: CentralEstado): boolean {
  return estado === "recibido" || estado === "en_analisis"
}

/** El cliente escribió de último y el caso sigue abierto: alguien le debe una respuesta. */
export function esperaRespuesta(c: Pick<CentralCasoItem, "estado" | "ultimoMensaje">): boolean {
  return estaAbierto(c.estado) && c.ultimoMensaje?.deCliente === true
}

// ─── Fechas ─────────────────────────────────────────────────────────────────

const FECHA_HORA = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const DIA_CORTO = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : FECHA_HORA.format(d)
}

/** "2026-11-12" → "12 nov" (sin corrimiento por zona horaria). */
export function diaCorto(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? fecha : DIA_CORTO.format(d)
}

function duracion(ms: number): string {
  const min = Math.round(Math.abs(ms) / 60_000)
  if (min < 1) return "menos de 1 min"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 && h < 6 ? `${h} h ${min % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return h % 24 && d < 7 ? `${d} d ${h % 24} h` : `${d} d`
}

/** "hace 3 h" */
export function haceCuanto(iso: string | null | undefined, ahora = Date.now()): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  return Number.isNaN(t) ? "—" : `hace ${duracion(ahora - t)}`
}

/** "vence en 2 h" / "venció hace 1 d" */
export function vencimiento(iso: string | null | undefined, ahora = Date.now()): string {
  if (!iso) return "Sin plazo"
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return "Sin plazo"
  return t >= ahora ? `vence en ${duracion(t - ahora)}` : `venció hace ${duracion(ahora - t)}`
}

/** Horas → pares [cifra, unidad]: 3.4 → [["3","h"],["24","min"]]; 41 → [["1","d"],["17","h"]]. */
export function partesDeHoras(valor: number | null | undefined): [string, string][] {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return []
  const min = Math.round(valor * 60)
  if (min < 60) return [[String(min), "min"]]
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? [[String(h), "h"], [String(min % 60), "min"]] : [[String(h), "h"]]
  return h % 24 ? [[String(Math.floor(h / 24)), "d"], [String(h % 24), "h"]] : [[String(Math.floor(h / 24)), "d"]]
}

export function iniciales(nombre: string): string {
  const partes = nombre.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean)
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?"
}

export function destinatarios(valor: string[] | string | null | undefined): string {
  if (!valor) return ""
  return Array.isArray(valor) ? valor.join(", ") : valor
}

// ─── Errores ────────────────────────────────────────────────────────────────

interface ErrorHttp {
  response?: { status?: number; data?: { error?: unknown } }
}

export function estadoDeError(err: unknown): number | null {
  return (err as ErrorHttp)?.response?.status ?? null
}

/** Texto del servidor (ya viene en español); si no hay, uno propio y sin tecnicismos. */
export function mensajeDeError(err: unknown, porDefecto = "No pudimos completar la acción. Intenta de nuevo."): string {
  const texto = (err as ErrorHttp)?.response?.data?.error
  if (typeof texto === "string" && texto.trim()) return texto
  if (estadoDeError(err) === null) return "No hay conexión con la intranet. Revisa tu red e intenta de nuevo."
  return porDefecto
}
