// Detalle del caso en un panel lateral: conversación con el cliente a la
// izquierda, gestión (plazos, acciones, historial) a la derecha. En el
// teléfono ocupa toda la pantalla y las dos partes van en pestañas.

import { useEffect, useId, useRef, useState } from "react"
import { AlertTriangle, ArrowUpCircle, Flame, Lock, RefreshCw, SearchX, Send } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
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
import { Aviso, Avatar, EstadoChip, Responsable, SeveridadChip } from "./partes"

const LIMITE_MENSAJE = 4000

// ─── Conversación ───────────────────────────────────────────────────────────

function esDelCliente(m: CentralMensaje, caso: CentralCasoDetalle): boolean {
  if (m.origen === "intranet" || m.interno) return false
  return m.rol.toLowerCase().includes("cliente") || m.autor === caso.cliente.nombre
}

function Burbuja({ mensaje, delCliente, nuevo }: { mensaje: CentralMensaje; delCliente: boolean; nuevo: boolean }) {
  if (mensaje.interno) {
    return (
      <li className={`ml-auto w-full max-w-[88%] ${nuevo ? "ct-burbuja-nueva" : ""}`}>
        <div className="rounded-xl border border-dashed border-[color:var(--ct-amber)] bg-[rgba(245,158,11,0.1)] px-3.5 py-2.5">
          <p className="m-0 mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--ct-amber)]">
            <Lock className="size-3" aria-hidden />
            Nota interna · solo equipo
          </p>
          <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{mensaje.texto}</p>
        </div>
        <p className="ct-faint m-0 mt-1 text-right text-[11px]">
          {mensaje.autor} · <time className="whitespace-nowrap" dateTime={mensaje.creadoEn}>{fechaHora(mensaje.creadoEn)}</time>
        </p>
      </li>
    )
  }
  return (
    <li className={`flex max-w-[88%] gap-2 ${delCliente ? "" : "ml-auto flex-row-reverse"} ${nuevo ? "ct-burbuja-nueva" : ""}`}>
      <Avatar nombre={mensaje.autor} className="mt-0.5" />
      <div className="min-w-0">
        <div
          className={`rounded-2xl px-3.5 py-2.5 ${
            delCliente ? "rounded-tl-md border bg-[var(--ct-surface)]" : "rounded-tr-md bg-[hsl(348_76%_95%)]"
          }`}
        >
          <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{mensaje.texto}</p>
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

function Conversacion({ caso, enviando }: { caso: CentralCasoDetalle; enviando: { texto: string; interno: boolean } | null }) {
  const fin = useRef<HTMLDivElement>(null)
  // Los que ya estaban al abrir no se animan; los que llegan después, sí.
  const [vistos] = useState(() => new Set(caso.mensajes.map((m) => String(m.id))))
  const cantidad = caso.mensajes.length

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" })
  }, [cantidad, enviando])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" role="log" aria-label="Conversación del caso" aria-live="polite">
      <div className="ct-surface rounded-xl border p-3.5">
        <p className="ct-faint m-0 text-[11px] font-semibold">
          Lo que radicó {caso.cliente.nombre} · {fechaHora(caso.creadoEn)}
        </p>
        <p className="m-0 mt-1.5 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{caso.descripcion}</p>
      </div>

      {cantidad === 0 && !enviando ? (
        <p className="ct-muted m-0 px-2 py-8 text-center text-[13px]">
          Todavía nadie le ha respondido al cliente. La primera respuesta detiene el plazo de respuesta inicial.
        </p>
      ) : (
        <ol className="m-0 mt-4 flex list-none flex-col gap-3.5 p-0">
          {caso.mensajes.map((m) => (
            <Burbuja key={m.id} mensaje={m} delCliente={esDelCliente(m, caso)} nuevo={!vistos.has(String(m.id))} />
          ))}
          {enviando && (
            <li className="ct-burbuja-nueva ml-auto max-w-[88%] opacity-70" aria-label="Enviando mensaje">
              <div className={`rounded-2xl rounded-tr-md px-3.5 py-2.5 ${enviando.interno ? "border border-dashed border-[color:var(--ct-amber)] bg-[rgba(245,158,11,0.1)]" : "bg-[hsl(348_76%_95%)]"}`}>
                <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{enviando.texto}</p>
              </div>
              <p className="ct-faint ct-latido m-0 mt-1 text-right text-[11px]">Enviando…</p>
            </li>
          )}
        </ol>
      )}
      <div ref={fin} />
    </div>
  )
}

function Redactor({
  cerrado,
  enviando,
  onEnviar,
}: {
  cerrado: boolean
  enviando: boolean
  onEnviar: (texto: string, interno: boolean, alTerminar: () => void) => void
}) {
  const [interno, setInterno] = useState(false)
  const [texto, setTexto] = useState("")
  const id = useId()
  const limpio = texto.trim()
  const puede = !cerrado && !enviando && limpio.length > 0 && texto.length <= LIMITE_MENSAJE

  function enviar() {
    if (puede) onEnviar(limpio, interno, () => setTexto(""))
  }

  if (cerrado) {
    return (
      <p className="ct-muted m-0 border-t px-5 py-4 text-center text-[13px]">
        El caso está cerrado: ya no recibe respuestas ni notas.
      </p>
    )
  }

  return (
    <form
      className="border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5"
      onSubmit={(e) => {
        e.preventDefault()
        enviar()
      }}
    >
      <div role="radiogroup" aria-label="Tipo de mensaje" className="mb-2 inline-flex rounded-lg border border-[color:var(--ct-line-strong)] p-0.5">
        {[
          { valor: false, texto: "Responder al cliente" },
          { valor: true, texto: "Nota interna" },
        ].map((o) => (
          <button
            key={o.texto}
            type="button"
            role="radio"
            aria-checked={interno === o.valor}
            onClick={() => setInterno(o.valor)}
            className={`flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors duration-150 ${
              interno === o.valor
                ? o.valor
                  ? "bg-[rgba(245,158,11,0.18)] text-[color:var(--ct-amber)]"
                  : "bg-[var(--ct-hover)] text-[color:var(--ct-text)]"
                : "ct-muted hover:text-[color:var(--ct-text)]"
            }`}
          >
            {o.valor && <Lock className="size-3" aria-hidden />}
            {o.texto}
          </button>
        ))}
      </div>
      <label htmlFor={id} className="sr-only">{interno ? "Nota interna" : "Respuesta al cliente"}</label>
      <textarea
        id={id}
        name="mensaje"
        rows={3}
        value={texto}
        maxLength={LIMITE_MENSAJE}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            enviar()
          }
        }}
        placeholder={interno ? "Solo la ve el equipo. El cliente no recibe esta nota…" : "Escribe la respuesta que verá el cliente en su app…"}
        className={`ct-input ${interno ? "!border-dashed !border-[color:var(--ct-amber)]" : ""}`}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="ct-faint m-0 text-[11px]">
          <span className="ct-mono" style={{ color: texto.length > LIMITE_MENSAJE - 200 ? "var(--ct-amber)" : undefined }}>
            {texto.length}/{LIMITE_MENSAJE}
          </span>
          <span className="max-sm:hidden"> · Ctrl + Enter para enviar</span>
        </p>
        <button type="submit" className="ct-btn ct-btn-primary" disabled={!puede}>
          <Send className="size-3.5" aria-hidden />
          {enviando ? "Enviando…" : interno ? "Guardar nota" : "Enviar respuesta"}
        </button>
      </div>
    </form>
  )
}

// ─── Gestión ────────────────────────────────────────────────────────────────

function FilaPlazo({ titulo, vence, cumplidoEn, ahora, activo }: { titulo: string; vence: string | null; cumplidoEn?: string | null; ahora: number; activo: boolean }) {
  const pasado = !!vence && Date.parse(vence) < ahora
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="ct-muted text-[13px]">{titulo}</dt>
      <dd className="m-0 text-right">
        {cumplidoEn ? (
          <span className="text-xs text-[color:var(--ct-green)]">Cumplido · {fechaHora(cumplidoEn)}</span>
        ) : (
          <>
            <span className="block text-xs" style={{ color: activo && pasado ? "var(--ct-red)" : undefined }}>
              {activo ? vencimiento(vence, ahora) : fechaHora(vence)}
            </span>
            {activo && vence && <span className="ct-faint block text-[11px]">{fechaHora(vence)}</span>}
          </>
        )}
      </dd>
    </div>
  )
}

function TarjetaSla({ caso, ahora }: { caso: CentralCasoDetalle; ahora: number }) {
  const abierto = estaAbierto(caso.estado)
  const { sla } = caso
  const pct = Math.max(0, Math.min(100, Math.round(sla.consumido)))
  const color = !abierto ? "var(--ct-gray)" : sla.vencido || sla.consumido >= 100 ? "var(--ct-red)" : sla.consumido >= 75 ? "var(--ct-orange)" : "var(--ct-green)"
  return (
    <section aria-labelledby="ct-plazos">
      <div className="flex items-baseline justify-between">
        <h3 id="ct-plazos" className="m-0 text-[13px] font-semibold">Plazos</h3>
        <span className="text-xs" style={{ color }}>
          {abierto && sla.vencido ? "Vencido · " : ""}{Math.round(sla.consumido)}% consumido
        </span>
      </div>
      <div
        className="ct-sla-barra mt-2"
        role="progressbar"
        aria-label="Plazo consumido"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        style={{ "--tono": color } as React.CSSProperties}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <dl className="m-0 mt-2 divide-y divide-[color:var(--ct-line)]">
        <FilaPlazo titulo="Acuse de recibo" vence={sla.acuseVence} ahora={ahora} activo={abierto && !caso.primeraRespuestaEn} />
        <FilaPlazo titulo="Primera respuesta" vence={sla.respuestaInicialVence} cumplidoEn={caso.primeraRespuestaEn} ahora={ahora} activo={abierto} />
        <FilaPlazo titulo="Respuesta de fondo" vence={sla.respuestaFondoVence} cumplidoEn={caso.resueltoEn} ahora={ahora} activo={abierto} />
      </dl>
      {sla.escalamiento && (
        <div role="note" className="mt-3 flex gap-2.5 rounded-lg bg-[rgba(193,26,60,0.08)] p-3 text-[13px]">
          <ArrowUpCircle className="mt-0.5 size-4 flex-none text-[color:var(--ct-red)]" aria-hidden />
          <p className="m-0 min-w-0 leading-snug [overflow-wrap:anywhere]">
            <strong className="font-semibold">Escalado.</strong> {sla.escalamiento.motivo}
            {destinatarios(sla.escalamiento.destinatarios) && (
              <span className="ct-muted block text-xs">Se avisó a {destinatarios(sla.escalamiento.destinatarios)}</span>
            )}
          </p>
        </div>
      )}
      {caso.urgenteSolicitado && (
        <div role="note" className="mt-2 flex gap-2.5 rounded-lg bg-[rgba(194,87,12,0.1)] p-3 text-[13px]">
          <Flame className="mt-0.5 size-4 flex-none text-[color:var(--ct-orange)]" aria-hidden />
          <p className="m-0 leading-snug"><strong className="font-semibold">El cliente pidió subir de nivel.</strong> Considéralo al priorizar.</p>
        </div>
      )}
    </section>
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
    <section aria-labelledby="ct-historial">
      <h3 id="ct-historial" className="m-0 text-[13px] font-semibold">Historial de asignaciones</h3>
      {asignaciones.length === 0 ? (
        <p className="ct-muted m-0 mt-2 text-[13px]">Nadie ha tomado este caso todavía.</p>
      ) : (
        <ol className="m-0 mt-3 list-none p-0">
          {asignaciones.map((a, i) => (
            <li key={a.id} className="relative pb-4 pl-5 last:pb-0">
              {i < asignaciones.length - 1 && <span className="absolute bottom-0 left-[3.5px] top-3 w-px bg-[var(--ct-line-strong)]" aria-hidden />}
              <span
                className="absolute left-0 top-[5px] size-2 rounded-full"
                style={{ background: a.tipo === "liberado" ? "var(--ct-gray)" : i === 0 ? "var(--ct-green)" : "var(--ct-line-strong)" }}
                aria-hidden
              />
              <p className="m-0 text-[13px] leading-snug [overflow-wrap:anywhere]">
                <strong className="font-semibold">{a.porNombre ?? a.porEmail ?? "Alguien"}</strong> {VERBO[a.tipo]}
                {(a.tipo === "asignado" || a.tipo === "reasignado") && <strong className="font-semibold"> {a.aNombre ?? a.aEmail ?? "otra persona"}</strong>}
                {a.tipo === "reasignado" && a.deNombre && <span className="ct-muted"> (antes: {a.deNombre})</span>}
                {a.tipo === "liberado" && a.deNombre && <span className="ct-muted"> (lo tenía {a.deNombre})</span>}
              </p>
              {a.nota && <p className="ct-muted m-0 mt-1 text-xs italic leading-snug [overflow-wrap:anywhere]">“{a.nota}”</p>}
              <p className="ct-faint m-0 mt-0.5 text-[11px]"><time dateTime={a.creadoEn}>{fechaHora(a.creadoEn)}</time></p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

type Dialogo = "asignar" | "liberar" | "cerrar" | null

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
    <div className="flex flex-col gap-6 px-4 py-4 sm:px-5">
      <section aria-labelledby="ct-responsable">
        <h3 id="ct-responsable" className="m-0 text-[13px] font-semibold">Responsable</h3>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <Responsable asignado={caso.asignado} asumidoPor={caso.asumidoPor} />
          {responsable && <span className="ct-faint flex-none text-[11px]">desde {haceCuanto(responsable.desde, ahora).replace("hace ", "")}</span>}
        </div>
        {director && !cerrado && (
          <div className="mt-3 flex flex-wrap gap-2">
            {!esMio && (
              <button
                type="button"
                className={`ct-btn ${responsable ? "" : "ct-btn-primary"}`}
                disabled={ocupado}
                onClick={() => onAccion({ tipo: "asumir", radicado }, "Asumiste el caso")}
              >
                Asumir caso
              </button>
            )}
            <button type="button" className="ct-btn" disabled={ocupado} onClick={() => onDialogo("asignar")}>
              {caso.asignado ? "Reasignar…" : "Asignar a un líder…"}
            </button>
            {responsable && (
              <button type="button" className="ct-btn ct-btn-ghost ct-btn-danger" disabled={ocupado} onClick={() => onDialogo("liberar")}>
                Liberar
              </button>
            )}
          </div>
        )}
      </section>

      {!cerrado && (
        <section aria-labelledby="ct-avance">
          <h3 id="ct-avance" className="m-0 text-[13px] font-semibold">Avance</h3>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {caso.estado === "recibido" && (
              <button type="button" className="ct-btn" disabled={ocupado} onClick={() => onAccion({ tipo: "actualizar", radicado, cambios: { estado: "en_analisis" } }, "Caso en análisis")}>
                Marcar en análisis
              </button>
            )}
            {estaAbierto(caso.estado) && (
              <button type="button" className="ct-btn" disabled={ocupado} onClick={() => onAccion({ tipo: "actualizar", radicado, cambios: { estado: "resuelto" } }, "Caso marcado como resuelto")}>
                Marcar resuelto
              </button>
            )}
            {caso.estado === "resuelto" && (
              <button type="button" className="ct-btn" disabled={ocupado} onClick={() => onAccion({ tipo: "actualizar", radicado, cambios: { estado: "en_analisis" } }, "El caso volvió a análisis")}>
                Volver a análisis
              </button>
            )}
            {director && caso.estado === "resuelto" && (
              <button type="button" className="ct-btn ct-btn-primary" disabled={ocupado} onClick={() => onDialogo("cerrar")}>
                Cerrar caso…
              </button>
            )}
          </div>
          {caso.estado === "resuelto" && !director && (
            <p className="ct-muted m-0 mt-2 text-xs">La dirección de la central revisa y cierra el caso.</p>
          )}
        </section>
      )}

      {director && !cerrado && (
        <section aria-labelledby="ct-clasificacion">
          <h3 id="ct-clasificacion" className="m-0 text-[13px] font-semibold">Clasificación</h3>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
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
        </section>
      )}

      <TarjetaSla caso={caso} ahora={ahora} />
      <Historial asignaciones={caso.asignaciones} />
    </div>
  )
}

// ─── Panel ──────────────────────────────────────────────────────────────────

function Cargando() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-5" aria-busy="true" aria-label="Cargando el caso">
      <div className="ct-skeleton h-5 w-40" />
      <div className="ct-skeleton h-7 w-3/4" />
      <div className="ct-skeleton h-24 w-full" />
      <div className="ct-skeleton h-14 w-2/3" />
      <div className="ct-skeleton ml-auto h-14 w-2/3" />
    </div>
  )
}

export function CentralDetalle({
  radicado,
  nivel,
  miCorreo,
  ahora,
  onCerrar,
}: {
  radicado: string | null
  nivel: CentralNivel
  miCorreo: string
  ahora: number
  onCerrar: () => void
}) {
  const { data: caso, isLoading, error, refetch } = useCentralCaso(radicado)
  const accion = useCentralAccion()
  const { showToast } = useTicketToast()
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [pestana, setPestana] = useState<"chat" | "gestion">("chat")

  function ejecutar(a: CentralAccion, exito: string, alTerminar?: () => void) {
    accion.mutate(a, {
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
  const r = radicado ?? ""
  const noExiste = estadoDeError(error) === 404

  return (
    <Sheet open={radicado !== null} onOpenChange={(v) => !v && onCerrar()}>
      <SheetContent
        side="right"
        className="central ct-panel flex h-dvh w-full flex-col gap-0 p-0 sm:max-w-none lg:w-[min(1080px,94vw)]"
      >
        {/* Encabezado */}
        <header className="flex-none border-b px-4 pb-3.5 pr-14 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pr-14">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="ct-mono text-sm font-medium" translate="no">#{r}</span>
            {caso && (
              <>
                <span className="ct-chip">{TIPO_TEXTO[caso.tipo]}</span>
                <SeveridadChip severidad={caso.severidad} />
                <EstadoChip estado={caso.estado} />
                <span className="ct-muted text-xs">{AREA_TEXTO[caso.area]}</span>
              </>
            )}
          </div>
          <SheetTitle className="mt-2 text-lg font-semibold leading-snug text-balance [overflow-wrap:anywhere]">
            {caso?.asunto ?? (noExiste ? "Caso no disponible" : "Cargando caso…")}
          </SheetTitle>
          <SheetDescription className="ct-muted mt-1 text-[13px]">
            {caso ? (
              <>
                {caso.cliente.nombre}
                {caso.cliente.empresa ? ` · ${caso.cliente.empresa}` : ""} · radicado {haceCuanto(caso.creadoEn, ahora)}
              </>
            ) : (
              "Caso de servicio al cliente"
            )}
          </SheetDescription>
        </header>

        {isLoading ? (
          <Cargando />
        ) : error || !caso ? (
          <Aviso
            icono={noExiste ? <SearchX className="size-5" aria-hidden /> : <AlertTriangle className="size-5" aria-hidden />}
            titulo={noExiste ? "No encontramos ese caso" : "No pudimos abrir el caso"}
            accion={
              noExiste ? (
                <button type="button" className="ct-btn" onClick={onCerrar}>Volver al panel</button>
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
        ) : (
          <>
            {/* Pestañas: solo en el teléfono */}
            <div role="tablist" aria-label="Secciones del caso" className="flex flex-none border-b lg:hidden">
              {(
                [
                  ["chat", `Conversación (${caso.mensajes.length})`],
                  ["gestion", "Gestión y plazos"],
                ] as const
              ).map(([clave, texto]) => (
                <button
                  key={clave}
                  type="button"
                  role="tab"
                  aria-selected={pestana === clave}
                  onClick={() => setPestana(clave)}
                  className={`min-h-[44px] flex-1 cursor-pointer border-b-2 text-[13px] font-semibold transition-colors ${
                    pestana === clave ? "border-[color:var(--ct-red)] text-[color:var(--ct-text)]" : "ct-muted border-transparent"
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className={`min-h-0 flex-col lg:flex lg:border-r ${pestana === "chat" ? "flex" : "hidden"}`}>
                <Conversacion key={r} caso={caso} enviando={enviando} />
                <Redactor
                  key={`redactor-${r}`}
                  cerrado={caso.estado === "cerrado"}
                  enviando={enviando !== null}
                  onEnviar={(texto, interno, limpiar) =>
                    ejecutar({ tipo: "mensaje", radicado: r, texto, interno }, interno ? "Nota interna guardada" : "Respuesta enviada al cliente", limpiar)
                  }
                />
              </div>
              <div className={`ct-surface min-h-0 overflow-y-auto overscroll-contain lg:block ${pestana === "gestion" ? "block" : "hidden"}`}>
                <Gestion caso={caso} nivel={nivel} miCorreo={miCorreo} ahora={ahora} ocupado={ocupado} onAccion={ejecutar} onDialogo={setDialogo} />
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
      </SheetContent>
    </Sheet>
  )
}
