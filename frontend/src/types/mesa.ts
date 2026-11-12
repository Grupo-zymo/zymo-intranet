// Mesa de ayuda — contrato de /zymoally-api/api/mesa (ver docs/mesa-ayuda.md)

export type MesaEstado = "abierto" | "en_espera" | "cerrado"
export type MesaVista = "mias" | "area" | "todas" | "eliminados"
export type MesaPrioridad = "alta" | "media" | "baja"
export type MesaRelacion = "admin" | "area" | "responsable" | "creador"

export type MesaAccion =
  | "ver" | "comentar" | "evidencia" | "ver_internas" | "nota_interna" | "asignar"
  | "estado" | "categoria" | "eliminar" | "redirigir" | "sumar_responsable"

export interface MesaCategoria {
  id: number
  areaId: number
  nombre: string
  activa: boolean
}

export interface MesaArea {
  areaId: number
  nombre: string
  prefijo: string
  recibeTickets: boolean
  esSac: boolean
  metaPrimeraRespuestaH: number | null
  metaCierreH: number | null
  categorias: MesaCategoria[]
}

export interface MesaResponsable {
  userId: number
  nombre: string
}

export interface MesaTicket {
  id: number
  codigo: string
  areaId: number
  areaNombre: string
  categoria: { id: number; nombre: string } | null
  asunto: string
  descripcion: string
  estado: MesaEstado
  prioridad: MesaPrioridad | null
  venceEn: string | null
  creadorId: number
  creadorNombre: string
  creadorArea: string | null
  creadorSede: string | null
  radicadoOrigen: string | null
  createdAt: string
  updatedAt: string
  primeraRespuestaEn: string | null
  cerradoEn: string | null
  eliminadoEn: string | null
  eliminadoPorNombre: string | null
  motivoEliminacion: string | null
  responsables: MesaResponsable[]
  /** Horas laborales que lleva abierto (solo en listas; null si está cerrado o eliminado). */
  horasAbierto?: number | null
}

export interface MesaLista {
  total: number
  pagina: number
  limite: number
  items: MesaTicket[]
}

export interface MesaResumen {
  abierto: number
  en_espera: number
  cerrado: number
  sinAsignar: number
  asignadosAMi: number
  sinRespuesta: number
}

export interface MesaMensaje {
  id: number
  autorId: number
  autorNombre: string
  texto: string
  interno: boolean
  createdAt: string
}

export interface MesaEvidencia {
  id: number
  mensajeId: number | null
  nombreArchivo: string
  tipo: string
  tamano: number
  subidoPorNombre: string
  createdAt: string
}

export interface MesaHistorial {
  id: number
  actorNombre: string
  accion: string
  detalle: Record<string, unknown> | null
  createdAt: string
}

export interface MesaDetalle extends MesaTicket {
  mensajes: MesaMensaje[]
  evidencias: MesaEvidencia[]
  historial: MesaHistorial[]
  relacion: MesaRelacion
  permisos: Record<MesaAccion, boolean>
}

/** Qué es quien usa la mesa (solo para decidir qué mostrar; el servidor revisa cada acción). */
export interface MesaYo {
  esAdmin: boolean
  esLider: boolean
  esSac: boolean
  areaIds: number[]
}

export interface MesaIndicador {
  medidos: number
  medianaH: number | null
  metaH: number | null
  cumplimiento: number | null
  fueraDeMetaAhora: number
}

/** Tablero del líder: su área contra las metas que él define. Tiempos en horas laborales. */
export interface MesaTableroDatos {
  area: { areaId: number; nombre: string; metasActualizadasPor: string | null; metasActualizadasEn: string | null }
  dias: number
  pendientes: { abierto: number; en_espera: number; sinRespuesta: number; sinAsignar: number }
  creados: number
  cerrados: number
  primeraRespuesta: MesaIndicador
  cierre: MesaIndicador
  porCategoria: { nombre: string; creados: number }[]
  porResponsable: { nombre: string; abiertos: number; cerrados: number }[]
}

/** Cuántos tickets tiene cada área ahora mismo (vista de administración). */
export interface MesaPanorama {
  eliminados: number
  areas: {
    areaId: number
    nombre: string
    prefijo: string
    recibeTickets: boolean
    abierto: number
    en_espera: number
    cerrado: number
    sinAsignar: number
    sinRespuesta: number
  }[]
}

/** Ticket interno que nació de un caso de la Central. */
export interface MesaEnlazado {
  id: number
  codigo: string
  asunto: string
  estado: MesaEstado
  areaNombre: string
  createdAt: string
}

export interface MesaPersona {
  id: number
  nombre: string
  email: string
  cargo?: string | null
}
