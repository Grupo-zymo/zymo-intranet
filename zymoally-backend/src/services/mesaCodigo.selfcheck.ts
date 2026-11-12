import assert from "assert"
import { prisma } from "../config/prisma"
import { crearTicketConCodigo, formatearCodigo } from "./mesaCodigo"

// Self-check contra la BD real (npm run selfcheck:mesa): consecutivo único y sin
// huecos bajo creación concurrente, por área, y área que no recibe tickets.
async function main() {
  const AREA = 990001
  const OTRA = 990002
  const N = 12
  const fecha = new Date("2099-03-10T12:00:00-05:00")
  await limpiar(AREA, OTRA)
  await prisma.mesaArea.createMany({
    data: [
      { areaId: AREA, nombre: "Autocheck A", prefijo: "ZZA" },
      { areaId: OTRA, nombre: "Autocheck B", prefijo: "ZZB" },
    ],
  })
  const base = { asunto: "selfcheck", descripcion: "selfcheck", creadorId: 1, creadorNombre: "Selfcheck", creadorEmail: "self@check" }

  try {
    const creados = await Promise.all([
      ...Array.from({ length: N }, () => crearTicketConCodigo({ ...base, areaId: AREA }, fecha)),
      ...Array.from({ length: 3 }, () => crearTicketConCodigo({ ...base, areaId: OTRA }, fecha)),
    ])
    const a = creados.filter((t) => t.areaId === AREA).map((t) => t.numero).sort((x, y) => x - y)
    assert.deepStrictEqual(a, Array.from({ length: N }, (_, i) => i + 1), `consecutivo con huecos o repetidos: ${a}`)
    const b = creados.filter((t) => t.areaId === OTRA).map((t) => t.codigo).sort()
    assert.deepStrictEqual(b, ["ZZB-2099-0001", "ZZB-2099-0002", "ZZB-2099-0003"], "cada área lleva su propio consecutivo")
    assert.ok(creados.every((t) => t.areaNombre.startsWith("Autocheck")), "el nombre del área se toma de MesaArea")
    assert.strictEqual(formatearCodigo("IT", 2026, 7), "IT-2026-0007")

    await prisma.mesaArea.update({ where: { areaId: OTRA }, data: { recibeTickets: false } })
    await assert.rejects(crearTicketConCodigo({ ...base, areaId: OTRA }, fecha), /no recibe tickets/)
    await assert.rejects(crearTicketConCodigo({ ...base, areaId: 990999 }, fecha), /no recibe tickets/)

    console.log(`OK: ${N} tickets concurrentes en un área → 1..${N} sin huecos; consecutivo independiente por área; áreas inactivas rechazadas.`)
  } finally {
    await limpiar(AREA, OTRA)
  }
}

async function limpiar(...areaIds: number[]) {
  await prisma.mesaTicket.deleteMany({ where: { areaId: { in: areaIds } } })
  await prisma.mesaArea.deleteMany({ where: { areaId: { in: areaIds } } })
}

main()
  .catch((err) => {
    console.error("FALLÓ el self-check de mesaCodigo:", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
