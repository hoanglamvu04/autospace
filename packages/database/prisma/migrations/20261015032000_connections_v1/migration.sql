-- CreateEnum
CREATE TYPE "ConnectionProvider" AS ENUM ('FACEBOOK_PAGE', 'WEBSITE');
CREATE TYPE "ConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'EXPIRED', 'MISSING_PERMISSION', 'ERROR');
ALTER TYPE "PublishJobStatus" ADD VALUE IF NOT EXISTS 'WAITING_CONNECTION';

-- CreateTable
CREATE TABLE "ProviderConnection" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "provider" "ConnectionProvider" NOT NULL,
  "status" "ConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "externalAccountId" TEXT,
  "publicConfig" JSONB,
  "secretEncrypted" TEXT,
  "lastTestedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DistributionTarget" ADD COLUMN "connectionId" TEXT;

CREATE INDEX "ProviderConnection_provider_status_idx" ON "ProviderConnection"("provider", "status");
CREATE INDEX "DistributionTarget_connectionId_idx" ON "DistributionTarget"("connectionId");

ALTER TABLE "DistributionTarget"
ADD CONSTRAINT "DistributionTarget_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "ProviderConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
