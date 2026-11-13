// Verifica el saneado de nombres, Content-Disposition y que la ruta web se conserva. Ejecutar: npm run selfcheck
import assert from "node:assert/strict"
import { crearGuardador, esCancelacion, nombreDesdeDisposition, rutaUnica, sanearNombre } from "../src/lib/archivosCore.ts"

// Saneado: sin rutas ni caracteres peligrosos, extension conservada
assert.equal(sanearNombre("../../etc/passwd"), "passwd")
const BS = String.fromCharCode(92)
assert.equal(sanearNombre(["C:", "Users", "x", "factura.pdf"].join(BS)), "factura.pdf")
assert.equal(sanearNombre('a<b>c:"d|e?f*.xlsx'), "a_b_c__d_e_f_.xlsx")
assert.equal(sanearNombre("  .oculto.txt "), "oculto.txt")
assert.equal(sanearNombre(""), "archivo")
assert.equal(sanearNombre(null, "x.pdf"), "x.pdf")
assert.equal(sanearNombre("informe final 2026.PDF"), "informe final 2026.PDF")
const largo = sanearNombre(`${"a".repeat(300)}.pdf`)
assert.ok(largo.length <= 100 && largo.endsWith(".pdf"))
assert.ok(!/[\/:*?"<>|\u0000-\u001f]/.test(sanearNombre("x\u0000y/../z\n.pdf")))

// Ruta unica: subcarpeta distinta por archivo, nombre visible limpio (sin sufijo tecnico)
const r1 = rutaUnica("descargas", "reporte.pdf", 1, "aaaa"), r2 = rutaUnica("descargas", "reporte.pdf", 2, "bbbb")
assert.ok(r1 !== r2)
assert.ok(/^descargas\/[a-z0-9]+\/reporte\.pdf$/.test(r1))
assert.equal(r1.split("/").pop(), "reporte.pdf")
assert.equal(rutaUnica("descargas", "sinext", 1, "a").split("/").pop(), "sinext")

// Content-Disposition
assert.equal(nombreDesdeDisposition('attachment; filename="OC-123.pdf"', "x.pdf"), "OC-123.pdf")
assert.equal(nombreDesdeDisposition("attachment; filename=OC-123.xlsx", "x"), "OC-123.xlsx")
assert.equal(nombreDesdeDisposition("attachment; filename*=UTF-8''Cotizaci%C3%B3n%20Ni%C3%B1o.pdf", "x"), "Cotización Niño.pdf")
assert.equal(nombreDesdeDisposition('attachment; filename="../../mal.pdf"', "x"), "mal.pdf")
assert.equal(nombreDesdeDisposition(undefined, "respaldo.xlsx"), "respaldo.xlsx")
assert.equal(nombreDesdeDisposition("inline", "respaldo.xlsx"), "respaldo.xlsx")

// Cancelar el selector de compartir no es error
assert.equal(esCancelacion(new Error("Share canceled")), true)
assert.equal(esCancelacion("Share cancelled"), true)
assert.equal(esCancelacion(new Error("disco lleno")), false)

// Web: se conserva la ruta web tal cual (sin sanear ni tocar el nativo); nativo: solo la ruta nativa con nombre saneado
const llamadas: string[] = []
const blob = new Blob(["x"])
const web = crearGuardador({ esNativo: false, web: (_b, n) => llamadas.push(`web:${n}`), nativo: async () => { llamadas.push("nativo") } })
await web(blob, "../raro nombre.pdf")
assert.deepEqual(llamadas, ["web:../raro nombre.pdf"])
llamadas.length = 0
const nat = crearGuardador({ esNativo: true, web: () => llamadas.push("web"), nativo: async (_b, n) => { llamadas.push(`nativo:${n}`) } })
await nat(blob, "../raro nombre.pdf")
assert.deepEqual(llamadas, ["nativo:raro nombre.pdf"])

console.log("archivos.selfcheck OK")
