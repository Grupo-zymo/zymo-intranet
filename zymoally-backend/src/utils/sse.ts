// Parser de Server-Sent Events por líneas. Recibe texto en trozos arbitrarios
// (un trozo puede cortar una línea o un bloque por la mitad) y entrega un
// bloque por cada línea vacía. Los comentarios (": ping") se ignoran.

export interface BloqueSse {
  id?: string
  event: string
  data: string
}

export function crearParserSse(onBloque: (bloque: BloqueSse) => void) {
  let resto = ""
  let id: string | undefined
  let event = ""
  let datos: string[] = []

  function cerrarBloque(): void {
    if (datos.length > 0 || event) onBloque({ id, event: event || "message", data: datos.join("\n") })
    id = undefined
    event = ""
    datos = []
  }

  function linea(texto: string): void {
    if (texto === "") return cerrarBloque()
    if (texto.startsWith(":")) return
    const i = texto.indexOf(":")
    const campo = i === -1 ? texto : texto.slice(0, i)
    let valor = i === -1 ? "" : texto.slice(i + 1)
    if (valor.startsWith(" ")) valor = valor.slice(1)
    if (campo === "id") id = valor
    else if (campo === "event") event = valor
    else if (campo === "data") datos.push(valor)
    // "retry" y campos desconocidos: se ignoran
  }

  return {
    push(trozo: string): void {
      resto += trozo
      let corte: number
      // Acepta \n, \r\n y \r como fin de línea.
      while ((corte = resto.search(/\r\n|\n|\r/)) !== -1) {
        // Un \r al final del trozo puede ser la mitad de un \r\n: esperar al siguiente.
        if (resto[corte] === "\r" && corte === resto.length - 1) return
        const texto = resto.slice(0, corte)
        resto = resto.slice(resto.startsWith("\r\n", corte) ? corte + 2 : corte + 1)
        linea(texto)
      }
    },
  }
}
