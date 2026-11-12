import assert from "assert"
import {
  decidirMesa,
  esLiderDe,
  filtroLista,
  normalizarArea,
  relacionCon,
  resolverAccesoMesa,
  PERM_MESA_LIDER,
  type AccionMesa,
  type TicketParaAcceso,
} from "./mesaAuth"

// Self-check sin base de datos ni red (npm run selfcheck): el aislamiento por área
// es la regla con más riesgo de la mesa de ayuda — un error aquí muestra tickets ajenos.

const AREAS = [
  { areaId: 1, nombre: "Gestion IT" },
  { areaId: 2, nombre: "Planeación y Consultoria", esSac: true },
  { areaId: 3, nombre: "Talento y Cultura" },
]
const acceso = (u: Parameters<typeof resolverAccesoMesa>[0]) => {
  const a = resolverAccesoMesa(u, AREAS)
  assert.ok(a, "se esperaba acceso")
  return a
}

// ── Áreas: tildes, mayúsculas y espacios no cambian a qué área pertenece alguien ──
assert.strictEqual(normalizarArea("  Planeación   y CONSULTORIA "), "planeacion y consultoria")
assert.deepStrictEqual(acceso({ id: 5, area: "Planeación y consultoria" }).areaIds, [2], "minúscula distinta = misma área")
assert.deepStrictEqual(acceso({ id: 5, area: "planeacion y consultoría" }).areaIds, [2], "tilde distinta = misma área")
assert.deepStrictEqual(acceso({ id: 5, area: "Gestion IT", areas_extra: [3, 99, "2"] }).areaIds, [1, 3], "areas_extra suma por id; ignora ids inexistentes y no numéricos")
assert.deepStrictEqual(acceso({ id: 5, area: "" }).areaIds, [], "cuenta sin área no pertenece a ninguna")
assert.deepStrictEqual(acceso({ id: 5, area: null }).areaIds, [])
assert.deepStrictEqual(acceso({ id: 5, area: "Gestion" }).areaIds, [], "coincidencia parcial NO cuenta")
assert.strictEqual(resolverAccesoMesa(undefined, AREAS), null)
assert.strictEqual(resolverAccesoMesa({ area: "Gestion IT" }, AREAS), null, "sin id no hay acceso")
assert.strictEqual(resolverAccesoMesa({ id: "abc" }, AREAS), null)

// ── Personas ──
const admin = acceso({ id: 1, role: "admin", area: "Gestion IT" })
const creador = acceso({ id: 10, area: "Talento y Cultura" })
const miembroIT = acceso({ id: 20, area: "gestión it" })
const liderIT = acceso({ id: 21, area: "Gestion IT", app_permissions: [PERM_MESA_LIDER] })
// SAC es un área marcada (hoy Planeación y Consultoria), no un permiso
const sac = acceso({ id: 30, area: "Planeación y consultoria" })
const sacPorExtra = acceso({ id: 31, area: "Gestion IT", areas_extra: [2] })
const sumado = acceso({ id: 40, area: "Talento y Cultura" })
const ajeno = acceso({ id: 50, area: "Talento y Cultura" })
const gerente = acceso({ id: 60, role: "gerente", area: "Talento y Cultura" })
assert.ok(sac.esSac && sacPorExtra.esSac, "pertenecer al área SAC (principal o adicional) da la capacidad")
assert.ok(!miembroIT.esSac && !ajeno.esSac && !admin.esSac, "nadie más es SAC")

// Ticket de un creador de Talento y Cultura (10) dirigido a IT, con el usuario 40 sumado por SAC
const t: TicketParaAcceso = { creadorId: 10, areaId: 1, eliminadoEn: null, responsableIds: [40] }
const eliminado: TicketParaAcceso = { ...t, eliminadoEn: new Date() }

assert.strictEqual(relacionCon(admin, t), "admin")
assert.strictEqual(relacionCon(creador, t), "creador")
assert.strictEqual(relacionCon(miembroIT, t), "area")
assert.strictEqual(relacionCon(sumado, t), "responsable")
assert.strictEqual(relacionCon(ajeno, t), null, "otra área no sabe que el ticket existe")
assert.strictEqual(relacionCon(gerente, t), null, "ser gerente no abre tickets de otras áreas")
assert.strictEqual(relacionCon(sac, t), null, "SAC no ve tickets con los que no tiene relación")

// ── Matriz de acciones: [accion, quién puede] ──
const TODAS: AccionMesa[] = ["ver", "comentar", "evidencia", "ver_internas", "nota_interna", "asignar", "estado", "categoria", "eliminar", "redirigir", "sumar_responsable"]
const esperado: Record<string, AccionMesa[]> = {
  admin: TODAS,
  creador: ["ver", "comentar", "evidencia", "eliminar"],
  miembroIT: ["ver", "comentar", "evidencia", "ver_internas", "nota_interna", "asignar", "estado", "categoria"],
  sumado: ["ver", "comentar", "evidencia", "ver_internas", "nota_interna", "asignar", "estado", "categoria"],
}
const personas = { admin, creador, miembroIT, sumado }
for (const [nombre, p] of Object.entries(personas)) {
  for (const accion of TODAS) {
    const d = decidirMesa(p, accion, t)
    const debe = esperado[nombre].includes(accion)
    assert.strictEqual(d.ok, debe, `${nombre} · ${accion}: se esperaba ${debe ? "permitido" : "prohibido"}`)
    if (!d.ok) assert.strictEqual(d.status, 403, `${nombre} · ${accion}: ve el ticket, así que es 403 y no 404`)
  }
}
for (const accion of TODAS) {
  const d = decidirMesa(ajeno, accion, t)
  assert.ok(!d.ok && d.status === 404, `ajeno · ${accion}: 404, no se revela que existe`)
}

// SAC: redirige y suma responsables solo en tickets con los que tiene relación
const sacCreo: TicketParaAcceso = { creadorId: 30, areaId: 1, eliminadoEn: null, responsableIds: [] }
assert.ok(decidirMesa(sac, "redirigir", sacCreo).ok, "SAC redirige el ticket que creó")
assert.ok(decidirMesa(sac, "sumar_responsable", sacCreo).ok)
const noSacCreo: TicketParaAcceso = { ...sacCreo, creadorId: 10 }
assert.ok(!decidirMesa(creador, "redirigir", noSacCreo).ok, "un creador sin permiso SAC no redirige")
const enAreaDeSac: TicketParaAcceso = { creadorId: 10, areaId: 2, eliminadoEn: null, responsableIds: [] }
assert.ok(decidirMesa(sac, "redirigir", enAreaDeSac).ok, "SAC redirige lo que llega a su área")
assert.ok(!decidirMesa(miembroIT, "redirigir", t).ok, "el área que atiende no redirige si no es SAC")
assert.ok(!decidirMesa(sumado, "sumar_responsable", t).ok, "un responsable sumado no suma a otros")

// Eliminados: solo el admin los ve, y solo para consultar
assert.strictEqual(relacionCon(creador, eliminado), null, "ni el creador ve su ticket eliminado")
assert.strictEqual(relacionCon(miembroIT, eliminado), null)
assert.ok(decidirMesa(admin, "ver", eliminado).ok)
const d = decidirMesa(admin, "comentar", eliminado)
assert.ok(!d.ok && d.status === 403, "un eliminado no se modifica")

// ── Listas: el filtro lo pone el servidor ──
const mias = filtroLista(creador, "mias")
assert.ok(mias.ok)
assert.deepStrictEqual(mias.where, { creadorId: 10, eliminadoEn: null })
const area = filtroLista(miembroIT, "area")
assert.ok(area.ok)
assert.deepStrictEqual(area.where, { eliminadoEn: null, OR: [{ areaId: { in: [1] } }, { responsables: { some: { userId: 20 } } }] })
const sinArea = filtroLista(acceso({ id: 70, area: "" }), "area")
assert.ok(sinArea.ok)
assert.deepStrictEqual((sinArea.where.OR as { areaId?: { in: number[] } }[])[0], { areaId: { in: [] } }, "sin área: bandeja vacía, no todas")
for (const vista of ["todas", "eliminados"] as const) {
  const no = filtroLista(liderIT, vista)
  assert.ok(!no.ok && no.status === 403, `${vista}: solo admin (ni el líder)`)
  assert.ok(!filtroLista(sac, vista).ok, `${vista}: SAC tampoco`)
  assert.ok(filtroLista(admin, vista).ok)
}
const elim = filtroLista(admin, "eliminados")
assert.ok(elim.ok)
assert.deepStrictEqual(elim.where, { eliminadoEn: { not: null } })

// ── Líder: metas y tablero solo de sus áreas; el admin no es líder por ser admin ──
assert.ok(esLiderDe(liderIT, 1))
assert.ok(!esLiderDe(liderIT, 2), "líder de IT no toca las metas de otra área")
assert.ok(!esLiderDe(miembroIT, 1), "miembro sin permiso no es líder")
assert.ok(!esLiderDe(admin, 1), "admin consulta, no define metas")

console.log("OK: aislamiento por área, matriz de acciones, SAC, eliminados, listas y líder.")
