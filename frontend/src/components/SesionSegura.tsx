import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { App } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import { Fingerprint } from "lucide-react"
import {
  activarBiometria, bioActivaGuardada, bioNoPreguntar, biometriaDisponible, desactivarBiometria, limpiarSiApagada,
  leerCredencialesBiometria, noVolverAPreguntar, verificarBiometria,
} from "@/lib/biometria"
import { decidirArranque, jwtVigente } from "@/lib/sesionDecision"

/** ok; rechazada = el servidor dijo 401/403 (contraseña mala o cuenta desactivada); otro = red caída o error del servidor (400/429/5xx). */
export type ResultadoLogin = "ok" | "rechazada" | "sin-conexion" | "error"

const ROJO = "#C3182A"
const boton = "min-h-11 rounded-xl px-5 text-[15px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
const REBLOQUEO_MS = 5 * 60_000

// ---- Oferta "¿Entrar con huella o rostro la próxima vez?" (las credenciales solo viven en memoria hasta que se responde) ----
type Oferta = { email: string; clave: string } | null
let oferta: Oferta = null
const oyentes = new Set<() => void>()
const poner = (o: Oferta) => {
  oferta = o
  oyentes.forEach((f) => f())
}

/**
 * Tras un login MANUAL exitoso. Si había biometría guardada se borra antes (podían ser credenciales de otra persona);
 * con "Recordar sesión" se propone de nuevo, una sola vez, si el teléfono la tiene y no se dijo "no volver".
 */
export async function trasLoginManual(email: string, clave: string, recordar: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (bioActivaGuardada()) await desactivarBiometria()
  if (!recordar || bioNoPreguntar()) return
  if ((await biometriaDisponible()) === "si") poner({ email, clave })
}

/** Fondo y tarjeta de un cuadro modal propio (sobre la hoja, con foco). */
function Modal({ children, etiqueta, alCerrar }: { children: ReactNode; etiqueta: string; alCerrar: () => void }) {
  useEffect(() => {
    // Escape (y el atrás de Android, que lo despacha) cierra el cuadro
    const f = (e: KeyboardEvent) => e.key === "Escape" && alCerrar()
    document.addEventListener("keydown", f)
    return () => document.removeEventListener("keydown", f)
  }, [alCerrar])
  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/50 p-6">
      <div role="alertdialog" aria-modal="true" aria-label={etiqueta} className="w-full max-w-xs rounded-2xl bg-white p-6 text-[#18181B] shadow-2xl">
        {children}
      </div>
    </div>
  )
}

export function OfertaBiometria() {
  const o = useSyncExternalStore((f) => (oyentes.add(f), () => oyentes.delete(f)), () => oferta)
  const [error, setError] = useState("")
  const [ocupado, setOcupado] = useState(false)
  if (!o) return null
  async function si() {
    if (!o) return
    setOcupado(true)
    const ok = await activarBiometria(o.email, o.clave)
    setOcupado(false)
    if (ok) poner(null)
    else setError("No se pudo activar. Puedes intentarlo después desde el menú.")
  }
  return (
    <Modal etiqueta="Entrar con huella o rostro" alCerrar={() => poner(null)}>
      <Fingerprint className="mb-3 size-9" style={{ color: ROJO }} aria-hidden />
      <h2 className="text-lg font-bold">¿Entrar con tu huella o rostro la próxima vez?</h2>
      <p className="mt-1 text-sm text-[#52525B]">Tu contraseña se guarda cifrada en el almacén seguro de tu celular.</p>
      {error && <p role="alert" className="mt-3 text-sm font-medium" style={{ color: ROJO }}>{error}</p>}
      <div className="mt-5 flex flex-col gap-2">
        <button autoFocus disabled={ocupado} onClick={() => void si()} className={`${boton} text-white`} style={{ background: ROJO }}>Sí, activar</button>
        <button disabled={ocupado} onClick={() => poner(null)} className={`${boton} border border-[#D4D4D8]`}>Ahora no</button>
        <button disabled={ocupado} onClick={() => { noVolverAPreguntar(); poner(null) }} className="min-h-11 text-sm text-[#52525B]">No volver a preguntar</button>
      </div>
    </Modal>
  )
}

// ---- Bloqueo al abrir la app (y al volver de segundo plano tras 5 minutos) ----
// Ojo: este bloqueo protege la APERTURA FÍSICA de la app (quien tome el celular desbloqueado), no es una barrera contra código
// que corra dentro del WebView: la pantalla es una capa de la propia web.
interface BloqueoProps {
  token: string | null
  iniciarSesion: (email: string, clave: string) => Promise<ResultadoLogin>
  /** La persona prefiere su contraseña (o hay que pedirla de nuevo): se cierra la sesión local y se muestra el login. */
  usarClave: (aviso?: string) => void
}

const MSG_BLOQUEADA = "La huella o el rostro están bloqueados por ahora. Usa tu contraseña."
const MSG_FALLO = "No pudimos verificarte. Intenta de nuevo o usa tu contraseña."

export function BloqueoBiometrico({ token, iniciarSesion, usarClave }: BloqueoProps) {
  const [bloqueado, setBloqueado] = useState(bioActivaGuardada)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const tokenRef = useRef(token)
  tokenRef.current = token
  const iniciarRef = useRef(iniciarSesion)
  iniciarRef.current = iniciarSesion
  const enCurso = useRef(false)

  /** Cierra el bloqueo por la vía de la contraseña: borra también lo guardado en el Keystore. */
  async function irAClave(aviso?: string) {
    await desactivarBiometria()
    setBloqueado(false)
    usarClave(aviso)
  }

  async function intentar() {
    if (enCurso.current) return
    enCurso.current = true
    setOcupado(true)
    setMensaje("")
    try {
      const disp = await biometriaDisponible()
      if (disp === "no") {
        // Permanente (se quitó la huella del teléfono, etc.): sin biometría no hay bloqueo posible. Aquí sí se desactiva.
        await desactivarBiometria()
        setBloqueado(false)
        return
      }
      if (disp === "transitorio") {
        setMensaje("No pudimos usar la huella o el rostro ahora. Intenta de nuevo o usa tu contraseña.") // sin borrar nada, sin abrir la app
        return
      }
      const vigente = jwtVigente(tokenRef.current)
      let creds: { email: string; clave: string } | null = null
      let ok = false
      if (vigente) {
        const r = await verificarBiometria()
        ok = r.ok
        if (!r.ok) setMensaje(r.bloqueado ? MSG_BLOQUEADA : MSG_FALLO)
      } else {
        const c = await leerCredencialesBiometria() // la lectura segura ya es el bloqueo: pide huella o rostro
        if (c === null) return void (await irAClave("Vuelve a iniciar sesión para activar de nuevo la huella o el rostro."))
        if ("email" in c) {
          ok = true
          creds = c
        } else setMensaje(c.bloqueado ? MSG_BLOQUEADA : MSG_FALLO)
      }
      const paso = decidirArranque({ tokenVigente: vigente, biometriaActiva: bioActivaGuardada(), biometriaDisponible: true, bloqueoOk: ok })
      if (paso === "entrar") setBloqueado(false)
      else if (paso === "login-silencioso" && creds) {
        const r = await iniciarRef.current(creds.email, creds.clave)
        if (r === "ok") setBloqueado(false)
        else if (r === "rechazada") await irAClave("Tu contraseña cambió o tu cuenta ya no está activa. Inicia sesión de nuevo.")
        else setMensaje(r === "sin-conexion" ? "Sin conexión con el servidor. Revisa tu internet e intenta de nuevo." : "El servidor no pudo atender ahora. Intenta de nuevo o usa tu contraseña.")
      }
      // "login-manual" / "pedir-biometria": la app sigue bloqueada con su mensaje y los dos botones; nunca se abre sin pasar el bloqueo
    } finally {
      enCurso.current = false
      setOcupado(false)
    }
  }

  // Arranque en frío
  useEffect(() => {
    void limpiarSiApagada()
    if (bloqueado) void intentar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-bloqueo al volver de segundo plano tras más de 5 minutos (solo guarda una marca de tiempo, nada sensible)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let inicio: number | null = null
    const h = App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) inicio = Date.now()
      else if (inicio !== null && Date.now() - inicio > REBLOQUEO_MS && bioActivaGuardada()) {
        inicio = null
        setBloqueado(true)
        void intentar()
      } else inicio = null
    })
    return () => void h.then((x) => x.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!bloqueado) return null
  return (
    <div data-bloqueo className="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-white px-8 pb-[env(safe-area-inset-bottom)]">
      <img src="/brand/zymo_logo.png" alt="ZYMO" className="h-14 w-auto object-contain" />
      <p className="mt-2 text-[11px] font-medium uppercase tracking-widest text-[#71717A]">Intranet</p>
      <Fingerprint className="mt-10 size-14" style={{ color: ROJO }} aria-hidden />
      <p role="status" className="mt-4 min-h-10 max-w-xs text-center text-sm text-[#52525B]">{mensaje || "Usa tu huella o rostro para entrar."}</p>
      <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
        <button disabled={ocupado} onClick={() => void intentar()} className={`${boton} text-white`} style={{ background: ROJO }}>{ocupado ? "Verificando…" : "Desbloquear"}</button>
        <button disabled={ocupado} onClick={() => void irAClave()} className={`${boton} border border-[#D4D4D8] text-[#18181B]`}>Usar mi contraseña</button>
      </div>
    </div>
  )
}

// ---- Interruptor "Entrar con huella o rostro" (menú) ----
interface InterruptorProps {
  /** Correo de la cuenta; si viene vacío (sesiones anteriores a esta versión) el cuadro lo pide. */
  email: string
  /** Comprueba la contraseña SIN efectos secundarios (no cambia la sesión ni ofrece nada). */
  verificarClave: (email: string, clave: string) => Promise<ResultadoLogin>
  className?: string
}

export function InterruptorBiometria({ email, verificarClave, className = "" }: InterruptorProps) {
  const [disponible, setDisponible] = useState(false)
  const [activa, setActiva] = useState(bioActivaGuardada)
  const [pidiendo, setPidiendo] = useState(false)
  const [correo, setCorreo] = useState(email)
  const [clave, setClave] = useState("")
  const [error, setError] = useState("")
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    void biometriaDisponible().then((d) => setDisponible(d === "si"))
  }, [])
  if (!disponible) return null

  async function confirmar() {
    setOcupado(true)
    setError("")
    const r = await verificarClave(correo.trim(), clave)
    if (r === "rechazada") setError("Esa contraseña no es correcta.")
    else if (r !== "ok") setError("No pudimos verificarla ahora. Revisa tu conexión e intenta de nuevo.")
    else if (await activarBiometria(correo.trim(), clave)) {
      setActiva(true)
      cerrar()
    } else setError("No se pudo activar la huella o el rostro.")
    setOcupado(false)
  }
  function cerrar() {
    setClave("")
    setError("")
    setPidiendo(false)
  }
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={activa}
        onClick={() => (activa ? void desactivarBiometria().then(() => setActiva(false)) : (setCorreo(email), setPidiendo(true)))}
        className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-[#18181B] active:bg-[#F4F4F5] ${className}`}
      >
        <Fingerprint className="size-5" aria-hidden />
        <span className="flex-1 text-left">Entrar con huella o rostro</span>
        <span aria-hidden className={`relative h-6 w-10 rounded-full transition-colors ${activa ? "" : "bg-[#D4D4D8]"}`} style={activa ? { background: ROJO } : undefined}>
          <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${activa ? "left-[1.125rem]" : "left-0.5"}`} />
        </span>
      </button>
      {pidiendo && (
        <Modal etiqueta="Confirma tu contraseña" alCerrar={cerrar}>
          <h2 className="text-lg font-bold">Confirma tu contraseña</h2>
          <p className="mt-1 text-sm text-[#52525B]">Se guardará cifrada en el almacén seguro del celular.</p>
          {!email && (
            <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="Tu correo" aria-label="Correo" className="mt-4 h-12 w-full rounded-xl border border-[#D4D4D8] px-4 text-[15px]" />
          )}
          <input type="password" autoComplete="current-password" autoFocus={!!email} value={clave} onChange={(e) => setClave(e.target.value)} className="mt-4 h-12 w-full rounded-xl border border-[#D4D4D8] px-4 text-[15px]" aria-label="Contraseña" />
          {error && <p role="alert" className="mt-2 text-sm font-medium" style={{ color: ROJO }}>{error}</p>}
          <div className="mt-4 flex gap-2">
            <button disabled={ocupado} onClick={cerrar} className={`${boton} flex-1 border border-[#D4D4D8]`}>Cancelar</button>
            <button disabled={ocupado || !clave || !correo.trim()} onClick={() => void confirmar()} className={`${boton} flex-1 text-white`} style={{ background: ROJO }}>Activar</button>
          </div>
        </Modal>
      )}
    </>
  )
}
