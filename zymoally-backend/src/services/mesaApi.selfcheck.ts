import assert from "assert"
import fs from "fs"
import path from "path"
import type { AddressInfo } from "net"
import jwt from "jsonwebtoken"
import { env } from "../config/env"
import { prisma } from "../config/prisma"
import app from "../app"
import { PERM_MESA_LIDER } from "./mesaAuth"
import { avisarFueraDeMeta } from "./mesaAvisos"
import { DIR_EVIDENCIAS } from "../routers/mesa/tickets"

// Self-check de punta a punta (npm run selfcheck:mesa): la API real + la BD real,
// con personas de varias áreas. Solo se simula el backend Python (cuentas y áreas).

const IT = 990001
const SAC = 990002
const TYC = 990003
const AREAS = [IT, SAC, TYC]

const P = {
  admin: { id: 9001, role: "admin", area: "ZZ IT" },
  creador: { id: 9010, area: "ZZ TyC" },
  it1: { id: 9020, area: "zz  it" }, // mayúsculas y espacios distintos: misma área
  it2: { id: 9021, area: "ZZ IT" },
  lider: { id: 9022, area: "ZZ IT", app_permissions: [PERM_MESA_LIDER] },
  sac: { id: 9030, area: "ZZ SAC" },
  ajeno: { id: 9050, area: "ZZ TyC" },
} as const
type Quien = keyof typeof P

const cuentas = Object.entries(P).map(([k, p]) => ({ id: p.id, full_name: `Persona ${k}`, nombre: `Persona ${k}`, email: `${k}@zz.test`, area: p.area, cargo: null }))

// ── Backend Python simulado ──
const fetchReal = globalThis.fetch
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = String(input)
  if (!url.startsWith(env.INTRANET_API_URL)) return fetchReal(input, init)
  const u = new URL(url)
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { "content-type": "application/json" } })
  if (u.pathname === "/api/tasks-v2/users") return json(cuentas)
  if (u.pathname === "/api/tasks-v2/users-por-area") {
    const pref = (u.searchParams.get("prefijo") ?? "").toLowerCase()
    return json(cuentas.filter((c) => c.area.toLowerCase().replace(/\s+/g, " ").startsWith(pref)))
  }
  if (u.pathname === "/areas") return json([{ id: IT, name: "ZZ IT" }, { id: SAC, name: "ZZ SAC" }, { id: TYC, name: "ZZ TyC" }])
  return new Response("{}", { status: 404 })
}) as typeof fetch

let base = ""
const token = (q: Quien) => jwt.sign({ sub: `${q}@zz.test`, ...P[q] }, env.JWT_SECRET, { algorithm: "HS256", expiresIn: "5m" })

async function api(q: Quien, metodo: string, ruta: string, cuerpo?: unknown) {
  const esForm = cuerpo instanceof FormData
  const res = await fetchReal(`${base}/api/mesa${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token(q)}`, ...(cuerpo && !esForm ? { "Content-Type": "application/json" } : {}) },
    body: cuerpo === undefined ? undefined : esForm ? cuerpo : JSON.stringify(cuerpo),
  })
  const texto = await res.text()
  let data: any = texto // eslint-disable-line @typescript-eslint/no-explicit-any
  try { data = JSON.parse(texto) } catch { /* archivo o cuerpo vacío */ }
  return { status: res.status, data }
}

function formulario(campos: Record<string, string>, archivo?: string) {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.set(k, v)
  if (archivo) f.append("evidencias", new Blob([archivo], { type: "text/plain" }), "prueba.txt")
  return f
}

async function limpiar() {
  const evidencias = await prisma.mesaEvidencia.findMany({ where: { ticket: { OR: [{ areaId: { in: AREAS } }, { creadorId: { gte: 9000, lt: 9100 } }] } }, select: { ruta: true } })
  for (const e of evidencias) fs.rmSync(path.join(DIR_EVIDENCIAS, e.ruta), { force: true })
  await prisma.mesaTicket.deleteMany({ where: { OR: [{ areaId: { in: AREAS } }, { creadorId: { gte: 9000, lt: 9100 } }] } })
  await prisma.mesaCategoria.deleteMany({ where: { areaId: { in: AREAS } } })
  await prisma.mesaArea.deleteMany({ where: { areaId: { in: AREAS } } })
  await prisma.mesaPushSub.deleteMany({ where: { userId: { gte: 9000, lt: 9100 } } })
}

async function main() {
  await limpiar()
  const server = app.listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    // ── Configuración: solo admin activa áreas; el nombre sale del panel, no del navegador ──
    assert.strictEqual((await api("creador", "PUT", `/areas/${IT}`, { prefijo: "ZZI" })).status, 403)
    const aIT = await api("admin", "PUT", `/areas/${IT}`, { prefijo: "zzi" })
    assert.strictEqual(aIT.status, 200)
    assert.deepStrictEqual([aIT.data.nombre, aIT.data.prefijo], ["ZZ IT", "ZZI"])
    assert.strictEqual((await api("admin", "PUT", `/areas/${SAC}`, { prefijo: "ZZS", esSac: true })).status, 200)
    assert.strictEqual((await api("admin", "PUT", `/areas/${TYC}`, { prefijo: "ZZT" })).status, 200)
    assert.strictEqual((await api("admin", "PUT", `/areas/${TYC}`, { prefijo: "ZZI" })).status, 409, "prefijo repetido")
    assert.strictEqual((await api("admin", "PUT", "/areas/991234", { prefijo: "ZZX" })).status, 404, "área que no existe en el panel")

    // Categorías: admin o líder del área; metas: solo el líder
    assert.strictEqual((await api("it1", "POST", `/areas/${IT}/categorias`, { nombre: "Impresora" })).status, 403)
    const cat = await api("lider", "POST", `/areas/${IT}/categorias`, { nombre: "Impresora" })
    assert.strictEqual(cat.status, 201)
    assert.strictEqual((await api("lider", "POST", `/areas/${TYC}/categorias`, { nombre: "Nómina" })).status, 403, "líder de IT no toca otra área")
    assert.strictEqual((await api("admin", "PUT", `/areas/${IT}/metas`, { metaPrimeraRespuestaH: 4, metaCierreH: 24 })).status, 403, "admin no define metas")
    assert.strictEqual((await api("lider", "PUT", `/areas/${IT}/metas`, { metaPrimeraRespuestaH: 4, metaCierreH: 24 })).status, 200)

    // ── Ticket → Consecutivo → Evidencia ──
    const anio = new Date().getFullYear()
    const creado = await api("creador", "POST", "/tickets", formulario({ areaId: String(IT), categoriaId: String(cat.data.id), asunto: "No imprime", descripcion: "La impresora del piso 2 no responde" }, "contenido de prueba"))
    assert.strictEqual(creado.status, 201)
    assert.strictEqual(creado.data.codigo, `ZZI-${anio}-0001`)
    assert.strictEqual(creado.data.creadorNombre, "Persona creador", "el nombre sale del backend Python")
    const id = creado.data.id
    assert.strictEqual((await api("creador", "POST", "/tickets", formulario({ areaId: String(IT), asunto: "x", descripcion: "" }))).status, 400)
    assert.strictEqual((await api("creador", "POST", "/tickets", formulario({ areaId: String(IT), asunto: "Con radicado", descripcion: "d", radicadoOrigen: "PQR-1" }))).status, 403, "solo SAC enlaza casos de la Central")

    // ── Cada quien ve lo suyo ──
    assert.strictEqual((await api("creador", "GET", "/tickets?vista=mias")).data.total, 1)
    assert.strictEqual((await api("ajeno", "GET", "/tickets?vista=mias")).data.total, 0)
    assert.strictEqual((await api("ajeno", "GET", "/tickets?vista=area")).data.total, 0, "misma área que el creador, pero el ticket es de IT")
    assert.strictEqual((await api("it1", "GET", "/tickets?vista=area")).data.total, 1)
    assert.strictEqual((await api("ajeno", "GET", `/tickets/${id}`)).status, 404)
    assert.strictEqual((await api("sac", "GET", `/tickets/${id}`)).status, 404, "SAC no ve tickets ajenos")
    assert.strictEqual((await api("creador", "GET", "/tickets?vista=todas")).status, 403)
    assert.strictEqual((await api("lider", "GET", "/tickets?vista=eliminados")).status, 403)
    assert.strictEqual((await api("admin", "GET", "/tickets?vista=todas&areaId=" + IT)).data.total, 1)

    // ── Dashboard: horas que lleva abierto y serie diaria ──
    const enLista = (await api("it1", "GET", "/tickets?vista=area")).data.items[0]
    assert.ok(typeof enLista.horasAbierto === "number" && enLista.horasAbierto >= 0 && enLista.horasAbierto < 1, "recién creado: lleva menos de 1 h laboral")
    const serie = (await api("it1", "GET", "/serie?vista=area&dias=7")).data
    assert.strictEqual(serie.length, 7, "un punto por día")
    assert.deepStrictEqual([serie[6].llegaron, serie[6].cerrados], [1, 0], "hoy llegó 1 y no se ha cerrado ninguno")
    assert.ok(serie.slice(0, 6).every((d: { llegaron: number; cerrados: number }) => d.llegaron === 0 && d.cerrados === 0))
    assert.deepStrictEqual((await api("ajeno", "GET", "/serie?vista=area&dias=7")).data[6].llegaron, 0, "otra área no cuenta tickets ajenos")
    assert.strictEqual((await api("it1", "GET", "/serie?vista=todas")).status, 403)
    assert.strictEqual((await api("it1", "GET", "/serie?vista=area&dias=3")).status, 400)

    // ── Notas internas: el creador no las ve ──
    assert.strictEqual((await api("creador", "POST", `/tickets/${id}/mensajes`, formulario({ texto: "nota", interno: "true" }))).status, 403)
    assert.strictEqual((await api("it1", "POST", `/tickets/${id}/mensajes`, formulario({ texto: "Revisar tóner antes de responder", interno: "true" }, "adjunto interno"))).status, 201)
    let det = (await api("it1", "GET", `/tickets/${id}`)).data
    assert.strictEqual(det.primeraRespuestaEn, null, "una nota interna no cuenta como primera respuesta")
    assert.strictEqual(det.mensajes.length, 1)
    const evInterna = det.evidencias.find((e: { mensajeId: number | null }) => e.mensajeId !== null)
    const evPublica = det.evidencias.find((e: { mensajeId: number | null }) => e.mensajeId === null)
    det = (await api("creador", "GET", `/tickets/${id}`)).data
    assert.strictEqual(det.mensajes.length, 0, "el creador no ve la nota interna")
    assert.strictEqual(det.evidencias.length, 1, "ni su adjunto")
    assert.deepStrictEqual([det.relacion, det.permisos.eliminar, det.permisos.estado], ["creador", true, false])

    // ── Evidencias: solo con sesión y relación con el ticket ──
    const baja = await api("creador", "GET", `/evidencias/${evPublica.id}`)
    assert.deepStrictEqual([baja.status, baja.data], [200, "contenido de prueba"])
    assert.strictEqual((await api("creador", "GET", `/evidencias/${evInterna.id}`)).status, 403, "adjunto de nota interna")
    assert.strictEqual((await api("ajeno", "GET", `/evidencias/${evPublica.id}`)).status, 404)
    const enDisco = (await prisma.mesaEvidencia.findUniqueOrThrow({ where: { id: evPublica.id } })).ruta
    assert.strictEqual((await fetchReal(`${base}/uploads/mesa/${enDisco}`)).status, 404, "sin URL pública")

    // ── Gestión del área ──
    assert.strictEqual((await api("it1", "GET", "/resumen?vista=area")).data.sinRespuesta, 1, "aún sin respuesta pública")
    assert.strictEqual((await api("it1", "GET", "/tickets?vista=area&estado=activos&sinRespuesta=true")).data.total, 1)
    assert.strictEqual((await api("it1", "POST", `/tickets/${id}/mensajes`, formulario({ texto: "Ya vamos para allá" }))).status, 201)
    assert.strictEqual((await api("it1", "GET", "/resumen?vista=area")).data.sinRespuesta, 0, "ya respondida")
    assert.ok((await api("it1", "GET", `/tickets/${id}`)).data.primeraRespuestaEn, "primera respuesta pública del área")
    assert.strictEqual((await api("creador", "PATCH", `/tickets/${id}`, { estado: "cerrado" })).status, 403)
    assert.strictEqual((await api("it1", "POST", `/tickets/${id}/responsables`, { userId: P.it2.id })).status, 201)
    assert.strictEqual((await api("it1", "POST", `/tickets/${id}/responsables`, { userId: P.it2.id })).status, 409)
    assert.strictEqual((await api("it1", "POST", `/tickets/${id}/responsables`, { userId: P.ajeno.id })).status, 403, "el área no suma gente de otras áreas")
    assert.strictEqual((await api("it1", "GET", "/resumen?vista=area")).data.sinAsignar, 0)
    assert.strictEqual((await api("it2", "GET", "/resumen?vista=area")).data.asignadosAMi, 1)

    // ── Cerrar y reabrir ──
    const cerrado = await api("it1", "PATCH", `/tickets/${id}`, { estado: "cerrado" })
    assert.ok(cerrado.status === 200 && cerrado.data.cerradoEn)
    assert.strictEqual((await api("it1", "GET", "/serie?vista=area&dias=7")).data[6].cerrados, 1, "el cierre cuenta en la serie")
    assert.strictEqual((await api("it1", "GET", "/tickets?vista=area&estado=cerrado")).data.items[0].horasAbierto, null, "un cerrado no sigue contando")
    assert.strictEqual((await api("it1", "POST", `/tickets/${id}/mensajes`, formulario({ texto: "algo más" }))).status, 409, "cerrado: el área lo reabre a propósito")
    assert.strictEqual((await api("creador", "POST", `/tickets/${id}/mensajes`, formulario({ texto: "Sigue sin imprimir" }))).status, 201)
    det = (await api("it1", "GET", `/tickets/${id}`)).data
    assert.deepStrictEqual([det.estado, det.cerradoEn], ["abierto", null], "la respuesta del creador lo reabre")
    assert.ok(det.historial.some((h: { accion: string }) => h.accion === "reabierto"))

    // ── Servicio al Cliente: enlaza un caso, suma responsables y redirige ──
    const deSac = await api("sac", "POST", "/tickets", formulario({ areaId: String(IT), asunto: "Cliente reporta falla", descripcion: "Viene de la Central", radicadoOrigen: "PQR-2026-15" }))
    assert.deepStrictEqual([deSac.status, deSac.data.codigo, deSac.data.radicadoOrigen], [201, `ZZI-${anio}-0002`, "PQR-2026-15"])
    const idSac = deSac.data.id
    assert.strictEqual((await api("sac", "POST", `/tickets/${idSac}/responsables`, { userId: P.ajeno.id })).status, 201, "SAC suma a alguien de otra área")
    assert.strictEqual((await api("ajeno", "GET", `/tickets/${idSac}`)).data.relacion, "responsable")
    assert.strictEqual((await api("it1", "POST", `/tickets/${idSac}/redirigir`, { areaId: TYC })).status, 403, "el área no redirige")
    const red = await api("sac", "POST", `/tickets/${idSac}/redirigir`, { areaId: TYC, nota: "Es de nómina" })
    assert.deepStrictEqual([red.status, red.data.areaNombre, red.data.codigo], [200, "ZZ TyC", `ZZI-${anio}-0002`], "cambia de área, conserva el consecutivo")
    assert.strictEqual((await api("it1", "GET", `/tickets/${idSac}`)).status, 404, "IT ya no lo ve")
    assert.strictEqual((await api("ajeno", "GET", `/tickets/${idSac}`)).data.relacion, "area", "ahora es de su área")
    assert.strictEqual((await api("sac", "GET", `/tickets/${idSac}`)).data.responsables.length, 0)

    // ── Enlace con la Central: cada quien ve solo los tickets del caso con los que tiene relación ──
    const codigos = async (q: Quien) => (await api(q, "GET", "/por-radicado/PQR-2026-15")).data.map((t: { codigo: string }) => t.codigo)
    assert.deepStrictEqual(await codigos("sac"), [`ZZI-${anio}-0002`], "SAC lo creó")
    assert.deepStrictEqual(await codigos("ajeno"), [`ZZI-${anio}-0002`], "ahora es de su área")
    assert.deepStrictEqual(await codigos("it1"), [], "IT ya no tiene relación")
    assert.deepStrictEqual(await codigos("admin"), [`ZZI-${anio}-0002`])
    assert.strictEqual((await api("sac", "GET", "/por-radicado/no%20valido")).status, 400)
    assert.deepStrictEqual((await api("sac", "GET", "/yo")).data, { esAdmin: false, esLider: false, esSac: true, areaIds: [SAC] })
    assert.deepStrictEqual((await api("lider", "GET", "/yo")).data, { esAdmin: false, esLider: true, esSac: false, areaIds: [IT] })

    // ── Eliminar: el creador, con motivo; el registro queda solo para el admin ──
    assert.strictEqual((await api("it1", "DELETE", `/tickets/${id}`, { motivo: "no aplica" })).status, 403)
    assert.strictEqual((await api("creador", "DELETE", `/tickets/${id}`, {})).status, 400, "exige motivo")
    assert.strictEqual((await api("creador", "DELETE", `/tickets/${id}`, { motivo: "Lo radiqué por error" })).status, 204)
    assert.strictEqual((await api("creador", "GET", `/tickets/${id}`)).status, 404)
    assert.strictEqual((await api("it1", "GET", "/tickets?vista=area")).data.total, 0)
    assert.strictEqual((await api("creador", "DELETE", `/tickets/${id}`, { motivo: "otra vez" })).status, 404)
    const elim = (await api("admin", "GET", "/tickets?vista=eliminados")).data
    assert.ok(elim.items.some((t: { id: number; motivoEliminacion: string }) => t.id === id && t.motivoEliminacion === "Lo radiqué por error"))
    assert.strictEqual((await api("admin", "GET", `/tickets/${id}`)).status, 200)
    assert.strictEqual((await api("admin", "PATCH", `/tickets/${id}`, { estado: "cerrado" })).status, 403, "un eliminado no se modifica")

    // ── Categorías inactivas: las ve el admin, y el líder solo las de su área ──
    const catTyc = await api("admin", "POST", `/areas/${TYC}/categorias`, { nombre: "Nómina" })
    assert.strictEqual((await api("admin", "PATCH", `/categorias/${catTyc.data.id}`, { activa: false })).status, 200)
    assert.strictEqual((await api("lider", "PATCH", `/categorias/${cat.data.id}`, { activa: false })).status, 200)
    const cats = async (q: Quien, areaId: number, todas = true) =>
      (await api(q, "GET", `/areas${todas ? "?todas=true" : ""}`)).data.find((a: { areaId: number }) => a.areaId === areaId).categorias.length
    assert.deepStrictEqual([await cats("admin", IT), await cats("admin", TYC)], [1, 1], "admin ve las inactivas de todas")
    assert.deepStrictEqual([await cats("lider", IT), await cats("lider", TYC)], [1, 0], "líder: solo las inactivas de su área")
    assert.deepStrictEqual([await cats("it1", IT), await cats("lider", IT, false)], [0, 0], "los demás, y el formulario, solo las activas")

    // ── Tablero: solo el líder del área, con sus metas ──
    assert.strictEqual((await api("admin", "GET", `/areas/${IT}/tablero`)).status, 403, "el admin no usa el tablero")
    assert.strictEqual((await api("it1", "GET", `/areas/${IT}/tablero`)).status, 403)
    assert.strictEqual((await api("lider", "GET", `/areas/${TYC}/tablero`)).status, 403, "líder de IT no ve el tablero de otra área")
    assert.strictEqual((await api("lider", "GET", `/areas/${IT}/tablero?dias=5`)).status, 400)
    const tab = (await api("lider", "GET", `/areas/${IT}/tablero?dias=7`)).data
    assert.deepStrictEqual([tab.dias, tab.primeraRespuesta.metaH, tab.cierre.metaH, tab.area.metasActualizadasPor], [7, 4, 24, "Persona lider"])
    assert.deepStrictEqual(tab.pendientes, { abierto: 0, en_espera: 0, sinRespuesta: 0, sinAsignar: 0 }, "IT quedó sin pendientes: uno eliminado y otro redirigido")

    // ── Panorama entre áreas: solo admin ──
    assert.strictEqual((await api("lider", "GET", "/panorama")).status, 403)
    assert.strictEqual((await api("sac", "GET", "/panorama")).status, 403)
    const pan = (await api("admin", "GET", "/panorama")).data
    const fila = (areaId: number) => pan.areas.find((a: { areaId: number }) => a.areaId === areaId)
    assert.deepStrictEqual([fila(IT).abierto, fila(IT).en_espera, fila(IT).cerrado], [0, 0, 0], "IT: uno eliminado y otro redirigido")
    assert.deepStrictEqual([fila(TYC).abierto, fila(TYC).sinAsignar, fila(TYC).sinRespuesta], [1, 1, 1], "TyC recibió el redirigido, sin dueño ni respuesta")
    assert.ok(pan.eliminados >= 1)

    // ── A quién se puede asignar ──
    const equipo = await api("it1", "GET", `/usuarios?areaId=${IT}`)
    assert.deepStrictEqual(equipo.data.map((c: { id: number }) => c.id).sort(), [P.admin.id, P.it1.id, P.it2.id, P.lider.id].sort())
    assert.strictEqual((await api("creador", "GET", `/usuarios?areaId=${IT}`)).status, 403)
    assert.strictEqual((await api("it1", "GET", "/usuarios")).status, 403)
    assert.strictEqual((await api("sac", "GET", "/usuarios")).status, 200)

    // ── Avisos de la campana ──
    type Aviso = { id: number; ticketId: number; tipo: string; leidoEn: string | null }
    const avisosDe = async (q: Quien, ticketId: number) =>
      (await prisma.mesaAviso.findMany({ where: { userId: P[q].id, ticketId }, select: { tipo: true } })).map((a) => a.tipo).sort()
    // Ticket 1: lo creó "creador"; it1 respondió y asignó a it2; it1 lo cerró; "creador" lo reabrió al responder
    assert.deepStrictEqual(await avisosDe("it1", id), ["nuevo"], "it1 no recibe sus propias acciones; con it2 de responsable, deja de recibir")
    assert.deepStrictEqual(await avisosDe("it2", id), ["asignacion", "cierre", "nota", "nuevo", "respuesta", "respuesta"], "it2: área al inicio, luego responsable")
    assert.deepStrictEqual(await avisosDe("lider", id), ["nota", "nuevo", "respuesta"], "el resto del área deja de recibir cuando hay responsable")
    assert.deepStrictEqual(await avisosDe("creador", id), ["cierre", "respuesta"], "quien lo pidió: le respondieron y lo cerraron; nunca la nota interna")
    assert.deepStrictEqual(await avisosDe("ajeno", id), [], "otra área no recibe nada")
    // Ticket 2: lo creó SAC, sumó a "ajeno" y lo redirigió a TyC sin nombre → toda el área nueva
    assert.deepStrictEqual(await avisosDe("ajeno", idSac), ["asignacion", "redireccion"])
    assert.deepStrictEqual(await avisosDe("creador", idSac), ["redireccion"], "miembro del área que lo recibe")
    assert.deepStrictEqual(await avisosDe("sac", idSac), [], "SAC hizo todo: no se avisa a sí mismo")

    // Redirigir ya con nombre: solo a esa persona
    const t3 = (await api("sac", "POST", "/tickets", formulario({ areaId: String(IT), asunto: "Con responsable", descripcion: "d" }))).data
    assert.strictEqual((await api("sac", "POST", `/tickets/${t3.id}/redirigir`, { areaId: TYC, responsableId: P.it2.id })).status, 400, "debe ser del área destino")
    const conNombre = await api("sac", "POST", `/tickets/${t3.id}/redirigir`, { areaId: TYC, responsableId: P.ajeno.id })
    assert.strictEqual(conNombre.status, 200)
    assert.deepStrictEqual((await api("sac", "GET", `/tickets/${t3.id}`)).data.responsables.map((r: { userId: number }) => r.userId), [P.ajeno.id])
    assert.deepStrictEqual(await avisosDe("ajeno", t3.id), ["redireccion"])
    assert.deepStrictEqual(await avisosDe("creador", t3.id), [], "redirigido con nombre: el resto del área no recibe")

    // Leer: cada quien marca solo los suyos
    const antes = (await api("it2", "GET", "/avisos")).data.sinLeer
    assert.ok(antes >= 6)
    const uno = ((await api("it2", "GET", "/avisos")).data.items as Aviso[])[0].id
    assert.strictEqual((await api("lider", "POST", "/avisos/leer", { ids: [uno] })).data.marcados, 0, "no se marcan avisos ajenos")
    assert.strictEqual((await api("it2", "POST", "/avisos/leer", { ids: [uno] })).data.marcados, 1)
    assert.strictEqual((await api("it2", "POST", "/avisos/leer", {})).data.marcados, antes - 1)
    assert.ok((await api("lider", "GET", "/avisos")).data.sinLeer > 0)
    // Lista corta: todo leído → solo los 5 últimos leídos
    const leida = (await api("it2", "GET", "/avisos")).data
    assert.deepStrictEqual([leida.sinLeer, leida.masSinLeer, leida.items.length, leida.items.every((a: Aviso) => a.leidoEn)], [0, 0, 5, true])
    // Pocos sin leer: van primero y se completa con leídos hasta 5 filas
    await prisma.mesaAviso.createMany({ data: [1, 2].map((n) => ({ userId: P.it2.id, ticketId: id, tipo: "respuesta", texto: `prueba ${n}` })) })
    const mixta = (await api("it2", "GET", "/avisos")).data
    assert.deepStrictEqual([mixta.sinLeer, mixta.masSinLeer, mixta.items.length], [2, 0, 5])
    assert.deepStrictEqual(mixta.items.map((a: Aviso) => a.leidoEn === null), [true, true, false, false, false], "los sin leer primero")
    // Muchos sin leer: tope de 8 filas y el resto como número; ningún leído
    await prisma.mesaAviso.createMany({ data: Array.from({ length: 10 }, (_, n) => ({ userId: P.it2.id, ticketId: id, tipo: "respuesta", texto: `más ${n}` })) })
    const llena = (await api("it2", "GET", "/avisos")).data
    assert.deepStrictEqual([llena.sinLeer, llena.masSinLeer, llena.items.length, llena.items.every((a: Aviso) => a.leidoEn === null)], [12, 4, 8, true])
    assert.strictEqual(llena.items[0].texto, "más 9", "los más recientes primero")

    // ── Notificaciones del teléfono: cada quien administra sus dispositivos ──
    const sub = { endpoint: "https://push.example.test/abc", keys: { p256dh: "clave-publica-del-dispositivo", auth: "secreto" } }
    assert.strictEqual((await api("it2", "POST", "/push/suscripcion", { ...sub, endpoint: "http://sin-https.test/x" })).status, 400)
    assert.strictEqual((await api("it2", "POST", "/push/suscripcion", sub)).status, 201)
    assert.strictEqual((await api("it2", "POST", "/push/suscripcion", sub)).status, 201, "repetir no duplica")
    assert.strictEqual(await prisma.mesaPushSub.count({ where: { endpoint: sub.endpoint } }), 1)
    assert.strictEqual((await api("lider", "DELETE", "/push/suscripcion", { endpoint: sub.endpoint })).data.borradas, 0, "no se borra el dispositivo de otra persona")
    assert.strictEqual((await api("lider", "POST", "/push/suscripcion", sub)).status, 201, "mismo dispositivo, otra sesión: pasa a quien lo activa")
    assert.strictEqual((await prisma.mesaPushSub.findUniqueOrThrow({ where: { endpoint: sub.endpoint } })).userId, P.lider.id)
    assert.strictEqual((await api("lider", "DELETE", "/push/suscripcion", { endpoint: sub.endpoint })).data.borradas, 1)
    assert.ok("clave" in (await api("it2", "GET", "/push")).data)

    // Fuera de meta: IT tiene metas de 4 h y 24 h; un ticket sin respuesta avisa una sola vez por meta
    const t4 = (await api("creador", "POST", "/tickets", formulario({ areaId: String(IT), asunto: "Sin atender", descripcion: "d" }))).data
    assert.strictEqual(await avisarFueraDeMeta(new Date(), AREAS), 0, "recién creado: dentro de meta")
    // Una semana después: más de 24 h laborales sea cual sea el día en que corra la prueba
    const enTresDias = new Date(Date.now() + 7 * 86_400_000)
    assert.strictEqual(await avisarFueraDeMeta(enTresDias, AREAS), 8, "4 personas del área × 2 metas (respuesta y cierre)")
    assert.strictEqual(await avisarFueraDeMeta(enTresDias, AREAS), 0, "no se repite")
    assert.deepStrictEqual(await avisosDe("lider", t4.id), ["fuera_de_meta", "fuera_de_meta", "nuevo"])
    assert.deepStrictEqual(await avisosDe("creador", t4.id), [], "a quien lo pidió no se le avisa la meta del área")

    console.log("OK: API de la mesa de ayuda — configuración, consecutivo, evidencias, visibilidad por área, notas internas, cierre/reapertura, SAC, eliminados y avisos.")
  } finally {
    server.close()
    await limpiar()
  }
}

main()
  .catch((err) => {
    console.error("FALLÓ el self-check de la API de la mesa:", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
