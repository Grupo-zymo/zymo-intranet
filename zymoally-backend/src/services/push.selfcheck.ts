// Self-check del push nativo (FCM). Sin red ni BD: todo con dependencias inyectadas.
//
//   npm run selfcheck:push

import assert from "assert"
import { armarMensajeFcm, despacharFcm, enviarFcmPorCorreo, leerCredenciales, type Enviador } from "./fcm"
import { borrarSchema, claveValida, correosEnMinuscula, datosDispositivo, internoSchema, registrarSchema } from "./pushApi"
import { crearAntiduplicado, crearAvisosCentral, decidirAviso, URL_CENTRAL } from "./centralPush"
import { crearDestinatarios } from "./destinatarios"
import { crearRelay } from "./centralStream"
import type { MensajePush } from "./mesaPush"

const MSG: MensajePush = { titulo: "t", texto: "x", url: "/a", etiqueta: "e" }
const TOKEN = "t".repeat(30)

async function main(): Promise<void> {
  // 1. Payload de /interno
  const ok = { correos: ["A@x.co"], titulo: "T", texto: "x", url: "/servicio-cliente/central", etiqueta: "e" }
  assert.ok(internoSchema.safeParse(ok).success)
  for (const url of ["//evil.com", "https://evil.com", "central", "/a\\b"]) assert.ok(!internoSchema.safeParse({ ...ok, url }).success, `url ${url}`)
  assert.ok(!internoSchema.safeParse({ ...ok, titulo: "x".repeat(81) }).success, "titulo > 80")
  assert.ok(!internoSchema.safeParse({ ...ok, texto: "x".repeat(181) }).success, "texto > 180")
  assert.ok(!internoSchema.safeParse({ ...ok, etiqueta: "x".repeat(61) }).success, "etiqueta > 60")
  assert.ok(!internoSchema.safeParse({ ...ok, correos: Array(201).fill("a@x.co") }).success, "correos > 200")
  assert.deepStrictEqual(correosEnMinuscula([" A@X.co ", "a@x.co", "sin-arroba"]), ["a@x.co"])
  // registro / borrado
  assert.ok(registrarSchema.safeParse({ token: TOKEN, plataforma: "android" }).success)
  assert.ok(!registrarSchema.safeParse({ token: "corto", plataforma: "android" }).success)
  assert.ok(!registrarSchema.safeParse({ token: TOKEN, plataforma: "ios" }).success)
  assert.ok(!registrarSchema.safeParse({ token: TOKEN, plataforma: "android", version: "v".repeat(41) }).success)
  assert.ok(!borrarSchema.safeParse({ token: "x".repeat(4097) }).success)
  // clave de servicio
  assert.ok(claveValida("secreta", "secreta"))
  assert.ok(!claveValida(undefined, "secreta") && !claveValida("", "") && !claveValida("otra", "secreta") && !claveValida(["secreta"], "secreta"))

  // 2. Reasignación de token: el upsert pisa userId y correo (en minúscula) con los de quien llama
  const d = datosDispositivo(7, "Nueva@Zymo.CO", { token: TOKEN, plataforma: "android" })
  assert.deepStrictEqual(d.update, { userId: 7, email: "nueva@zymo.co", plataforma: "android", version: null })
  assert.strictEqual(d.create.token, TOKEN)

  // 3. Token inválido se borra; otros errores no; los demás siguen
  const borrados: string[][] = []
  const enviador: Enviador = async (t) => {
    if (t === "muerto") throw Object.assign(new Error("x"), { code: "messaging/registration-token-not-registered" })
    if (t === "malo") throw Object.assign(new Error("x"), { code: "messaging/invalid-registration-token" })
    if (t === "caido") throw Object.assign(new Error("secreto-no-loguear"), { code: "messaging/internal-error" })
  }
  const logs: string[] = []
  const errOriginal = console.error
  console.error = (...a: unknown[]) => void logs.push(a.join(" "))
  const n = await despacharFcm(["bueno", "muerto", "malo", "caido"], MSG, enviador, async (t) => void borrados.push(t))
  console.error = errOriginal
  assert.strictEqual(n, 1)
  assert.deepStrictEqual(borrados, [["muerto", "malo"]])
  assert.ok(logs.length === 1 && !logs[0].includes("secreto-no-loguear"), "el log no filtra detalle del error")
  const f = armarMensajeFcm(MSG)
  assert.deepStrictEqual(f.android, { priority: "high", notification: { channelId: "zymo_general", tag: "e" } })
  assert.deepStrictEqual(f.data, { url: "/a", etiqueta: "e" })

  // 4. Antiduplicado de 20 s
  let reloj = 1_000
  const permitir = crearAntiduplicado(20_000, () => reloj)
  assert.ok(permitir("a@x.co", "central-1"))
  assert.ok(!permitir("a@x.co", "central-1"), "repetida dentro de 20 s")
  assert.ok(permitir("b@x.co", "central-1"), "otro correo sí")
  assert.ok(permitir("a@x.co", "central-2"), "otra etiqueta sí")
  reloj += 20_001
  assert.ok(permitir("a@x.co", "central-1"), "pasada la ventana sí")

  // 5. Decisión de avisos y privacidad
  const msgCliente = { radicado: 55, asignadoEmail: "Lider@Zymo.co", mensaje: { id: 1, texto: "x".repeat(300), interno: false, deCliente: true, autorNombre: "Acme SAS" } }
  const a1 = decidirAviso("mensaje.nuevo", msgCliente)
  assert.ok(a1)
  assert.strictEqual(a1.para, "lider@zymo.co")
  assert.strictEqual(a1.mensaje.titulo, "Mensaje de Acme SAS")
  assert.ok(a1.mensaje.texto.length <= 100, "máx. 100 caracteres del mensaje")
  assert.strictEqual(a1.mensaje.url, URL_CENTRAL)
  assert.strictEqual(decidirAviso("mensaje.nuevo", { ...msgCliente, asignadoEmail: null })?.para, null, "sin asignado → dirección")
  const nota = { ...msgCliente, mensaje: { ...msgCliente.mensaje, interno: true, texto: "NOTA-INTERNA-SECRETA" } }
  assert.strictEqual(decidirAviso("mensaje.nuevo", nota), null, "nota interna no genera aviso")
  assert.strictEqual(decidirAviso("mensaje.nuevo", { ...msgCliente, mensaje: { ...msgCliente.mensaje, deCliente: false } }), null, "mensaje del personal no avisa")
  for (const e of ["mensaje.leido", "escribiendo", "resync"]) assert.strictEqual(decidirAviso(e, nota), null)
  const asign = decidirAviso("caso.actualizado", { radicado: 9, asignadoEmail: "Nuevo@zymo.co", asignadoAntesEmail: null })
  assert.ok(asign && asign.para === "nuevo@zymo.co" && asign.mensaje.titulo === "Te asignaron un caso")
  assert.strictEqual(decidirAviso("caso.actualizado", { radicado: 9, asignadoEmail: "n@zymo.co" }), null, "sin asignadoAntesEmail no es asignación")
  assert.strictEqual(decidirAviso("caso.actualizado", { radicado: 9, asignadoEmail: "n@zymo.co", asignadoAntesEmail: "N@zymo.co" }), null, "mismo responsable")
  assert.strictEqual(decidirAviso("caso.actualizado", { radicado: 9, asignadoEmail: null, asignadoAntesEmail: "n@zymo.co" }), null, "liberar no avisa")

  // 6. Flujo completo con enviador falso: la dirección recibe; nada con la nota; destinatarios fallando no lanza
  const enviados: { correos: string[]; m: MensajePush }[] = []
  const avisos = crearAvisosCentral({
    destinatarios: async () => [{ id: 1, email: "Dir@Zymo.co", nombre: "D" }, { id: 2, email: "dir2@zymo.co", nombre: "E" }],
    enviar: async (correos, m) => void enviados.push({ correos, m }),
    permitir: crearAntiduplicado(20_000, () => reloj),
  })
  await avisos("mensaje.nuevo", { ...msgCliente, asignadoEmail: null })
  await avisos("mensaje.nuevo", { ...msgCliente, asignadoEmail: null }) // duplicado inmediato
  await avisos("mensaje.nuevo", nota)
  assert.strictEqual(enviados.length, 1)
  assert.deepStrictEqual(enviados[0].correos, ["dir@zymo.co", "dir2@zymo.co"])
  assert.ok(!JSON.stringify(enviados).includes("NOTA-INTERNA-SECRETA"))
  const roto = crearAvisosCentral({ destinatarios: async () => { throw new Error("caído") }, enviar: async () => { throw new Error("x") } })
  console.error = () => {}
  await roto("mensaje.nuevo", { ...msgCliente, asignadoEmail: null })
  console.error = errOriginal

  // 7. Caché de destinatarios (60 s) y tolerancia a fallos
  let llamadas = 0
  let falla = false
  let t0 = 0
  const dest = crearDestinatarios(async () => { llamadas++; if (falla) throw new Error("x"); return [{ id: 1, email: "a@x.co", nombre: "A" }] }, 60_000, () => t0)
  await dest("p"); await dest("p")
  assert.strictEqual(llamadas, 1, "segunda consulta sale de la caché")
  t0 = 61_000; falla = true
  console.error = () => {}
  assert.strictEqual((await dest("p")).length, 1, "si falla, usa la lista vieja")
  assert.deepStrictEqual(await dest("otro"), [], "si falla y no hay caché, vacío")
  console.error = errOriginal

  // 8. Gancho del relay: solo ids nuevos
  const vistos: string[] = []
  const relay = crearRelay({
    alEvento: (e, ev) => void vistos.push(`${e}:${ev.radicado}`),
    abrir: async () => ({
      ok: true, status: 200,
      body: (async function* () {
        yield `id: 5\nevent: mensaje.nuevo\ndata: {"radicado":1}\n\n`
        yield `id: 5\nevent: mensaje.nuevo\ndata: {"radicado":1}\n\n` // repetido tras reconexión
        yield `id: 6\nevent: mensaje.nuevo\ndata: {"radicado":2}\n\n`
        yield `event: caso.actualizado\ndata: {"radicado":3}\n\n`
      })(),
    }),
    backoffMinMs: 60_000,
  })
  const sub = relay.suscribir({ nivel: "director", email: "d@zymo.co", escribir: () => {} })
  assert.ok("baja" in sub)
  await new Promise((r) => setTimeout(r, 100))
  relay.detener()
  assert.deepStrictEqual(vistos, ["mensaje.nuevo:1", "mensaje.nuevo:2", "caso.actualizado:3"])

  // 9. FCM apagado sin credenciales: no lanza, devuelve 0 y no toca la BD
  assert.strictEqual(leerCredenciales("", ""), null)
  console.error = () => {}
  assert.strictEqual(leerCredenciales("", "{no es json"), null)
  assert.strictEqual(leerCredenciales("/no/existe.json", "", () => { throw new Error("ENOENT") }), null)
  console.error = errOriginal
  assert.strictEqual(await enviarFcmPorCorreo(["a@x.co"], MSG), 0, "sin credenciales: 0 y sin excepción")
  assert.strictEqual(await enviarFcmPorCorreo([], MSG), 0)

  console.log("push.selfcheck OK")
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
