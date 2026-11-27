// Importación única del Excel «FR-002-SIG LISTADO MAESTRO» al listado maestro del SIG (SigListadoMaestro).
// Simulacro por defecto: no escribe nada. Con --aplicar escribe, una transacción por hoja. No crea avisos.
// Idempotente por (carpeta, código normalizado, nombre) y termina comparando conteos por carpeta (CLAUDE.md, «Siembra
// de datos reales»). Dos documentos distintos con el mismo código en la misma carpeta entran los dos: el código repetido
// es justo lo que el SIG debe ver y corregir (la pantalla lo marca). Diseño: docs/superpowers/specs/2026-11-27-sig-listado-maestro-design.md §5.
//
// Uso:
//   npm run importar:listado -- <ruta.xlsx> [--aplicar] [--mapa "Hoja=Carpeta"]... [--hoja "Hoja"]... [--autor "Nombre"]
//   --mapa   asigna una hoja a una carpeta del SIG (nombre o id); sin él, por nombre de hoja o por la columna «Area».
//   --hoja   procesa solo esas hojas (sin él, todas menos «Listas»).

import { parseArgs } from "node:util"
import ExcelJS from "exceljs"
import type { Prisma } from "@prisma/client"
import prisma from "../src/config/prisma"
import {
  anosDeTexto, disposicionDeTexto, empresaDeTexto, estadoDeTexto, normalizarCodigo, plano, revisarCodigo, tipoDeTexto,
} from "../src/services/listadoMaestro"
import {
  ENCABEZADOS, columnasDe, decidirSiglas, enlaceCelda, fechaDe, masFrecuente, siDe, siglaMayoritaria, textoCelda, valorCelda,
  type Campo,
} from "../src/services/importarListado"

type Carpeta = { id: number; nombre: string; sigla: string | null }
/** Llave natural de una fila dentro de su carpeta: el mismo documento es mismo código y mismo nombre. */
const llave = (codigo: string, nombre: string) => `${codigo}|${plano(nombre)}`
type FilaNueva = Omit<Prisma.SigListadoMaestroCreateManyInput, "areaId">
type Destino = {
  nombre: string
  carpeta: Carpeta | null
  hojas: string[]
  existentes: Set<string> // llaves (código + nombre) que la carpeta ya tiene en la base
  antes: number
  vistos: Map<string, string> // llave (código + nombre) → dónde apareció primero en esta corrida
  codigos: string[] // todos los códigos del Excel que quedan en esta carpeta (nuevos y ya existentes)
}
type Hoja = {
  nombre: string
  destino: Destino | null
  como: string
  leidas: number
  filas: FilaNueva[]
  yaExistian: number
  omitidas: string[]
  revisar: string[]
  sinColumna: string[]
}

const LIMITES: [string, keyof FilaNueva, number][] = [["código", "codigo", 30], ["nombre", "nombre", 300], ["empresa", "empresa", 60], ["versión", "version", 20]]
const nombreCarpeta = (c: Carpeta) => `carpeta ${c.id} «${c.nombre}»`

function fallar(msg: string): never {
  throw Object.assign(new Error(msg), { deUso: true })
}

/** Una carpeta por nombre (`plano`) o por id; error claro si no está o si hay dos con ese nombre. */
function carpetaPor(texto: string, carpetas: Carpeta[]): Carpeta | null | "ambigua" {
  const t = texto.trim()
  if (/^\d+$/.test(t)) return carpetas.find((c) => c.id === Number(t)) ?? null
  const iguales = carpetas.filter((c) => plano(c.nombre) === plano(t))
  return iguales.length > 1 ? "ambigua" : iguales[0] ?? null
}

async function main() {
  const uso = 'Uso: npm run importar:listado -- <ruta.xlsx> [--aplicar] [--mapa "Hoja=Carpeta"]... [--hoja "Hoja"]... [--autor "Nombre"]'
  let args
  try {
    args = parseArgs({
      allowPositionals: true,
      options: { aplicar: { type: "boolean" }, mapa: { type: "string", multiple: true }, hoja: { type: "string", multiple: true }, autor: { type: "string" } },
    })
  } catch (e) {
    fallar(`${(e as Error).message}\n${uso}`)
  }
  const { values: op, positionals } = args
  const ruta = positionals[0]
  if (!ruta) fallar(`Falta la ruta del Excel. ${uso}`)
  const aplicar = !!op.aplicar
  const quien = op.autor?.trim() || "Importación FR-002-SIG"

  const libro = new ExcelJS.Workbook()
  await libro.xlsx.readFile(ruta)
  const hojasLibro = libro.worksheets.filter((ws) => plano(ws.name) !== "listas")
  const hojaLlamada = (n: string) => hojasLibro.find((ws) => plano(ws.name) === plano(n))
  const carpetas: Carpeta[] = await prisma.sigArea.findMany({ select: { id: true, nombre: true, sigla: true }, orderBy: { id: "asc" } })
  const listaCarpetas = carpetas.map(nombreCarpeta).join(", ") || "(ninguna)"

  // ── Argumentos: todo se valida antes de leer filas o escribir ──
  const mapa = new Map<string, Carpeta>()
  for (const m of op.mapa ?? []) {
    const i = m.indexOf("=")
    if (i < 1) fallar(`--mapa «${m}»: debe ser "Hoja=Carpeta".`)
    const hoja = hojaLlamada(m.slice(0, i))
    if (!hoja) fallar(`--mapa «${m}»: el Excel no tiene la hoja «${m.slice(0, i).trim()}». Hojas: ${hojasLibro.map((w) => `«${w.name}»`).join(", ")}.`)
    const c = carpetaPor(m.slice(i + 1), carpetas)
    if (c === "ambigua") fallar(`--mapa «${m}»: hay varias carpetas con ese nombre; usa el id. Carpetas: ${listaCarpetas}.`)
    const buscada = m.slice(i + 1).trim()
    if (!c) fallar(`--mapa «${m}»: no hay ninguna carpeta ${/^\d+$/.test(buscada) ? `con id ${buscada}` : `«${buscada}»`} en el SIG. Carpetas: ${listaCarpetas}.`)
    mapa.set(hoja.name, c)
  }
  for (const h of op.hoja ?? []) if (!hojaLlamada(h)) fallar(`--hoja «${h}»: el Excel no tiene esa hoja.`)
  const elegidas = op.hoja?.length ? hojasLibro.filter((ws) => op.hoja!.some((h) => plano(h) === plano(ws.name))) : hojasLibro

  // ── Lectura ──
  const destinos = new Map<string, Destino>()
  const destinoDe = async (carpeta: Carpeta | null, hoja: string): Promise<Destino> => {
    const clave = carpeta ? `c${carpeta.id}` : `h${hoja}`
    let d = destinos.get(clave)
    if (!d) {
      const ya = carpeta ? await prisma.sigListadoMaestro.findMany({ where: { areaId: carpeta.id }, select: { codigo: true, nombre: true } }) : []
      d = {
        nombre: carpeta ? nombreCarpeta(carpeta) : `«${hoja}» (sin carpeta)`,
        carpeta, hojas: [], existentes: new Set(ya.map((r) => llave(r.codigo, r.nombre))), antes: ya.length, vistos: new Map(), codigos: [],
      }
      destinos.set(clave, d)
    }
    d.hojas.push(hoja)
    return d
  }

  const hojas: Hoja[] = []
  const vacias: string[] = []
  for (const ws of elegidas) {
    const encabezados: unknown[] = []
    ws.getRow(2).eachCell((c, i) => { encabezados[i] = c.value })
    const cols = columnasDe(encabezados)
    const filasExcel: { r: number; get: (campo: Campo) => ExcelJS.CellValue }[] = []
    for (let r = 3; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const get = (campo: Campo) => (cols[campo] === undefined ? null : row.getCell(cols[campo]!).value)
      if (textoCelda(get("codigo")) || textoCelda(get("nombre"))) filasExcel.push({ r, get })
    }
    if (!filasExcel.length) { vacias.push(ws.name); continue }

    // Hoja → carpeta: --mapa, nombre de la hoja, o el valor más frecuente de «Area».
    let carpeta: Carpeta | null = mapa.get(ws.name) ?? null
    let como = "por --mapa"
    if (!carpeta) {
      const porHoja = carpetaPor(ws.name, carpetas)
      const area = masFrecuente(filasExcel.map((f) => textoCelda(f.get("area"))))?.valor ?? ""
      const porArea = area ? carpetaPor(area, carpetas) : null
      if (porHoja && porHoja !== "ambigua") { carpeta = porHoja; como = "por el nombre de la hoja" }
      else if (porArea && porArea !== "ambigua") { carpeta = porArea; como = `por la columna Area («${area}»)` }
      else como = `ninguna carpeta se llama «${ws.name}»${area && plano(area) !== plano(ws.name) ? ` ni «${area}» (columna Area)` : ""}${porHoja === "ambigua" || porArea === "ambigua" ? "; hay varias con ese nombre" : ""}`
    }
    const destino = await destinoDe(carpeta, ws.name)
    const h: Hoja = {
      nombre: ws.name, destino, como, leidas: filasExcel.length, filas: [], yaExistian: 0, omitidas: [], revisar: [],
      sinColumna: (Object.keys(ENCABEZADOS) as Campo[]).filter((c) => cols[c] === undefined).map((c) => ENCABEZADOS[c]),
    }
    hojas.push(h)

    for (const { r, get } of filasExcel) {
      const codigo = normalizarCodigo(textoCelda(get("codigo")))
      const nombre = textoCelda(get("nombre"))
      const tipoTxt = textoCelda(get("tipo"))
      const tipo = tipoDeTexto(tipoTxt)
      const omitir = (motivo: string) => h.omitidas.push(`fila ${r}${codigo ? ` (${codigo})` : ""}: ${motivo}`)
      if (!codigo) { omitir("sin código"); continue }
      if (!nombre) { omitir("sin nombre"); continue }
      if (!tipo) { omitir(`tipo «${tipoTxt}» fuera del catálogo`); continue }

      const estadoTxt = textoCelda(get("aprobado"))
      const notas: string[] = []
      const fecha = (campo: Campo, etiqueta: string) => {
        const f = fechaDe(get(campo))
        if (!f && textoCelda(get(campo))) notas.push(`${etiqueta} no válida en el Excel: «${textoCelda(get(campo))}»`)
        return f
      }
      const dispTxt = textoCelda(get("disposicion"))
      const disposicionFinal = disposicionDeTexto(dispTxt)
      if (dispTxt && !disposicionFinal) notas.push(`disposición final no reconocida: «${dispTxt}»`)
      const fila: FilaNueva = {
        tipo, codigo, nombre,
        empresa: empresaDeTexto(textoCelda(get("empresa"))),
        version: textoCelda(get("version")) || null,
        fechaCreacion: fecha("fechaCreacion", "fecha de creación"),
        fechaActualizacion: fecha("fechaActualizacion", "fecha de última actualización"),
        controlCambios: textoCelda(get("controlCambios")) || null,
        anosActivo: anosDeTexto(valorCelda(get("anosActivo"))),
        anosInactivo: anosDeTexto(valorCelda(get("anosInactivo"))),
        disposicionFinal,
        ubicacion: enlaceCelda(get("ubicacion")) || null,
        revisado: siDe(get("revisado")),
        estado: estadoDeTexto(estadoTxt),
        creadoPor: quien,
      }
      const largo = LIMITES.find(([, k, max]) => String(fila[k] ?? "").length > max)
      if (largo) { omitir(`${largo[0]} de más de ${largo[2]} caracteres`); continue }

      const k = llave(codigo, nombre)
      if (destino.existentes.has(k)) { h.yaExistian++; destino.codigos.push(codigo); continue }
      const previa = destino.vistos.get(k)
      if (previa) { omitir(`fila idéntica a la de ${previa} (mismo código y nombre) — «${nombre}»`); continue }
      const mismoCodigo = [...destino.vistos.entries()].find(([v]) => v.startsWith(`${codigo}|`))
      if (mismoCodigo) h.revisar.push(`fila ${r} (${codigo}): mismo código que ${mismoCodigo[1]} con otro nombre («${nombre}»). Se importa igual y queda marcada como repetida.`)
      destino.vistos.set(k, `«${ws.name}» fila ${r}`)
      destino.codigos.push(codigo)

      const forma = revisarCodigo(codigo, tipo)
      if (forma) h.revisar.push(`fila ${r} (${codigo}): ${forma} Se importa igual.`)
      for (const n of notas) h.revisar.push(`fila ${r} (${codigo}): ${n}; queda vacía.`)
      const detalle = `Hoja «${ws.name}», fila ${r}; estado en el Excel: ${estadoTxt ? `«${estadoTxt}»` : "vacío"}${notas.length ? `; ${notas.join("; ")}` : ""}`
      fila.historial = [{ fecha: new Date().toISOString(), quien, accion: "importado", detalle }]
      h.filas.push(fila)
    }
  }

  // ── Siglas por mayoría ──
  const listaDestinos = [...destinos.values()]
  const propuestas = listaDestinos.map((d) => siglaMayoritaria(d.codigos))
  const decisiones = decidirSiglas(
    listaDestinos.map((d, i) => ({ nombre: d.nombre, id: d.carpeta?.id ?? null, actual: d.carpeta?.sigla ?? null, propuesta: propuestas[i]?.valor ?? null })),
    carpetas.map((c) => ({ id: c.id, nombre: nombreCarpeta(c), sigla: c.sigla })),
  )

  // ── Escritura ──
  const insertadas = new Map<Destino, number>()
  if (aplicar) {
    for (const h of hojas) {
      const carpeta = h.destino?.carpeta
      if (!carpeta || !h.filas.length) continue
      const data = h.filas.map((f) => ({ ...f, areaId: carpeta.id }))
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.sigListadoMaestro.createMany({ data })
        if (count !== data.length) throw new Error(`Hoja «${h.nombre}»: se esperaban ${data.length} inserciones y hubo ${count}; se revierte la hoja.`)
      })
      insertadas.set(h.destino!, (insertadas.get(h.destino!) ?? 0) + data.length)
    }
    for (const [i, d] of listaDestinos.entries()) {
      if (decisiones[i].asignar && d.carpeta) {
        await prisma.sigArea.updateMany({ where: { id: d.carpeta.id, sigla: null }, data: { sigla: propuestas[i]!.valor } })
      }
    }
  }

  // ── Informe ──
  const verbo = aplicar ? "insertadas" : "a insertar"
  console.log(aplicar ? "=== IMPORTACIÓN (--aplicar) ===" : "=== SIMULACRO: no se escribe nada. Corre con --aplicar para cargar. ===")
  console.log(`Excel: ${ruta}\nAutor en el historial: ${quien}\n`)
  for (const h of hojas) {
    const d = h.destino!
    console.log(`Hoja «${h.nombre}» → ${d.carpeta ? `${d.nombre} (${h.como})` : `SIN CARPETA (${h.como}); se omite`}`)
    console.log(`  ${h.leidas} leídas · ${h.filas.length} ${d.carpeta ? verbo : "entrarían"} · ${h.yaExistian} ya existían · ${h.omitidas.length} omitidas`)
    if (h.sinColumna.length) console.log(`  sin columna: ${h.sinColumna.join(", ")}`)
    for (const o of h.omitidas) console.log(`  omitida ${o}`)
    for (const r of h.revisar) console.log(`  revisar ${r}`)
  }
  if (vacias.length) console.log(`\nHojas vacías: ${vacias.map((v) => `«${v}»`).join(", ")}`)
  const sinCarpeta = hojas.filter((h) => !h.destino!.carpeta)
  if (sinCarpeta.length) console.log(`\nHojas sin carpeta (${sinCarpeta.length}): asígnalas con --mapa "Hoja=Carpeta". Carpetas del SIG: ${listaCarpetas}`)
  for (const d of listaDestinos) if (d.carpeta && d.hojas.length > 1) console.log(`\nAtención: ${d.hojas.map((x) => `«${x}»`).join(" y ")} van a la misma ${d.nombre}.`)

  console.log("\nSiglas de área (sufijo más frecuente de los códigos):")
  listaDestinos.forEach((d, i) => {
    const p = propuestas[i]
    console.log(`  ${d.nombre}: ${decisiones[i].texto}${p ? ` [${p.veces} de ${d.codigos.length} códigos]` : ""}`)
  })
  const conflictos = decisiones.filter((x) => x.conflicto).length
  console.log(`  ${conflictos} con conflicto.${aplicar ? "" : " Nada se escribe en el simulacro."}`)

  const dondeEsta = new Map<string, string[]>()
  for (const d of listaDestinos) for (const c of new Set(d.codigos)) dondeEsta.set(c, [...(dondeEsta.get(c) ?? []), d.nombre])
  const repetidos = [...dondeEsta].filter(([, ds]) => ds.length > 1).sort(([a], [b]) => a.localeCompare(b))
  console.log(`\nCódigos repetidos entre carpetas (${repetidos.length}; se importan igual, el SIG los debe corregir):`)
  for (const [c, ds] of repetidos) console.log(`  ${c}: ${ds.join(", ")}`)

  const suma = (f: (h: Hoja) => number) => hojas.reduce((s, h) => s + f(h), 0)
  console.log(
    `\nTotal: ${hojas.length} hojas con filas, ${suma((h) => h.leidas)} filas leídas, ` +
      `${suma((h) => (h.destino!.carpeta ? h.filas.length : 0))} ${verbo}, ${suma((h) => h.yaExistian)} ya existían, ` +
      `${suma((h) => h.omitidas.length)} omitidas, ${suma((h) => (h.destino!.carpeta ? 0 : h.filas.length))} en hojas sin carpeta.`,
  )

  // ── Aserción final: filas después = antes + insertadas, por carpeta ──
  if (aplicar) {
    let bien = true
    for (const d of listaDestinos) {
      if (!d.carpeta) continue
      const esperado = d.antes + (insertadas.get(d) ?? 0)
      const real = await prisma.sigListadoMaestro.count({ where: { areaId: d.carpeta.id } })
      if (real !== esperado) {
        bien = false
        console.error(`✗ ${d.nombre}: se esperaban ${esperado} filas (${d.antes} antes + ${insertadas.get(d) ?? 0}) y hay ${real}.`)
      }
    }
    if (!bien) { process.exitCode = 1; return }
    console.log("✓ Conteos cuadran en todas las carpetas.")
  }
}

main()
  .catch((e) => {
    console.error(e?.deUso ? `Error: ${e.message}\nNo se escribió nada.` : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
