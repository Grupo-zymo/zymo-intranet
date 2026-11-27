-- Listado maestro de documentos (reemplaza el Excel FR-002-SIG). Solo agrega: la sigla del área (columna opcional)
-- y una tabla nueva. No borra ni reescribe ninguna fila existente.

-- AlterTable
ALTER TABLE "SigArea" ADD COLUMN     "sigla" VARCHAR(5);

-- CreateTable
CREATE TABLE "SigListadoMaestro" (
    "id" SERIAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(300) NOT NULL,
    "empresa" VARCHAR(60),
    "version" VARCHAR(20),
    "fechaCreacion" TIMESTAMP(3),
    "fechaActualizacion" TIMESTAMP(3),
    "controlCambios" TEXT,
    "anosActivo" INTEGER,
    "anosInactivo" INTEGER,
    "disposicionFinal" VARCHAR(40),
    "ubicacion" TEXT,
    "revisado" BOOLEAN NOT NULL DEFAULT false,
    "estado" VARCHAR(12) NOT NULL DEFAULT 'APROBADO',
    "historial" JSONB NOT NULL DEFAULT '[]',
    "creadoPor" TEXT,
    "editadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SigListadoMaestro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SigListadoMaestro_areaId_idx" ON "SigListadoMaestro"("areaId");

-- CreateIndex
CREATE INDEX "SigListadoMaestro_codigo_idx" ON "SigListadoMaestro"("codigo");

-- AddForeignKey
ALTER TABLE "SigListadoMaestro" ADD CONSTRAINT "SigListadoMaestro_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "SigArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

