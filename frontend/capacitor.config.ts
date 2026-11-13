import type { CapacitorConfig } from "@capacitor/cli"

// El APK empaqueta su propio código (dist/, compilado con `npm run build:android`): el JS que corre en el
// WebView —con acceso a los plugins nativos— queda fijado en el APK firmado y no se sirve desde la red.
// La app llama a la API pública (https://zymointranet.com) desde el origen https://localhost.
// Las versiones nuevas llegan con un APK nuevo (ver aviso de versión mínima).
const config: CapacitorConfig = {
  appId: "com.zymo.intranet",
  appName: "ZYMO Intranet",
  webDir: "dist",
  // Iconos oscuros en las barras del sistema (blancas), también si el teléfono está en modo oscuro.
  plugins: { SystemBars: { style: "LIGHT" } },
  server: { androidScheme: "https" },
}

export default config
