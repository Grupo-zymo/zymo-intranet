// Self-check de CORS (origen del WebView de la app). Sin BD ni red.   npx ts-node src/config/cors.selfcheck.ts
import assert from "assert"
import { origenPermitido, listaOrigenes } from "./cors"

const cfg = "https://zymointranet.com"
assert.ok(origenPermitido("https://localhost", cfg), "WebView Android")
assert.ok(origenPermitido("https://localhost", undefined), "WebView sin env")
assert.ok(origenPermitido(cfg, cfg), "configurado")
assert.ok(!origenPermitido("https://evil.example", cfg), "ajeno")
assert.ok(!origenPermitido("null", cfg), "origin null")
assert.ok(!origenPermitido("capacitor://localhost", cfg), "capacitor fuera")
assert.ok(origenPermitido(undefined, cfg), "sin Origin")
assert.ok(origenPermitido("http://b.test", " http://a.test , ,http://b.test,"), "lista con espacios/vacíos")
assert.ok(!origenPermitido("http://localhost:5173", cfg), "dev solo si no hay env")
assert.ok(origenPermitido("http://localhost:5173", undefined), "dev por defecto")
assert.ok(!listaOrigenes("*").includes("https://evil.example") && !origenPermitido("https://evil.example", "*"), "sin comodín")
console.log("cors.selfcheck: OK")
