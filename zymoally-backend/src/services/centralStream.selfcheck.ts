// Self-check del relay de tiempo real de la Central (contrato PLAN.md (g) punto 9).
// Sin red ni BD: el upstream es un canal en memoria.
//
//   npm run selfcheck:stream

import assert from "assert"
import { crearParserSse, type BloqueSse } from "../utils/sse"
import { crearRelay, type RespuestaUpstream, type Suscriptor } from "./centralStream"

const CLAVE = "clave-de-servicio-solo-para-el-selfcheck"
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function hasta(cond: () => boolean, etiqueta: string, ms = 2_000): Promise<void> {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) assert.fail(`timeout esperando: ${etiqueta}`)
    await esperar(5)
  }
}

// ─── 1. Parser SSE ──────────────────────────────────────────────────────────

function parsear(trozos: string[]): BloqueSse[] {
  const salida: BloqueSse[] = []
  const p = crearParserSse((b) => salida.push(b))
  trozos.forEach((t) => p.push(t))
  return salida
}

{
  const texto = ': ping\n\nid: 7\nevent: mensaje.nuevo\ndata: {"a":1}\n\nevent: x\ndata: l1\ndata: l2\n\n'
  const esperado = [
    { id: "7", event: "mensaje.nuevo", data: '{"a":1}' },
    { id: undefined, event: "x", data: "l1\nl2" },
  ]
  assert.deepStrictEqual(parsear([texto]), esperado, "bloques completos")
  // Cortado en cada byte: el resultado no cambia.
  assert.deepStrictEqual(parsear(texto.split("")), esperado, "cortado byte a byte")
  // CRLF, incluso con el \r\n partido entre trozos.
  assert.deepStrictEqual(parsear(["id: 7\r", "\nevent: mensaje.nuevo\r\ndata: {\"a\":1}\r\n\r", "\n", "event: x\r\ndata: l1\r\ndata: l2\r\n\r\n"]), esperado, "CRLF")
  assert.deepStrictEqual(parsear(["data: sin cerrar\n"]), [], "un bloque sin línea vacía no se entrega")
}

// ─── Upstream simulado ──────────────────────────────────────────────────────

interface Conexion {
  lastId: number | null
  emitir(texto: string): void
  cerrar(): void
}

function crearUpstream(fallos = 0) {
  const conexiones: Conexion[] = []
  let restantesFallos = fallos
  const abrir = async (lastId: number | null, signal: AbortSignal): Promise<RespuestaUpstream> => {
    if (restantesFallos > 0) {
      restantesFallos -= 1
      return { ok: false, status: 503, body: null }
    }
    const cola: string[] = []
    let fin = false
    let despertar: (() => void) | null = null
    const despertarYa = () => despertar?.()
    signal.addEventListener("abort", () => {
      fin = true
      despertarYa()
    })
    conexiones.push({
      lastId,
      emitir: (t) => {
        cola.push(t)
        despertarYa()
      },
      cerrar: () => {
        fin = true
        despertarYa()
      },
    })
    async function* cuerpo(): AsyncGenerator<string> {
      while (true) {
        if (cola.length > 0) yield cola.shift() as string
        else if (fin) return
        else await new Promise<void>((r) => (despertar = r))
      }
    }
    return { ok: true, status: 200, body: cuerpo() }
  }
  return { abrir, conexiones }
}

function suscriptor(nivel: "director" | "lider", email: string) {
  const recibido: string[] = []
  const s: Suscriptor = { nivel, email, escribir: (t) => void recibido.push(t) }
  return { s, recibido, texto: () => recibido.join("") }
}

const evento = (id: number | null, event: string, datos: object): string =>
  `${id !== null ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(datos)}\n\n`

async function main(): Promise<void> {
  // ─── 2. Fan-out por nivel ─────────────────────────────────────────────────
  {
    const up = crearUpstream()
    const relay = crearRelay({ abrir: up.abrir, backoffMinMs: 5, backoffMaxMs: 20 })
    const dir = suscriptor("director", "dir@zymo.co")
    const ana = suscriptor("lider", "ana@zymo.co")
    const beto = suscriptor("lider", "beto@zymo.co")
    for (const x of [dir, ana, beto]) assert.ok("baja" in relay.suscribir(x.s), "cabe")
    await hasta(() => up.conexiones.length === 1, "conexión upstream perezosa")
    assert.strictEqual(up.conexiones[0].lastId, null, "la primera conexión no lleva Last-Event-ID")
    for (const x of [dir, ana, beto]) assert.ok(x.texto().includes("event: hello"), "hello propio al suscribirse")

    const c = up.conexiones[0]
    // Mensaje de un caso de Ana
    c.emitir(evento(10, "mensaje.nuevo", { radicado: 55, asignadoEmail: "Ana@Zymo.co", mensaje: { id: 10, texto: "hola", interno: false } }))
    // Caso que Beto acaba de perder y pasó a Ana: ambos lo ven
    c.emitir(evento(null, "caso.actualizado", { radicado: 56, estado: "en_analisis", asignadoEmail: "ana@zymo.co", asignadoAntesEmail: "beto@zymo.co" }))
    // Caso de nadie y datos no parseables
    c.emitir(evento(11, "mensaje.nuevo", { radicado: 57, asignadoEmail: null, mensaje: { id: 11 } }))
    c.emitir("event: mensaje.nuevo\ndata: {no es json\n\n")
    // Ping y hello upstream: a todos
    c.emitir(": ping\n\n")
    c.emitir('event: hello\ndata: {"t":"x"}\n\n')
    c.emitir(evento(null, "caso.actualizado", { radicado: 58, estado: "x", asignadoEmail: "ana@zymo.co" }))
    await hasta(() => ana.texto().includes('"radicado":58'), "marcador tras el hello upstream")
    for (const x of [dir, ana, beto]) assert.strictEqual(x.texto().split("event: hello").length, 2, "un solo hello por suscriptor (el del upstream no se reenvía)")

    // Director: todo, con asignadoEmail, sin id:
    assert.ok(dir.texto().includes('"radicado":55') && dir.texto().includes('"radicado":56') && dir.texto().includes('"radicado":57'), "director ve todo")
    assert.ok(dir.texto().includes("asignadoEmail"), "director conserva asignadoEmail")
    assert.ok(!dir.texto().includes("no es json"), "data no parseable descartada")
    // Ana: 55 y 56, no 57
    assert.ok(ana.texto().includes('"radicado":55') && ana.texto().includes('"radicado":56'), "Ana ve los suyos")
    assert.ok(!ana.texto().includes('"radicado":57'), "Ana no ve casos sin asignar")
    // Beto: solo 56 (lo tuvo antes)
    assert.ok(beto.texto().includes('"radicado":56') && !beto.texto().includes('"radicado":55'), "Beto ve su caso anterior, no el de Ana")
    // Nada de lo que sale al navegador lleva id: ni la clave; el líder no ve correos de asignación
    for (const x of [dir, ana, beto]) {
      assert.ok(!/(^|\n)id:/.test(x.texto()), "sin id: hacia el navegador")
      assert.ok(!x.texto().includes(CLAVE), "la clave de servicio nunca sale")
    }
    for (const x of [ana, beto]) assert.ok(!/asignado(Antes)?Email/.test(x.texto()), "el líder no recibe asignadoEmail/asignadoAntesEmail")

    // ─── 3. Upstream caído → reconexión con Last-Event-ID + resync ──────────
    const antes = new Map([dir, ana, beto].map((x) => [x, x.recibido.length] as const))
    c.cerrar()
    await hasta(() => up.conexiones.length === 2, "reconexión")
    assert.strictEqual(up.conexiones[1].lastId, 11, "reconecta con el último id visto")
    await hasta(() => [dir, ana, beto].every((x) => x.recibido.slice(antes.get(x) ?? 0).some((t) => t.startsWith("event: resync"))), "resync a todos")

    // Sigue repartiendo tras reconectar
    up.conexiones[1].emitir(evento(12, "mensaje.nuevo", { radicado: 55, asignadoEmail: "ana@zymo.co", mensaje: { id: 12 } }))
    await hasta(() => ana.texto().includes('"id":12'), "reparte tras reconectar")
    relay.detener()
  }

  // ─── 4. El servicio falla al abrir: reintenta con backoff y luego resync ──
  {
    const up = crearUpstream(2)
    const relay = crearRelay({ abrir: up.abrir, backoffMinMs: 5, backoffMaxMs: 20 })
    const dir = suscriptor("director", "dir@zymo.co")
    relay.suscribir(dir.s)
    await hasta(() => up.conexiones.length === 1, "conecta tras 2 fallos")
    await hasta(() => dir.texto().includes("event: resync"), "resync al recuperar")
    relay.detener()
  }

  // ─── 5. Sin suscriptores no se reconecta ─────────────────────────────────
  {
    const up = crearUpstream()
    const relay = crearRelay({ abrir: up.abrir, backoffMinMs: 5, backoffMaxMs: 20 })
    const dir = suscriptor("director", "dir@zymo.co")
    const r = relay.suscribir(dir.s)
    assert.ok("baja" in r)
    await hasta(() => up.conexiones.length === 1, "conecta")
    if ("baja" in r) r.baja()
    up.conexiones[0].cerrar()
    await esperar(100)
    assert.strictEqual(up.conexiones.length, 1, "sin gente no se reconecta")
    relay.detener()
  }

  // ─── 5b. Suscriptor nuevo durante el backoff: conexión inmediata + resync a todos ─
  {
    const up = crearUpstream()
    const relay = crearRelay({ abrir: up.abrir, backoffMinMs: 400, backoffMaxMs: 400 })
    const a = suscriptor("director", "a@zymo.co")
    relay.suscribir(a.s)
    await hasta(() => up.conexiones.length === 1, "conecta")
    up.conexiones[0].cerrar() // cae: reconexión programada a ~400 ms
    await esperar(60)
    const b = suscriptor("director", "b@zymo.co")
    relay.suscribir(b.s)
    await hasta(() => up.conexiones.length === 2, "el suscriptor nuevo abre la conexión sin esperar el backoff", 300)
    await hasta(() => a.texto().includes("event: resync"), "el suscriptor previo recibe resync")
    await hasta(() => b.texto().includes("event: resync"), "el nuevo también (no sabe qué se perdió)")
    await esperar(450) // el temporizador viejo no debe abrir una tercera conexión
    assert.strictEqual(up.conexiones.length, 2, "sin conexiones duplicadas")
    relay.detener()
  }

  // ─── 5c. Backpressure ─────────────────────────────────────────────────────
  {
    const up = crearUpstream()
    const relay = crearRelay({ abrir: up.abrir })
    const lento = suscriptor("director", "lento@zymo.co")
    let pendiente = 100_000
    let cerrado = false
    lento.s.bufferado = () => pendiente
    lento.s.cerrar = () => void (cerrado = true)
    relay.suscribir(lento.s)
    await hasta(() => up.conexiones.length === 1, "conecta")
    const c = up.conexiones[0]
    c.emitir(evento(null, "escribiendo", { radicado: 1, lado: "cliente", nombre: "X", asignadoEmail: null }))
    c.emitir(evento(30, "mensaje.nuevo", { radicado: 1, mensaje: { id: 30 } }))
    await hasta(() => lento.texto().includes('"id":30'), "lo crítico sigue llegando con buffer alto")
    assert.ok(!lento.texto().includes("escribiendo"), "el aviso efímero se descarta con buffer alto")
    pendiente = 2 * 1024 * 1024
    c.emitir(evento(31, "mensaje.nuevo", { radicado: 1, mensaje: { id: 31 } }))
    await hasta(() => cerrado, "buffer desbordado: se cierra la conexión")
    assert.ok(!lento.texto().includes('"id":31'))
    assert.strictEqual(relay.cantidad(), 0)
    relay.detener()
  }

  // ─── 6. Topes: 5 por usuario y total ─────────────────────────────────────
  {
    const up = crearUpstream()
    const relay = crearRelay({ abrir: up.abrir, maxPorUsuario: 5, maxTotal: 7 })
    for (let i = 0; i < 5; i += 1) assert.ok("baja" in relay.suscribir(suscriptor("lider", "x@zymo.co").s), `conexión ${i + 1} cabe`)
    assert.deepStrictEqual(relay.suscribir(suscriptor("lider", "x@zymo.co").s), { error: "usuario" }, "la 6.ª del mismo usuario se rechaza")
    assert.strictEqual(relay.motivoDeRechazo("x@zymo.co"), "usuario")
    assert.strictEqual(relay.motivoDeRechazo("y@zymo.co"), null, "otro usuario no se ve afectado")
    assert.ok("baja" in relay.suscribir(suscriptor("lider", "y@zymo.co").s))
    assert.ok("baja" in relay.suscribir(suscriptor("lider", "z@zymo.co").s))
    assert.deepStrictEqual(relay.suscribir(suscriptor("lider", "w@zymo.co").s), { error: "total" }, "tope total")
    assert.strictEqual(relay.cantidad(), 7)
    relay.detener()
  }

  console.log("centralStream.selfcheck: OK")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
