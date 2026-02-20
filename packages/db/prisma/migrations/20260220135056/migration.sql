-- DropIndex
DROP INDEX "Position_id_userId_key";

-- CreateIndex
CREATE INDEX "Position_userId_idx" ON "Position"("userId");
