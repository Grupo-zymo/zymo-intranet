-- CreateTable
CREATE TABLE "PushDispositivo" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "version" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vistoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushDispositivo_token_key" ON "PushDispositivo"("token");

-- CreateIndex
CREATE INDEX "PushDispositivo_email_idx" ON "PushDispositivo"("email");

-- CreateIndex
CREATE INDEX "PushDispositivo_userId_idx" ON "PushDispositivo"("userId");
