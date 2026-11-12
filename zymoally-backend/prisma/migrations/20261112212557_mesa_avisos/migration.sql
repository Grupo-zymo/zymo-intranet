-- AlterTable
ALTER TABLE "MesaTicket" ADD COLUMN     "avisoCierreEn" TIMESTAMP(3),
ADD COLUMN     "avisoRespuestaEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MesaAviso" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "leidoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MesaAviso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MesaAviso_userId_leidoEn_idx" ON "MesaAviso"("userId", "leidoEn");

-- CreateIndex
CREATE INDEX "MesaAviso_ticketId_idx" ON "MesaAviso"("ticketId");

-- AddForeignKey
ALTER TABLE "MesaAviso" ADD CONSTRAINT "MesaAviso_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MesaTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
