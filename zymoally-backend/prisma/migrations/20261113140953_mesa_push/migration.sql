-- CreateTable
CREATE TABLE "MesaPushSub" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MesaPushSub_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MesaPushSub_endpoint_key" ON "MesaPushSub"("endpoint");

-- CreateIndex
CREATE INDEX "MesaPushSub_userId_idx" ON "MesaPushSub"("userId");
