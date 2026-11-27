/**
 * Self-check de las reglas del listado maestro (sin BD): forma del código, alertas, siguiente código libre,
 * código dentro de un nombre de archivo, normalización de lo que trae el Excel y textos de los avisos.
 * Corre encadenado en: npm run selfcheck
 */
import assert from "node:assert/strict"
import {
  alertasDe, anosDeTexto, codigoEnTexto, disposicionDeTexto, empresaDeTexto, estadoDeTexto, normalizarCodigo,
  repetidosDe, revisarCodigo, siglaDeTipo, siguienteCodigo, textoAvisoListado, tipoDeTexto,
} from "../src/services/listadoMaestro"
import {
  columnasDe, decidirSiglas, enlaceCelda, fechaDe, masFrecuente, siDe, siglaMayoritaria, textoCelda, valorCelda,
} from "../src/services/importarListado"

// ── Normalización y forma del código ──
assert.equal(normalizarCodigo("  fr-005-pn "), "FR-005-PN")
assert.equal(normalizarCodigo("PRC - 001 - GAD"), "PRC-001-GAD", "espacios de más dentro del código")
assert.equal(revisarCodigo("PRC-001-GAD", "Procedimiento"), null)
assert.equal(revisarCodigo("PRT-001-GAD", "Protocolo"), null)
assert.equal(revisarCodigo("PO-001-PESV", "Política"), null, "sigla de área de 4 letras")
assert.match(revisarCodigo("PRC-1-GAD", "Procedimiento") ?? "", /forma/i, "el número lleva tres dígitos")
assert.match(revisarCodigo("PRC-001", "Procedimiento") ?? "", /forma/i)
assert.match(revisarCodigo("XYZ-001-GAD", "Procedimiento") ?? "", /forma/i, "sigla de tipo que no existe")
assert.match(revisarCodigo("PRC-001-GAD", "Formato") ?? "", /FR/, "un formato empieza por FR")
assert.match(revisarCodigo("FR-001-GAD", "Inventado") ?? "", /tipo/i)
assert.equal(siglaDeTipo("Instructivo"), "INS")
assert.equal(tipoDeTexto(" politica "), "Política", "el Excel lo escribe sin tilde")
assert.equal(tipoDeTexto("PROCEDIMIENTO"), "Procedimiento")
assert.equal(tipoDeTexto("Circular"), null)

// ── Alertas ──
const filas = [
  { codigo: "PRC-001-SIG", tipo: "Procedimiento", estado: "APROBADO" },
  { codigo: "PRC-001-SIG", tipo: "Procedimiento", estado: "APROBADO" }, // otra área usa el mismo código
  { codigo: "FR-001-GAD", tipo: "Formato", estado: "APROBADO" },
  { codigo: "FR-001-GAD", tipo: "Formato", estado: "BAJA" }, // dado de baja: no cuenta
  { codigo: "FR-9-GAD", tipo: "Formato", estado: "PENDIENTE" },
]
const rep = repetidosDe(filas)
assert.deepEqual([...rep], ["PRC-001-SIG"])
assert.deepEqual(alertasDe(filas[0], "SIG", rep), ["repetido"])
assert.deepEqual(alertasDe(filas[0], "OPD", rep), ["repetido", "sigla_area"])
assert.deepEqual(alertasDe(filas[2], "GAD", rep), [])
assert.deepEqual(alertasDe(filas[2], null, rep), [], "sin sigla del área no se puede comparar")
assert.deepEqual(alertasDe(filas[3], "SIG", rep), [], "una fila dada de baja no tiene alertas")
assert.deepEqual(alertasDe(filas[4], "GAD", rep), ["forma"], "lo importado con forma mala queda marcado")

// ── Siguiente código libre ──
assert.equal(siguienteCodigo("Formato", "GAD", ["FR-001-GAD", "FR-024-GAD", "PRC-030-GAD", "FR-099-PN"]), "FR-025-GAD")
assert.equal(siguienteCodigo("Formato", "GAD", []), "FR-001-GAD")
assert.equal(siguienteCodigo("Formato", null, ["FR-001-GAD"]), null, "sin sigla del área no hay sugerencia")
assert.equal(siguienteCodigo("Formato", "GAD", ["FR-999-GAD"]), null, "no pasa de 999")

// ── Código al inicio del nombre de un formato o anexo ──
assert.equal(codigoEnTexto("FR-001-GAD Registro de proveedores"), "FR-001-GAD")
assert.equal(codigoEnTexto("fr-001-gad_registro_proveedores.xlsx"), "FR-001-GAD")
assert.equal(codigoEnTexto("  PRT-002-GSC.pdf"), "PRT-002-GSC")
assert.equal(codigoEnTexto("Registro FR-001-GAD"), null, "solo cuenta al inicio")
assert.equal(codigoEnTexto("FR-0011-GAD algo"), null)
assert.equal(codigoEnTexto(null), null)

// ── Lo que trae el Excel ──
assert.equal(anosDeTexto("2 años"), 2)
assert.equal(anosDeTexto("1 año"), 1)
assert.equal(anosDeTexto(4), 4)
assert.equal(anosDeTexto("4"), 4)
assert.equal(anosDeTexto("No aplica"), null)
assert.equal(anosDeTexto(""), null)
assert.equal(empresaDeTexto("TRASVERSAL"), "Transversal")
assert.equal(empresaDeTexto("Trasversal"), "Transversal")
assert.equal(empresaDeTexto("IMC CARGO"), "IMC Cargo")
assert.equal(empresaDeTexto("LOGIMAT"), "Logimat")
assert.equal(empresaDeTexto("Otra S.A.S."), "Otra S.A.S.", "lo que no reconoce lo deja como venía")
assert.equal(empresaDeTexto(null), null)
assert.equal(estadoDeTexto("APROBADO"), "APROBADO")
assert.equal(estadoDeTexto("aprobado"), "APROBADO")
assert.equal(estadoDeTexto("No aprobado (Falta Codigo)"), "PENDIENTE")
assert.equal(estadoDeTexto("No enviaron documento"), "PENDIENTE")
assert.equal(disposicionDeTexto("Eliminación"), "Eliminación")
assert.equal(disposicionDeTexto("Conservación Total"), "Conservación total")
assert.equal(disposicionDeTexto("Almacenamiento Magnetico"), "Almacenamiento magnético")
assert.equal(disposicionDeTexto("otra cosa"), null)

// ── Textos de los avisos al líder ──
assert.equal(
  textoAvisoListado({ accion: "creado", quien: "Pepito Pérez", codigo: "FR-025-GAD", nombre: "Control de llaves" }),
  "Pepito Pérez creó el código FR-025-GAD (Control de llaves) en el listado maestro",
)
assert.equal(
  textoAvisoListado({ accion: "cambiado", quien: "Pepito Pérez", codigo: "FR-006-PN", codigoAnterior: "FR-005-PN", nombre: "Matriz de riesgos clientes" }),
  "Pepito Pérez cambió el código FR-005-PN a FR-006-PN (Matriz de riesgos clientes)",
)
assert.equal(
  textoAvisoListado({ accion: "baja", quien: "Pepito Pérez", codigo: "FR-012-GAD", nombre: "Control administrativo" }),
  "Pepito Pérez dio de baja FR-012-GAD (Control administrativo)",
)
assert.equal(
  textoAvisoListado({ accion: "baja", quien: "Pepito", codigo: "FR-012-GAD", nombre: "Control", motivo: " Lo reemplaza\nel FR-030-GAD " }),
  "Pepito dio de baja FR-012-GAD (Control): Lo reemplaza el FR-030-GAD",
)
const largo = textoAvisoListado({ accion: "baja", quien: "Pepito", codigo: "FR-012-GAD", nombre: "x".repeat(200), motivo: "y".repeat(97) + "😀" + "z".repeat(50) })
assert.ok(largo.length <= 300 && largo.endsWith("…"))
assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(largo), "sin medio emoji")

// ── Importación del Excel: columnas por encabezado, celdas de exceljs y siglas ──
// Encabezados reales de dos hojas con distinto orden («Administrativo» y «Desarrollo e Innov»).
const admin = columnasDe([, "N°", "Revisado", "Aprobado", "Tipo de Documento", "Nombre del Documento", "Area", "Empresa que Aplica",
  "Codigo Generado", "Fecha de inicial de creacion", "N° de Version", "Fecha de última actualizacion", "Control de Cambios",
  "Tiempo Archivo Activo en años", "Tiempo Archivo Inactivo en años", "Disposicion Final", "Ubicacion del Documento (Espacio Exclusivo SIG)"])
assert.deepEqual([admin.revisado, admin.aprobado, admin.tipo, admin.codigo, admin.anosActivo, admin.anosInactivo, admin.ubicacion], [2, 3, 4, 8, 13, 14, 16])
const desarrollo = columnasDe([, "N°", "Tipo de Documento", "Revisado", "Aprobado", "Nombre del Documento", "Area", "Codigo Generado",
  "Fecha de inicial de creacion", "N° de Version", "Fecha de última actualizacion", " ", "Tiempo Archivo Activo", "Tiempo Archivo Inactivo",
  "Disposicion Final", "Ubicacion del Documento (Espacio Exclusivo SIG)", "Nombre de indicador", "Tipo de indicador"])
assert.deepEqual([desarrollo.tipo, desarrollo.revisado, desarrollo.codigo, desarrollo.anosActivo, desarrollo.anosInactivo], [2, 3, 7, 12, 13])
assert.equal(desarrollo.empresa, undefined, "hoja sin «Empresa que Aplica»")
assert.equal(desarrollo.controlCambios, undefined, "encabezado vacío, como en «Gestión IT»")

assert.equal(valorCelda({ formula: "IF(1,\"x\")", result: "PRC-001-PN" }), "PRC-001-PN")
assert.equal(valorCelda({ sharedFormula: "L3", result: 4 }), 4)
assert.equal(valorCelda({ formula: "VLOOKUP()", result: { error: "#N/A" } }), null)
assert.equal(valorCelda({ richText: [{ text: "FR-005" }, { text: "-PN " }] }), "FR-005-PN ")
assert.equal(textoCelda({ text: { richText: [{ text: "PROYECTOS" }] }, hyperlink: "https://x/y" }), "PROYECTOS")
assert.equal(enlaceCelda({ text: { richText: [{ text: "PROYECTOS" }] }, hyperlink: "https://x/y" }), "https://x/y", "la ubicación es el enlace")
assert.equal(enlaceCelda("https://x/z"), "https://x/z")
assert.equal(textoCelda(1), "1")
assert.equal(textoCelda(null), "")
assert.equal(siDe(true), true)
assert.equal(siDe("True"), true)
assert.equal(siDe(""), false)
assert.equal(siDe(null), false)
assert.equal(fechaDe(new Date("2026-09-03T00:00:00Z"))?.toISOString(), "2026-09-03T00:00:00.000Z")
assert.equal(fechaDe("04/09/2026")?.toISOString(), "2026-09-04T00:00:00.000Z", "día/mes/año")
assert.equal(fechaDe("2026-09-04")?.toISOString(), "2026-09-04T00:00:00.000Z")
assert.equal(fechaDe(46269)?.toISOString(), "2026-09-04T00:00:00.000Z", "número de serie de Excel")
assert.equal(fechaDe("04/09/0206"), null, "año mal escrito en el Excel real")
assert.equal(fechaDe("31/02/2026"), null)
assert.equal(fechaDe("No aplica"), null)

assert.deepEqual(siglaMayoritaria(["PRC-001-GAD", "FR-001-GAD", "FR-002-SIG", "FR-9"]), { valor: "GAD", veces: 2 })
assert.equal(siglaMayoritaria([]), null)
assert.deepEqual(masFrecuente(["A", "B"]), { valor: "A", veces: 1 }, "empate: gana el primero")
const dec = decidirSiglas(
  [
    { nombre: "Adm", id: 1, actual: null, propuesta: "GAD" },
    { nombre: "SAC", id: 2, actual: null, propuesta: "GSC" },
    { nombre: "Seg", id: 3, actual: null, propuesta: "GSC" },
    { nombre: "TyC", id: 4, actual: "TYC", propuesta: "GTC" },
    { nombre: "Oper", id: 5, actual: null, propuesta: "SIG" },
    { nombre: "Hoja suelta", id: null, actual: null, propuesta: "PN" },
    { nombre: "Vacía", id: 7, actual: null, propuesta: null },
  ],
  [{ id: 9, nombre: "SIG", sigla: "SIG" }, { id: 4, nombre: "TyC", sigla: "TYC" }],
)
assert.deepEqual(dec.map((d) => d.asignar), [true, false, false, false, false, false, false])
assert.deepEqual(dec.map((d) => d.conflicto), [false, true, true, false, true, false, false])
assert.match(dec[1].texto, /Seg/, "dos carpetas proponen la misma: ninguna la recibe")
assert.match(dec[3].texto, /no se pisa/)
assert.match(dec[4].texto, /SIG/, "otra carpeta ya la tiene")
assert.match(dec[5].texto, /darle carpeta/)

console.log("listadoMaestro.selfcheck OK")
