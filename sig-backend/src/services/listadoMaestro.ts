// Listado maestro de documentos (reemplaza el Excel FR-002-SIG): reglas puras, sin BD ni red, para probarlas
// solas (scripts/listadoMaestro.selfcheck.ts). El router y el script de importación solo las conectan a Prisma.

/** Tipos de documento y su sigla, de la hoja «Listas» del FR-002-SIG. ponytail: un tipo nuevo es un cambio de código. */
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

const MAX_AVISO = 300
const PATRON = new RegExp(`^(${TIPOS.map((t) => t.sigla).join("|")})-(\\d{3})-([A-Z]{2,5})$`)
const AL_INICIO = /^\s*([A-Za-z]{2,3})-(\d{3})-([A-Za-z]{2,5})(?![A-Za-z0-9])/

/** Sin tildes, minúsculas y espacios simples: para comparar lo que viene escrito a mano. */
export const plano = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()

/** Mayúsculas y sin ningún espacio: «  fr - 005-pn » → «FR-005-PN». */
export const normalizarCodigo = (c: string): string => c.replace(/\s+/g, "").toUpperCase()

export const siglaDeTipo = (tipo: string): string | null => TIPOS.find((t) => t.tipo === tipo)?.sigla ?? null

/** El tipo del catálogo que corresponde a lo escrito («politica» → «Política»), o null si no es ninguno. */
export const tipoDeTexto = (texto: string): string | null => TIPOS.find((t) => plano(t.tipo) === plano(texto))?.tipo ?? null

/** null si el código sirve para ese tipo; si no, el motivo para mostrarle a quien lo escribió. */
export function revisarCodigo(codigo: string, tipo: string): string | null {
  const sigla = siglaDeTipo(tipo)
  if (!sigla) return `El tipo «${tipo}» no está en el catálogo del listado maestro.`
  const m = PATRON.exec(codigo)
  if (!m) return `El código no tiene la forma correcta: sigla del tipo, tres dígitos y sigla del área (por ejemplo ${sigla}-001-GAD).`
  if (m[1] !== sigla) return `Un ${tipo.toLowerCase()} se codifica con ${sigla}, no con ${m[1]}.`
  return null
}

export type Alerta = "repetido" | "sigla_area" | "forma"

/** Códigos usados por más de una fila vigente (las dadas de baja no cuentan). */
export function repetidosDe(filas: { codigo: string; estado: string }[]): Set<string> {
  const vistos = new Set<string>()
  const repetidos = new Set<string>()
  for (const f of filas) {
    if (f.estado === "BAJA") continue
    if (vistos.has(f.codigo)) repetidos.add(f.codigo)
    vistos.add(f.codigo)
  }
  return repetidos
}

/** Lo que el SIG debe revisar de una fila. Una fila dada de baja ya no alerta. */
export function alertasDe(fila: { codigo: string; tipo: string; estado: string }, siglaArea: string | null, repetidos: Set<string>): Alerta[] {
  if (fila.estado === "BAJA") return []
  const alertas: Alerta[] = []
  if (repetidos.has(fila.codigo)) alertas.push("repetido")
  if (revisarCodigo(fila.codigo, fila.tipo)) alertas.push("forma")
  else if (siglaArea && !fila.codigo.endsWith(`-${siglaArea}`)) alertas.push("sigla_area")
  return alertas
}

/** El número siguiente al más alto ya usado para ese tipo y sigla de área (no rellena huecos: un número dado de baja no se reutiliza). */
export function siguienteCodigo(tipo: string, siglaArea: string | null, usados: string[]): string | null {
  const sigla = siglaDeTipo(tipo)
  if (!sigla || !siglaArea) return null
  let mayor = 0
  for (const c of usados) {
    const m = PATRON.exec(c)
    if (m && m[1] === sigla && m[3] === siglaArea) mayor = Math.max(mayor, Number(m[2]))
  }
  return mayor >= 999 ? null : `${sigla}-${String(mayor + 1).padStart(3, "0")}-${siglaArea}`
}

/** Código escrito al inicio del nombre o del archivo de un formato o anexo («FR-001-GAD Registro…», «fr-001-gad_x.xlsx»). */
export function codigoEnTexto(texto: string | null | undefined): string | null {
  const m = AL_INICIO.exec(texto ?? "")
  return m ? `${m[1]}-${m[2]}-${m[3]}`.toUpperCase() : null
}

// ── Lo que trae el Excel, a valores del catálogo ──

/** «2 años», «1 año», 4, «4» → número; «No aplica» o vacío → null. */
export function anosDeTexto(v: unknown): number | null {
  const m = /^\s*(\d{1,3})\b/.exec(String(v ?? ""))
  return m ? Number(m[1]) : null
}

export function empresaDeTexto(v: unknown): string | null {
  const t = plano(v)
  if (!t) return null
  if (t === "transversal" || t === "trasversal") return "Transversal"
  const conocida = EMPRESAS.find((e) => plano(e) === t)
  return conocida ?? String(v).trim()
}

/** Todo lo que no diga «aprobado» queda pendiente (el texto original va al historial de la fila). */
export const estadoDeTexto = (v: unknown): EstadoListado => (plano(v) === "aprobado" ? "APROBADO" : "PENDIENTE")

export const disposicionDeTexto = (v: unknown): string | null => DISPOSICIONES.find((d) => plano(d) === plano(v)) ?? null

// ── Avisos al líder del área ──

export type EventoListado = {
  accion: "creado" | "cambiado" | "baja"
  quien: string
  codigo: string
  codigoAnterior?: string
  nombre: string
  motivo?: string | null
}

const unaLinea = (t: string | null | undefined): string => (t ?? "").replace(/\s+/g, " ").trim()

/** Texto del aviso de la campana, de hasta 300 caracteres sin partir un emoji. */
export function textoAvisoListado(e: EventoListado): string {
  const quien = unaLinea(e.quien)
  const nombre = unaLinea(e.nombre)
  let texto =
    e.accion === "creado" ? `${quien} creó el código ${e.codigo} (${nombre}) en el listado maestro`
      : e.accion === "cambiado" ? `${quien} cambió el código ${e.codigoAnterior} a ${e.codigo} (${nombre})`
        : `${quien} dio de baja ${e.codigo} (${nombre})`
  const motivo = e.accion === "baja" ? unaLinea(e.motivo) : ""
  if (motivo) texto += `: ${motivo}`
  return texto.length > MAX_AVISO ? texto.slice(0, MAX_AVISO - 1).replace(/[\uD800-\uDBFF]$/, "") + "…" : texto
}
