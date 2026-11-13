export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: parseInt(process.env.PORT ?? "3005", 10),
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://zymoally:zymoallypass@zymoally-db:5432/zymoallydb",
  // FastAPI signs tokens with SECRET_KEY; JWT_SECRET is accepted as an alias.
  JWT_SECRET: process.env.JWT_SECRET ?? process.env.SECRET_KEY ?? (() => {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET (or SECRET_KEY) must be set in production");
    }
    return "change-me-same-as-fastapi";
  })(),
  INTRANET_API_URL: process.env.INTRANET_API_URL ?? "http://backend:8001",
  // Sin valor por defecto en produccion: el de desarrollo esta en el repo y abriria /api/tasks-v2 a quien lo conozca.
  INTERNAL_KEY: process.env.INTERNAL_KEY ?? (() => {
    if (process.env.NODE_ENV === "production") throw new Error("INTERNAL_KEY must be set in production");
    return "task-internal-key-dev";
  })(),
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL ?? "http://localhost:8080",
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? "./uploads",
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  // Central de tickets: API de la app de autogestión del cliente (servidor a
  // servidor). Si falta la URL o la clave, el módulo responde 503 y no llama.
  AUTOGESTION_API_URL: (process.env.AUTOGESTION_API_URL ?? "").trim().replace(/\/+$/, ""),
  AUTOGESTION_SERVICE_KEY: (process.env.AUTOGESTION_SERVICE_KEY ?? "").trim(),
  // Mesa de ayuda: notificaciones push (Web Push). Sin las dos claves VAPID el push queda apagado.
  // Generarlas una vez con `npx web-push generate-vapid-keys`; la privada es un secreto.
  VAPID_PUBLIC_KEY: (process.env.VAPID_PUBLIC_KEY ?? "").trim(),
  VAPID_PRIVATE_KEY: (process.env.VAPID_PRIVATE_KEY ?? "").trim(),
  VAPID_SUBJECT: (process.env.VAPID_SUBJECT ?? "mailto:soporte@zymointranet.com").trim(),
} as const;

export type Env = typeof env;
