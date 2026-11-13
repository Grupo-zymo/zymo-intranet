import { useEffect, useRef, useState } from "react"
import axios from "axios"
import { App } from "@capacitor/app"
import { api } from "@/lib/api"
import { abrirExterno, esNativo } from "@/lib/entorno"
import {
  compararVersion, leerVersionInstalada, parsearRespuesta,
  type EstadoVersion, type InfoVersionServidor, type VersionInstalada,
} from "@/lib/versionApp"

const MIN_ENTRE_CONSULTAS_MS = 10 * 60_000
const CLAVE_DESCARTADA = "zymo_apk_aviso_descartado"
const FUENTE = '"DM Sans", system-ui, sans-serif'

export function leerVersionDescartada(): number {
  try { return Number(localStorage.getItem(CLAVE_DESCARTADA)) || 0 } catch { return 0 }
}
function guardarDescartada(code: number) {
  try { localStorage.setItem(CLAVE_DESCARTADA, String(code)) } catch { /* sin almacenamiento: se avisa de nuevo */ }
}

/** Texto "Versión 1.1.0 (2)" del APK instalado; null en web. */
export function useVersionInstalada(): VersionInstalada | null {
  const [v, setV] = useState<VersionInstalada | null>(null)
  useEffect(() => {
    if (!esNativo) return
    let vivo = true
    void leerVersionInstalada().then((r) => { if (vivo) setV(r) })
    return () => { vivo = false }
  }, [])
  return v
}

// Cliente propio: sin el interceptor de 401 de `api` (esta consulta nunca debe cerrar sesión) y con tope de 5 s.
const clienteVersion = axios.create({ timeout: 5000 })

/** Montar una sola vez (solo se renderiza algo en el APK). Fail-open: un error de red nunca bloquea. */
export function VersionApp() {
  const [instalada, setInstalada] = useState<VersionInstalada | null>(null)
  const [info, setInfo] = useState<InfoVersionServidor | null>(null)
  const [estado, setEstado] = useState<EstadoVersion>("al-dia")
  const [descartada, setDescartada] = useState(leerVersionDescartada)
  const ultima = useRef(0)
  const enCurso = useRef(false)

  useEffect(() => {
    if (!esNativo) return
    let vivo = true
    const consultar = async (forzar: boolean) => {
      if (enCurso.current || (!forzar && Date.now() - ultima.current < MIN_ENTRE_CONSULTAS_MS)) return
      enCurso.current = true
      try {
        const v = await leerVersionInstalada()
        if (!v) return
        const { data } = await clienteVersion.get("/api/app/version", { baseURL: api.defaults.baseURL, headers: { "Cache-Control": "no-cache" } })
        ultima.current = Date.now()
        const r = parsearRespuesta(data)
        if (!vivo) return
        setInstalada(v)
        setInfo(r)
        setEstado(compararVersion(v.code, r.minVersionCode, r.latestVersionCode))
      } catch {
        /* sin red o servidor caído: no se bloquea */
      } finally {
        enCurso.current = false
      }
    }
    void consultar(true)
    const escucha = App.addListener("appStateChange", (s) => { if (s.isActive) void consultar(false) })
    return () => {
      vivo = false
      void escucha.then((h) => h.remove())
    }
  }, [])

  if (!esNativo || !instalada || !info) return null
  if (estado === "obligatoria") return <Bloqueo instalada={instalada} info={info} />
  if (estado === "sugerida" && descartada < info.latestVersionCode) {
    return (
      <Sugerida
        info={info}
        alCerrar={() => { guardarDescartada(info.latestVersionCode); setDescartada(info.latestVersionCode) }}
      />
    )
  }
  return null
}

function Bloqueo({ instalada, info }: { instalada: VersionInstalada; info: InfoVersionServidor }) {
  const boton = useRef<HTMLButtonElement>(null)
  useEffect(() => { boton.current?.focus() }, [])
  return (
    <div
      data-bloqueo="version"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="va-titulo"
      aria-describedby="va-detalle"
      style={{ fontFamily: FUENTE, zIndex: 2147483000 }}
      className="fixed inset-0 grid place-items-center bg-[#F4F4F5] p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-[#18181B] shadow-lg">
        <h2 id="va-titulo" className="text-xl font-bold">Hay una versión nueva de la app</h2>
        <p id="va-detalle" className="mt-2 text-base text-[#52525B]">
          {info.mensaje || "Para seguir usando la intranet en tu celular necesitas instalar la versión más reciente."}
        </p>
        <p className="mt-3 text-sm text-[#71717A]">
          Tienes la versión {instalada.name} ({instalada.code}). Nueva: {info.latestVersionName || "—"} ({info.latestVersionCode}).
        </p>
        {info.apkUrl ? (
          <button
            ref={boton}
            type="button"
            onClick={() => abrirExterno(info.apkUrl)}
            className="mt-5 min-h-12 w-full rounded-full bg-[#C11A3C] px-5 text-base font-semibold text-white active:opacity-90"
          >
            Descargar actualización
          </button>
        ) : (
          <p ref={(el) => el?.focus()} tabIndex={-1} className="mt-5 rounded-xl bg-[#F4F4F5] p-3 text-base font-medium outline-none">
            Pide el APK actualizado al área de TI.
          </p>
        )}
      </div>
    </div>
  )
}

function Sugerida({ info, alCerrar }: { info: InfoVersionServidor; alCerrar: () => void }) {
  return (
    <div
      role="status"
      style={{ fontFamily: FUENTE, zIndex: 2147482000 }}
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-3 rounded-2xl border border-[#E4E4E7] bg-white p-3 text-[#18181B] shadow-lg"
    >
      <p className="flex-1 text-sm">
        {info.mensaje || `Hay una versión nueva de la app (${info.latestVersionName}).`}
      </p>
      {info.apkUrl && (
        <button type="button" onClick={() => abrirExterno(info.apkUrl)} className="min-h-11 rounded-full bg-[#C11A3C] px-4 text-sm font-semibold text-white">
          Descargar
        </button>
      )}
      <button type="button" onClick={alCerrar} className="min-h-11 rounded-full px-3 text-sm font-medium text-[#52525B]">
        Ahora no
      </button>
    </div>
  )
}
