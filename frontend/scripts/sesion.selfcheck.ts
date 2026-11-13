// Verifica la decision de arranque (sesion recordada + biometria) y la lectura del exp del JWT. Ejecutar: npm run selfcheck
import assert from "node:assert/strict"
import { decidirArranque, jwtVigente } from "../src/lib/sesionDecision.ts"

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = (exp: number, extra = "") => `${b64url({ alg: "HS256" })}.${b64url({ sub: "a@b.co", exp, n: extra })}.firma`
const ahora = 1_800_000_000_000

// El exp se lee aunque el payload tenga - y _ (base64url) o no lleve relleno: antes atob() lanzaba y la sesion se cerraba sola.
const raro = jwt(ahora / 1000 + 3600, "???>>>~~~")
assert.ok(/[-_]/.test(raro.split(".")[1]), "el caso de prueba debe contener - o _")
assert.equal(jwtVigente(raro, ahora), true)
assert.equal(jwtVigente(jwt(ahora / 1000 - 10), ahora), false)
assert.equal(jwtVigente(jwt(ahora / 1000 + 30), ahora), false) // dentro del margen de 60 s
assert.equal(jwtVigente(null, ahora), false)
assert.equal(jwtVigente("basura", ahora), false)

const e = { tokenVigente: true, biometriaActiva: true, biometriaDisponible: true, bloqueoOk: null as boolean | null }
// Sin biometria activa (o sin huella en el telefono): entra con token vigente; si no, login manual
assert.equal(decidirArranque({ ...e, biometriaActiva: false }), "entrar")
assert.equal(decidirArranque({ ...e, biometriaDisponible: false }), "entrar")
assert.equal(decidirArranque({ ...e, biometriaActiva: false, tokenVigente: false }), "login-manual")
// Con biometria: primero se pide; fallo/cancelacion -> contrasena; exito -> token o login silencioso
assert.equal(decidirArranque(e), "pedir-biometria")
assert.equal(decidirArranque({ ...e, bloqueoOk: false }), "login-manual")
assert.equal(decidirArranque({ ...e, bloqueoOk: true }), "entrar")
assert.equal(decidirArranque({ ...e, bloqueoOk: true, tokenVigente: false }), "login-silencioso")
console.log("sesion.selfcheck OK")
