// Origen fijo del WebView Android de la app empaquetada (Capacitor, androidScheme https).
export const ORIGEN_APP_MOVIL = "https://localhost"

// Defaults de desarrollo local (los mismos que ya traía el compose / el backend Python).
const ORIGENES_DEV = ["http://localhost:5173", "http://localhost:81", "http://localhost:3000"]

export function listaOrigenes(configurado?: string | null): string[] {
  const extra = (configurado ?? "").split(",").map((o) => o.trim()).filter(Boolean)
  return [...new Set([...(extra.length ? extra : ORIGENES_DEV), ORIGEN_APP_MOVIL])]
}

// Sin Origin (curl, server a server, nginx same-origin) se permite; "null" y los no listados se rechazan.
export function origenPermitido(origin: string | undefined, configurado?: string | null): boolean {
  if (!origin) return true
  return listaOrigenes(configurado).includes(origin)
}

export function corsOrigin(configurado?: string | null) {
  return (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
    cb(null, origenPermitido(origin, configurado))
}
