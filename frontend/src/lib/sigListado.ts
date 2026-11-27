// Listado maestro del SIG (reemplaza el Excel FR-002-SIG): tipos del contrato de /api/listado-maestro
// (docs/superpowers/plans/2026-11-27-sig-listado-maestro.md, «Contrato de la API») y catálogos.

/** Copia de sig-backend/src/services/listadoMaestro.ts: TIPOS, ESTADOS, DISPOSICIONES y EMPRESAS deben coincidir con el backend. */
export const TIPOS = [
  { tipo: "Procedimiento", sigla: "PRC" },
  { tipo: "Instructivo", sigla: "INS" },
  { tipo: "Formato", sigla: "FR" },
  { tipo: "Protocolo", sigla: "PRT" },
  { tipo: "Política", sigla: "PO" },
  { tipo: "Manual", sigla: "MA" },
  { tipo: "Plan", sigla: "PL" },
  { tipo: "Programa", sigla: "PRG" },
  { tipo: "Reglamento", sigla: "RG" },
] as const

export const ESTADOS = ["APROBADO", "PENDIENTE", "BAJA"] as const
export type EstadoListado = (typeof ESTADOS)[number]
export const DISPOSICIONES = ["Eliminación", "Conservación total", "Almacenamiento magnético"] as const
export const EMPRESAS = ["Transversal", "IMC Cargo", "Logimat", "IMC Depósito"] as const

/** Prefijo de las consultas del listado: invalidarlo refresca las áreas y el listado abierto. */
export const CLAVE_LISTADO = ["sig", "listado-maestro"] as const

export const ESTADO_TEXTO: Record<EstadoListado, string> = {
  APROBADO: "Aprobado",
  PENDIENTE: "Pendiente",
  BAJA: "Dado de baja",
}

export type Alerta = "repetido" | "sigla_area" | "forma"

export const ALERTA_TEXTO: Record<Alerta, string> = {
  repetido: "Código repetido",
  sigla_area: "La sigla no es la del área",
  forma: "Código mal formado",
}

export interface Documento {
  tipo: "procedimiento" | "instructivo" | "protocolo" | "formato" | "anexo"
  id: number
  codigo: string
  titulo: string
  procedimiento: { id: number; codigo: string; titulo: string; areaId: number }
}

export interface HistorialItem {
  fecha: string
  quien: string
  accion: "creado" | "cambiado" | "area" | "baja" | "reactivado" | "importado"
  detalle?: string
}

export interface FilaListado {
  id: number
  areaId: number
  tipo: string
  codigo: string
  nombre: string
  empresa: string | null
  version: string | null
  fechaCreacion: string | null
  fechaActualizacion: string | null
  controlCambios: string | null
  anosActivo: number | null
  anosInactivo: number | null
  disposicionFinal: string | null
  ubicacion: string | null
  revisado: boolean
  estado: EstadoListado
  historial: HistorialItem[]
  creadoPor: string | null
  editadoPor: string | null
  createdAt: string
  updatedAt: string
  alertas: Alerta[]
  documento: Documento | null
}

export interface AreaListado {
  id: number
  nombre: string
  color: string
  sigla: string | null
  /** Filas no dadas de baja */
  total: number
  conAlertas: number
}

export interface RespuestaArea {
  area: { id: number; nombre: string; color: string; sigla: string | null }
  filas: FilaListado[]
  fueraDelListado: Documento[]
  resumen: {
    filas: number
    repetidos: number
    siglaArea: number
    forma: number
    sinDocumento: number
    fueraDelListado: number
    documentosSinCodigo: number
  }
  siguientes: Record<string, string | null>
}

/** Lo que el formulario manda en POST / PATCH (fechas como YYYY-MM-DD). */
export interface CuerpoFila {
  tipo: string
  codigo: string
  nombre: string
  empresa: string | null
  version: string | null
  fechaCreacion: string | null
  fechaActualizacion: string | null
  controlCambios: string | null
  anosActivo: number | null
  anosInactivo: number | null
  disposicionFinal: string | null
  ubicacion: string | null
  revisado: boolean
  estado: EstadoListado
}

export const siglaDeTipo = (tipo: string): string | null => TIPOS.find((t) => t.tipo === tipo)?.sigla ?? null

/** El contrato no fija si `siguientes` va por nombre del tipo («Formato») o por su sigla («FR»): se aceptan los dos. */
export function siguienteDe(siguientes: Record<string, string | null> | undefined, tipo: string): string | null {
  if (!siguientes) return null
  return siguientes[tipo] ?? siguientes[siglaDeTipo(tipo) ?? ""] ?? null
}

/** Sin tildes ni mayúsculas, para el buscador. */
export const plano = (s: string | null | undefined): string => (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/** Mayúsculas y sin espacios, como lo guarda el backend. */
export const normalizarCodigo = (c: string): string => c.replace(/\s+/g, "").toUpperCase()

/** Fecha corta dd/mm/aaaa de un campo de solo fecha. Se lee en UTC: «2024-03-05» llega como medianoche UTC y en Bogotá daría el día anterior. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-CO", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" })
}

/** «2 / 5 años»; lo que no aplica sale como «—». */
export function retencion(activo: number | null, inactivo: number | null): string {
  if (activo == null && inactivo == null) return "No aplica"
  return `${activo ?? "—"} / ${inactivo ?? "—"} años`
}

export const esUrl = (s: string | null | undefined): boolean => /^https?:\/\/\S+$/i.test((s ?? "").trim())

/** Mensaje y campo de un error de la API: `{ error, campo? }`. */
export function errorDeApi(e: unknown, porDefecto: string): { mensaje: string; campo: string | null } {
  const data = (e as { response?: { data?: { error?: unknown; campo?: unknown } } })?.response?.data
  return {
    mensaje: typeof data?.error === "string" ? data.error : porDefecto,
    campo: typeof data?.campo === "string" ? data.campo : null,
  }
}
