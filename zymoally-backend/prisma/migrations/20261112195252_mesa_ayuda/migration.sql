-- CreateTable
CREATE TABLE "MesaArea" (
    "areaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "recibeTickets" BOOLEAN NOT NULL DEFAULT true,
    "esSac" BOOLEAN NOT NULL DEFAULT false,
    "metaPrimeraRespuestaH" INTEGER,
    "metaCierreH" INTEGER,
    "metasActualizadasPor" TEXT,
    "metasActualizadasEn" TIMESTAMP(3),

    CONSTRAINT "MesaArea_pkey" PRIMARY KEY ("areaId")
);

-- CreateTable
CREATE TABLE "MesaCategoria" (
    "id" SERIAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MesaCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesaTicket" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "areaId" INTEGER NOT NULL,
    "areaNombre" TEXT NOT NULL,
    "categoriaId" INTEGER,
    "asunto" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierto',
    "prioridad" TEXT,
    "venceEn" TIMESTAMP(3),
    "creadorId" INTEGER NOT NULL,
    "creadorNombre" TEXT NOT NULL,
    "creadorEmail" TEXT NOT NULL,
    "creadorArea" TEXT,
    "creadorSede" TEXT,
    "radicadoOrigen" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "primeraRespuestaEn" TIMESTAMP(3),
    "cerradoEn" TIMESTAMP(3),
    "eliminadoEn" TIMESTAMP(3),
    "eliminadoPorId" INTEGER,
    "eliminadoPorNombre" TEXT,
    "motivoEliminacion" TEXT,

    CONSTRAINT "MesaTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesaResponsable" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "area" TEXT,
    "asignadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asignadoPor" TEXT,

    CONSTRAINT "MesaResponsable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesaMensaje" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "autorNombre" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "interno" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MesaMensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesaEvidencia" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "mensajeId" INTEGER,
    "nombreArchivo" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "subidoPorId" INTEGER NOT NULL,
    "subidoPorNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MesaEvidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesaHistorial" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "actorNombre" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MesaHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MesaArea_prefijo_key" ON "MesaArea"("prefijo");

-- CreateIndex
CREATE UNIQUE INDEX "MesaCategoria_areaId_nombre_key" ON "MesaCategoria"("areaId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "MesaTicket_codigo_key" ON "MesaTicket"("codigo");

-- CreateIndex
CREATE INDEX "MesaTicket_areaId_estado_idx" ON "MesaTicket"("areaId", "estado");

-- CreateIndex
CREATE INDEX "MesaTicket_creadorId_idx" ON "MesaTicket"("creadorId");

-- CreateIndex
CREATE INDEX "MesaTicket_eliminadoEn_idx" ON "MesaTicket"("eliminadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "MesaTicket_prefijo_anio_numero_key" ON "MesaTicket"("prefijo", "anio", "numero");

-- CreateIndex
CREATE INDEX "MesaResponsable_userId_idx" ON "MesaResponsable"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MesaResponsable_ticketId_userId_key" ON "MesaResponsable"("ticketId", "userId");

-- CreateIndex
CREATE INDEX "MesaMensaje_ticketId_idx" ON "MesaMensaje"("ticketId");

-- CreateIndex
CREATE INDEX "MesaEvidencia_ticketId_idx" ON "MesaEvidencia"("ticketId");

-- CreateIndex
CREATE INDEX "MesaHistorial_ticketId_idx" ON "MesaHistorial"("ticketId");

-- AddForeignKey
ALTER TABLE "MesaCategoria" ADD CONSTRAINT "MesaCategoria_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "MesaArea"("areaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesaTicket" ADD CONSTRAINT "MesaTicket_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "MesaArea"("areaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesaTicket" ADD CONSTRAINT "MesaTicket_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "MesaCategoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesaResponsable" ADD CONSTRAINT "MesaResponsable_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MesaTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesaMensaje" ADD CONSTRAINT "MesaMensaje_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MesaTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesaEvidencia" ADD CONSTRAINT "MesaEvidencia_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MesaTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesaEvidencia" ADD CONSTRAINT "MesaEvidencia_mensajeId_fkey" FOREIGN KEY ("mensajeId") REFERENCES "MesaMensaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesaHistorial" ADD CONSTRAINT "MesaHistorial_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MesaTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
