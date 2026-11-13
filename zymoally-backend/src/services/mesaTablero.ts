// Mesa de ayuda — tablero del líder: indicadores de un área contra las metas
// que él mismo define. Función pura (sin base de datos) para poder probarla.
//
// Los tiempos se miden en horas laborales de la mesa (lunes a viernes 7 a. m. –
// 7 p. m., sábados hasta mediodía, domingos no; hora Colombia): un ticket que
// llega el viernes a las 6 p. m. no "lleva 60 horas sin respuesta" el lunes.

import { horasLaboralesMesa } from "../utils/businessHours"

export interface TicketTablero {
  estado: string
  createdAt: Date
  primeraRespuestaEn: Date | null
  cerradoEn: Date | null
  categoria: string | null
  responsables: string[]
}

export interface Metas {
  primeraRespuestaH: number | null
  cierreH: number | null
}

export interface Indicador {
  /** Tickets medidos (los que ya tienen respuesta o cierre dentro del período). */
  medidos: number
  /** Mediana en horas laborales; null si no hay tickets medidos. */
  medianaH: number | null
  metaH: number | null
  /** % de los medidos que cumplió la meta; null si no hay meta o no hay medidos. */
  cumplimiento: number | null
  /** Abiertos que ya pasaron la meta y siguen sin respuesta / sin cerrar. */
  fueraDeMetaAhora: number
}

export interface Tablero {
  dias: number
  pendientes: { abierto: number; en_espera: number; sinRespuesta: number; sinAsignar: number }
  creados: number
  cerrados: number
  primeraRespuesta: Indicador
  cierre: Indicador
  porCategoria: { nombre: string; creados: number }[]
  porResponsable: { nombre: string; abiertos: number; cerrados: number }[]
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return Math.round((v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) * 10) / 10
}

function indicador(horas: number[], metaH: number | null, fueraDeMetaAhora: number): Indicador {
  return {
    medidos: horas.length,
    medianaH: mediana(horas),
    metaH,
    cumplimiento: metaH === null || horas.length === 0 ? null : Math.round((horas.filter((h) => h <= metaH).length / horas.length) * 100),
    fueraDeMetaAhora,
  }
}

/**
 * `tickets` son TODOS los no eliminados del área. El período (últimos `dias`)
 * aplica a lo que se mide; los pendientes son siempre los de ahora.
 */
export function calcularTablero(tickets: TicketTablero[], metas: Metas, dias: number, ahora = new Date()): Tablero {
  const desde = new Date(ahora.getTime() - dias * 86_400_000)
  const activos = tickets.filter((t) => t.estado !== "cerrado")
  const creadosEnPeriodo = tickets.filter((t) => t.createdAt >= desde)
  const cerradosEnPeriodo = tickets.filter((t) => t.cerradoEn && t.cerradoEn >= desde)

  // Primera respuesta: tickets creados en el período que ya la tienen
  const hRespuesta = creadosEnPeriodo.filter((t) => t.primeraRespuestaEn).map((t) => horasLaboralesMesa(t.createdAt, t.primeraRespuestaEn as Date))
  // Cierre: tickets cerrados en el período
  const hCierre = cerradosEnPeriodo.map((t) => horasLaboralesMesa(t.createdAt, t.cerradoEn as Date))

  const pasada = (t: TicketTablero, metaH: number | null) => metaH !== null && horasLaboralesMesa(t.createdAt, ahora) > metaH
  const sinRespuesta = activos.filter((t) => !t.primeraRespuestaEn)

  const categorias = new Map<string, number>()
  for (const t of creadosEnPeriodo) categorias.set(t.categoria ?? "Sin categoría", (categorias.get(t.categoria ?? "Sin categoría") ?? 0) + 1)

  const personas = new Map<string, { abiertos: number; cerrados: number }>()
  const persona = (n: string) => personas.get(n) ?? personas.set(n, { abiertos: 0, cerrados: 0 }).get(n)!
  for (const t of activos) for (const r of t.responsables) persona(r).abiertos++
  for (const t of cerradosEnPeriodo) for (const r of t.responsables) persona(r).cerrados++

  return {
    dias,
    pendientes: {
      abierto: activos.filter((t) => t.estado === "abierto").length,
      en_espera: activos.filter((t) => t.estado === "en_espera").length,
      sinRespuesta: sinRespuesta.length,
      sinAsignar: activos.filter((t) => t.responsables.length === 0).length,
    },
    creados: creadosEnPeriodo.length,
    cerrados: cerradosEnPeriodo.length,
    primeraRespuesta: indicador(hRespuesta, metas.primeraRespuestaH, sinRespuesta.filter((t) => pasada(t, metas.primeraRespuestaH)).length),
    cierre: indicador(hCierre, metas.cierreH, activos.filter((t) => pasada(t, metas.cierreH)).length),
    porCategoria: [...categorias].map(([nombre, creados]) => ({ nombre, creados })).sort((a, b) => b.creados - a.creados || a.nombre.localeCompare(b.nombre, "es")),
    porResponsable: [...personas].map(([nombre, v]) => ({ nombre, ...v })).sort((a, b) => b.abiertos - a.abiertos || b.cerrados - a.cerrados || a.nombre.localeCompare(b.nombre, "es")),
  }
}
