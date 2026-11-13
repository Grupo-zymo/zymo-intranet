// Verifica el parser SSE, el backoff y el ciclo de conexion de lib/sse.ts. Ejecutar: npm run selfcheck
import assert from "node:assert/strict"
import { abrirStream, crearParser, esperaBackoff } from "../src/lib/sse.ts"
import type { EstadoStream, EventoSse } from "../src/lib/sse.ts"

// ── Parser: trozos partidos en cualquier punto, comentarios, multilinea, CRLF ──
const bloque = ": ping\n\nid: 7\nevent: mensaje.nuevo\ndata: {\"a\":1}\n\nevent: hello\r\ndata: x\r\ndata: y\r\n\r\n"
for (let corte = 1; corte < bloque.length; corte += 3) {
  const vistos: EventoSse[] = []
  const p = crearParser((e) => vistos.push(e))
  p.push(bloque.slice(0, corte))
  p.push(bloque.slice(corte))
  assert.equal(vistos.length, 2, `corte ${corte}`)
  assert.deepEqual(vistos[0], { id: "7", evento: "mensaje.nuevo", datos: '{"a":1}' })
  assert.deepEqual(vistos[1], { id: "7", evento: "hello", datos: "x\ny" })
}

// ── Backoff: 1 -> 30 s, con jitter de 50 % a 100 % ──
assert.equal(esperaBackoff(1, () => 1), 1000)
assert.equal(esperaBackoff(1, () => 0), 500)
assert.equal(esperaBackoff(3, () => 1), 4000)
assert.equal(esperaBackoff(20, () => 1), 30_000)
assert.ok(esperaBackoff(20, () => 0) >= 15_000)

// ── Ciclo de conexion con fetch simulado ──
const enc = new TextEncoder()
function respuestaEnVivo(texto: string, cerrarAlFinal: boolean): Response {
  const cuerpo = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(texto))
      if (cerrarAlFinal) c.close()
    },
  })
  return new Response(cuerpo, { status: 200, headers: { "Content-Type": "text/event-stream" } })
}
const sinEsperar = () => new Promise<void>((r) => setTimeout(r, 1))
const tick = () => new Promise<void>((r) => setTimeout(r, 5))
async function hasta(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await tick()
  assert.ok(cond(), "la condicion no se cumplio a tiempo")
}

// 1) Llega hello -> en_vivo; se manda el Bearer; al cortarse reconecta con Last-Event-ID
{
  const estados: EstadoStream[] = []
  const eventos: EventoSse[] = []
  const pedidos: Record<string, string>[] = []
  let llamadas = 0
  let ultimo: string | null = null
  const c = abrirStream({
    url: "http://x/stream",
    token: () => "T0KEN",
    ultimoId: () => ultimo,
    onEvento: (e) => { eventos.push(e); if (e.id) ultimo = e.id },
    onEstado: (s) => estados.push(s),
    onNoAutorizado: () => assert.fail("no debia dar 401"),
    esperar: sinEsperar,
    fetchFn: (async (_u: unknown, init?: RequestInit) => {
      pedidos.push(init?.headers as Record<string, string>)
      llamadas += 1
      if (llamadas === 1) return respuestaEnVivo('event: hello\ndata: {}\n\nid: 5\nevent: mensaje.nuevo\ndata: {}\n\n', true)
      return respuestaEnVivo('event: hello\ndata: {}\n\n', false)
    }) as typeof fetch,
  })
  await hasta(() => llamadas >= 2 && eventos.length >= 3)
  c.cerrar()
  assert.equal(pedidos[0].Authorization, "Bearer T0KEN")
  assert.equal(pedidos[0]["Last-Event-ID"], undefined)
  assert.equal(pedidos[1]["Last-Event-ID"], "5")
  assert.deepEqual(estados.slice(0, 4), ["conectando", "en_vivo", "reconectando", "en_vivo"])
}

// 2) 401 -> onNoAutorizado y no reintenta
{
  let llamadas = 0
  let sesion = 0
  abrirStream({
    url: "http://x/stream",
    token: () => "viejo",
    onEvento: () => {},
    onEstado: () => {},
    onNoAutorizado: () => { sesion += 1 },
    esperar: sinEsperar,
    fetchFn: (async () => { llamadas += 1; return new Response("no", { status: 401 }) }) as typeof fetch,
  })
  await hasta(() => sesion === 1)
  await tick()
  assert.equal(llamadas, 1)
}

// 3) Tres fallos seguidos -> sin_stream (y sigue reintentando por si vuelve)
{
  const estados: EstadoStream[] = []
  let llamadas = 0
  const c = abrirStream({
    url: "http://x/stream",
    token: () => null,
    onEvento: () => {},
    onEstado: (s) => estados.push(s),
    onNoAutorizado: () => {},
    esperar: sinEsperar,
    fetchFn: (async () => { llamadas += 1; return new Response("x", { status: 503 }) }) as typeof fetch,
  })
  await hasta(() => estados.includes("sin_stream") && llamadas >= 4)
  c.cerrar()
  assert.deepEqual(estados.slice(0, 3), ["conectando", "reconectando", "sin_stream"])
}

// 4) Volver a primer plano corta la conexion y abre otra
{
  let llamadas = 0
  let volver: () => void = () => {}
  const c = abrirStream({
    url: "http://x/stream",
    token: () => null,
    onEvento: () => {},
    onEstado: () => {},
    onNoAutorizado: () => {},
    suscribirPrimerPlano: (cb) => { volver = cb; return () => {} },
    fetchFn: (async (_u: unknown, init?: RequestInit) => {
      llamadas += 1
      const senal = init?.signal
      const cuerpo = new ReadableStream<Uint8Array>({
        start(ctl) {
          ctl.enqueue(enc.encode("event: hello\ndata: {}\n\n"))
          senal?.addEventListener("abort", () => ctl.error(senal.reason))
        },
      })
      return new Response(cuerpo, { status: 200 })
    }) as typeof fetch,
  })
  await hasta(() => llamadas === 1)
  await tick()
  volver()
  await hasta(() => llamadas === 2)
  c.cerrar()
}

console.log("sse.selfcheck OK")
