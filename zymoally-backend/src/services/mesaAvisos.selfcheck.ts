import assert from "assert"
import { destinatarios } from "./mesaAvisos"

// Self-check sin base de datos (npm run selfcheck): a quién le llega cada aviso.

const AREA = [1, 2, 3, 4]
const base = { miembrosArea: AREA, creadorId: 10, incluirCreador: false }

// Sin responsable: a toda el área, menos quien hizo la acción
assert.deepStrictEqual(destinatarios({ ...base, responsables: [], actorId: 10 }), [1, 2, 3, 4], "ticket nuevo: toda el área")
assert.deepStrictEqual(destinatarios({ ...base, responsables: [], actorId: 2 }), [1, 3, 4], "nunca a quien hizo la acción")

// Con responsable: solo a los responsables (el resto del área deja de recibir)
assert.deepStrictEqual(destinatarios({ ...base, responsables: [3], actorId: 10 }), [3])
assert.deepStrictEqual(destinatarios({ ...base, responsables: [3, 4], actorId: 3 }), [4])
assert.deepStrictEqual(destinatarios({ ...base, responsables: [3], actorId: 3 }), [], "si solo está él, no hay a quién avisar")

// Lo que le importa a quien lo pidió también le llega a él; una nota interna, nunca
assert.deepStrictEqual(destinatarios({ ...base, responsables: [3], actorId: 3, incluirCreador: true }), [10], "respuesta del área → quien lo pidió")
assert.deepStrictEqual(destinatarios({ ...base, responsables: [3, 4], actorId: 3, incluirCreador: true }), [4, 10])
assert.deepStrictEqual(destinatarios({ ...base, responsables: [3], actorId: 10, incluirCreador: true }), [3], "si responde quien lo pidió, no se avisa a sí mismo")
assert.deepStrictEqual(destinatarios({ ...base, responsables: [10], actorId: 2, incluirCreador: true }), [10], "sin duplicados si quien lo pidió también es responsable")

// Destinatarios fijos (la persona recién asignada): ignora área y responsables
assert.deepStrictEqual(destinatarios({ ...base, responsables: [3], actorId: 2, soloEstos: [4] }), [4])
assert.deepStrictEqual(destinatarios({ ...base, responsables: [], actorId: 4, soloEstos: [4] }), [], "tomarlo uno mismo no genera aviso")

console.log("OK: avisos — área completa sin responsable, solo responsables cuando los hay, quien lo pidió cuando le importa, nunca el actor.")
