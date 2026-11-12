// Detalle del caso. En el teléfono es una pantalla completa que se abre encima de la lista; en escritorio (lg+)
// ocupa la columna derecha. Dos pestañas: Conversación (chat + barra de redacción) y Gestión (responsable,
// acciones, clasificación, plazos e historial de asignaciones).

import { CentralApoyoInterno } from "./CentralApoyoInterno"
import { useEffect, useId, useRef, useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowUpCircle, Lock, RefreshCw, SearchX, Send, X } from "lucide-react"
import { useTicketToast } from "@/components/tickets/TicketToast"
import { useCentralAccion, useCentralCaso } from "@/hooks/useCentralTickets"
import {
  AREAS,
  AREA_TEXTO,
  SEVERIDADES,
  SEVERIDAD_TEXTO,
  TIPO_TEXTO,
  destinatarios,
  estaAbierto,
  estadoDeError,
  fechaHora,
  haceCuanto,
  mensajeDeError,
  vencimiento,
} from "@/lib/centralTickets"
import type {
  CentralAccion,
  CentralAsignacion,
  CentralCasoDetalle,
  CentralMensaje,
  CentralNivel,
} from "@/types/centralTickets"
import { DialogoAsignar, DialogoConfirmar } from "./CentralDialogos"
import { Aviso, Avatar, BarraSla, EstadoChip, Responsable, SeveridadChip, SlaResumen, colorSla } from "./partes"

const LIMITE_MENSAJE = 4000

/** Borradores por caso: sobreviven al cambio de móvil a escritorio (que vuelve a montar el detalle). */
const borradores = new Map<string, { texto: string; interno: boolean }>()
const NOTA = "rounded-[1.25rem] rounded-tr-md border border-dashed border-[color:var(--ct-amber)] bg-[rgba(245,158,11,0.1)]"

// ─── Conversación ───────────────────────────────────────────────────────────

function esDelCliente(m: CentralMensaje, caso: CentralCasoDetalle): boolean {
  if (m.origen === "intranet" || m.interno) return false
  return m.rol.toLowerCase().includes("cliente") || m.autor === caso.cliente.nombre
}

function Burbuja({ mensaje, delCliente, nuevo }: { mensaje: CentralMensaje; delCliente: boolean; nuevo: boolean }) {
  if (mensaje.interno) {
    return (
      <li className={`ml-auto w-full max-w-[90%] ${nuevo ? "ct-burbuja-nueva" : ""}`}>
        <div className={`${NOTA} px-4 py-3`}>
          <p className="m-0 mb-1 flex items-center gap-1.5 text-xs font-bold text-[color:var(--ct-amber)]">
            <Lock className="size-3" aria-hidden />
            Nota interna · solo equipo
          </p>
          <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed [overflow-wrap:anywhere]">{mensaje.texto}</p>
        </div>
        <p className="ct-faint m-0 mt-1 text-right text-[11px]">
          {mensaje.autor} · <time className="whitespace-nowrap" dateTime={mensaje.creadoEn}>{fechaHora(mensaje.creadoEn)}</time>
        </p>
      </li>
    )
  }
  return (
    <li className={`flex max-w-[90%] gap-2 ${delCliente ? "" : "ml-auto flex-row-reverse"} ${nuevo ? "ct-burbuja-nueva" : ""}`}>
      <Avatar nombre={mensaje.autor} className="mt-0.5" />
      <div className="min-w-0">
        <div
          className={`px-4 py-3 ${
            delCliente
              ? "rounded-[1.25rem] rounded-tl-md border bg-white"
              : "rounded-[1.25rem] rounded-tr-md bg-[var(--ct-red-soft)]"
          }`}
        >
          <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed [overflow-wrap:anywhere]">{mensaje.texto}</p>
        </div>
        <p className={`ct-faint m-0 mt-1 text-[11px] ${delCliente ? "" : "text-right"}`}>
          {delCliente ? `${mensaje.autor} · Cliente` : `${mensaje.autor} · ${mensaje.origen === "intranet" ? "Intranet" : "App"}`}
          {" · "}
          <time className="whitespace-nowrap" dateTime={mensaje.creadoEn}>{fechaHora(mensaje.creadoEn)}</time>
        </p>
      </div>
    </li>
  )
}

function Conversacion({
  caso,
  enviando,
  ahora,
}: {
  caso: CentralCasoDetalle
  enviando: { texto: string; interno: boolean } | null
  ahora: number
}) {
  const caja = useRef<HTMLDivElement>(null)
  // Los que ya estaban al abrir no se animan; los que llegan después, sí.
  const [vistos] = useState(() => new Set(caso.mensajes.map((m) => String(m.id))))
  const cantidad = caso.mensajes.length
  const abierto = estaAbierto(caso.estado)

  useEffect(() => {
    caja.current?.scrollTo({ top: caja.current.scrollHeight })
  }, [cantidad, enviando])

  return (
    <div ref={caja} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" role="log" aria-label="Conversación del caso" aria-live="polite">
      <div className="ct-card flex items-center justify-between gap-4 p-4">
        <Responsable asignado={caso.asignado} asumidoPor={caso.asumidoPor} compacto />
        <div className="w-[42%] max-w-[190px] flex-none">
          <SlaResumen sla={caso.sla} abierto={abierto} ahora={ahora} />
        </div>
      </div>

      <div className="ct-card mt-3 p-4">
        <p className="ct-faint m-0 text-xs font-semibold">
          Lo que radicó {caso.cliente.nombre} · {fechaHora(caso.creadoEn)}
        </p>
        <p className="m-0 mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed [overflow-wrap:anywhere]">{caso.descripcion}</p>
      </div>

      {cantidad === 0 && !enviando ? (
        <p className="ct-muted m-0 px-2 py-8 text-center text-sm">
          Todavía nadie le ha respondido al cliente. La primera respuesta detiene el plazo de respuesta inicial.
        </p>
      ) : (
        <ol className="m-0 mt-4 flex list-none flex-col gap-4 p-0">
          {caso.mensajes.map((m) => (
            <Burbuja key={m.id} mensaje={m} delCliente={esDelCliente(m, caso)} nuevo={!vistos.has(String(m.id))} />
          ))}
          {enviando && (
            <li className="ct-burbuja-nueva ml-auto max-w-[90%] opacity-70" aria-label="Enviando mensaje">
              <div className={`px-4 py-3 ${enviando.interno ? NOTA : "rounded-[1.25rem] rounded-tr-md bg-[var(--ct-red-soft)]"}`}>
                <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed [overflow-wrap:anywhere]">{enviando.texto}</p>
              </div>
              <p className="ct-faint ct-latido m-0 mt-1 text-right text-[11px]">Enviando…</p>
            </li>
          )}
        </ol>
      )}
    </div>
  )
}

/** Barra de redacción fija abajo: texto en pastilla, interruptor de nota interna y botón de enviar. */
function Redactor({
  radicado,
  cerrado,
  enviando,
  onEnviar,
}: {
  radicado: string
  cerrado: boolean
  enviando: boolean
  onEnviar: (texto: string, interno: boolean, alTerminar: () => void) => void
}) {
  const [interno, setInterno] = useState(() => borradores.get(radicado)?.interno ?? false)
  const [texto, setTexto] = useState(() => borradores.get(radicado)?.texto ?? "")
  useEffect(() => {
    if (texto) borradores.set(radicado, { texto, interno })
    else borradores.delete(radicado)
  }, [radicado, texto, interno])
  const caja = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const limpio = texto.trim()
  const puede = !cerrado && !enviando && limpio.length > 0 && texto.length <= LIMITE_MENSAJE

  // La caja crece con lo escrito (hasta ~5 líneas).
  useEffect(() => {
    const el = caja.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
    el.style.overflowY = el.scrollHeight > 132 ? "auto" : "hidden"
  }, [texto])

  function enviar() {
    if (puede) onEnviar(limpio, interno, () => setTexto(""))
  }

  if (cerrado) {
    return (
      <p className="ct-muted m-0 flex-none border-t bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm">
        El caso está cerrado: ya no recibe respuestas ni notas.
      </p>
    )
  }

  return (
    <form
      className="flex-none border-t bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        enviar()
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={interno}
          onClick={() => setInterno((v) => !v)}
          className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors duration-150 lg:min-h-[36px] ${
            interno
              ? "border-dashed border-[color:var(--ct-amber)] bg-[rgba(245,158,11,0.14)] text-[color:var(--ct-amber)]"
              : "border-[color:var(--ct-line-strong)] text-[color:var(--ct-muted)]"
          }`}
        >
          <Lock className="size-3.5" aria-hidden />
          Nota interna
        </button>
        <span className="ct-faint text-[11px]">
          {texto.length > LIMITE_MENSAJE - 400 ? (
            <span className="ct-mono" style={{ color: texto.length > LIMITE_MENSAJE - 200 ? "var(--ct-amber)" : undefined }}>
              {texto.length}/{LIMITE_MENSAJE}
            </span>
          ) : (
            <span className="max-lg:hidden">Ctrl + Enter para enviar</span>
          )}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <label htmlFor={id} className="sr-only">{interno ? "Nota interna" : "Respuesta al cliente"}</label>
        <textarea
          ref={caja}
          id={id}
          name="mensaje"
          rows={1}
          value={texto}
          maxLength={LIMITE_MENSAJE}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              enviar()
            }
          }}
          placeholder={interno ? "Solo la ve el equipo…" : "Escribe tu respuesta al cliente…"}
          className={`ct-input !rounded-[1.4rem] ${interno ? "!border-dashed !border-[color:var(--ct-amber)]" : ""}`}
          style={{ maxHeight: 132 }}
        />
        <button
          type="submit"
          className="ct-btn ct-btn-primary ct-btn-redondo !min-h-[44px] !w-11"
          disabled={!puede}
          aria-label={enviando ? "Enviando…" : interno ? "Guardar nota interna" : "Enviar respuesta"}
        >
          <Send className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  )
}

// ─── Gestión ────────────────────────────────────────────────────────────────

function Tarjeta({ titulo, id, children }: { titulo: string; id: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="ct-card p-5">
      <h3 id={id} className="m-0 text-[15px] font-bold">{titulo}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function FilaPlazo({ titulo, vence, cumplidoEn, ahora, activo }: { titulo: string; vence: string | null; cumplidoEn?: string | null; ahora: number; activo: boolean }) {
  const pasado = !!vence && Date.parse(vence) < ahora
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="ct-muted text-sm">{titulo}</dt>
      <dd className="m-0 text-right">
        {cumplidoEn ? (
          <span className="text-[13px] font-medium text-[color:var(--ct-green)]">Cumplido · {fechaHora(cumplidoEn)}</span>
        ) : (
          <>
            <span className="block text-[13px] font-medium" style={{ color: activo && pasado ? "var(--ct-red)" : undefined }}>
              {activo ? vencimiento(vence, ahora) : fechaHora(vence)}
            </span>
            {activo && vence && <span className="ct-faint block text-[11px]">{fechaHora(vence)}</span>}
          </>
        )}
      </dd>
    </div>
  )
}

function Plazos({ caso, ahora }: { caso: CentralCasoDetalle; ahora: number }) {
  const abierto = estaAbierto(caso.estado)
  const { sla } = caso
  const color = colorSla(sla, abierto)
  return (
    <Tarjeta titulo="Plazos" id="ct-plazos">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold" style={{ color }}>
          {abierto && sla.vencido ? "Vencido · " : ""}<span className="ct-mono">{Math.round(sla.consumido)}%</span> consumido
        </span>
      </div>
      <BarraSla pct={sla.consumido} color={color} className="mt-2" />
      <dl className="m-0 mt-2 divide-y divide-[color:var(--ct-line)]">
        <FilaPlazo titulo="Acuse de recibo" vence={sla.acuseVence} ahora={ahora} activo={abierto && !caso.primeraRespuestaEn} />
        <FilaPlazo titulo="Primera respuesta" vence={sla.respuestaInicialVence} cumplidoEn={caso.primeraRespuestaEn} ahora={ahora} activo={abierto} />
        <FilaPlazo titulo="Respuesta de fondo" vence={sla.respuestaFondoVence} cumplidoEn={caso.resueltoEn} ahora={ahora} activo={abierto} />
      </dl>
      {sla.escalamiento && (
        <div role="note" className="mt-3 flex gap-2.5 rounded-2xl bg-[var(--ct-red-soft)] p-3.5 text-sm">
          <ArrowUpCircle className="mt-0.5 size-4 flex-none text-[color:var(--ct-red)]" aria-hidden />
          <p className="m-0 min-w-0 leading-snug [overflow-wrap:anywhere]">
            <strong className="font-bold">Escalar:</strong> {sla.escalamiento.motivo}
            {destinatarios(sla.escalamiento.destinatarios) && (
              <span className="ct-muted block text-xs">Se avisó a {destinatarios(sla.escalamiento.destinatarios)}</span>
            )}
          </p>
        </div>
      )}
    </Tarjeta>
  )
}

const VERBO: Record<CentralAsignacion["tipo"], string> = {
  asumido: "asumió el caso",
  asignado: "lo asignó a",
  reasignado: "lo reasignó a",
  liberado: "liberó el caso",
}

function Historial({ asignaciones }: { asignaciones: CentralAsignacion[] }) {
  return (
    <Tarjeta titulo="Historial de asignaciones" id="ct-historial">
      {asignaciones.length === 0 ? (
        <p className="ct-muted m-0 text-sm">Nadie ha tomado este caso todavía.</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {asignaciones.map((a, i) => (
            <li key={a.id} className="relative pb-4 pl-6 last:pb-0">
              {i < asignaciones.length - 1 && <span className="absolute bottom-0 left-[4.5px] top-3 w-px bg-[var(--ct-line-strong)]" aria-hidden />}
              <span
                className="absolute left-0 top-[5px] size-2.5 rounded-full"
                style={{ background: a.tipo === "liberado" ? "var(--ct-gray)" : i === 0 ? "var(--ct-red)" : "var(--ct-line-strong)" }}
                aria-hidden
              />
              <p className="m-0 text-sm leading-snug [overflow-wrap:anywhere]">
                <strong className="font-bold">{a.porNombre ?? a.porEmail ?? "Alguien"}</strong> {VERBO[a.tipo]}
                {(a.tipo === "asignado" || a.tipo === "reasignado") && <strong className="font-bold"> {a.aNombre ?? a.aEmail ?? "otra persona"}</strong>}
                {a.tipo === "reasignado" && a.deNombre && <span className="ct-muted"> (antes: {a.deNombre})</span>}
                {a.tipo === "liberado" && a.deNombre && <span className="ct-muted"> (lo tenía {a.deNombre})</span>}
              </p>
              {a.nota && <p className="ct-muted m-0 mt-1 text-[13px] italic leading-snug [overflow-wrap:anywhere]">“{a.nota}”</p>}
              <p className="ct-faint m-0 mt-0.5 text-[11px]"><time dateTime={a.creadoEn}>{fechaHora(a.creadoEn)}</time></p>
            </li>
          ))}
        </ol>
      )}
    </Tarjeta>
  )
}

type Dialogo = "asignar" | "liberar" | "cerrar" | null

const BOTON_GRANDE = "ct-btn !min-h-[48px] w-full"

function Gestion({
  caso,
  nivel,
  miCorreo,
  ahora,
  ocupado,
  onAccion,
  onDialogo,
}: {
  caso: CentralCasoDetalle
  nivel: CentralNivel
  miCorreo: string
  ahora: number
  ocupado: boolean
  onAccion: (accion: CentralAccion, exito: string) => void
  onDialogo: (d: Dialogo) => void
}) {
  const radicado = String(caso.radicado)
  const director = nivel === "director"
  const cerrado = caso.estado === "cerrado"
  const responsable = caso.asignado ?? caso.asumidoPor
  const esMio = responsable?.email.toLowerCase() === miCorreo
  const idSev = useId()
  const idArea = useId()

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <Tarjeta titulo="Responsable" id="ct-responsable">
        <div className="flex items-center justify-between gap-3">
          <Responsable asignado={caso.asignado} asumidoPor={caso.asumidoPor} />
          {responsable && <span className="ct-faint flex-none text-xs">desde {haceCuanto(responsable.desde, ahora).replace("hace ", "")}</span>}
        </div>
        {director && !cerrado && (
          <div className="mt-4 flex flex-col gap-2">
            {!esMio && (
              <button
                type="button"
                className={`${BOTON_GRANDE} ${responsable ? "" : "ct-btn-primary"}`}
                disabled={ocupado}
                onClick={() => onAccion({ tipo: "asumir", radicado }, "Asumiste el caso")}
              >
                Asumir caso
              </button>
            )}
            <button type="button" className={BOTON_GRANDE} disabled={ocupado} onClick={() => onDialogo("asignar")}>
              {caso.asignado ? "Reasignar…" : "Asignar a un líder…"}
            </button>
            {responsable && (
              <button type="button" className={`${BOTON_GRANDE} ct-btn-ghost ct-btn-danger`} disabled={ocupado} onClick={() => onDialogo("liberar")}>
                Liberar caso
              </button>
            )}
          </div>
        )}
      </Tarjeta>

      {!cerrado && (
        <Tarjeta titulo="Avance" id="ct-avance">
          <div className="flex flex-col gap-2">
            {caso.estado === "recibido" && (
              <button type="button" className={BOTON_GRANDE} disabled={ocupado} onClick={() => onAccion({ tipo: "actualizar", radicado, cambios: { estado: "en_analisis" } }, "Caso en análisis")}>
                Marcar en análisis
              </button>
            )}
            {estaAbierto(caso.estado) && (
              <button type="button" className={BOTON_GRANDE} disabled={ocupado} onClick={() => onAccion({ tipo: "actualizar", radicado, cambios: { estado: "resuelto" } }, "Caso marcado como resuelto")}>
                Marcar resuelto
              </button>
            )}
            {caso.estado === "resuelto" && (
              <button type="button" className={BOTON_GRANDE} disabled={ocupado} onClick={() => onAccion({ tipo: "actualizar", radicado, cambios: { estado: "en_analisis" } }, "El caso volvió a análisis")}>
                Volver a análisis
              </button>
            )}
            {director && caso.estado === "resuelto" && (
              <button type="button" className={`${BOTON_GRANDE} ct-btn-primary`} disabled={ocupado} onClick={() => onDialogo("cerrar")}>
                Cerrar caso…
              </button>
            )}
          </div>
          {caso.estado === "resuelto" && !director && (
            <p className="ct-muted m-0 mt-2 text-[13px]">La dirección de la central revisa y cierra el caso.</p>
          )}
        </Tarjeta>
      )}

      {director && !cerrado && (
        <Tarjeta titulo="Clasificación" id="ct-clasificacion">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <div>
              <label htmlFor={idSev} className="ct-label">Severidad</label>
              <select
                id={idSev}
                className="ct-input"
                value={caso.severidad}
                disabled={ocupado}
                onChange={(e) => {
                  const severidad = e.target.value as CentralCasoDetalle["severidad"]
                  onAccion({ tipo: "actualizar", radicado, cambios: { severidad } }, `Severidad: ${SEVERIDAD_TEXTO[severidad].toLowerCase()}`)
                }}
              >
                {SEVERIDADES.map((s) => <option key={s} value={s}>{SEVERIDAD_TEXTO[s]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={idArea} className="ct-label">Área</label>
              <select
                id={idArea}
                className="ct-input"
                value={caso.area}
                disabled={ocupado}
                onChange={(e) => {
                  const area = e.target.value as CentralCasoDetalle["area"]
                  onAccion({ tipo: "actualizar", radicado, cambios: { area } }, `Área: ${AREA_TEXTO[area].toLowerCase()}`)
                }}
              >
                {AREAS.map((a) => <option key={a} value={a}>{AREA_TEXTO[a]}</option>)}
              </select>
            </div>
          </div>
        </Tarjeta>
      )}

      <CentralApoyoInterno caso={caso} />
      <Plazos caso={caso} ahora={ahora} />
      <Historial asignaciones={caso.asignaciones} />
    </div>
  )
}

// ─── Pantalla ───────────────────────────────────────────────────────────────

function Cargando() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-5" aria-busy="true" aria-label="Cargando el caso">
      <div className="ct-skeleton h-16 w-full !rounded-3xl" />
      <div className="ct-skeleton h-24 w-full !rounded-3xl" />
      <div className="ct-skeleton h-14 w-2/3 !rounded-3xl" />
      <div className="ct-skeleton ml-auto h-14 w-2/3 !rounded-3xl" />
    </div>
  )
}

/** Sin caso elegido (solo escritorio): invita a abrir uno. */
export function CentralDetalleVacio() {
  return (
    <div className="ct-card hidden h-full flex-col items-center justify-center px-8 text-center lg:flex">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-[var(--ct-red-soft)] text-[color:var(--ct-red)]">
        <Send className="size-5" aria-hidden />
      </div>
      <p className="m-0 text-base font-bold">Elige una conversación</p>
      <p className="ct-muted m-0 mt-1 max-w-xs text-sm">Aquí verás el chat con el cliente y la gestión del caso.</p>
    </div>
  )
}

export function CentralDetalle({
  radicado,
  nivel,
  miCorreo,
  ahora,
  onCerrar,
  sinMarco = false,
}: {
  radicado: string
  nivel: CentralNivel
  miCorreo: string
  ahora: number
  onCerrar: () => void
  sinMarco?: boolean
}) {
  const { data: caso, isLoading, error, refetch } = useCentralCaso(radicado)
  const accion = useCentralAccion()
  const { showToast } = useTicketToast()
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [pestana, setPestana] = useState<"chat" | "gestion">("chat")

  // En el teléfono el detalle tapa la lista: que esta no se desplace por debajo.
  useEffect(() => {
    if (!window.matchMedia("(max-width: 1023px)").matches) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = anterior
    }
  }, [])

  // Esc cierra el detalle (si no hay un diálogo encima).
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape" && dialogo === null && !document.querySelector("[role='dialog']")) onCerrar()
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [dialogo, onCerrar])

  // Una sola acción a la vez: el estado de la mutación llega un instante tarde, así que un doble clic
  // o un doble Enter se frenan con este cerrojo síncrono.
  const enCurso = useRef(false)
  // Quien abrió un diálogo recupera el foco al cerrarlo.
  const disparador = useRef<HTMLElement | null>(null)
  function abrirDialogo(d: Dialogo) {
    if (d) disparador.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDialogo(d)
  }
  useEffect(() => {
    if (dialogo !== null) return
    const t = setTimeout(() => {
      if (disparador.current?.isConnected) disparador.current.focus()
      disparador.current = null
    }, 60)
    return () => clearTimeout(t)
  }, [dialogo])

  function ejecutar(a: CentralAccion, exito: string, alTerminar?: () => void) {
    if (enCurso.current) return
    enCurso.current = true
    accion.mutate(a, {
      onSettled: () => {
        enCurso.current = false
      },
      onSuccess: () => {
        showToast(exito)
        setDialogo(null)
        alTerminar?.()
      },
      onError: (err) => showToast(mensajeDeError(err), "error"),
    })
  }

  const enviando =
    accion.isPending && accion.variables?.tipo === "mensaje"
      ? { texto: accion.variables.texto, interno: accion.variables.interno }
      : null
  const ocupado = accion.isPending
  const r = radicado
  const noExiste = estadoDeError(error) === 404

  return (
    <section
      aria-label={`Caso ${r}`}
      data-pestana={pestana}
      className={`ct-d ct-detalle fixed inset-0 z-40 flex flex-col overflow-hidden bg-[var(--ct-bg)] lg:static lg:z-auto lg:h-full lg:bg-[var(--ct-bg)] ${sinMarco ? "" : "lg:rounded-[1.5rem] lg:border"}`}
    >
      {/* Encabezado */}
      <header className="flex-none border-b bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onCerrar} className="ct-btn ct-btn-redondo -ml-1 mt-0.5" aria-label="Volver a la lista de casos">
            <ArrowLeft className="size-4 lg:hidden" aria-hidden />
            <X className="hidden size-4 lg:block" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="ct-mono text-base font-medium" translate="no">#{r}</span>
              {caso && (
                <>
                  <SeveridadChip severidad={caso.severidad} />
                  <EstadoChip estado={caso.estado} />
                </>
              )}
            </div>
            <h2 className="m-0 mt-1.5 line-clamp-3 text-lg font-bold leading-snug text-balance [overflow-wrap:anywhere]">
              {caso?.asunto ?? (noExiste ? "Caso no disponible" : "Cargando caso…")}
            </h2>
            <p className="ct-muted m-0 mt-0.5 text-[13px]">
              {caso ? (
                <>
                  {caso.cliente.nombre}
                  {caso.cliente.empresa ? ` · ${caso.cliente.empresa}` : ""} · {TIPO_TEXTO[caso.tipo]} · {AREA_TEXTO[caso.area]} · radicado {haceCuanto(caso.creadoEn, ahora)}
                </>
              ) : (
                "Caso de servicio al cliente"
              )}
            </p>
          </div>
        </div>
        {caso && (
          <div role="tablist" aria-label="Secciones del caso" className="ct-segmento ct-d-tabs mt-3">
            {(
              [
                ["chat", `Conversación (${caso.mensajes.length})`],
                ["gestion", "Gestión"],
              ] as const
            ).map(([clave, texto]) => (
              <button key={clave} type="button" role="tab" aria-selected={pestana === clave} onClick={() => setPestana(clave)}>
                {texto}
              </button>
            ))}
          </div>
        )}
      </header>

      {isLoading ? (
        <Cargando />
      ) : error || !caso ? (
        <div className="flex-1 overflow-y-auto">
          <Aviso
            icono={noExiste ? <SearchX className="size-6" aria-hidden /> : <AlertTriangle className="size-6" aria-hidden />}
            titulo={noExiste ? "No encontramos ese caso" : "No pudimos abrir el caso"}
            accion={
              noExiste ? (
                <button type="button" className="ct-btn" onClick={onCerrar}>Volver a la lista</button>
              ) : (
                <button type="button" className="ct-btn" onClick={() => refetch()}>
                  <RefreshCw className="size-3.5" aria-hidden />
                  Reintentar
                </button>
              )
            }
          >
            {noExiste
              ? nivel === "lider"
                ? "Puede que ya no esté asignado a ti. Revisa tu lista de casos."
                : "Puede que el radicado no exista. Revisa el número e intenta de nuevo."
              : mensajeDeError(error, "Intenta de nuevo en un momento.")}
          </Aviso>
        </div>
      ) : (
        <>
          <div className="ct-d-cuerpo">
            <div className="ct-d-chat">
              <Conversacion key={r} caso={caso} enviando={enviando} ahora={ahora} />
              <Redactor
                key={`redactor-${r}`}
                radicado={r}
                cerrado={caso.estado === "cerrado"}
                enviando={enviando !== null}
                onEnviar={(texto, interno, limpiar) =>
                  ejecutar({ tipo: "mensaje", radicado: r, texto, interno }, interno ? "Nota interna guardada" : "Respuesta enviada al cliente", limpiar)
                }
              />
            </div>
            <div className="ct-d-gestion pb-[env(safe-area-inset-bottom)]">
              <Gestion caso={caso} nivel={nivel} miCorreo={miCorreo} ahora={ahora} ocupado={ocupado} onAccion={ejecutar} onDialogo={abrirDialogo} />
            </div>
          </div>

          <DialogoAsignar
            abierto={dialogo === "asignar"}
            radicado={r}
            responsableEmail={caso.asignado?.email ?? null}
            enviando={ocupado}
            onCerrar={() => setDialogo(null)}
            onAsignar={(lider, nota) =>
              ejecutar({ tipo: "asignar", radicado: r, asignadoId: lider.id, nota: nota || undefined }, `Caso asignado a ${lider.nombre}`)
            }
          />
          <DialogoConfirmar
            abierto={dialogo === "liberar"}
            titulo={`¿Liberar el caso #${r}?`}
            descripcion="El caso queda sin responsable y vuelve a la bandeja «Sin asignar» hasta que alguien lo asuma o se asigne de nuevo."
            accion="Liberar caso"
            conNota
            enviando={ocupado}
            onCerrar={() => setDialogo(null)}
            onConfirmar={(nota) => ejecutar({ tipo: "liberar", radicado: r, nota: nota || undefined }, "Caso liberado")}
          />
          <DialogoConfirmar
            abierto={dialogo === "cerrar"}
            titulo={`¿Cerrar el caso #${r}?`}
            descripcion="Un caso cerrado ya no recibe respuestas ni cambios. El cliente lo verá como cerrado en su app."
            accion="Cerrar caso"
            enviando={ocupado}
            onCerrar={() => setDialogo(null)}
            onConfirmar={() => ejecutar({ tipo: "actualizar", radicado: r, cambios: { estado: "cerrado" } }, "Caso cerrado")}
          />
        </>
      )}
    </section>
  )
}
