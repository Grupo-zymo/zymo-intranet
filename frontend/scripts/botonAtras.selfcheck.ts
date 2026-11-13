// Verifica la decision del boton atras. Ejecutar: npm run selfcheck (Node >= 22.18)
import assert from "node:assert/strict"
import { decidir } from "../src/lib/botonAtras.ts"

const t = [true, false]
for (const estaEnInicio of t)
  for (const hayOperacion of t) {
    assert.equal(decidir({ estaEnInicio, hayDialogo: true, hayOperacion }), "cerrar-dialogo") // un dialogo abierto manda siempre
  }
for (const estaEnInicio of t) {
  assert.equal(decidir({ estaEnInicio, hayDialogo: false, hayOperacion: true }), "quedarse") // operacion: no navegar ni salir
}
assert.equal(decidir({ estaEnInicio: false, hayDialogo: false, hayOperacion: false }), "ir-inicio")
assert.equal(decidir({ estaEnInicio: true, hayDialogo: false, hayOperacion: false }), "confirmar-salida")
console.log("botonAtras.selfcheck OK")
