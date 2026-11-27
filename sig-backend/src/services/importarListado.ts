// Importación del Excel FR-002-SIG al listado maestro: lectura de celdas y decisiones puras (sin BD ni exceljs),
// probadas en scripts/listadoMaestro.selfcheck.ts. El script scripts/importar-listado-maestro.ts las conecta a Prisma.
import { plano } from "./listadoMaestro"

/** Encabezado (ya en `plano`) de cada columna que se importa. Cuenta igual o seguido de más texto («… en años»). */
export const ENCABEZADOS = {
  tipo: "tipo de documento",
  nombre: "nombre del documento",
  area: "area",
  empresa: "empresa que aplica",
  codigo: "codigo generado",
  fechaCreacion: "fecha de inicial de creacion",
  version: "n° de version",
  fechaActualizacion: "fecha de ultima actualizacion",
  controlCambios: "control de cambios",
  anosActivo: "tiempo archivo activo",
  anosInactivo: "tiempo archivo inactivo",
  disposicion: "disposicion final",
  ubicacion: "ubicacion del documento",
  revisado: "revisado",
  aprobado: "aprobado",
} as const
export type Campo = keyof typeof ENCABEZADOS

/** Número de columna de cada campo según los encabezados de la hoja (índice = número de columna). */
export function columnasDe(encabezados: unknown[]): Partial<Record<Campo, number>> {
  const cols: Partial<Record<Campo, number>> = {}
  encabezados.forEach((h, i) => {
    const t = plano(valorCelda(h))
    for (const [campo, esperado] of Object.entries(ENCABEZADOS) as [Campo, string][]) {
      if (cols[campo] === undefined && (t === esperado || t.startsWith(esperado + " "))) cols[campo] = i
    }
  })
  return cols
}

/** El valor de una celda de exceljs: resultado de la fórmula, texto enriquecido unido, texto del enlace; error → null. */
export function valorCelda(v: unknown): unknown {
  if (v === null || v === undefined || v instanceof Date || typeof v !== "object") return v ?? null
  const o = v as Record<string, unknown>
  if ("formula" in o || "sharedFormula" in o || "result" in o) return valorCelda(o.result)
  if (Array.isArray(o.richText)) return o.richText.map((p: { text?: unknown }) => String(p.text ?? "")).join("")
  if ("hyperlink" in o) return valorCelda(o.text)
  return null // { error: "#N/A" } y cualquier otra cosa
}

export function textoCelda(v: unknown): string {
  const x = valorCelda(v)
  if (x === null || x === undefined) return ""
  return (x instanceof Date ? x.toISOString().slice(0, 10) : String(x)).trim()
}

/** Para «Ubicación»: el destino del enlace, no el texto que se ve («PROYECTOS Y NEGOCIOS»). */
export function enlaceCelda(v: unknown): string {
  const o = v as { hyperlink?: unknown } | null
  return o && typeof o === "object" && typeof o.hyperlink === "string" ? o.hyperlink.trim() : textoCelda(v)
}

/** «Revisado» viene como true, «True» o vacío. */
export const siDe = (v: unknown): boolean => {
  const x = valorCelda(v)
  return x === true || plano(x) === "true" || plano(x) === "verdadero"
}

/** Fecha de una celda: Date, número de serie de Excel, «dd/mm/aaaa» o «aaaa-mm-dd». Año fuera de 1990–2100 → null. */
export function fechaDe(v: unknown): Date | null {
  const x = valorCelda(v)
  let d: Date | null = null
  if (x instanceof Date) d = x
  else if (typeof x === "number") d = new Date(Math.round((x - 25569) * 86_400_000))
  else if (typeof x === "string") {
    const dma = /^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*$/.exec(x)
    const amd = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(x)
    const [a, m, dia] = dma ? [+dma[3], +dma[2], +dma[1]] : amd ? [+amd[1], +amd[2], +amd[3]] : [0, 0, 0]
    if (a) {
      d = new Date(Date.UTC(a, m - 1, dia))
      if (d.getUTCMonth() !== m - 1 || d.getUTCDate() !== dia) d = null // 31/02 no existe
    }
  }
  if (!d || isNaN(d.getTime())) return null
  const ano = d.getUTCFullYear()
  return ano >= 1990 && ano <= 2100 ? d : null
}

/** El valor que más se repite y cuántas veces (en empate gana el primero que apareció). */
export function masFrecuente(valores: string[]): { valor: string; veces: number } | null {
  const cuenta = new Map<string, number>()
  for (const v of valores) if (v) cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
  let mejor: { valor: string; veces: number } | null = null
  for (const [valor, veces] of cuenta) if (!mejor || veces > mejor.veces) mejor = { valor, veces }
  return mejor
}

/** Sigla de área que se propone para una carpeta: la del sufijo más frecuente de sus códigos. */
export const siglaMayoritaria = (codigos: string[]) => masFrecuente(codigos.map((c) => /-([A-Z]{2,5})$/.exec(c)?.[1] ?? ""))

export type DestinoSigla = { nombre: string; id: number | null; actual: string | null; propuesta: string | null }

/**
 * Qué pasa con la sigla propuesta de cada destino (carpeta, o hoja sin carpeta con id null). No se pisa una sigla ya
 * puesta; si otro destino propone la misma, o otra carpeta ya la tiene, nadie la recibe.
 */
export function decidirSiglas(destinos: DestinoSigla[], carpetas: { id: number; nombre: string; sigla: string | null }[]) {
  return destinos.map((d) => {
    const p = d.propuesta
    if (!p) return { asignar: false, conflicto: false, texto: "sin sigla que proponer" }
    if (d.actual === p) return { asignar: false, conflicto: false, texto: `${p}: ya la tiene` }
    if (d.actual) return { asignar: false, conflicto: false, texto: `propone ${p}, pero ya tiene ${d.actual}: no se pisa` }
    const otros = new Set([
      ...destinos.filter((o) => o !== d && o.propuesta === p).map((o) => o.nombre),
      ...carpetas.filter((c) => c.sigla === p && c.id !== d.id).map((c) => c.nombre),
    ])
    if (otros.size) return { asignar: false, conflicto: true, texto: `CONFLICTO: ${p} también la proponen o la tienen ${[...otros].join(", ")}; queda sin sigla` }
    if (d.id === null) return { asignar: false, conflicto: false, texto: `${p} (se asignaría al darle carpeta)` }
    return { asignar: true, conflicto: false, texto: `${p}: se asigna` }
  })
}
