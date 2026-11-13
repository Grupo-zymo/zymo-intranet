import { useMutation, useQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/store/authStore"
import { api } from "@/lib/api"
import { trasLoginManual, type ResultadoLogin } from "@/components/SesionSegura"
import { desactivarBiometria } from "@/lib/biometria"
import { recordarSesion } from "@/lib/almacenSesion"
import type { TokenResponse, User } from "@/types/auth"

// ── Login ─────────────────────────────────────────────────────────────────────

interface LoginCredentials {
  email: string
  password: string
  recordar?: boolean
}

async function loginRequest(credentials: LoginCredentials): Promise<TokenResponse> {
  const form = new URLSearchParams()
  form.set("username", credentials.email)
  form.set("password", credentials.password)
  const { data } = await api.post<TokenResponse>("/auth/token", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  })
  return data
}

async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me")
  return data
}

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: async (c: LoginCredentials) => {
      recordarSesion.fijar(c.recordar ?? true) // antes del login: decide en qué almacén se guarda el token
      return loginRequest(c)
    },
    onSuccess: async (tokenData, c) => {
      // Guardamos el token primero para que el interceptor lo adjunte en /me
      useAuthStore.setState({ token: tokenData.access_token })
      const user = await fetchMe()
      setAuth(user, tokenData.access_token)
      void trasLoginManual(c.email, c.password, c.recordar ?? true)
    },
  })
}

/** Login sin pantalla (desbloqueo biométrico): mismo endpoint, y distingue contraseña rechazada de falta de red. */
export async function loginSilencioso(email: string, password: string): Promise<ResultadoLogin> {
  try {
    const t = await loginRequest({ email, password })
    useAuthStore.setState({ token: t.access_token })
    const user = await fetchMe()
    useAuthStore.getState().setAuth(user, t.access_token)
    return "ok"
  } catch (e) {
    if (!useAuthStore.getState().isAuthenticated) useAuthStore.setState({ token: null }) // no dejar un token persistido sin sesión
    return clasificarError(e)
  }
}

/** Solo 401/403 cuentan como "rechazada" (y habilitan borrar lo guardado); 400/429/5xx o sin respuesta no. */
function clasificarError(e: unknown): ResultadoLogin {
  const status = (e as { response?: { status?: number } }).response?.status
  if (status === undefined) return "sin-conexion"
  return status === 401 || status === 403 ? "rechazada" : "error"
}

/** Comprueba correo y contraseña sin tocar la sesión ni el token guardado (para activar la biometría). */
export async function verificarClaveLogin(email: string, password: string): Promise<ResultadoLogin> {
  try {
    await loginRequest({ email, password })
    return "ok"
  } catch (e) {
    return clasificarError(e)
  }
}

// ── Usuario actual ─────────────────────────────────────────────────────────────

export function useMe() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const updateUser = useAuthStore((s) => s.updateUser)

  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const user = await fetchMe()
      updateUser(user)
      return user
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,  // 5 minutos
  })
}

// ── Logout ─────────────────────────────────────────────────────────────────────

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  return () => {
    clearAuth()
    // cerrar sesión borra las credenciales del Keystore; se espera antes de recargar para no cortar el borrado
    void desactivarBiometria().finally(() => { window.location.href = "/login" })
  }
}
