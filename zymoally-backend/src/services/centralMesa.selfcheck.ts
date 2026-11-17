import assert from "assert"
import { elegirArea, planear, textoTicket } from "./centralMesa"

// Self-check sin base de datos (npm run selfcheck:centralmesa): Central → Mesa de ayuda al asignar un caso.

const areas = [
  { areaId: 1, nombre: "Operaciones", recibeTickets: true },
  { areaId: 2, nombre: "Compras", recibeTickets: true },
  { areaId: 3, nombre: "Gestión de Calidad", recibeTickets: false },
]

// Mesa del área de la persona: sin importar tildes ni mayúsculas, y solo si el área recibe tickets
assert.strictEqual(elegirArea(areas, "operaciones")?.areaId, 1, "mayúsculas")
assert.strictEqual(elegirArea(areas, " OPERACIONES ")?.areaId, 1, "espacios")
assert.strictEqual(elegirArea(areas, "Gestion de Calidad"), null, "área que no recibe tickets")
assert.strictEqual(elegirArea(areas, null), null, "sin área")
assert.strictEqual(elegirArea(areas, "Bodega"), null, "área sin Mesa")

// Texto del ticket: datos del caso, indicaciones del que asigna, nunca más de lo permitido
const t = textoTicket({ radicado: "1187", asunto: "Demora en entrega", cliente: "Cliente Alfa", tipo: "queja", severidad: "alta" }, "Laura", "Llamar hoy")
assert.strictEqual(t.asunto, "Caso 1187 · Demora en entrega")
assert.ok(t.descripcion.includes("Cliente: Cliente Alfa") && t.descripcion.includes("Indicaciones de Laura: Llamar hoy"))
assert.ok(textoTicket({ radicado: "1", asunto: "x".repeat(400), cliente: null, tipo: null, severidad: null }, "L").asunto.length <= 160, "asunto ≤ 160")
assert.ok(!textoTicket({ radicado: "1", asunto: "a", cliente: null, tipo: null, severidad: null }, "L").descripcion.includes("null"), "sin 'null' en el texto")

// Plan: sin ticket previo → crear; mismo caso en la misma área → reutilizar; en otra área → cerrar
assert.deepStrictEqual(planear([], 1, 50), { cerrar: [], usar: null })
assert.deepStrictEqual(planear([{ id: 7, areaId: 1, responsables: [50] }], 1, 50), { cerrar: [], usar: { id: 7, yaEsResponsable: true, otrosResponsables: false } }, "ya asignado: nada que hacer")
assert.deepStrictEqual(planear([{ id: 7, areaId: 1, responsables: [60] }], 1, 50), { cerrar: [], usar: { id: 7, yaEsResponsable: false, otrosResponsables: true } }, "reasignación en la misma área")
assert.deepStrictEqual(planear([{ id: 8, areaId: 2, responsables: [60] }], 1, 50), { cerrar: [8], usar: null }, "el caso cambió de área: se cierra el viejo y se crea uno")
assert.deepStrictEqual(planear([{ id: 7, areaId: 1, responsables: [] }, { id: 8, areaId: 2, responsables: [60] }], 1, 50), { cerrar: [8], usar: { id: 7, yaEsResponsable: false, otrosResponsables: false } }, "uno en el área correcta y otro en otra")

console.log("centralMesa.selfcheck OK")
