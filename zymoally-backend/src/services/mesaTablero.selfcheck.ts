import assert from "assert"
import { calcularTablero, type TicketTablero } from "./mesaTablero"
import { businessHoursBetween, horasLaboralesMesa } from "../utils/businessHours"

// Self-check sin base de datos (npm run selfcheck): el tablero del líder mide en
// horas laborales de la mesa y contra las metas del área.

// Miércoles 11 nov 2026, 3:00 p. m. hora Colombia
const ahora = new Date("2026-11-11T15:00:00-05:00")
const col = (dia: number, hora: number, min = 0) => new Date(`2026-11-${String(dia).padStart(2, "0")}T${String(hora).padStart(2, "0")}:${String(min).padStart(2, "0")}:00-05:00`)

// ── Horario de la mesa: L–V 7 a. m.–7 p. m., sábado hasta mediodía, domingo no ──
// (13 nov 2026 es viernes, 14 sábado, 15 domingo, 16 lunes)
assert.strictEqual(horasLaboralesMesa(col(13, 18), col(16, 8)), 7, "viernes 6 p. m. → lunes 8 a. m.: 1 h + 5 h del sábado + 0 del domingo + 1 h")
assert.strictEqual(horasLaboralesMesa(col(14, 11), col(14, 13)), 1, "sábado: solo cuenta hasta mediodía")
assert.strictEqual(horasLaboralesMesa(col(14, 13), col(14, 18)), 0, "sábado en la tarde no cuenta")
assert.strictEqual(horasLaboralesMesa(col(15, 7), col(15, 19)), 0, "domingo no cuenta")
assert.strictEqual(horasLaboralesMesa(col(10, 9), col(10, 11)), 2, "entre semana, igual que antes")
assert.strictEqual(businessHoursBetween(col(13, 18), col(16, 8)), 26, "la regla de los otros módulos no cambió (todos los días 7–19)")

const t = (p: Partial<TicketTablero>): TicketTablero => ({ estado: "abierto", createdAt: col(10, 9), primeraRespuestaEn: null, cerradoEn: null, categoria: null, responsables: [], ...p })

const tickets: TicketTablero[] = [
  // Respondido en 2 h laborales, cerrado en 5 h laborales
  t({ estado: "cerrado", createdAt: col(10, 9), primeraRespuestaEn: col(10, 11), cerradoEn: col(10, 14), categoria: "Impresora", responsables: ["Iván"] }),
  // Llega a las 6 p. m.; respuesta a las 8 a. m. del día siguiente = 1 h (hasta 7 p. m.) + 1 h (desde 7 a. m.) = 2 h, no 14
  t({ estado: "en_espera", createdAt: col(9, 18), primeraRespuestaEn: col(10, 8), categoria: "Impresora", responsables: ["Iván", "Laura"] }),
  // Respondido en 6 h (fuera de una meta de 4 h), sigue abierto
  t({ createdAt: col(10, 8), primeraRespuestaEn: col(10, 14), categoria: "WIFI", responsables: ["Laura"] }),
  // Sin respuesta y sin asignar desde ayer 9 a. m. → 10 h (ayer) + 8 h (hoy) = 18 h laborales
  t({ createdAt: col(10, 9) }),
  // Recién llegado (hace 1 h): sin respuesta pero dentro de meta
  t({ createdAt: col(11, 14), categoria: "WIFI" }),
  // Viejo: creado y cerrado hace 60 días, fuera del período de 30
  t({ estado: "cerrado", createdAt: new Date(ahora.getTime() - 60 * 86_400_000), primeraRespuestaEn: new Date(ahora.getTime() - 60 * 86_400_000 + 3_600_000), cerradoEn: new Date(ahora.getTime() - 59 * 86_400_000), categoria: "Viejo", responsables: ["Iván"] }),
]

const tab = calcularTablero(tickets, { primeraRespuestaH: 4, cierreH: 16 }, 30, ahora)

assert.deepStrictEqual(tab.pendientes, { abierto: 3, en_espera: 1, sinRespuesta: 2, sinAsignar: 2 })
assert.deepStrictEqual([tab.creados, tab.cerrados], [5, 1], "el ticket de hace 60 días no entra al período")

// Primera respuesta: horas [2, 2, 6] → mediana 2; 2 de 3 dentro de la meta de 4 h
assert.deepStrictEqual(tab.primeraRespuesta, { medidos: 3, medianaH: 2, metaH: 4, cumplimiento: 67, fueraDeMetaAhora: 1 })
// Cierre: solo el primero (5 h) → cumple la meta de 16 h; abiertos que ya pasaron 16 h laborales:
// el de las 6 p. m. del día 9 (1+12+8=21 h), el de ayer 8 a. m. (11+8=19 h) y el de ayer 9 a. m. (18 h)
assert.deepStrictEqual(tab.cierre, { medidos: 1, medianaH: 5, metaH: 16, cumplimiento: 100, fueraDeMetaAhora: 3 })

assert.deepStrictEqual(tab.porCategoria, [
  { nombre: "Impresora", creados: 2 },
  { nombre: "WIFI", creados: 2 },
  { nombre: "Sin categoría", creados: 1 },
])
assert.deepStrictEqual(tab.porResponsable, [
  { nombre: "Laura", abiertos: 2, cerrados: 0 },
  { nombre: "Iván", abiertos: 1, cerrados: 1 },
])

// Sin metas: se mide igual, pero no hay cumplimiento ni "fuera de meta"
const sinMetas = calcularTablero(tickets, { primeraRespuestaH: null, cierreH: null }, 30, ahora)
assert.deepStrictEqual([sinMetas.primeraRespuesta.medianaH, sinMetas.primeraRespuesta.cumplimiento, sinMetas.primeraRespuesta.fueraDeMetaAhora], [2, null, 0])

// Período de 1 día: solo cuenta lo creado desde ayer a las 3 p. m.
const unDia = calcularTablero(tickets, { primeraRespuestaH: 4, cierreH: 16 }, 1, ahora)
assert.deepStrictEqual([unDia.creados, unDia.primeraRespuesta.medidos, unDia.pendientes.abierto], [1, 0, 3], "los pendientes son siempre los de ahora")

// Área vacía
const vacio = calcularTablero([], { primeraRespuestaH: 4, cierreH: 16 }, 30, ahora)
assert.deepStrictEqual([vacio.primeraRespuesta.medianaH, vacio.primeraRespuesta.cumplimiento, vacio.cierre.medidos, vacio.porCategoria.length], [null, null, 0, 0])

console.log("OK: tablero del líder — horas laborales, medianas, cumplimiento contra metas, pendientes y desgloses.")
