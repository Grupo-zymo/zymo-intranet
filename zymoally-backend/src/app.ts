import "dotenv/config"
import "./utils/asyncErrors" // ANTES de montar rutas: un handler async que lanza no debe tumbar el proceso
import express, { Request, Response, NextFunction } from "express"
import cors from "cors"
import path from "path"
import { env } from "./config/env"
import { corsOrigin } from "./config/cors"
import { startReminderCron } from "./cron"
import { authenticate, requireCentralAccess, requireSacAccess, requireTicketsAccess } from "./middleware/auth"
import pqrRouter from "./routers/tickets/pqr"
import pqrConfigRouter from "./routers/tickets/pqrConfig"
import pqrDashboardRouter from "./routers/tickets/pqrDashboard"
import pqrAlertasRouter from "./routers/tickets/pqrAlertas"
import surveysRouter from "./routers/sac/surveys"
import experienceRouter from "./routers/sac/experience"
import visitsRouter from "./routers/sac/visits"
import sacDashboardRouter from "./routers/sac/sacDashboard"
import sacAlertasRouter from "./routers/sac/sacAlertas"
import sacConfigRouter from "./routers/sac/sacConfig"
import { ticketsExportRouter, sacExportRouter } from "./routers/export"
import centralRouter from "./routers/central"
import mesaTicketsRouter from "./routers/mesa/tickets"
import mesaConfigRouter from "./routers/mesa/config"
import mesaAvisosRouter from "./routers/mesa/avisos"
import { requireMesaAccess } from "./middleware/mesa"
import publicSurveyRouter from "./routers/public/survey"
import publicShortLinkRouter from "./routers/public/shortlink"

const app = express()

// --- Middleware ---
app.use(
  cors({
    origin: corsOrigin(env.CORS_ORIGIN),
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
    exposedHeaders: ["Content-Disposition"],
  })
)
app.use(express.json())

// --- Static uploads ---
// Las evidencias de la mesa de ayuda solo se descargan con sesión (GET /api/mesa/evidencias/:id)
app.use("/uploads/mesa", (_req: Request, res: Response) => {
  res.status(404).end()
})
app.use("/uploads", express.static(path.resolve(env.UPLOAD_DIR)))

// --- Health check ---
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "zymoally-backend" })
})

// --- Encuesta pública (magic-link, sin login — cliente final) ---
app.use("/public/survey", publicSurveyRouter)

// --- Links cortos (ej. "Enviar encuesta") — redirect público, sin login ---
app.use("/s", publicShortLinkRouter)

// --- Auth ---
app.use("/api", authenticate)

// --- Tickets (dominio PQR) ---
app.use("/api/tickets/pqr", requireTicketsAccess, pqrRouter)
app.use("/api/tickets/config", requireTicketsAccess, pqrConfigRouter)
app.use("/api/tickets/dashboard", requireTicketsAccess, pqrDashboardRouter)
app.use("/api/tickets/alertas", requireTicketsAccess, pqrAlertasRouter)
app.use("/api/tickets/export", requireTicketsAccess, ticketsExportRouter)

// --- SAC (dominio Servicio al Cliente) ---
app.use("/api/sac/surveys", requireSacAccess, surveysRouter)
app.use("/api/sac/experience", requireSacAccess, experienceRouter)
app.use("/api/sac/visits", requireSacAccess, visitsRouter)
app.use("/api/sac/dashboard", requireSacAccess, sacDashboardRouter)
app.use("/api/sac/alertas", requireSacAccess, sacAlertasRouter)
app.use("/api/sac/config", requireSacAccess, sacConfigRouter)
app.use("/api/sac/export", requireSacAccess, sacExportRouter)

// --- Central de tickets (casos que radican los clientes en la app de autogestión) ---
app.use("/api/central-tickets", requireCentralAccess, centralRouter)

// --- Mesa de ayuda interna por áreas (toda cuenta autenticada; las reglas van por ticket) ---
app.use("/api/mesa", requireMesaAccess, mesaConfigRouter, mesaAvisosRouter, mesaTicketsRouter)

// --- 404 handler ---
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" })
})

// --- Error handler ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: "Internal server error" })
})

// --- Start server ---
if (require.main === module) {
  app.listen(env.PORT, () => {
    console.log(`zymoally-backend listening on port ${env.PORT}`)
  })
  startReminderCron()
}

export default app
