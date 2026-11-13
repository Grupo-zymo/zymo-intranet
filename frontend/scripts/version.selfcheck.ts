// Verifica la comparación de versión del APK y la lectura tolerante de /api/app/version. Ejecutar: npm run selfcheck
import assert from "node:assert/strict"
import { compararVersion, parsearRespuesta } from "../src/lib/versionApp.ts"

assert.equal(compararVersion(1, 2, 3), "obligatoria")
assert.equal(compararVersion(2, 2, 3), "sugerida")
assert.equal(compararVersion(3, 2, 3), "al-dia")
assert.equal(compararVersion(5, 2, 3), "al-dia")
assert.equal(compararVersion(1, 1, 1), "al-dia")
assert.equal(compararVersion(Number.NaN, 2, 3), "al-dia")

const ok = parsearRespuesta({ android: { minVersionCode: 2, latestVersionCode: 3, latestVersionName: "1.2.0", apkUrl: "https://x.test/a.apk", mensaje: "Hola" } })
assert.deepEqual(ok, { minVersionCode: 2, latestVersionCode: 3, latestVersionName: "1.2.0", apkUrl: "https://x.test/a.apk", mensaje: "Hola" })

for (const raro of [null, undefined, "x", 5, [], {}, { android: null }, { android: "x" }, { android: { minVersionCode: "z", latestVersionCode: -4 } }]) {
  const p = parsearRespuesta(raro)
  assert.equal(compararVersion(1, p.minVersionCode, p.latestVersionCode), "al-dia", JSON.stringify(raro))
}
assert.equal(parsearRespuesta({ android: { minVersionCode: "2" } }).minVersionCode, 2)
assert.equal(parsearRespuesta({ android: { apkUrl: "javascript:alert(1)" } }).apkUrl, "") // solo http(s)
console.log("version.selfcheck OK")
