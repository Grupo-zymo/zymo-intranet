import { useState, type ReactNode } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Loader, Wand2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { sigApi } from "@/lib/sigApi"
import { cn } from "@/lib/utils"
import {
  CLAVE_LISTADO, DISPOSICIONES, EMPRESAS, ESTADO_TEXTO, TIPOS,
  errorDeApi, normalizarCodigo, siguienteDe,
  type CuerpoFila, type EstadoListado, type FilaListado,
} from "@/lib/sigListado"

/** Lo que se escribe en el formulario: todo texto (vacío = no aplica), salvo revisado y estado. */
type Form = Omit<Record<keyof CuerpoFila, string>, "revisado" | "estado"> & { revisado: boolean; estado: EstadoListado }

const VACIO: Form = {
  tipo: "", codigo: "", nombre: "", empresa: "", version: "", fechaCreacion: "", fechaActualizacion: "",
  controlCambios: "", anosActivo: "", anosInactivo: "", disposicionFinal: "", ubicacion: "", revisado: false, estado: "APROBADO",
}

function desdeFila(f: FilaListado): Form {
  return {
    tipo: f.tipo, codigo: f.codigo, nombre: f.nombre, empresa: f.empresa ?? "", version: f.version ?? "",
    fechaCreacion: f.fechaCreacion?.slice(0, 10) ?? "", fechaActualizacion: f.fechaActualizacion?.slice(0, 10) ?? "",
    controlCambios: f.controlCambios ?? "", anosActivo: f.anosActivo == null ? "" : String(f.anosActivo),
    anosInactivo: f.anosInactivo == null ? "" : String(f.anosInactivo), disposicionFinal: f.disposicionFinal ?? "",
    ubicacion: f.ubicacion ?? "", revisado: f.revisado, estado: f.estado,
  }
}

const texto = (s: string) => s.trim() || null
const anos = (s: string) => (s.trim() === "" ? null : Number(s))

function haciaCuerpo(f: Form): CuerpoFila {
  return {
    tipo: f.tipo, codigo: normalizarCodigo(f.codigo), nombre: f.nombre.trim(), empresa: texto(f.empresa), version: texto(f.version),
    fechaCreacion: f.fechaCreacion || null, fechaActualizacion: f.fechaActualizacion || null, controlCambios: texto(f.controlCambios),
    anosActivo: anos(f.anosActivo), anosInactivo: anos(f.anosInactivo), disposicionFinal: f.disposicionFinal || null,
    ubicacion: texto(f.ubicacion), revisado: f.revisado, estado: f.estado,
  }
}

const CAMPO = "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[12px] text-zinc-800 outline-none transition-colors focus-visible:border-helix-accent/50 focus-visible:ring-2 focus-visible:ring-helix-accent/30 aria-[invalid=true]:border-red-400"

/** Etiqueta + control + ayuda o error del servidor de ese campo. El control lleva id `lm-<campo>`. */
function Campo({ campo, label, error, ayuda, className, children }: {
  campo: keyof Form; label: string; error: string | null; ayuda?: ReactNode; className?: string; children: ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={`lm-${campo}`} className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-zinc-600">{label}</label>
      {children}
      {error ? (
        <p id={`lm-${campo}-error`} role="alert" className="mt-1 flex items-start gap-1.5 text-[11px] text-red-700">
          <AlertCircle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          {error}
        </p>
      ) : ayuda && <div className="mt-1 text-[11px] leading-relaxed text-zinc-600">{ayuda}</div>}
    </div>
  )
}

/**
 * Crear o editar una fila del listado maestro. `fila` null = fila nueva en `area`.
 * Al editar solo manda lo que cambió: guardar sin tocar el estado de una fila dada de baja no la reactiva.
 */
export function FilaListadoDialog({ fila, area, siguientes, onClose }: {
  fila: FilaListado | null
  area: { id: number; nombre: string; sigla: string | null }
  siguientes: Record<string, string | null>
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [inicial] = useState<Form>(() => (fila ? desdeFila(fila) : VACIO))
  const [form, setForm] = useState<Form>(inicial)
  const [error, setError] = useState<{ mensaje: string; campo: string | null } | null>(null)
  const poner = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const guardar = useMutation({
    mutationFn: async () => {
      const cuerpo = haciaCuerpo(form)
      if (!fila) return (await sigApi.post<FilaListado>("/api/listado-maestro", { areaId: area.id, ...cuerpo })).data
      const antes = haciaCuerpo(inicial)
      const cambios = Object.fromEntries(Object.entries(cuerpo).filter(([k, v]) => v !== antes[k as keyof CuerpoFila]))
      if (Object.keys(cambios).length === 0) return fila
      return (await sigApi.patch<FilaListado>(`/api/listado-maestro/${fila.id}`, cambios)).data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CLAVE_LISTADO })
      onClose()
    },
    onError: (e) => setError(errorDeApi(e, "No se pudo guardar la fila. Intenta de nuevo.")),
  })

  const errorDe = (campo: keyof Form) => (error?.campo === campo ? error.mensaje : null)
  const invalido = (campo: keyof Form) => (errorDe(campo) ? { "aria-invalid": true, "aria-describedby": `lm-${campo}-error` } : {})
  const errorGeneral = error && !(error.campo && error.campo in VACIO) ? error.mensaje : null
  const sugerido = siguienteDe(siguientes, form.tipo)

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !guardar.isPending) onClose() }}>
      <DialogContent className="sig-root max-h-[90dvh] max-w-2xl gap-5 overflow-y-auto overscroll-contain border-zinc-300 bg-white text-zinc-900">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">{fila ? `Editar ${fila.codigo}` : "Nueva fila del listado"}</DialogTitle>
          <DialogDescription className="text-[12px] text-zinc-600">
            {area.nombre}{area.sigla ? ` · sigla ${area.sigla}` : " · sin sigla de área"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); setError(null); guardar.mutate() }} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {errorGeneral && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 sm:col-span-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-700" aria-hidden />
              <p className="text-xs text-red-700">{errorGeneral}</p>
            </div>
          )}

          <Campo campo="tipo" label="Tipo *" error={errorDe("tipo")}>
            <select id="lm-tipo" required value={form.tipo} onChange={(e) => poner("tipo", e.target.value)} className={CAMPO} {...invalido("tipo")}>
              <option value="" disabled>Elige el tipo…</option>
              {TIPOS.map((t) => <option key={t.tipo} value={t.tipo}>{t.tipo} ({t.sigla})</option>)}
            </select>
          </Campo>

          <Campo
            campo="codigo"
            label="Código *"
            error={errorDe("codigo")}
            ayuda={sugerido && sugerido !== form.codigo ? (
              <button
                type="button"
                onClick={() => poner("codigo", sugerido)}
                className="inline-flex items-center gap-1 rounded border border-helix-accent/30 px-1.5 py-0.5 font-mono text-[11px] text-helix-accent-ink outline-none transition-colors hover:bg-helix-accent/5 focus-visible:ring-2 focus-visible:ring-helix-accent/40"
              >
                <Wand2 className="h-3 w-3" aria-hidden />
                Usar el siguiente: {sugerido}
              </button>
            ) : !area.sigla ? "El área no tiene sigla: no se puede sugerir el siguiente código." : "Sigla del tipo, tres dígitos y sigla del área."}
          >
            <input
              id="lm-codigo" name="codigo" required autoComplete="off" spellCheck={false}
              value={form.codigo}
              onChange={(e) => poner("codigo", normalizarCodigo(e.target.value))}
              placeholder={`FR-001-${area.sigla ?? "GAD"}`}
              className={cn(CAMPO, "font-mono uppercase")}
              {...invalido("codigo")}
            />
          </Campo>

          <Campo campo="nombre" label="Nombre *" error={errorDe("nombre")} className="sm:col-span-2">
            <input id="lm-nombre" name="nombre" required autoComplete="off" value={form.nombre} onChange={(e) => poner("nombre", e.target.value)} className={CAMPO} {...invalido("nombre")} />
          </Campo>

          <Campo campo="empresa" label="Empresa" error={errorDe("empresa")}>
            <input id="lm-empresa" name="empresa" list="lm-empresas" autoComplete="off" value={form.empresa} onChange={(e) => poner("empresa", e.target.value)} className={CAMPO} {...invalido("empresa")} />
            <datalist id="lm-empresas">{EMPRESAS.map((e) => <option key={e} value={e} />)}</datalist>
          </Campo>

          <Campo campo="version" label="Versión" error={errorDe("version")}>
            <input id="lm-version" name="version" autoComplete="off" value={form.version} onChange={(e) => poner("version", e.target.value)} className={cn(CAMPO, "font-mono")} {...invalido("version")} />
          </Campo>

          <Campo campo="fechaCreacion" label="Fecha de creación" error={errorDe("fechaCreacion")}>
            <input id="lm-fechaCreacion" type="date" value={form.fechaCreacion} onChange={(e) => poner("fechaCreacion", e.target.value)} className={cn(CAMPO, "font-mono")} {...invalido("fechaCreacion")} />
          </Campo>

          <Campo campo="fechaActualizacion" label="Última actualización" error={errorDe("fechaActualizacion")}>
            <input id="lm-fechaActualizacion" type="date" value={form.fechaActualizacion} onChange={(e) => poner("fechaActualizacion", e.target.value)} className={cn(CAMPO, "font-mono")} {...invalido("fechaActualizacion")} />
          </Campo>

          <Campo campo="anosActivo" label="Retención activo (años)" error={errorDe("anosActivo")} ayuda="Vacío = no aplica.">
            <input id="lm-anosActivo" type="number" inputMode="numeric" min={0} step={1} autoComplete="off" value={form.anosActivo} onChange={(e) => poner("anosActivo", e.target.value)} className={cn(CAMPO, "font-mono")} {...invalido("anosActivo")} />
          </Campo>

          <Campo campo="anosInactivo" label="Retención inactivo (años)" error={errorDe("anosInactivo")} ayuda="Vacío = no aplica.">
            <input id="lm-anosInactivo" type="number" inputMode="numeric" min={0} step={1} autoComplete="off" value={form.anosInactivo} onChange={(e) => poner("anosInactivo", e.target.value)} className={cn(CAMPO, "font-mono")} {...invalido("anosInactivo")} />
          </Campo>

          <Campo campo="disposicionFinal" label="Disposición final" error={errorDe("disposicionFinal")}>
            <select id="lm-disposicionFinal" value={form.disposicionFinal} onChange={(e) => poner("disposicionFinal", e.target.value)} className={CAMPO} {...invalido("disposicionFinal")}>
              <option value="">No aplica</option>
              {DISPOSICIONES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Campo>

          <Campo
            campo="estado"
            label="Estado"
            error={errorDe("estado")}
            ayuda={fila?.estado === "BAJA" ? "Está dada de baja: elegir Aprobado o Pendiente la reactiva." : undefined}
          >
            <select id="lm-estado" value={form.estado} onChange={(e) => poner("estado", e.target.value as EstadoListado)} className={CAMPO} {...invalido("estado")}>
              {fila?.estado === "BAJA" && <option value="BAJA">{ESTADO_TEXTO.BAJA}</option>}
              <option value="APROBADO">{ESTADO_TEXTO.APROBADO}</option>
              <option value="PENDIENTE">{ESTADO_TEXTO.PENDIENTE}</option>
            </select>
          </Campo>

          <Campo campo="ubicacion" label="Ubicación" error={errorDe("ubicacion")} ayuda="Ruta o enlace donde está guardado el documento." className="sm:col-span-2">
            <input id="lm-ubicacion" name="ubicacion" autoComplete="off" value={form.ubicacion} onChange={(e) => poner("ubicacion", e.target.value)} className={CAMPO} {...invalido("ubicacion")} />
          </Campo>

          <Campo campo="controlCambios" label="Control de cambios" error={errorDe("controlCambios")} className="sm:col-span-2">
            <textarea id="lm-controlCambios" rows={3} autoComplete="off" value={form.controlCambios} onChange={(e) => poner("controlCambios", e.target.value)} className={cn(CAMPO, "resize-y")} {...invalido("controlCambios")} />
          </Campo>

          <label className="flex items-center gap-2 text-[12px] text-zinc-800 sm:col-span-2">
            <input type="checkbox" checked={form.revisado} onChange={(e) => poner("revisado", e.target.checked)} className="h-4 w-4 accent-helix-accent" />
            Revisado por el SIG
          </label>

          <div className="flex gap-2 pt-1 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              disabled={guardar.isPending}
              className="flex-1 rounded-lg border border-zinc-300 py-2 font-mono text-xs text-zinc-700 outline-none transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-helix-accent/40 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardar.isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-helix-accent py-2 font-mono text-xs font-semibold text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-helix-accent/40 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {guardar.isPending ? <><Loader className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden /> Guardando…</> : fila ? "Guardar cambios" : "Crear fila"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
