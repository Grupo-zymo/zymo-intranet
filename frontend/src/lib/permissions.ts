// Acceso por permisos del rol (`app_permissions` desde /auth/me) + admin.
// Compatibilidad: áreas históricas (Compras, Operaciones, etc.) hasta migrar todo a la BD.

function hasPerm(appPerms: string[] | undefined, id: string): boolean {
  return appPerms?.includes(id) === true
}

export function canSeeOC(role: string, area?: string | null, appPerms?: string[]): boolean {
  if (role === "admin") return true
  if (hasPerm(appPerms, "mod_oc_ver")) return true
  if (hasPerm(appPerms, "mod_oc_config")) return true
  if (area === "Compras") return true
  return false
}

export function canApproveOC(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_oc_aprobar")
}

export function canConfigureOC(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_oc_config")
}

export function canSeeOperativo(role: string, area?: string | null, appPerms?: string[]): boolean {
  if (role === "admin") return true
  if (hasPerm(appPerms, "mod_operativo")) return true
  if (area === "Operaciones") return true
  // Líder con permiso de Agenda (capacitaciones) entra a Operativo aunque no tenga mod_operativo.
  if (canUseAgenda(role, appPerms)) return true
  return false
}

export function canSeeOperClientes(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_oper_clientes")
}

// Archivado 2026-11-12 junto con Zymo Ally · Tickets (ver canSeeTickets).
export function canSeeGestionTickets(role: string, _appPerms?: string[]): boolean {
  return role === "admin"
}

export function canSeeSGC(role: string, area?: string | null, appPerms?: string[]): boolean {
  if (role === "admin") return true
  if (hasPerm(appPerms, "mod_sgc")) return true
  if (area === "Gestión de Calidad") return true
  return false
}

export function canSeeFinanciero(role: string, area?: string | null, appPerms?: string[]): boolean {
  if (role === "admin") return true
  if (hasPerm(appPerms, "mod_financiero")) return true
  if (area === "contabilidad") return true
  return false
}

export function canSeeGerencial(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_gerencial")
}

export function canSeeIT(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_it")
}

export function canSeeSIG(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_sig") || hasPerm(appPerms, "mod_sig_subir")
}

/** Líder de área: ve solo las carpetas de su área en el SIG. Quien ya tiene el SIG completo no lo necesita. */
export function canSeeSigLider(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return false
  return hasPerm(appPerms, "mod_sig_lider") && !hasPerm(appPerms, "mod_sig") && !hasPerm(appPerms, "mod_sig_subir")
}

// ── Herramientas de usuario ────────────────────────────────────────────────────

export function hasUserTool(userTools: string[] | undefined, key: string): boolean {
  return userTools?.includes(key) === true
}

/**
 * Puede registrar tareas si tiene tool_task_submit_dev.
 */
export function canSubmitDevTasks(userTools: string[]): boolean {
  return userTools.includes("tool_task_submit_dev")
}

/**
 * Puede gestionar si tiene tool_task_manage_dev.
 */
export function canManageDevTasks(userTools: string[]): boolean {
  return userTools.includes("tool_task_manage_dev")
}

/**
 * Puede co-gestionar si es co_gestor en al menos un equipo.
 * Se determina verificando los miembros del equipo que retorna el backend.
 */
export function isCoGestor(members: Array<{ user_id: number; role: string }>, userId: number): boolean {
  return members.some((m) => m.user_id === userId && m.role === "co_gestor")
}

export function canSeeLibertadora(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_libertadora")
}

// Archivado 2026-11-12: el módulo viejo de PQR (Zymo Ally · Tickets) sale del menú
// mientras se construye la mesa de ayuda por áreas. Solo el admin entra por URL para
// consultar el archivo; mod_tickets ya no abre la pantalla.
export function canSeeTickets(role: string, _appPerms?: string[]): boolean {
  return role === "admin"
}

export function canConfigTickets(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_tickets_config")
}

/** Vista gerencial de tickets — ve TODOS los tickets (no solo los propios) con su score, estilo OP.GG. */
export function canSeeTicketsGerencia(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_tickets_gerencia")
}

// ── Central de tickets (casos que radican los clientes en la app de autogestión) ──
// Dos niveles, siempre por permiso. El backend (zymoally-backend) aplica lo mismo.

/** Dirección de la central: ve todos los casos, asume, asigna, clasifica y cierra. */
export function canSeeTicketsCentral(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_tickets_central")
}

/** Líder de operaciones: solo los casos asignados a su correo; responde y los marca en análisis o resueltos. */
export function canLeadTicketsCentral(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return false
  return hasPerm(appPerms, "mod_tickets_central_lider") && !hasPerm(appPerms, "mod_tickets_central")
}

export type NivelCentralTickets = "director" | "lider"

/** Nivel de la persona en la Central de tickets, o null si no entra. Con los dos permisos gana dirección. */
export function nivelTicketsCentral(role: string, appPerms?: string[]): NivelCentralTickets | null {
  if (canSeeTicketsCentral(role, appPerms)) return "director"
  if (canLeadTicketsCentral(role, appPerms)) return "lider"
  return null
}

export function canSeeSAC(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_sac")
}

export function canConfigSAC(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_sac_config")
}

export function canSeeTyC(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_tc")
}

export function canEditTyC(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_tc_editar")
}

export function canSeeTyCSensible(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_tc_sensible")
}

export function canImportTyC(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_tc_importar")
}

export function canConfigTyC(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return canEditTyC(role, appPerms) || canSeeTyCSensible(role, appPerms)
}

// Independiente de mod_tc — un líder de área puede no tener acceso al resto de T&C.
export function canUseAgenda(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_tc_agenda")
}

// Permiso adicional sobre T&C completo — a diferencia de mod_tc_agenda (líderes,
// independiente de T&C), este solo tiene sentido para coordinador con T&C completo.
export function canUseCapCoordinador(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_tc_cap_coordinador")
}

// Independiente de mod_tc — mismo patrón que mod_tc_agenda: el líder evalúa a
// su gente sin necesitar acceso al resto de T&C.
export function canUseEvaluacionesDesempeno(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_tc_evaluaciones")
}

// Independiente de mod_tc — mismo patrón que mod_tc_agenda: el jefe aprueba
// permisos/novedades de su gente a cargo sin necesitar acceso al resto de T&C.
export function canUseAprobaciones(role: string, appPerms?: string[]): boolean {
  if (role === "admin") return true
  return hasPerm(appPerms, "mod_tc_aprobaciones")
}

// Reportes de Desarrollo — módulo exclusivo de admin (decisión definitiva,
// 2026-07-24). El backend también lo exige (sig-backend/routers/reportes-desarrollo.ts).
export function canSeeReportesDesarrollo(role: string, _appPerms?: string[]): boolean {
  return role === "admin"
}

export function canWriteReportesDesarrollo(role: string, _appPerms?: string[]): boolean {
  return role === "admin"
}

export function canSeeMantenimiento(
  role: string,
  appPerms?: string[]
): boolean {
  if (role === "admin") return true
  if (role === "auxiliar_mantenimiento") return true
  return hasPerm(appPerms, "mod_mantenimiento")
}

/** Rutas /mantenimiento/* — equipo de mantenimiento o hub administrativo (OC). */
export function canAccessMantenimiento(
  role: string,
  area?: string | null,
  appPerms?: string[],
): boolean {
  return canSeeMantenimiento(role, appPerms) || canSeeOC(role, area, appPerms)
}

export function canManageMantenimiento(
  role: string,
  appPerms?: string[]
): boolean {
  if (role === "auxiliar_mantenimiento") return false
  if (role === "admin") return true
  if (hasPerm(appPerms, "mod_mantenimiento")) return true
  return false
}

/** Acciones de campo: en camino, evidencia, OC desde celular. */
export function canOperateMantenimientoCampo(
  role: string,
  appPerms?: string[],
): boolean {
  if (role === "auxiliar_mantenimiento") return true
  return canManageMantenimiento(role, appPerms)
}

/** Solo admin puede ver todos — auxiliar ve los suyos */
export function canSeeAllMantenimientos(role: string): boolean {
  return role === "admin"
}
