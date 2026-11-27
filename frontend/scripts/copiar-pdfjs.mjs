// Copia a public/pdfjs/ los recursos que el visor de lectura del SIG (components/sig/PdfLectura.tsx) le pasa a pdf.js:
// los decodificadores wasm (imágenes escaneadas CCITT/JBIG2/JPEG2000; sin ellos esas páginas salen en blanco), las
// fuentes estándar y los perfiles de color. Corre solo antes de `npm run dev` y `npm run build` (predev/prebuild),
// también dentro de Docker; la carpeta no se versiona (.gitignore) porque sale de node_modules.
import { cpSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..")
const origen = join(raiz, "node_modules", "pdfjs-dist")
const destino = join(raiz, "public", "pdfjs")

rmSync(destino, { recursive: true, force: true }) // nada viejo de otra versión de pdf.js
for (const carpeta of ["wasm", "standard_fonts", "iccs"]) {
  cpSync(join(origen, carpeta), join(destino, carpeta), { recursive: true })
}
console.log("pdf.js: recursos copiados a public/pdfjs/")
