/**
 * Self-check de los avisos al líder de área (campana de la intranet): qué texto sale, a quién le llega y a dónde lleva.
 * Sin BD ni red: las dependencias van inyectadas. Corre encadenado en: npm run selfcheck
 */
import assert from "node:assert/strict"
import { crearAvisador, crearAvisoArea, repartir, textoAviso, urlProcedimiento, type AvisoCampana } from "../src/services/avisosLider"

async function main(): Promise<void> {
  // ── 1. Texto: quién hizo qué, sobre qué y de cuál procedimiento ──
  const version = { decision: "APROBADO", tipo: "version", codigo: "PRC-000-ABC", quien: "Pepito Pérez", nombre: "3" } as const
  assert.equal(textoAviso(version, true), "Pepito Pérez aprobó tu versión 3 del PRC-000-ABC", "a quien la subió se le dice «tu»")
  assert.equal(textoAviso(version, false), "Pepito Pérez aprobó la versión 3 del PRC-000-ABC", "a los demás líderes del área, «la»")
  assert.equal(
    textoAviso({ ...version, decision: "RECHAZADO", motivo: "  Falta la\n firma  " }, true),
    "Pepito Pérez rechazó tu versión 3 del PRC-000-ABC: Falta la firma",
    "el rechazo lleva el motivo, en una sola línea",
  )
  assert.equal(textoAviso({ ...version, nombre: null }, true), "Pepito Pérez aprobó tu versión del PRC-000-ABC", "sin número de versión se omite")
  assert.equal(textoAviso({ ...version, nombre: "   " }, false), "Pepito Pérez aprobó la versión del PRC-000-ABC")
  // Versión que un gerente o admin subió ya aprobada: se avisa sin nombrar a nadie
  assert.equal(textoAviso({ ...version, quien: null }, false), "La versión 3 del PRC-000-ABC fue aprobada")
  // Documentos del procedimiento
  const formato = { decision: "APROBADO", tipo: "formato", codigo: "PRC-000-ABC", quien: "Ana", nombre: "Lista de chequeo" } as const
  assert.equal(textoAviso(formato, true), "Ana aprobó tu formato «Lista de chequeo» del PRC-000-ABC")
  assert.equal(textoAviso({ ...formato, tipo: "instructivo", decision: "RECHAZADO", motivo: "Está desactualizado" }, false), "Ana rechazó el instructivo «Lista de chequeo» del PRC-000-ABC: Está desactualizado")
  assert.equal(textoAviso({ ...formato, tipo: "anexo" }, false), "Ana aprobó el anexo «Lista de chequeo» del PRC-000-ABC")
  assert.equal(textoAviso({ ...formato, quien: null }, false), "El formato «Lista de chequeo» del PRC-000-ABC fue aprobado", "el participio concuerda con el documento")
  // Un motivo larguísimo no desborda la campana (tope de 300 caracteres)
  const largo = textoAviso({ ...version, decision: "RECHAZADO", motivo: "x".repeat(1000) }, true)
  assert.equal(largo.length, 300)
  assert.ok(largo.endsWith("…"), "si se corta, se nota")
  // El corte no parte un emoji por la mitad (medio emoji es texto inválido y la campana rechazaría el aviso)
  const hastaElMotivo = textoAviso({ ...version, decision: "RECHAZADO", motivo: "a" }, true).length - 1
  const conEmoji = textoAviso({ ...version, decision: "RECHAZADO", motivo: "x".repeat(298 - hastaElMotivo) + "😀" + "y".repeat(50) }, true)
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(conEmoji), "sin medio emoji suelto")
  assert.ok(conEmoji.length <= 300 && conEmoji.endsWith("…"))

  // ── 2. A quién: los líderes del área, nunca quien hizo la acción ──
  assert.deepEqual(repartir([5, 6, 7, 6], 7, 5), { autor: [5], otros: [6] }, "sin duplicados y sin el actor")
  assert.deepEqual(repartir([5, 6], 9, 8), { autor: [], otros: [5, 6] }, "quien la subió no es líder de esa área: nadie recibe «tu»")
  assert.deepEqual(repartir([5], 5, 5), { autor: [], otros: [] }, "nadie se avisa a sí mismo")
  assert.deepEqual(repartir([], 1, 2), { autor: [], otros: [] })

  // ── 3. A dónde lleva: el procedimiento en el SIG del líder ──
  assert.equal(urlProcedimiento({ id: 12, codigo: "PRC-000-ABC", titulo: "Gestión de compras" }), "/sig-area?proc=12&codigo=PRC-000-ABC&titulo=Gesti%C3%B3n+de+compras")
  assert.equal(urlProcedimiento({ id: 12, codigo: "PRC-000-ABC", titulo: "ó".repeat(200) }), "/sig-area?proc=12&codigo=PRC-000-ABC", "la campana acepta rutas de hasta 300 caracteres: un título largo se deja fuera")
  assert.equal(urlProcedimiento({ id: 12, codigo: "ó".repeat(200), titulo: "t" }), "/sig-area?proc=12")

  // ── 4. Flujo completo con dependencias falsas ──
  const pedidas: number[] = []
  const enviados: AvisoCampana[] = []
  const avisar = crearAvisador({
    procedimiento: async (id) =>
      id === 12 ? { id: 12, codigo: "PRC-000-ABC", titulo: "Compras", intranetAreaId: 4 }
        : id === 13 ? { id: 13, codigo: "PRC-SIN-AREA", titulo: "Carpeta vieja", intranetAreaId: null }
          : null,
    lideres: async (areaId) => { pedidas.push(areaId); return [5, 6, 7] },
    enviar: async (aviso) => void enviados.push(aviso),
  })

  // Rechazo de una versión que subió el líder 5; la rechaza la cuenta 7
  await avisar({ procedimientoId: 12, decision: "RECHAZADO", tipo: "version", nombre: "3", motivo: "Falta firma", actor: { id: 7, nombre: "Pepito" }, autorId: 5 })
  assert.deepEqual(pedidas, [4], "se piden los líderes del área de la intranet enlazada a la carpeta, no otra")
  assert.deepEqual(enviados.map((e) => [e.userIds, e.texto]), [
    [[5], "Pepito rechazó tu versión 3 del PRC-000-ABC: Falta firma"],
    [[6], "Pepito rechazó la versión 3 del PRC-000-ABC: Falta firma"],
  ])
  assert.deepEqual(
    { tipo: enviados[0].tipo, titulo: enviados[0].titulo, url: enviados[0].url, etiqueta: enviados[0].etiqueta },
    { tipo: "sig_rechazado", titulo: "SIG · PRC-000-ABC", url: "/sig-area?proc=12&codigo=PRC-000-ABC&titulo=Compras", etiqueta: "sig-proc-12" },
  )

  // Subida directa de un gerente o admin (cuenta 99): un solo aviso, sin nombrar a nadie
  enviados.length = 0
  await avisar({ procedimientoId: 12, decision: "APROBADO", tipo: "version", nombre: "4", actor: { id: 99, nombre: "La Gerente" }, nombrar: false, autorId: 99 })
  assert.deepEqual(enviados.map((e) => [e.userIds, e.texto, e.tipo]), [[[5, 6, 7], "La versión 4 del PRC-000-ABC fue aprobada", "sig_aprobado"]])
  assert.ok(!JSON.stringify(enviados).includes("La Gerente"), "el nombre de quien subió no viaja")

  // Carpeta sin enlazar a un área de la intranet, o procedimiento que no existe: no hay a quién avisar
  enviados.length = 0
  pedidas.length = 0
  await avisar({ procedimientoId: 13, decision: "APROBADO", tipo: "version", actor: { id: 7, nombre: "Pepito" }, autorId: 5 })
  await avisar({ procedimientoId: 404, decision: "APROBADO", tipo: "version", actor: { id: 7, nombre: "Pepito" }, autorId: 5 })
  assert.deepEqual([pedidas, enviados], [[], []])

  // Si la intranet o la campana no responden, la aprobación no se entera: nunca lanza
  const errOriginal = console.error
  const logs: string[] = []
  console.error = (...a: unknown[]) => void logs.push(a.join(" "))
  const roto = crearAvisador({
    procedimiento: async () => ({ id: 12, codigo: "PRC-000-ABC", titulo: "Compras", intranetAreaId: 4 }),
    lideres: async () => { throw new Error("intranet caída") },
    enviar: async () => { throw new Error("no debería llegar aquí") },
  })
  await roto({ procedimientoId: 12, decision: "APROBADO", tipo: "version", actor: { id: 7, nombre: "Pepito" }, autorId: 5 })
  console.error = errOriginal
  assert.equal(logs.length, 1, "queda registrado una vez")

  // ── 5. Avisos del listado maestro: por área (no por procedimiento) ──
  const enviadosArea: AvisoCampana[] = []
  const pedidasArea: number[] = []
  const avisarArea = crearAvisoArea({
    area: async (id) => (id === 2 ? { id: 2, intranetAreaId: 24 } : id === 1 ? { id: 1, intranetAreaId: null } : null),
    lideres: async (intranetAreaId) => { pedidasArea.push(intranetAreaId); return [11, 12, 10, 11] },
    enviar: async (aviso) => void enviadosArea.push(aviso),
  })
  const base = { texto: "Pepito creó el código FR-025-GAD (Control de llaves) en el listado maestro", url: "/sig-area?listado=2", etiqueta: "sig-listado-2" }
  await avisarArea({ ...base, areaId: 2, actorId: 10 })
  assert.deepEqual(pedidasArea, [24], "se piden los líderes del área de la intranet enlazada a la carpeta")
  assert.deepEqual(enviadosArea, [{ ...base, userIds: [11, 12], tipo: "sig_listado", titulo: "SIG · Listado maestro" }], "sin repetir y sin quien hizo el cambio")
  enviadosArea.splice(0)
  await avisarArea({ ...base, areaId: 1, actorId: 10 })
  await avisarArea({ ...base, areaId: 404, actorId: 10 })
  assert.deepEqual(enviadosArea, [], "carpeta sin enlazar o inexistente: no hay a quién avisar")
  const alActor: AvisoCampana[] = []
  const soloActor = crearAvisoArea({ area: async () => ({ id: 2, intranetAreaId: 24 }), lideres: async () => [10], enviar: async (a) => void alActor.push(a) })
  await soloActor({ ...base, areaId: 2, actorId: 10 })
  assert.deepEqual(alActor, [], "si el único líder es quien hizo el cambio, nadie recibe")
  const logsArea: string[] = []
  console.error = (...a: unknown[]) => void logsArea.push(a.join(" "))
  await crearAvisoArea({ area: async () => ({ id: 2, intranetAreaId: 24 }), lideres: async () => { throw new Error("caída") }, enviar: async () => {} })({ ...base, areaId: 2, actorId: 10 })
  console.error = errOriginal
  assert.equal(logsArea.length, 1, "nunca lanza; queda registrado")

  console.log("avisosLider.selfcheck OK")
}

main().catch((e) => { console.error(e); process.exit(1) })
