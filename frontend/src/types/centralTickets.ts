// Central de tickets — contrato de /zymoally-api/api/central-tickets
// (zymoally-backend reenvía el de la app de autogestión del cliente).

export type CentralEstado = "recibido" | "en_analisis" | "resuelto" | "cerrado"
export type CentralSeveridad = "critica" | "alta" | "media" | "baja"
export type CentralArea = "bodega" | "administrativo"
export type CentralTipo = "peticion" | "queja" | "reclamo" | "sugerencia"
export type CentralNivel = "director" | "lider"

export interface CentralSla {
  acuseVence: string | null
  respuestaInicialVence: string | null
  respuestaFondoVence: string | null
  /** Porcentaje del plazo ya consumido (puede pasar de 100). */
  consumido: number
  vencido: boolean
  escalamiento: { motivo: string; destinatarios: string[] | string } | null
}

export interface CentralPersona {
  nombre: string
  email: string
  desde: string
}

export interface CentralCasoBase {
  radicado: string | number
  tipo: CentralTipo
  area: CentralArea
  severidad: CentralSeveridad
  estado: CentralEstado
  asunto: string
  creadoEn: string
  primeraRespuestaEn: string | null
  resueltoEn: string | null
  cliente: { nombre: string; empresa: string | null }
  sla: CentralSla
  asignado: (CentralPersona & { id: number }) | null
  asumidoPor: CentralPersona | null
}

export interface CentralCasoItem extends CentralCasoBase {
  ultimoMensaje: { creadoEn: string; deCliente: boolean } | null
  mensajes: number
}

export interface CentralMensaje {
  id: number | string
  texto: string
  interno: boolean
  origen: "app" | "intranet"
  creadoEn: string
  autor: string
  rol: string
}

export interface CentralAsignacion {
  id: number | string
  tipo: "asumido" | "asignado" | "reasignado" | "liberado"
  deNombre: string | null
  aNombre: string | null
  aEmail: string | null
  porNombre: string | null
  porEmail: string | null
  nota: string | null
  creadoEn: string
}

export interface CentralCasoDetalle extends CentralCasoBase {
  descripcion: string
  cerradoEn: string | null
  mensajes: CentralMensaje[]
  asignaciones: CentralAsignacion[]
}

export interface CentralListaRespuesta {
  total: number
  pagina: number
  limite: number
  truncado: boolean
  items: CentralCasoItem[]
}

export interface CentralCargaLider {
  email: string
  nombre: string
  abiertos: number
  vencidos: number
  escalados: number
  resueltos30d: number
}

export interface CentralResumen {
  total: number
  porEstado: Record<CentralEstado, number>
  porSeveridad: Record<CentralSeveridad, number>
  porArea: Record<CentralArea, number>
  abiertos: number
  sinAsignar: number
  escalados: number
  vencidos: number
  sinPrimeraRespuesta: number
  horasPrimeraRespuesta: number | null
  horasResolucion: number | null
  porLider: CentralCargaLider[]
  ultimos14dias: { fecha: string; creados: number; resueltos: number }[]
  truncado: boolean
}

export interface CentralLider {
  id: number
  nombre: string
  email: string
  area: string | null
  cargo: string | null
  esLider: boolean
}

/** Filtros del panel. Todos viven en la URL. */
export interface CentralFiltros {
  estado: "" | CentralEstado | "abierto"
  severidad: "" | CentralSeveridad
  area: "" | CentralArea
  tipo: "" | CentralTipo
  /** "" (todos) | "sin" | "mios" | correo de un líder */
  asignado: string
  escalado: boolean
  vencido: boolean
  /** Sin filtro en el servicio: se aplican sobre los casos abiertos ya cargados. */
  sinRespuesta: boolean
  q: string
  desde: string
  hasta: string
  orden: "recientes" | "vencimiento"
  pagina: number
}

export type CentralAccion =
  | { tipo: "asumir"; radicado: string }
  | { tipo: "asignar"; radicado: string; asignadoId: number; nota?: string }
  | { tipo: "liberar"; radicado: string; nota?: string }
  | { tipo: "mensaje"; radicado: string; texto: string; interno: boolean }
  | {
      tipo: "actualizar"
      radicado: string
      cambios: { severidad?: CentralSeveridad; area?: CentralArea; estado?: "en_analisis" | "resuelto" | "cerrado" }
    }
