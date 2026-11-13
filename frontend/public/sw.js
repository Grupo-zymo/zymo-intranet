// Service Worker mínimo — solo activa el trigger de instalación PWA.
// No implementa cache offline. Las solicitudes siempre van a la red.
self.addEventListener("install", () => {
  self.skipWaiting()
})
self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim())
})
self.addEventListener("fetch", (event) => {
  // No interceptar navegaciones — el browser las maneja directamente.
  // Interceptarlas con fetch() causa net::ERR_FAILED en algunas rutas SPA.
  if (event.request.mode === "navigate") return
  event.respondWith(fetch(event.request))
})

// ── Mesa de ayuda: notificaciones del teléfono (Web Push) ──
// El servidor manda { titulo, texto, url, etiqueta } (zymoally-backend/src/services/mesaPush.ts).
self.addEventListener("push", (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { /* cuerpo vacío o ilegible: se muestra el aviso genérico */ }
  event.waitUntil(
    self.registration.showNotification(d.titulo || "Mesa de ayuda", {
      body: d.texto || "Tienes un aviso nuevo.",
      tag: d.etiqueta, // un aviso nuevo del mismo ticket reemplaza al anterior
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      data: { url: d.url || "/mesa-ayuda" },
    }),
  )
})

// Al tocar la notificación: abre el ticket en una ventana de la intranet ya abierta, o en una nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/mesa-ayuda"
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => "navigate" in v)
      if (abierta) return abierta.navigate(url).then((v) => (v || abierta).focus())
      return clients.openWindow(url)
    }),
  )
})
