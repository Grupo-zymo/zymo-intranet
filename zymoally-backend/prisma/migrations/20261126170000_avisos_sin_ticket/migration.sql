-- La campana deja de ser solo de la mesa de ayuda: un aviso puede no ser de un ticket (los del SIG al líder de
-- área) y traer la ruta de la intranet a la que lleva. Solo agrega una columna opcional y vuelve opcional otra:
-- no borra ni reescribe ninguna fila existente.

-- AlterTable
ALTER TABLE "MesaAviso" ADD COLUMN     "url" TEXT,
ALTER COLUMN "ticketId" DROP NOT NULL;
