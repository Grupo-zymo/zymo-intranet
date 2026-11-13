// Tras `npm run build:android`: falla si dist/ trae URLs de desarrollo de la intranet.
// Solo mira los puertos de los backends y localhost con puerto; "https://localhost" a secas
// (origen del WebView, aparece en librerías) no cuenta.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, extname } from "node:path"

const DIST = new URL("../dist", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
const EXT = new Set([".js", ".html", ".css", ".json", ".mjs"])
const DEV_CON_PUERTO = /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/g
const hallazgos = []

function recorrer(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) recorrer(p)
    else if (EXT.has(extname(p))) revisar(p)
  }
}

function revisar(archivo) {
  const txt = readFileSync(archivo, "utf8")
  for (const m of txt.matchAll(DEV_CON_PUERTO)) hallazgos.push([archivo, m[0], "URL de desarrollo con puerto"])
  for (const m of txt.matchAll(/http:\/\/(?:[a-z0-9-]+\.)*zymo[a-z0-9.-]*/gi)) hallazgos.push([archivo, m[0], "http plano hacia la intranet"])
  for (const m of txt.matchAll(/\b(?:localhost|127\.0\.0\.1):(8001|3002|3003|3004|3005|3006)\b/g)) hallazgos.push([archivo, m[0], "puerto de backend"])
}

try {
  recorrer(DIST)
} catch (e) {
  console.error("No hay dist/: corre primero npm run build:android", e.message)
  process.exit(2)
}

if (hallazgos.length) {
  console.error(`FALLA: ${hallazgos.length} hallazgo(s) en dist/`)
  for (const [f, v, why] of hallazgos.slice(0, 40)) console.error(`  ${f.replace(DIST, "dist")}  ${v}  (${why})`)
  process.exit(1)
}
console.log("OK: dist/ sin URLs de desarrollo ni http plano hacia la intranet.")
