import { Prisma } from "@prisma/client"
import { prisma } from "../config/prisma"

type TicketInput = Omit<Prisma.MesaTicketUncheckedCreateInput, "codigo" | "prefijo" | "anio" | "numero" | "areaNombre">

/** PREFIJO-AAAA-NNNN — el consecutivo arranca en 1 cada año y por área. */
export function formatearCodigo(prefijo: string, anio: number, numero: number): string {
  return `${prefijo}-${anio}-${String(numero).padStart(4, "0")}`
}

/**
 * Crea el ticket con su consecutivo. "Leer el máximo + crear" no es atómico bajo
 * concurrencia (ver pqrCode.ts), así que se serializa con un advisory lock de
 * Postgres por (prefijo, año): solo espera quien compite por el mismo consecutivo.
 */
export async function crearTicketConCodigo(data: TicketInput, fecha = new Date()) {
  const anio = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Bogota" }).format(fecha))
  return prisma.$transaction(async (tx) => {
    const area = await tx.mesaArea.findUnique({ where: { areaId: data.areaId } })
    if (!area || !area.recibeTickets) throw new Error(`El área ${data.areaId} no recibe tickets`)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mesa:${area.prefijo}:${anio}`}))`
    const max = await tx.mesaTicket.aggregate({ where: { prefijo: area.prefijo, anio }, _max: { numero: true } })
    const numero = (max._max.numero ?? 0) + 1
    return tx.mesaTicket.create({
      data: { ...data, areaNombre: area.nombre, prefijo: area.prefijo, anio, numero, codigo: formatearCodigo(area.prefijo, anio, numero) },
    })
  }, { maxWait: 10_000, timeout: 10_000 }) // quien espera el lock ocupa una conexión: los 2 s por defecto no alcanzan en ráfaga
}
