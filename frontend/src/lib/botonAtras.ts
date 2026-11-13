// Botón atrás de Android (APK Capacitor): decisión pura + seguimiento de "operación en curso" + avisos propios en DOM.
// Mismo módulo en la intranet y en autogestión; solo cambia ESTILO. Sin dependencias: lo ejecuta también el autotest con node.

const ESTILO = { rojo: "#C11A3C", fuente: '"DM Sans", system-ui, sans-serif' }

export type AccionAtras = "cerrar-dialogo" | "quedarse" | "ir-inicio" | "confirmar-salida"

export function decidir(e: { estaEnInicio: boolean; hayDialogo: boolean; hayOperacion: boolean }): AccionAtras {
  if (e.hayDialogo) return "cerrar-dialogo"
  if (e.hayOperacion) return "quedarse"
  return e.estaEnInicio ? "confirmar-salida" : "ir-inicio"
}

// ---- Escrituras en vuelo (POST/PUT/PATCH/DELETE por XHR o fetch) ----
const VENCE_MS = 60_000 // una petición colgada más de un minuto ya no bloquea el atrás
const enVuelo = new Set<number>()
let siguiente = 0
let instalado = false

const esEscritura = (metodo: unknown) => /^(POST|PUT|PATCH|DELETE)$/i.test(String(metodo ?? "GET"))

function registrar(): () => void {
  const id = ++siguiente
  enVuelo.add(id)
  const t = setTimeout(() => enVuelo.delete(id), VENCE_MS)
  return () => {
    clearTimeout(t)
    enVuelo.delete(id)
  }
}

export function escriturasEnVuelo(): number {
  return enVuelo.size
}

// ---- Formularios con cambios sin enviar ----
const camposSucios = new Set<HTMLElement>()

const BUSQUEDA = /buscar|search|filtr/i

function esFiltro(el: HTMLElement): boolean {
  const i = el as HTMLInputElement
  return (
    i.type === "search" ||
    el.getAttribute("role") === "searchbox" ||
    BUSQUEDA.test(`${i.name ?? ""} ${el.id} ${i.placeholder ?? ""} ${el.getAttribute("aria-label") ?? ""}`)
  )
}

function conCambios(el: HTMLElement): boolean {
  if (!el.isConnected) return false
  const c = el as HTMLInputElement
  if (c.disabled || c.readOnly) return false
  if (c.type === "checkbox" || c.type === "radio" || c.type === "range") return true // solo se marcan dentro de un form
  return (c.value ?? "").trim() !== ""
}

export function hayFormularioSucio(): boolean {
  for (const el of [...camposSucios]) {
    if (!el.isConnected) camposSucios.delete(el)
  }
  for (const el of camposSucios) if (conCambios(el)) return true
  return false
}

export function limpiarFormularios(): void {
  camposSucios.clear()
}

function alEscribir(ev: Event) {
  const el = ev.target
  if (!(el instanceof HTMLElement) || !ev.isTrusted) return
  const esCampo = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
  if (!esCampo || esFiltro(el)) return
  if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "button" || el.type === "submit")) return
  const enForm = el.closest("form") !== null
  // Fuera de un <form> solo cuenta escribir texto (p. ej. redactar un mensaje); casillas y listas suelen ser filtros.
  const esTexto = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|email|tel|url|number|password)$/.test(el.type))
  if (!enForm && !esTexto) return
  camposSucios.add(el)
}

function alEnviar(ev: Event) {
  const f = ev.target
  if (!(f instanceof HTMLFormElement)) return
  for (const el of [...camposSucios]) if (f.contains(el)) camposSucios.delete(el)
}

export function hayOperacion(estaEnInicio: boolean): boolean {
  // En el inicio solo una escritura en vuelo cuenta: un correo a medio escribir en el login no debe impedir salir.
  return escriturasEnVuelo() > 0 || (!estaEnInicio && hayFormularioSucio())
}

/** Idempotente: parcha XHR y fetch y escucha input/change/submit en captura. Llamar una vez al arrancar. */
export function instalarSeguimiento(): void {
  if (instalado || typeof window === "undefined") return
  instalado = true

  const abrir = XMLHttpRequest.prototype.open
  const enviar = XMLHttpRequest.prototype.send
  const metodos = new WeakMap<XMLHttpRequest, string>()
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, metodo: string, ...resto: unknown[]) {
    metodos.set(this, metodo)
    return (abrir as (...a: unknown[]) => void).call(this, metodo, ...resto)
  } as typeof XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: [Document | XMLHttpRequestBodyInit | null | undefined]) {
    if (esEscritura(metodos.get(this))) {
      const fin = registrar()
      this.addEventListener("loadend", fin, { once: true })
    }
    return enviar.apply(this, args)
  }

  const original = window.fetch.bind(window)
  window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    const metodo = init?.method ?? (entrada instanceof Request ? entrada.method : "GET")
    if (!esEscritura(metodo)) return original(entrada, init)
    const fin = registrar()
    return original(entrada, init).finally(fin)
  }

  document.addEventListener("input", alEscribir, true)
  document.addEventListener("change", alEscribir, true)
  document.addEventListener("submit", alEnviar, true)
}

// ---- Diálogos abiertos ----
const DIALOGOS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], dialog[open]'

function visible(el: Element): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
}

function dialogosAbiertos(): Element[] {
  return [...document.querySelectorAll(DIALOGOS)].filter(
    (el) => !el.closest("[data-boton-atras]") && el.getAttribute("data-state") !== "closed" && visible(el),
  )
}

export function hayDialogoAbierto(): boolean {
  return dialogosAbiertos().length > 0
}

export function cerrarDialogo(): void {
  const nativo = dialogosAbiertos().find((d): d is HTMLDialogElement => d instanceof HTMLDialogElement)
  if (nativo) {
    nativo.close()
    return
  }
  const destino = document.activeElement ?? document
  destino.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }))
}

// ---- Aviso breve y diálogo de salida (DOM propio, sin librería) ----
let avisoTimer: ReturnType<typeof setTimeout> | undefined

export function mostrarAviso(texto: string): void {
  document.querySelector("[data-boton-atras=aviso]")?.remove()
  clearTimeout(avisoTimer)
  const a = document.createElement("div")
  a.setAttribute("data-boton-atras", "aviso")
  a.setAttribute("role", "status")
  a.textContent = texto
  a.style.cssText = `position:fixed;left:50%;bottom:calc(6rem + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483646;max-width:calc(100vw - 2rem);padding:.75rem 1.25rem;border-radius:9999px;background:#18181B;color:#fff;font:500 .9rem/1.2 ${ESTILO.fuente};box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:none;text-align:center`
  document.body.append(a)
  avisoTimer = setTimeout(() => a.remove(), 2000)
}

let cancelarSalida: (() => void) | null = null

/** Si el diálogo de salida está abierto lo cancela y devuelve true (el atrás dentro del diálogo = cancelar). */
export function cancelarDialogoSalida(): boolean {
  if (!cancelarSalida) return false
  cancelarSalida()
  return true
}

/** "¿Salir de la aplicación?": resuelve true solo si la persona pulsa Salir. */
export function confirmarSalida(): Promise<boolean> {
  if (cancelarSalida) return Promise.resolve(false)
  return new Promise((resolver) => {
    const previo = document.activeElement as HTMLElement | null
    const fondo = document.createElement("div")
    fondo.setAttribute("data-boton-atras", "salir")
    fondo.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:1.5rem;background:rgba(0,0,0,.5)"
    const caja = document.createElement("div")
    caja.setAttribute("role", "alertdialog")
    caja.setAttribute("aria-modal", "true")
    caja.setAttribute("aria-labelledby", "ba-titulo")
    caja.setAttribute("aria-describedby", "ba-detalle")
    caja.style.cssText = `width:100%;max-width:20rem;border-radius:1.25rem;background:#fff;color:#18181B;padding:1.5rem;font-family:${ESTILO.fuente};box-shadow:0 20px 50px rgba(0,0,0,.35)`
    caja.innerHTML =
      '<h2 id="ba-titulo" style="margin:0;font-size:1.2rem;font-weight:700">¿Salir de la aplicación?</h2>' +
      '<p id="ba-detalle" style="margin:.5rem 0 1.25rem;font-size:.95rem;color:#52525B">Se cerrará la aplicación en tu celular.</p>' +
      '<div style="display:flex;gap:.75rem;justify-content:flex-end"></div>'
    const base = `min-height:2.75rem;padding:0 1.25rem;border-radius:9999px;font:600 .95rem ${ESTILO.fuente};cursor:pointer;`
    const cancelar = document.createElement("button")
    cancelar.type = "button"
    cancelar.textContent = "Cancelar"
    cancelar.style.cssText = base + "border:1px solid #D4D4D8;background:#fff;color:#18181B"
    const salir = document.createElement("button")
    salir.type = "button"
    salir.textContent = "Salir"
    salir.style.cssText = base + `border:0;background:${ESTILO.rojo};color:#fff`
    caja.lastElementChild!.append(cancelar, salir)
    fondo.append(caja)

    const cerrar = (r: boolean) => {
      cancelarSalida = null
      fondo.remove()
      previo?.focus?.()
      resolver(r)
    }
    cancelarSalida = () => cerrar(false)
    cancelar.onclick = () => cerrar(false)
    salir.onclick = () => cerrar(true)
    fondo.addEventListener("click", (e) => {
      if (e.target === fondo) cerrar(false)
    })
    fondo.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        cerrar(false)
      } else if (e.key === "Tab") {
        // el foco no sale del diálogo
        e.preventDefault()
        ;(document.activeElement === cancelar ? salir : cancelar).focus()
      }
    })
    document.body.append(fondo)
    cancelar.focus()
  })
}
