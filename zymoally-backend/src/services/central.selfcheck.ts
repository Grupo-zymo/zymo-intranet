// Self-check de la Central de tickets. Sin base de datos y sin red real:
// levanta en un puerto efímero un servidor falso que hace de API de casos y de
// backend Python, y ejercita (1) las decisiones puras de autorización, (2) el
// cliente HTTP y (3) el router completo con JWT firmados de mentira.
//
//   npm run selfcheck

import assert from "assert"
import http from "http"
import type { AddressInfo } from "net"
import jwt from "jsonwebtoken"
import {
  decidirAccion,
  filtrosParaNivel,
  normalizarCorreo,
  resolverAcceso,
  resolverAsignado,
  resumenDeCasos,
  type AccesoCentral,
  type AccionCentral,
} from "./centralAuth"

const CLAVE = "clave-de-servicio-solo-para-el-selfcheck"
const CLAVE_INTERNA = "clave-interna-selfcheck"
const SECRETO_JWT = "secreto-jwt-selfcheck"

// ─── Servidor falso: API de casos + backend Python ──────────────────────────

interface Llamada {
  method: string
  url: string
  serviceKey: string | undefined
  internalKey: string | undefined
  body: any
}

const llamadas: Llamada[] = []

const CASOS: Record<string, { radicado: string; estado: string; asignado: { email: string } | null }> = {
  "101": { radicado: "101", estado: "en_analisis", asignado: { email: "lider@zymo.co" } },
  "102": { radicado: "102", estado: "recibido", asignado: { email: "otro@zymo.co" } },
  "103": { radicado: "103", estado: "recibido", asignado: null },
}

function itemDe(c: (typeof CASOS)[string]) {
  return {
    ...c,
    severidad: "media",
    area: "bodega",
    urgenteSolicitado: false,
    creadoEn: new Date().toISOString(),
    primeraRespuestaEn: null,
    resueltoEn: null,
    sla: { vencido: false, escalamiento: null },
  }
}

const servidorFalso = http.createServer((req, res) => {
  let crudo = ""
  req.on("data", (trozo) => (crudo += trozo))
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://falso")
    const body = crudo ? JSON.parse(crudo) : undefined
    const serviceKey = req.headers["x-service-key"] as string | undefined
    llamadas.push({ method: req.method ?? "", url: req.url ?? "", serviceKey, internalKey: req.headers["x-internal-key"] as string | undefined, body })
    const responder = (status: number, json: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" })
      res.end(JSON.stringify(json))
    }

    // --- backend Python ---
    if (url.pathname === "/api/tasks-v2/users") {
      return responder(200, [
        { id: 7, full_name: "Dirección Central", email: "Directora@Zymo.co" },
        { id: 8, full_name: "Líder Uno", email: "lider@zymo.co" },
        { id: 9, full_name: null, email: "admin@zymo.co" },
        { id: 30, full_name: "Persona de Compras", email: "compras@zymo.co" },
      ])
    }
    if (url.pathname === "/api/tasks-v2/users-por-area") {
      return responder(200, [
        { id: 8, nombre: "Líder Uno", email: "lider@zymo.co", area: "Operaciones IMCC", cargo: "Coordinador", esLider: true },
        { id: 12, nombre: "Auxiliar Dos", email: "aux@zymo.co", area: "Operaciones Logimat", cargo: null, esLider: false },
      ])
    }

    // --- API de casos ---
    if (serviceKey !== CLAVE) return responder(401, { error: `clave inválida: ${serviceKey}` })
    const ruta = url.pathname.replace("/api/central", "")
    if (ruta === "/resumen") return responder(200, { total: 99, abiertos: 50, porLider: [{ email: "otro@zymo.co" }] })
    if (ruta === "/casos" && req.method === "GET") {
      const asignado = url.searchParams.get("asignado")
      const items = Object.values(CASOS).filter((c) => !asignado || c.asignado?.email === asignado).map(itemDe)
      return responder(200, { total: items.length, pagina: 1, limite: 100, truncado: false, items })
    }
    if (ruta === "/bloqueado") return responder(429, { error: "Demasiados intentos con la clave" })
    if (ruta === "/roto") return responder(500, { error: "stack interno" })
    if (ruta === "/eco-clave") return responder(409, { error: `no se pudo con ${serviceKey}` })
    const m = ruta.match(/^\/casos\/([^/]+)(\/.*)?$/)
    if (m) {
      const caso = CASOS[decodeURIComponent(m[1])]
      if (!caso) return responder(404, { error: "Caso no encontrado" })
      if (!m[2] && req.method === "GET") return responder(200, { ...itemDe(caso), mensajes: [], asignaciones: [] })
      if (m[2] === "/mensajes") return responder(201, { ok: true, id: 1 })
      if (m[2] === "/asignar" && body?.asignado?.email === caso.asignado?.email) {
        return responder(409, { error: "El caso ya está asignado a esa persona" })
      }
      if (!m[2] && req.method === "PATCH" && body?.estado === "cerrado" && caso.estado !== "resuelto") {
        return responder(409, { error: "Solo se cierra un caso resuelto" })
      }
      return responder(200, { ok: true })
    }
    return responder(404, { error: "No existe" })
  })
})

// ─── 1. Decisiones puras ────────────────────────────────────────────────────

function probarAutorizacion() {
  // Correos
  assert.strictEqual(normalizarCorreo("  Lider@Zymo.CO "), "lider@zymo.co")
  assert.strictEqual(normalizarCorreo(undefined), "")
  assert.strictEqual(normalizarCorreo(42), "")

  // Niveles
  const director = resolverAcceso({ role: "empleado", app_permissions: ["mod_tickets_central"], email: "Directora@Zymo.co" })
  const lider = resolverAcceso({ role: "operativo", app_permissions: ["mod_tickets_central_lider"], email: " LIDER@zymo.co" })
  const admin = resolverAcceso({ role: "admin", app_permissions: [], email: "admin@zymo.co" })
  assert.deepStrictEqual(director, { nivel: "director", esAdmin: false, email: "directora@zymo.co" })
  assert.deepStrictEqual(lider, { nivel: "lider", esAdmin: false, email: "lider@zymo.co" })
  assert.deepStrictEqual(admin, { nivel: "director", esAdmin: true, email: "admin@zymo.co" })
  assert.strictEqual(resolverAcceso({ role: "empleado", app_permissions: ["mod_tickets"], email: "x@zymo.co" }), null, "mod_tickets no da acceso")
  assert.strictEqual(resolverAcceso({ role: "gerente", app_permissions: [], email: "g@zymo.co" }), null, "gerente no entra sin el permiso")
  assert.strictEqual(resolverAcceso({ role: "empleado", app_permissions: ["mod_tickets_central"] }), null, "sin correo no hay acceso")
  assert.strictEqual(resolverAcceso(undefined), null)
  assert.strictEqual(
    resolverAcceso({ role: "x", app_permissions: ["mod_tickets_central_lider", "mod_tickets_central"], email: "a@b.co" })?.nivel,
    "director",
    "con los dos permisos gana dirección",
  )
  assert.ok(director && lider && admin)

  // Matriz: director y admin pueden todo
  const acciones: AccionCentral[] = ["listar", "resumen", "ver", "lideres", "asumir", "asignar", "liberar", "mensaje", "actualizar"]
  for (const quien of [director, admin]) {
    for (const accion of acciones) {
      assert.deepStrictEqual(decidirAccion(quien, accion, "otro@zymo.co", { estado: "cerrado", severidad: "alta" }), { ok: true }, `${quien.email} → ${accion}`)
    }
  }

  // Matriz: líder
  const estado = (d: ReturnType<typeof decidirAccion>) => (d.ok ? 200 : d.status)
  assert.strictEqual(estado(decidirAccion(lider, "listar")), 200)
  assert.strictEqual(estado(decidirAccion(lider, "resumen")), 200)
  for (const accion of ["asumir", "asignar", "liberar", "lideres"] as AccionCentral[]) {
    assert.strictEqual(estado(decidirAccion(lider, accion, "lider@zymo.co")), 403, `líder no puede ${accion} ni en su propio caso`)
  }
  for (const accion of ["ver", "mensaje"] as AccionCentral[]) {
    assert.strictEqual(estado(decidirAccion(lider, accion, "LIDER@Zymo.co ")), 200, `líder ${accion} en su caso (correo con otra caja)`)
    assert.strictEqual(estado(decidirAccion(lider, accion, "otro@zymo.co")), 404, `caso ajeno → 404 en ${accion}`)
    assert.strictEqual(estado(decidirAccion(lider, accion, null)), 404, `caso sin asignar → 404 en ${accion}`)
    assert.strictEqual(estado(decidirAccion(lider, accion)), 404)
  }
  assert.strictEqual(estado(decidirAccion(lider, "actualizar", "lider@zymo.co", { estado: "en_analisis" })), 200)
  assert.strictEqual(estado(decidirAccion(lider, "actualizar", "lider@zymo.co", { estado: "resuelto" })), 200)
  assert.strictEqual(estado(decidirAccion(lider, "actualizar", "lider@zymo.co", { estado: "cerrado" })), 403, "líder no cierra")
  assert.strictEqual(estado(decidirAccion(lider, "actualizar", "lider@zymo.co", { severidad: "baja" })), 403)
  assert.strictEqual(estado(decidirAccion(lider, "actualizar", "lider@zymo.co", { area: "bodega", estado: "resuelto" })), 403)
  assert.strictEqual(estado(decidirAccion(lider, "actualizar", "lider@zymo.co", {})), 403)
  assert.strictEqual(estado(decidirAccion(lider, "actualizar", "otro@zymo.co", { estado: "resuelto" })), 404, "ajeno: 404 antes que 403")
  assert.strictEqual(estado(decidirAccion(lider, "actualizar", "otro@zymo.co", { severidad: "baja" })), 404)

  // Forzado de `asignado`
  assert.deepStrictEqual(filtrosParaNivel(lider, { asignado: "otro@zymo.co", estado: "abierto" }), { asignado: "lider@zymo.co", estado: "abierto" })
  assert.deepStrictEqual(filtrosParaNivel(lider, { asignado: "cualquiera" }), { asignado: "lider@zymo.co" })
  assert.deepStrictEqual(filtrosParaNivel(lider, {}), { asignado: "lider@zymo.co" })
  assert.deepStrictEqual(filtrosParaNivel(director, {}), {})
  assert.deepStrictEqual(filtrosParaNivel(director, { asignado: "sin" }), { asignado: "sin" })
  assert.deepStrictEqual(filtrosParaNivel(director, { asignado: "Mios" }), { asignado: "directora@zymo.co" })
  assert.deepStrictEqual(filtrosParaNivel(director, { asignado: "Lider@Zymo.co" }), { asignado: "lider@zymo.co" })

  // A quién se puede asignar
  const lideres = [{ id: 8, nombre: "Líder Uno", email: "Lider@zymo.co" }]
  const cuentas = [{ id: 30, nombre: "Persona de Compras", email: "compras@zymo.co" }]
  assert.deepStrictEqual(resolverAsignado(director, 8, lideres, cuentas), { id: 8, nombre: "Líder Uno", email: "lider@zymo.co" })
  assert.strictEqual(resolverAsignado(director, 30, lideres, cuentas), null, "dirección solo asigna a líderes de operaciones")
  assert.deepStrictEqual(resolverAsignado(admin, 30, lideres, cuentas)?.email, "compras@zymo.co", "admin puede asignar fuera de la lista")
  assert.strictEqual(resolverAsignado(admin, 999, lideres, cuentas), null)

  // Resumen del líder: solo sus casos
  const ahora = new Date("2026-11-12T15:00:00Z")
  const r = resumenDeCasos(
    [
      { estado: "recibido", severidad: "alta", area: "bodega", urgenteSolicitado: true, creadoEn: "2026-11-12T08:00:00Z", sla: { vencido: true, escalamiento: { motivo: "x" } } },
      { estado: "en_analisis", severidad: "media", area: "administrativo", creadoEn: "2026-11-10T08:00:00Z", primeraRespuestaEn: "2026-11-10T10:00:00Z", sla: { vencido: false, escalamiento: null } },
      { estado: "resuelto", severidad: "baja", area: "bodega", creadoEn: "2026-11-01T08:00:00Z", primeraRespuestaEn: "2026-11-01T12:00:00Z", resueltoEn: "2026-11-02T08:00:00Z", sla: { vencido: true } },
      { estado: "cerrado", severidad: "baja", area: "bodega", creadoEn: "2026-08-01T08:00:00Z", resueltoEn: "2026-08-02T08:00:00Z" },
    ],
    { email: "lider@zymo.co", nombre: "Líder Uno" },
    false,
    ahora,
  )
  assert.strictEqual(r.total, 4)
  assert.strictEqual(r.abiertos, 2)
  assert.deepStrictEqual(r.porEstado, { recibido: 1, en_analisis: 1, resuelto: 1, cerrado: 1 })
  assert.deepStrictEqual(r.porSeveridad, { critica: 0, alta: 1, media: 1, baja: 0 })
  assert.strictEqual(r.vencidos, 1, "un resuelto vencido ya no cuenta como vencido abierto")
  assert.strictEqual(r.escalados, 1)
  assert.strictEqual(r.urgentesSolicitados, 1)
  assert.strictEqual(r.sinPrimeraRespuesta, 1)
  assert.strictEqual(r.sinAsignar, 0)
  assert.strictEqual(r.horasPrimeraRespuesta, 3)
  assert.strictEqual(r.horasResolucion, 24)
  assert.deepStrictEqual(r.porLider, [{ email: "lider@zymo.co", nombre: "Líder Uno", abiertos: 2, vencidos: 1, escalados: 1, resueltos30d: 1 }])
  assert.strictEqual(r.ultimos14dias.length, 14)
  assert.deepStrictEqual(r.ultimos14dias[13], { fecha: "2026-11-12", creados: 1, resueltos: 0 })
  assert.deepStrictEqual(r.ultimos14dias[3], { fecha: "2026-11-02", creados: 0, resueltos: 1 })
  console.log("OK: autorización por nivel, correos, forzado de `asignado`, asignables y resumen del líder.")
}

// ─── 2. Cliente HTTP ────────────────────────────────────────────────────────

async function probarCliente(base: string) {
  const { crearClienteAutogestion, CentralError, ERROR_NO_CONFIGURADA, ERROR_SERVICIO } = await import("./autogestionClient")
  const fallo = async (p: Promise<unknown>): Promise<InstanceType<typeof CentralError>> => {
    try {
      await p
    } catch (err) {
      assert.ok(err instanceof CentralError, "debe ser CentralError")
      return err
    }
    throw new Error("se esperaba un error")
  }

  // Sin configurar: 503 y NINGUNA llamada
  const antes = llamadas.length
  for (const cfg of [{ baseUrl: "", serviceKey: CLAVE }, { baseUrl: base, serviceKey: "" }, { baseUrl: "  ", serviceKey: "  " }]) {
    const err = await fallo(crearClienteAutogestion(cfg).get("/casos"))
    assert.strictEqual(err.status, 503)
    assert.strictEqual(err.message, ERROR_NO_CONFIGURADA)
  }
  assert.strictEqual(llamadas.length, antes, "sin clave o sin URL no se llama a nadie")

  const cliente = crearClienteAutogestion({ baseUrl: `${base}///`, serviceKey: CLAVE })

  // Envía la clave, la consulta y el actor
  await cliente.get("/casos", { estado: "abierto", asignado: "lider@zymo.co", vacio: "", nulo: null, q: "#42" })
  let ultima = llamadas[llamadas.length - 1]
  assert.strictEqual(ultima.serviceKey, CLAVE, "debe enviar X-Service-Key")
  assert.strictEqual(ultima.url, "/api/central/casos?estado=abierto&asignado=lider%40zymo.co&q=%2342")
  const actor = { id: 7, nombre: "Dirección Central", email: "directora@zymo.co" }
  const creado = await cliente.post("/casos/101/mensajes", { actor, texto: "Hola", interno: false })
  ultima = llamadas[llamadas.length - 1]
  assert.strictEqual(creado.status, 201)
  assert.strictEqual(ultima.method, "POST")
  assert.strictEqual(ultima.serviceKey, CLAVE)
  assert.deepStrictEqual(ultima.body, { actor, texto: "Hola", interno: false })

  // 409 → conserva estado y texto en español del servicio
  const conflicto = await fallo(cliente.patch("/casos/103", { actor, estado: "cerrado" }))
  assert.strictEqual(conflicto.status, 409)
  assert.strictEqual(conflicto.message, "Solo se cierra un caso resuelto")
  const noExiste = await fallo(cliente.get("/casos/999"))
  assert.strictEqual(noExiste.status, 404)
  assert.strictEqual(noExiste.message, "Caso no encontrado")

  // 401 / 429 / 500 / caído → 502 genérico, sin detalles ni clave
  const errores = [
    await fallo(crearClienteAutogestion({ baseUrl: base, serviceKey: "clave-equivocada" }).get("/casos")),
    await fallo(cliente.get("/bloqueado")),
    await fallo(cliente.get("/roto")),
    await fallo(crearClienteAutogestion({ baseUrl: "http://127.0.0.1:1", serviceKey: CLAVE, timeoutMs: 1500 }).get("/casos")),
  ]
  for (const err of errores) {
    assert.strictEqual(err.status, 502)
    assert.strictEqual(err.message, ERROR_SERVICIO)
  }
  // Ni siquiera si el servicio devolviera la clave en su texto de error
  const eco = await fallo(cliente.get("/eco-clave"))
  assert.strictEqual(eco.status, 409)
  for (const err of [...errores, eco, conflicto]) {
    assert.ok(!JSON.stringify({ m: err.message, s: err.stack }).includes(CLAVE), "la clave no puede aparecer en un error")
    assert.ok(!err.message.includes("clave-equivocada"))
  }
  console.log("OK: cliente HTTP (X-Service-Key, actor, 409/404 con su texto, 401/429/500/caído → 502 genérico, clave nunca en errores).")
}

// ─── 3. Router completo ─────────────────────────────────────────────────────

async function probarRouter(base: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const app = require("../app").default as import("express").Express
  const servidor = app.listen(0, "127.0.0.1")
  await new Promise((ok) => servidor.once("listening", ok))
  const api = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/central-tickets`

  // Igual que el backend Python: el correo va en `sub`, no en `email`.
  const token = (sub: string, id: number, role: string, perms: string[]) =>
    jwt.sign({ sub, id, role, app_permissions: perms }, SECRETO_JWT, { algorithm: "HS256", expiresIn: "5m" })
  const T = {
    director: token("Directora@Zymo.co", 7, "empleado", ["mod_tickets_central"]),
    lider: token("Lider@Zymo.co", 8, "operativo", ["mod_tickets_central_lider"]),
    admin: token("admin@zymo.co", 9, "admin", []),
    nadie: token("nadie@zymo.co", 10, "gerente", ["mod_tickets", "mod_sac"]),
  }
  const pedir = async (quien: keyof typeof T | null, method: string, ruta: string, body?: unknown) => {
    const res = await fetch(`${api}${ruta}`, {
      method,
      headers: { ...(quien ? { Authorization: `Bearer ${T[quien]}` } : {}), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, json: (await res.json().catch(() => null)) as any }
  }
  const ultima = () => llamadas[llamadas.length - 1]

  try {
    // Sin sesión / sin permiso
    assert.strictEqual((await pedir(null, "GET", "/casos")).status, 401)
    for (const [m, r] of [["GET", "/casos"], ["GET", "/resumen"], ["GET", "/casos/101"], ["GET", "/lideres"], ["POST", "/casos/101/asumir"]]) {
      assert.strictEqual((await pedir("nadie", m, r, m === "POST" ? {} : undefined)).status, 403, `sin permiso: ${m} ${r}`)
    }

    // Líder: la lista SIEMPRE va filtrada por su correo
    let r = await pedir("lider", "GET", "/casos?asignado=otro@zymo.co&estado=abierto")
    assert.strictEqual(r.status, 200)
    assert.ok(ultima().url.includes("asignado=lider%40zymo.co"), "se fuerza asignado=<su correo>")
    assert.ok(!ultima().url.includes("otro"), "se ignora lo que pidió")
    assert.deepStrictEqual(r.json.items.map((i: any) => i.radicado), ["101"])

    // Líder: resumen propio, sin totales globales
    r = await pedir("lider", "GET", "/resumen")
    assert.strictEqual(r.status, 200)
    assert.strictEqual(r.json.total, 1)
    assert.deepStrictEqual(r.json.porLider.map((l: any) => [l.email, l.nombre]), [["lider@zymo.co", "Líder Uno"]])
    assert.ok(!llamadas.some((l) => l.url.includes("/resumen") && l.serviceKey), "el líder nunca dispara el resumen global")

    // Líder: su caso sí; ajeno / sin asignar / inexistente → 404 idéntico
    assert.strictEqual((await pedir("lider", "GET", "/casos/101")).status, 200)
    for (const radicado of ["102", "103", "999"]) {
      r = await pedir("lider", "GET", `/casos/${radicado}`)
      assert.strictEqual(r.status, 404, `detalle ${radicado}`)
      r = await pedir("lider", "POST", `/casos/${radicado}/mensajes`, { texto: "hola" })
      assert.strictEqual(r.status, 404, `mensaje ${radicado}`)
      assert.notStrictEqual(ultima().method, "POST", "no se envía el mensaje a un caso ajeno")
      r = await pedir("lider", "PATCH", `/casos/${radicado}`, { estado: "resuelto" })
      assert.strictEqual(r.status, 404, `estado ${radicado}`)
      assert.notStrictEqual(ultima().method, "PATCH")
    }

    // Líder: responde y avanza su caso, con su identidad real
    r = await pedir("lider", "POST", "/casos/101/mensajes", { texto: "  Ya lo revisamos  ", interno: true })
    assert.strictEqual(r.status, 201)
    assert.deepStrictEqual(ultima().body, { actor: { id: 8, nombre: "Líder Uno", email: "lider@zymo.co" }, texto: "Ya lo revisamos", interno: true })
    assert.strictEqual((await pedir("lider", "PATCH", "/casos/101", { estado: "resuelto" })).status, 200)
    assert.deepStrictEqual(ultima().body, { actor: { id: 8, nombre: "Líder Uno", email: "lider@zymo.co" }, estado: "resuelto" })

    // Líder: lo que no puede, ni en su propio caso
    const antes = llamadas.length
    assert.strictEqual((await pedir("lider", "PATCH", "/casos/101", { estado: "cerrado" })).status, 403)
    assert.strictEqual((await pedir("lider", "PATCH", "/casos/101", { severidad: "baja" })).status, 403)
    CASOS["101"].estado = "cerrado"
    assert.strictEqual((await pedir("lider", "PATCH", "/casos/101", { estado: "en_analisis" })).status, 409, "el líder no reabre un caso cerrado")
    CASOS["101"].estado = "en_analisis"
    assert.strictEqual((await pedir("lider", "POST", "/casos/101/asumir", {})).status, 403)
    assert.strictEqual((await pedir("lider", "POST", "/casos/101/asignar", { asignadoId: 8 })).status, 403)
    assert.strictEqual((await pedir("lider", "POST", "/casos/101/liberar", {})).status, 403)
    assert.strictEqual((await pedir("lider", "GET", "/lideres")).status, 403)
    assert.ok(llamadas.slice(antes).every((l) => l.method === "GET"), "nada prohibido llega a escribir en el servicio de casos")

    // Dirección: todo
    r = await pedir("director", "GET", "/casos?asignado=sin&vencido=true&pagina=2&limite=20&orden=vencimiento")
    assert.strictEqual(r.status, 200)
    assert.strictEqual(ultima().url, "/api/central/casos?asignado=sin&vencido=true&pagina=2&limite=20&orden=vencimiento")
    await pedir("director", "GET", "/casos?asignado=mios")
    assert.ok(ultima().url.endsWith("asignado=directora%40zymo.co"), "«mis casos» = correo del token en minúsculas")
    assert.strictEqual((await pedir("director", "GET", "/resumen")).json.total, 99)
    assert.strictEqual((await pedir("director", "GET", "/casos/102")).status, 200)
    r = await pedir("director", "GET", "/lideres")
    assert.strictEqual(r.json.length, 2)
    assert.ok(llamadas.some((l) => l.url.startsWith("/api/tasks-v2/users-por-area") && l.internalKey === CLAVE_INTERNA), "líderes con X-Internal-Key")

    assert.strictEqual((await pedir("director", "POST", "/casos/103/asumir", {})).status, 200)
    assert.deepStrictEqual(ultima().body, { actor: { id: 7, nombre: "Dirección Central", email: "directora@zymo.co" } })

    // Asignar: el asignado sale de la lista del servidor, no de lo que mande el navegador
    r = await pedir("director", "POST", "/casos/103/asignar", { asignadoId: 8, nota: "Urgente", asignado: { email: "x@x.co" } })
    assert.strictEqual(r.status, 200)
    assert.deepStrictEqual(ultima().body, {
      actor: { id: 7, nombre: "Dirección Central", email: "directora@zymo.co" },
      asignado: { id: 8, nombre: "Líder Uno", email: "lider@zymo.co" },
      nota: "Urgente",
    })
    r = await pedir("director", "POST", "/casos/103/asignar", { asignadoId: 30 })
    assert.strictEqual(r.status, 400, "dirección no asigna fuera de operaciones")
    r = await pedir("admin", "POST", "/casos/103/asignar", { asignadoId: 30 })
    assert.strictEqual(r.status, 200, "admin sí")
    assert.strictEqual(ultima().body.asignado.email, "compras@zymo.co")
    assert.strictEqual(ultima().body.actor.nombre, "admin@zymo.co", "sin nombre cae al correo, nunca «Usuario N»")

    // 409 del servicio llega tal cual
    r = await pedir("director", "POST", "/casos/101/asignar", { asignadoId: 8 })
    assert.deepStrictEqual([r.status, r.json.error], [409, "El caso ya está asignado a esa persona"])
    r = await pedir("director", "PATCH", "/casos/103", { estado: "cerrado" })
    assert.deepStrictEqual([r.status, r.json.error], [409, "Solo se cierra un caso resuelto"])
    assert.strictEqual((await pedir("director", "POST", "/casos/101/liberar", { nota: "Cambio de turno" })).status, 200)
    assert.strictEqual((await pedir("director", "PATCH", "/casos/101", { severidad: "critica", area: "administrativo" })).status, 200)

    // Entradas inválidas
    assert.strictEqual((await pedir("director", "GET", "/casos?estado=inventado")).status, 400)
    assert.strictEqual((await pedir("director", "GET", "/casos?limite=500")).status, 400)
    assert.strictEqual((await pedir("director", "GET", "/casos/..%2Fresumen")).status, 400)
    assert.strictEqual((await pedir("director", "POST", "/casos/101/mensajes", { texto: "   " })).status, 400)
    assert.strictEqual((await pedir("director", "POST", "/casos/101/mensajes", { texto: "x".repeat(4001) })).status, 400)
    assert.strictEqual((await pedir("director", "PATCH", "/casos/101", {})).status, 400)
    assert.strictEqual((await pedir("director", "PATCH", "/casos/101", { estado: "recibido" })).status, 400)

    // Ninguna respuesta ni llamada interna filtra la clave de servicio
    assert.ok(llamadas.filter((l) => l.url.startsWith("/api/central")).every((l) => l.serviceKey === CLAVE))
    assert.ok(llamadas.filter((l) => l.url.startsWith("/api/tasks-v2")).every((l) => l.serviceKey === undefined), "la clave de servicio no va al backend Python")
    console.log("OK: router /api/central-tickets (401/403/404 por nivel, forzado del líder, actor real, asignación validada, 409 del servicio).")
  } finally {
    servidor.close()
  }
}

async function probarSinConfigurar() {
  const { crearClienteAutogestion } = await import("./autogestionClient")
  await assert.rejects(crearClienteAutogestion({ baseUrl: "", serviceKey: "" }).get("/resumen"), { status: 503 })
}

async function main() {
  probarAutorizacion()
  await new Promise<void>((ok) => servidorFalso.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${(servidorFalso.address() as AddressInfo).port}`
  const silencio = console.error
  console.error = () => undefined // los 502 esperados escriben en el log; aquí no aportan
  // El entorno se fija ANTES de cargar cualquier módulo que lea config/env.ts
  // (dotenv no pisa variables que ya existen, así que un .env local no interfiere).
  process.env.NODE_ENV = "test"
  process.env.JWT_SECRET = SECRETO_JWT
  process.env.INTERNAL_KEY = CLAVE_INTERNA
  process.env.INTRANET_API_URL = base
  process.env.AUTOGESTION_API_URL = base
  process.env.AUTOGESTION_SERVICE_KEY = CLAVE
  try {
    await probarSinConfigurar()
    await probarRouter(base)
    await probarCliente(base)
  } finally {
    console.error = silencio
    servidorFalso.close()
  }
  console.log("Central de tickets: self-check completo.")
}

main().catch((err) => {
  console.error("FALLÓ el self-check de la Central de tickets:", err)
  process.exitCode = 1
})
