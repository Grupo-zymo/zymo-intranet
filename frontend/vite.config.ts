import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Los workers de pdf.js vienen como .mjs y el nginx del frontend sirve .mjs como application/octet-stream:
        // el navegador se niega a ejecutar un worker de módulo con ese tipo y el visor de PDF (y la extracción de
        // texto del SIG) fallan solo en producción. Con extensión .js, nginx los sirve como JavaScript.
        assetFileNames: (info) => {
          const nombre = info.names?.[0] ?? ""
          return nombre.endsWith(".mjs") ? "assets/[name]-[hash].js" : "assets/[name]-[hash][extname]"
        },
      },
    },
  },
})
