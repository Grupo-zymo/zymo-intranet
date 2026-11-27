import { Fragment, useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle, Archive, ChevronRight, ExternalLink, FileText, ListChecks, Loader, Pencil, Plus, Search, TriangleAlert,
} from "lucide-react"
import { sigApi } from "@/lib/sigApi"
import { cn } from "@/lib/utils"
import { formatFechaHora } from "@/lib/dates"
import type { ProcedureOpenInfo } from "@/components/sig/SigExplorer"
import type { TabSolicitada } from "@/components/sig/SigBuscarProcedimiento"
import {
  ALERTA_TEXTO, CLAVE_LISTADO, ESTADO_TEXTO, TIPOS,
  errorDeApi, esUrl, fechaCorta, plano, retencion,
  type Alerta, type AreaListado, type Documento, type EstadoListado, type FilaListado, type HistorialItem, type RespuestaArea,
} from "@/lib/sigListado"
import { FilaListadoDialog } from "./FilaListadoDialog"

type FiltroAlerta = "repetido" | "sigla_area" | "forma" | "sin_documento"
type Filtro = "todos" | FiltroAlerta | "fuera"
type FiltroEstado = "vigentes" | EstadoListado | "todos"

const CHIPS: { clave: FiltroAlerta; texto: string; tono: "bad" | "warn" | "neutro"; cumple: (f: FilaListado) => boolean }[] = [
  { clave: "repetido", texto: "Repetidos", tono: "bad", cumple: (f) => f.alertas.includes("repetido") },
  { clave: "sigla_area", texto: "Sigla no cuadra", tono: "warn", cumple: (f) => f.alertas.includes("sigla_area") },
  { clave: "forma", texto: "Mal formados", tono: "bad", cumple: (f) => f.alertas.includes("forma") },
  { clave: "sin_documento", texto: "Sin documento en el SIG", tono: "neutro", cumple: (f) => f.estado !== "BAJA" && !f.documento },
]

const TONO_CHIP = {
  bad: "border-red-200 text-red-700 hover:border-red-300",
  warn: "border-amber-300 text-amber-800 hover:border-amber-400",
  neutro: "border-zinc-300 text-zinc-700 hover:border-zinc-400",
}

const ESTADO_CHIP: Record<EstadoListado, string> = {
  APROBADO: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PENDIENTE: "border-amber-200 bg-amber-50 text-amber-800",
  BAJA: "border-zinc-300 bg-zinc-100 text-zinc-600",
}

/** Pestaña del procedimiento donde vive cada tipo de documento (la misma que usa el buscador del SIG). */
const TAB_DE: Record<Documento["tipo"], TabSolicitada | undefined> = {
  procedimiento: undefined, instructivo: "soporte", formato: "formatos", anexo: "docanexos", protocolo: "docanexos",
}
const DOC_TEXTO: Record<Documento["tipo"], string> = {
  procedimiento: "Procedimiento", instructivo: "Instructivo", formato: "Formato", anexo: "Anexo", protocolo: "Protocolo",
}
const ACCION_TEXTO: Record<HistorialItem["accion"], string> = {
  creado: "Creó la fila", cambiado: "Cambió el código", area: "Cambió de área", baja: "Dio de baja", reactivado: "Reactivó", importado: "Importó",
}
/** Título de cada sección del listado (una por tipo de documento). */
const PLURAL: Record<string, string> = {
  Procedimiento: "Procedimientos", Instructivo: "Instructivos", Formato: "Formatos", Protocolo: "Protocolos", Política: "Políticas",
  Manual: "Manuales", Plan: "Planes", Programa: "Programas", Reglamento: "Reglamentos",
}
const ordenTipo = (tipo: string) => { const i = TIPOS.findIndex((t) => t.tipo === tipo); return i < 0 ? TIPOS.length : i }

/** Punto que titila cuando la fila tiene alertas (rojo si alguna es grave; ámbar si solo la sigla no cuadra). El texto, al desplegar. */
function PuntoAlerta({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) return null
  const grave = alertas.some((a) => a !== "sigla_area")
  const texto = alertas.map((a) => ALERTA_TEXTO[a]).join(" · ")
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0" title={texto}>
      <span aria-hidden className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:hidden", grave ? "bg-red-500" : "bg-amber-400")} />
      <span aria-hidden className={cn("relative inline-flex h-2 w-2 rounded-full", grave ? "bg-red-600" : "bg-amber-500")} />
      <span className="sr-only">, tiene alertas: {texto}</span>
    </span>
  )
}

const BOTON = "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-helix-accent/40 disabled:opacity-50"
const CONTROL = "h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-[12px] text-zinc-800 outline-none transition-colors focus-visible:border-helix-accent/50 focus-visible:ring-2 focus-visible:ring-helix-accent/30"

function Cargando({ texto }: { texto: string }) {
  return (
    <p role="status" className="flex items-center gap-2 py-10 font-mono text-[12px] text-zinc-600">
      <Loader className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      {texto}
    </p>
  )
}

function ErrorRed({ texto, onReintentar }: { texto: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="py-14 text-center">
      <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-700" aria-hidden />
      <p className="text-[13px] text-zinc-800">{texto}</p>
      <button type="button" onClick={onReintentar} className={cn(BOTON, "mt-3 border-zinc-300 text-zinc-700 hover:bg-zinc-100")}>
        Reintentar
      </button>
    </div>
  )
}

/** Sigla del área (la que llevan los códigos al final). El equipo del SIG la cambia en línea. */
function SiglaArea({ area, canEdit }: { area: RespuestaArea["area"]; canEdit: boolean }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(area.sigla ?? "")
  const guardar = useMutation({
    mutationFn: async () => (await sigApi.put(`/api/listado-maestro/areas/${area.id}/sigla`, { sigla: valor.trim() || null })).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CLAVE_LISTADO })
      setEditando(false)
    },
  })
  const error = guardar.error ? errorDeApi(guardar.error, "No se pudo guardar la sigla.").mensaje : null

  if (!editando) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-600">Sigla</span>
        {area.sigla
          ? <span className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[13px] font-semibold text-zinc-900">{area.sigla}</span>
          : <span className="text-[12px] text-amber-800">Sin sigla: no se revisa la del código ni se sugiere el siguiente</span>}
        {canEdit && (
          <button type="button" onClick={() => { setValor(area.sigla ?? ""); guardar.reset(); setEditando(true) }} className={cn(BOTON, "border-transparent px-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900")}>
            <Pencil className="h-3 w-3" aria-hidden />
            {area.sigla ? "Cambiar" : "Poner sigla"}
          </button>
        )}
      </div>
    )
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar.mutate() }} className="flex flex-wrap items-start gap-2">
      <div>
        <label htmlFor="lm-sigla" className="sr-only">Sigla del área</label>
        <input
          id="lm-sigla" autoFocus autoComplete="off" spellCheck={false} maxLength={5}
          value={valor}
          onChange={(e) => setValor(e.target.value.replace(/\s+/g, "").toUpperCase())}
          placeholder="GAD"
          aria-invalid={!!error}
          aria-describedby={error ? "lm-sigla-error" : "lm-sigla-ayuda"}
          className={cn(CONTROL, "h-8 w-24 font-mono uppercase aria-[invalid=true]:border-red-400")}
        />
        {error
          ? <p id="lm-sigla-error" className="mt-1 max-w-xs text-[11px] text-red-700">{error}</p>
          : <p id="lm-sigla-ayuda" className="mt-1 text-[11px] text-zinc-600">De 2 a 5 letras. Vacía, se quita.</p>}
      </div>
      <button type="submit" disabled={guardar.isPending} className={cn(BOTON, "h-8 border-helix-accent bg-helix-accent font-semibold text-white hover:opacity-90")}>
        {guardar.isPending ? <><Loader className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden /> Guardando…</> : "Guardar"}
      </button>
      <button type="button" onClick={() => setEditando(false)} disabled={guardar.isPending} className={cn(BOTON, "h-8 border-zinc-300 text-zinc-700 hover:bg-zinc-100")}>
        Cancelar
      </button>
    </form>
  )
}

/** Confirmación en línea de la baja, con motivo opcional. */
function BajaEnLinea({ fila, onListo }: { fila: FilaListado; onListo: () => void }) {
  const qc = useQueryClient()
  const [motivo, setMotivo] = useState("")
  const baja = useMutation({
    mutationFn: async () => (await sigApi.post(`/api/listado-maestro/${fila.id}/baja`, { motivo: motivo.trim() || undefined })).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CLAVE_LISTADO })
      onListo()
    },
  })
  return (
    <form onSubmit={(e) => { e.preventDefault(); baja.mutate() }} className="mb-4 rounded-lg border border-red-200 bg-red-50/60 p-3">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-red-800">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
        ¿Dar de baja {fila.codigo}? Deja de contar como código en uso y se avisa al líder del área.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={`lm-motivo-${fila.id}`} className="sr-only">Motivo de la baja (opcional)</label>
        <input
          id={`lm-motivo-${fila.id}`} autoFocus autoComplete="off"
          value={motivo} onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional)…"
          className={cn(CONTROL, "h-8 min-w-0 flex-1")}
        />
        <button type="submit" disabled={baja.isPending} className={cn(BOTON, "h-8 border-red-300 bg-white text-red-700 hover:bg-red-100")}>
          {baja.isPending ? <><Loader className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden /> Dando de baja…</> : "Dar de baja"}
        </button>
        <button type="button" onClick={onListo} disabled={baja.isPending} className={cn(BOTON, "h-8 border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100")}>
          Cancelar
        </button>
      </div>
      {baja.error && <p role="alert" className="mt-2 text-[11px] text-red-700">{errorDeApi(baja.error, "No se pudo dar de baja. Intenta de nuevo.").mensaje}</p>}
    </form>
  )
}

function Dato({ titulo, children, className }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">{titulo}</dt>
      <dd className="mt-0.5 text-[12px] text-zinc-800">{children}</dd>
    </div>
  )
}

/** Lo que se ve al desplegar una fila. `documento`: el enlace al SIG para quien edita (su última columna son los botones). */
function Detalle({ fila, documento }: { fila: FilaListado; documento?: ReactNode }) {
  const historial = [...fila.historial].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return (
    <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {fila.alertas.length > 0 && (
          <Dato titulo="Alertas" className="col-span-2 sm:col-span-3">
            <span className="flex flex-wrap gap-1.5">
              {fila.alertas.map((a) => (
                <span key={a} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px]", a === "sigla_area" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700")}>
                  <TriangleAlert className="h-3 w-3" aria-hidden />
                  {ALERTA_TEXTO[a]}
                </span>
              ))}
            </span>
          </Dato>
        )}
        <Dato titulo="Retención (activo / inactivo)"><span className="font-mono">{retencion(fila.anosActivo, fila.anosInactivo)}</span></Dato>
        {documento && <Dato titulo="En el SIG">{documento}</Dato>}
        <Dato titulo="Empresa">{fila.empresa ?? "—"}</Dato>
        <Dato titulo="Creación"><span className="font-mono">{fechaCorta(fila.fechaCreacion)}</span></Dato>
        <Dato titulo="Última actualización"><span className="font-mono">{fechaCorta(fila.fechaActualizacion)}</span></Dato>
        <Dato titulo="Revisado">{fila.revisado ? "Sí" : "No"}</Dato>
        <Dato titulo="Creado por">{fila.creadoPor ?? "—"}</Dato>
        <Dato titulo="Editado por">{fila.editadoPor ?? "—"}</Dato>
        {/* al líder el servidor no le envía la ubicación (espacio exclusivo del SIG): sin dato, no se muestra el campo */}
        {documento !== undefined && <Dato titulo="Ubicación" className="col-span-2 sm:col-span-3">
          {esUrl(fila.ubicacion) ? (
            <a href={fila.ubicacion?.trim()} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 break-all text-helix-accent-ink underline-offset-2 hover:underline">
              {fila.ubicacion}
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            </a>
          ) : <span className="break-words">{fila.ubicacion ?? "—"}</span>}
        </Dato>}
        <Dato titulo="Control de cambios" className="col-span-2 sm:col-span-3">
          <span className="whitespace-pre-wrap">{fila.controlCambios ?? "—"}</span>
        </Dato>
      </dl>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">Historial</p>
        {historial.length === 0 ? <p className="mt-1 text-[12px] text-zinc-600">Sin movimientos.</p> : (
          <ol className="mt-1.5 space-y-2 border-l border-zinc-300 pl-3">
            {historial.map((h, i) => (
              <li key={i} className="text-[12px] text-zinc-800">
                <span className="font-medium">{ACCION_TEXTO[h.accion] ?? h.accion}</span>
                {h.detalle && <span className="text-zinc-700">: {h.detalle}</span>}
                <span className="block font-mono text-[10px] text-zinc-600">{h.quien} · {formatFechaHora(h.fecha)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

/** Listado maestro de documentos del SIG (reemplaza el Excel FR-002-SIG). Sin `canEdit` (líder de área): solo lectura. */
export function SigListadoMaestroView({ canEdit, areaInicial = null, onOpenProcedure }: {
  canEdit: boolean
  areaInicial?: number | null
  onOpenProcedure: (id: number, info: ProcedureOpenInfo, tab?: TabSolicitada) => void
}) {
  const [elegida, setElegida] = useState<number | null>(areaInicial)
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [q, setQ] = useState("")
  const [tipo, setTipo] = useState("")
  const [estado, setEstado] = useState<FiltroEstado>("vigentes")
  const [abierta, setAbierta] = useState<number | null>(null)
  const [bajando, setBajando] = useState<number | null>(null)
  // Secciones (tipos) que la persona abrió o cerró a mano. Sin búsqueda ni filtro de alerta empiezan todas cerradas;
  // con búsqueda o filtro empiezan abiertas, para que se vea lo encontrado. Al cambiar la búsqueda o el filtro, se reinicia.
  const [alternadas, setAlternadas] = useState<Set<string>>(() => new Set())
  const [dialogo, setDialogo] = useState<{ fila: FilaListado | null } | null>(null)

  const areas = useQuery<AreaListado[]>({
    queryKey: [...CLAVE_LISTADO, "areas"],
    queryFn: async () => (await sigApi.get("/api/listado-maestro/areas")).data,
  })
  const listaAreas = areas.data ?? []
  const areaId = listaAreas.some((a) => a.id === elegida) ? elegida : listaAreas[0]?.id ?? null

  const listado = useQuery<RespuestaArea>({
    queryKey: [...CLAVE_LISTADO, "area", areaId],
    queryFn: async () => (await sigApi.get("/api/listado-maestro", { params: { areaId } })).data,
    enabled: areaId != null,
  })
  const datos = listado.data
  const filas = useMemo(() => datos?.filas ?? [], [datos])

  const conteo = useMemo(() => Object.fromEntries(CHIPS.map((c) => [c.clave, filas.filter(c.cumple).length])) as Record<FiltroAlerta, number>, [filas])
  const vigentes = filas.filter((f) => f.estado !== "BAJA").length
  const bajas = filas.length - vigentes

  const visibles = useMemo(() => {
    const aguja = plano(q.trim())
    const chip = CHIPS.find((c) => c.clave === filtro)
    return filas.filter((f) =>
      (estado === "todos" || (estado === "vigentes" ? f.estado !== "BAJA" : f.estado === estado))
      && (!tipo || f.tipo === tipo)
      && (!aguja || plano(f.codigo).includes(aguja) || plano(f.nombre).includes(aguja))
      && (!chip || chip.cumple(f)))
  }, [filas, q, tipo, estado, filtro])

  // Una sección por tipo, en el orden del catálogo
  const secciones = useMemo(() => {
    const grupos = new Map<string, FilaListado[]>()
    for (const f of visibles) grupos.set(f.tipo, [...(grupos.get(f.tipo) ?? []), f])
    return [...grupos.entries()].sort(([a], [b]) => ordenTipo(a) - ordenTipo(b))
  }, [visibles])

  function alternar(tipoSec: string) {
    setAlternadas((p) => {
      const n = new Set(p)
      if (n.has(tipoSec)) n.delete(tipoSec)
      else n.add(tipoSec)
      return n
    })
  }
  const buscando = q.trim() !== "" || filtro !== "todos"
  const estaAbierta = (tipoSec: string) => (buscando ? !alternadas.has(tipoSec) : alternadas.has(tipoSec))
  const cambiarFiltro = (f: Filtro) => { setFiltro(f); setAlternadas(new Set()) }
  const cambiarBusqueda = (texto: string) => { setQ(texto); setAlternadas(new Set()) }

  function elegirArea(id: number) {
    setElegida(id)
    cambiarFiltro("todos")
    setAbierta(null)
    setBajando(null)
  }

  function abrir(doc: Documento) {
    const a = listaAreas.find((x) => x.id === doc.procedimiento.areaId) ?? datos?.area
    onOpenProcedure(doc.procedimiento.id, {
      codigo: doc.procedimiento.codigo, titulo: doc.procedimiento.titulo, areaNombre: a?.nombre ?? "", areaColor: a?.color ?? "",
    }, TAB_DE[doc.tipo])
  }

  const quitarFiltros = () => { cambiarFiltro("todos"); setQ(""); setTipo(""); setEstado("vigentes") }
  const columnas = 7

  /** «Abrir» el documento del SIG que tiene el código de la fila, o «Sin documento». */
  const enElSig = (doc: Documento | null) => doc ? (
    <button
      type="button"
      onClick={() => abrir(doc)}
      title={`${DOC_TEXTO[doc.tipo]} ${doc.codigo} · ${doc.titulo}`}
      aria-label={`Abrir ${doc.codigo} en el SIG`}
      className={cn(BOTON, "border-zinc-300 py-0.5 text-zinc-700 hover:border-helix-accent/40 hover:text-helix-accent-ink")}
    >
      <FileText className="h-3 w-3" aria-hidden />
      Abrir
    </button>
  ) : <span className="whitespace-nowrap text-[11px] text-zinc-600">Sin documento</span>

  return (
    <div className="h-full overflow-y-auto bg-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-medium tracking-tight text-zinc-900">
              <ListChecks className="h-5 w-5 text-helix-accent-ink" aria-hidden />
              Listado maestro de documentos
            </h1>
            <p className="mt-1 text-[12px] text-zinc-600">Codificación de los documentos de cada área (antes, el Excel FR-002-SIG).</p>
          </div>
          {!canEdit && <p className="rounded-full border border-zinc-300 bg-white px-3 py-1 font-mono text-[11px] text-zinc-600">Solo consulta</p>}
        </header>

        {areas.isLoading && <Cargando texto="Cargando áreas…" />}
        {areas.isError && <ErrorRed texto="No se pudieron cargar las áreas del listado." onReintentar={() => void areas.refetch()} />}
        {areas.isSuccess && listaAreas.length === 0 && (
          <div className="py-20 text-center">
            <ListChecks className="mx-auto mb-3 h-7 w-7 text-zinc-500" aria-hidden />
            <p className="text-[13px] text-zinc-700">No hay áreas para mostrar en el listado maestro.</p>
          </div>
        )}

        {listaAreas.length > 0 && (
          <nav aria-label="Áreas" className="mb-4 flex gap-1.5 overflow-x-auto pb-2">
            {listaAreas.map((a) => {
              const activo = a.id === areaId
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => elegirArea(a.id)}
                  title={`${a.total} documentos vigentes${a.conAlertas ? ` · ${a.conAlertas} con alertas` : ""}`}
                  className={cn(
                    "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-helix-accent/40",
                    activo ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400",
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} aria-hidden />
                  {a.nombre}
                  <span className={cn("font-mono text-[10px] tabular-nums", activo ? "text-zinc-300" : "text-zinc-600")}>{a.total}</span>
                  {a.conAlertas > 0 && (
                    <span className={cn("inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums", activo ? "text-amber-300" : "text-amber-800")}>
                      <TriangleAlert className="h-2.5 w-2.5" aria-hidden />
                      {a.conAlertas}
                      <span className="sr-only"> con alertas</span>
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        )}

        {areaId != null && listado.isLoading && <Cargando texto="Cargando listado…" />}
        {listado.isError && (
          <ErrorRed texto={errorDeApi(listado.error, "No se pudo cargar el listado de esta área.").mensaje} onReintentar={() => void listado.refetch()} />
        )}

        {datos && (
          <div key={datos.area.id} className="space-y-4">
            {/* Cabecera del área + resumen */}
            <section aria-label={`Resumen de ${datos.area.nombre}`} className="sig-entra overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
                  <h2 className="flex items-center gap-2 text-[15px] font-medium text-zinc-900">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: datos.area.color }} aria-hidden />
                    {datos.area.nombre}
                  </h2>
                  <SiglaArea key={`${datos.area.id}-${datos.area.sigla}`} area={datos.area} canEdit={canEdit} />
                </div>
                {canEdit && (
                  <button type="button" onClick={() => setDialogo({ fila: null })} className={cn(BOTON, "border-helix-accent/30 text-helix-accent-ink hover:bg-helix-accent/5")}>
                    <Plus className="h-3 w-3" aria-hidden />
                    Nueva fila
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4 px-5 py-4">
                <p className="flex items-baseline gap-2 text-zinc-900">
                  <span className="font-mono text-4xl font-medium leading-none tabular-nums">{vigentes}</span>
                  <span className="text-[13px] text-zinc-600">códigos vigentes{bajas > 0 ? ` · ${bajas} dados de baja` : ""}</span>
                </p>
                <ul className="flex flex-wrap gap-2" aria-label="Filtrar por alerta">
                  {CHIPS.map((c) => {
                    const n = conteo[c.clave]
                    const activo = filtro === c.clave
                    return (
                      <li key={c.clave}>
                        <button
                          type="button"
                          aria-pressed={activo}
                          disabled={n === 0 && !activo}
                          onClick={() => cambiarFiltro(activo ? "todos" : c.clave)}
                          className={cn(
                            "inline-flex min-h-8 items-center gap-2 rounded-full border bg-white px-3 text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-helix-accent/40 disabled:cursor-default disabled:border-zinc-200 disabled:text-zinc-500",
                            activo ? "border-zinc-900 bg-zinc-900 text-white" : TONO_CHIP[c.tono],
                          )}
                        >
                          {c.tono !== "neutro" && n > 0 && <TriangleAlert className="h-3 w-3" aria-hidden />}
                          {c.texto}
                          <span className="font-mono text-[11px] tabular-nums">{n}</span>
                        </button>
                      </li>
                    )
                  })}
                  <li>
                    <button
                      type="button"
                      aria-pressed={filtro === "fuera"}
                      disabled={datos.fueraDelListado.length === 0 && filtro !== "fuera"}
                      onClick={() => cambiarFiltro(filtro === "fuera" ? "todos" : "fuera")}
                      className={cn(
                        "inline-flex min-h-8 items-center gap-2 rounded-full border bg-white px-3 text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-helix-accent/40 disabled:cursor-default disabled:border-zinc-200 disabled:text-zinc-500",
                        filtro === "fuera" ? "border-zinc-900 bg-zinc-900 text-white" : TONO_CHIP.warn,
                      )}
                    >
                      Fuera del listado
                      <span className="font-mono text-[11px] tabular-nums">{datos.fueraDelListado.length}</span>
                    </button>
                  </li>
                  {datos.resumen.documentosSinCodigo > 0 && (
                    <li
                      className="inline-flex min-h-8 items-center gap-2 rounded-full border border-dashed border-zinc-300 px-3 text-[12px] text-zinc-700"
                      title="Formatos y anexos cargados en el SIG cuyo nombre no empieza por un código: no se pueden cruzar con el listado."
                    >
                      Formatos o anexos sin código
                      <span className="font-mono text-[11px] tabular-nums">{datos.resumen.documentosSinCodigo}</span>
                    </li>
                  )}
                </ul>
              </div>
            </section>

            {filtro !== "fuera" && (
              <section aria-label="Documentos del listado" className="sig-entra overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-3">
                  <div className="relative min-w-[14rem] flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" aria-hidden />
                    <input
                      type="search" value={q} onChange={(e) => cambiarBusqueda(e.target.value)}
                      aria-label="Buscar por código o nombre" placeholder="Buscar por código o nombre…"
                      autoComplete="off" spellCheck={false}
                      className={cn(CONTROL, "w-full pl-8")}
                    />
                  </div>
                  <select aria-label="Filtrar por tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={CONTROL}>
                    <option value="">Todos los tipos</option>
                    {TIPOS.map((t) => <option key={t.tipo} value={t.tipo}>{t.tipo}</option>)}
                  </select>
                  <select aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)} className={CONTROL}>
                    <option value="vigentes">Vigentes (sin las dadas de baja)</option>
                    <option value="APROBADO">Aprobados</option>
                    <option value="PENDIENTE">Pendientes</option>
                    <option value="BAJA">Dados de baja</option>
                    <option value="todos">Todos, con las dadas de baja</option>
                  </select>
                  <span className="ml-auto font-mono text-[11px] text-zinc-600" aria-live="polite">{visibles.length} de {filas.length}</span>
                </div>

                {filas.length === 0 ? (
                  <div className="px-6 py-14 text-center">
                    <FileText className="mx-auto mb-2 h-6 w-6 text-zinc-500" aria-hidden />
                    <p className="text-[13px] text-zinc-700">Esta área todavía no tiene documentos en el listado.</p>
                    {canEdit && (
                      <button type="button" onClick={() => setDialogo({ fila: null })} className={cn(BOTON, "mt-3 border-helix-accent/30 text-helix-accent-ink hover:bg-helix-accent/5")}>
                        <Plus className="h-3 w-3" aria-hidden />
                        Nueva fila
                      </button>
                    )}
                  </div>
                ) : visibles.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <p className="text-[13px] text-zinc-700">Ningún documento coincide con la búsqueda o los filtros.</p>
                    <button type="button" onClick={quitarFiltros} className={cn(BOTON, "mt-3 border-zinc-300 text-zinc-700 hover:bg-zinc-100")}>Quitar filtros</button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[52rem] border-collapse text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                          <th scope="col" className="py-2 pl-4 pr-2 font-normal">Código</th>
                          <th scope="col" className="px-2 py-2 font-normal">Nombre</th>
                          <th scope="col" className="px-2 py-2 font-normal">Versión</th>
                          <th scope="col" className="px-2 py-2 font-normal">Actualización</th>
                          <th scope="col" className="px-2 py-2 font-normal">Disposición</th>
                          <th scope="col" className="px-2 py-2 font-normal">Aprobación</th>
                          {canEdit
                            ? <th scope="col" className="py-2 pl-2 pr-4 font-normal"><span className="sr-only">Acciones</span></th>
                            : <th scope="col" className="py-2 pl-2 pr-4 font-normal">En el SIG</th>}
                        </tr>
                      </thead>
                      {secciones.map(([tipoSec, filasSec]) => {
                        const plegada = !estaAbierta(tipoSec)
                        const conAlertas = filasSec.filter((f) => f.alertas.length > 0).length
                        const idSec = `lm-sec-${ordenTipo(tipoSec)}`
                        return (
                          <tbody key={tipoSec} className="sig-escalona">
                            <tr className="border-b border-zinc-200 bg-zinc-100/80">
                              <th scope="rowgroup" colSpan={columnas} className="p-0 text-left font-normal">
                                <button
                                  type="button"
                                  id={idSec}
                                  aria-expanded={!plegada}
                                  onClick={() => alternar(tipoSec)}
                                  className="flex w-full items-center gap-2 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-800 outline-none transition-colors hover:bg-zinc-200/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-helix-accent/40"
                                >
                                  <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform motion-reduce:transition-none", !plegada && "rotate-90")} aria-hidden />
                                  {PLURAL[tipoSec] ?? tipoSec}
                                  <span className="font-normal tabular-nums text-zinc-600">{filasSec.length}</span>
                                  {conAlertas > 0 && (
                                    <span className="ml-1 inline-flex items-center gap-1 font-normal normal-case tracking-normal text-red-700">
                                      <TriangleAlert className="h-3 w-3" aria-hidden />
                                      {conAlertas} con alertas
                                    </span>
                                  )}
                                </button>
                              </th>
                            </tr>
                            {!plegada && filasSec.map((f) => {
                              const abiertaEsta = abierta === f.id
                              return (
                                <Fragment key={f.id}>
                                  <tr className={cn("border-b border-zinc-200 align-top transition-colors hover:bg-zinc-50", abiertaEsta && "bg-zinc-50", f.estado === "BAJA" && "text-zinc-500")}>
                                    <td className="py-2 pl-4 pr-2">
                                      <button
                                        type="button"
                                        aria-expanded={abiertaEsta}
                                        onClick={() => { setAbierta(abiertaEsta ? null : f.id); if (abiertaEsta) setBajando(null) }}
                                        className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 font-mono text-[12px] font-semibold text-zinc-900 outline-none hover:bg-zinc-200/70 focus-visible:ring-2 focus-visible:ring-helix-accent/40"
                                      >
                                        <ChevronRight className={cn("h-3 w-3 shrink-0 text-zinc-500 transition-transform motion-reduce:transition-none", abiertaEsta && "rotate-90")} aria-hidden />
                                        <span className={cn("whitespace-nowrap", f.estado === "BAJA" && "line-through decoration-zinc-400")}>{f.codigo}</span>
                                        <PuntoAlerta alertas={f.alertas} />
                                      </button>
                                    </td>
                                    <td className="min-w-[16rem] px-2 py-2 text-zinc-900">{f.nombre}</td>
                                    <td className="px-2 py-2 font-mono text-zinc-700">{f.version ?? "—"}</td>
                                    <td className="whitespace-nowrap px-2 py-2 font-mono text-zinc-700">{fechaCorta(f.fechaActualizacion)}</td>
                                    <td className="px-2 py-2 text-zinc-700">{f.disposicionFinal ?? "—"}</td>
                                    <td className="px-2 py-2">
                                      <span className={cn("whitespace-nowrap rounded border px-1.5 py-px font-mono text-[10px]", ESTADO_CHIP[f.estado])}>{ESTADO_TEXTO[f.estado]}</span>
                                    </td>
                                    {canEdit ? (
                                      <td className="py-2 pl-2 pr-4">
                                        <div className="flex justify-end gap-0.5">
                                          <button type="button" onClick={() => setDialogo({ fila: f })} aria-label={`Editar ${f.codigo}`} title="Editar" className="rounded p-1.5 text-zinc-600 outline-none transition-colors hover:bg-zinc-200/70 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-helix-accent/40">
                                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                                          </button>
                                          {f.estado !== "BAJA" && (
                                            <button type="button" onClick={() => { setAbierta(f.id); setBajando(f.id) }} aria-label={`Dar de baja ${f.codigo}`} title="Dar de baja" className="rounded p-1.5 text-zinc-600 outline-none transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-helix-accent/40">
                                              <Archive className="h-3.5 w-3.5" aria-hidden />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    ) : (
                                      <td className="py-2 pl-2 pr-4">{enElSig(f.documento)}</td>
                                    )}
                                  </tr>
                                  {abiertaEsta && (
                                    <tr className="border-b border-zinc-200 bg-zinc-50" style={{ animationDelay: "0ms" }}>
                                      <td colSpan={columnas} className="px-6 py-4">
                                        {canEdit && bajando === f.id && <BajaEnLinea fila={f} onListo={() => setBajando(null)} />}
                                        <Detalle fila={f} documento={canEdit ? enElSig(f.documento) : undefined} />
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              )
                            })}
                          </tbody>
                        )
                      })}
                    </table>
                  </div>
                )}
              </section>
            )}

            {(datos.fueraDelListado.length > 0 || filtro === "fuera") && (
              <section aria-labelledby="lm-fuera" className="sig-entra overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm">
                <div className="border-b border-zinc-200 px-5 py-3">
                  <h3 id="lm-fuera" className="text-[13px] font-medium text-zinc-900">Documentos cargados que no están en el listado</h3>
                  <p className="mt-0.5 text-[11px] text-zinc-600">Están en el SIG con un código que ninguna fila del listado tiene.</p>
                </div>
                {datos.fueraDelListado.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[12px] text-zinc-600">Todo lo cargado en esta área está en el listado.</p>
                ) : (
                  <ul className="sig-escalona divide-y divide-zinc-200">
                    {datos.fueraDelListado.map((d) => (
                      <li key={`${d.tipo}-${d.id}`} className="flex items-center gap-3 px-5 py-2.5">
                        <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-600">{DOC_TEXTO[d.tipo]}</span>
                        <span className="shrink-0 font-mono text-[12px] font-semibold text-zinc-900">{d.codigo}</span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-700" title={d.titulo}>{d.titulo}</span>
                        <button
                          type="button"
                          onClick={() => abrir(d)}
                          aria-label={`Abrir ${d.codigo} en el SIG`}
                          className={cn(BOTON, "shrink-0 border-zinc-300 py-0.5 text-zinc-700 hover:border-helix-accent/40 hover:text-helix-accent-ink")}
                        >
                          <FileText className="h-3 w-3" aria-hidden />
                          Abrir
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {dialogo && datos && (
        <FilaListadoDialog fila={dialogo.fila} area={datos.area} siguientes={datos.siguientes} onClose={() => setDialogo(null)} />
      )}
    </div>
  )
}
