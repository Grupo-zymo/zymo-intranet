// Dónde vive el token: "Recordar sesión" marcado → localStorage (sobrevive al cierre de la app); desmarcado → sessionStorage.
import type { StateStorage } from "zustand/middleware"

const RECORDAR = "zymo-recordar"
const AVISO = "zymo-aviso-login"

export const recordarSesion = {
  leer: (): boolean => {
    try { return localStorage.getItem(RECORDAR) !== "0" } catch { return true }
  },
  fijar: (v: boolean) => {
    try { localStorage.setItem(RECORDAR, v ? "1" : "0") } catch { /* sin almacenamiento */ }
  },
}

export const almacenAuth: StateStorage = {
  getItem: (n) => {
    try { return sessionStorage.getItem(n) ?? localStorage.getItem(n) } catch { return null }
  },
  setItem: (n, v) => {
    try {
      const [dentro, fuera] = recordarSesion.leer() ? [localStorage, sessionStorage] : [sessionStorage, localStorage]
      dentro.setItem(n, v)
      fuera.removeItem(n)
    } catch { /* sin almacenamiento */ }
  },
  removeItem: (n) => {
    try {
      sessionStorage.removeItem(n)
      localStorage.removeItem(n)
    } catch { /* sin almacenamiento */ }
  },
}

/** Mensaje que el login muestra una sola vez (p. ej. "tu contraseña cambió"). */
export const avisoLogin = {
  poner: (m: string) => { try { sessionStorage.setItem(AVISO, m) } catch { /* nada */ } },
  tomar: (): string => {
    try {
      const m = sessionStorage.getItem(AVISO) ?? ""
      sessionStorage.removeItem(AVISO)
      return m
    } catch { return "" }
  },
}
