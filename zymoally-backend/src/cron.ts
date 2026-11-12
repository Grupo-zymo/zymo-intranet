import cron from "node-cron"
import { runTicketReminders } from "./services/ticketReminders"
import { avisarFueraDeMeta, limpiarAvisosViejos } from "./services/mesaAvisos"

/**
 * Fase F — recordatorios de tickets sin cerrar (día 7/15/22/30). Corre una
 * vez al día, 8am hora de Bogotá. Solo alerta, nunca cierra tickets
 * automáticamente (decisión de negocio explícita, 2026-07-16).
 */
export function startReminderCron(): void {
  cron.schedule(
    "0 8 * * *",
    () => {
      limpiarAvisosViejos().catch((err) => console.error("[mesa] error limpiando avisos viejos:", err))
      runTicketReminders()
        .then((r) => console.log(`[reminders] ${r.ranAt} — ${r.checked} ticket(s) abiertos revisados, ${r.sent} recordatorio(s) enviado(s)`))
        .catch((err) => console.error("[reminders] error en cron de recordatorios:", err))
    },
    { timezone: "America/Bogota" },
  )
  console.log("[reminders] cron de recordatorios programado (0 8 * * * America/Bogota)")

  // Mesa de ayuda: tickets que pasaron la meta de su área. Cada 30 min dentro del horario laboral
  // (las metas se miden en horas laborales, así que fuera de él no cambia nada).
  cron.schedule(
    "*/30 7-19 * * *",
    () => {
      avisarFueraDeMeta()
        .then((n) => { if (n > 0) console.log(`[mesa] ${n} aviso(s) de tickets fuera de meta`) })
        .catch((err) => console.error("[mesa] error revisando metas:", err))
    },
    { timezone: "America/Bogota" },
  )
}
