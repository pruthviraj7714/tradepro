-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSE');

-- CreateEnum
CREATE TYPE "PositionType" AS ENUM ('LONG', 'SHORT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "usdBalance" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "leverage" INTEGER NOT NULL,
    "margin" INTEGER NOT NULL,
    "slippage" INTEGER NOT NULL,
    "type" "PositionType" NOT NULL,
    "userId" TEXT NOT NULL,
    "openPrice" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "closePrice" INTEGER,
    "pnl" DOUBLE PRECISION,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
