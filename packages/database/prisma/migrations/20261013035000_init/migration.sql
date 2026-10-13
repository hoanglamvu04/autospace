-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');
CREATE TYPE "TargetType" AS ENUM ('FACEBOOK_PAGE', 'FACEBOOK_GROUP', 'WEBSITE', 'OTHER');
CREATE TYPE "TargetMode" AS ENUM ('API', 'MANUAL_CONFIRMATION');
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'PREPARED', 'COMPLETED', 'FAILED');
CREATE TYPE "PublishJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY_FOR_PROVIDER', 'AWAITING_CONFIRMATION', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentVariant" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "mediaUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DistributionTarget" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "externalId" TEXT,
  "type" "TargetType" NOT NULL,
  "mode" "TargetMode" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DistributionTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignRun" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishJob" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "contentVariantId" TEXT,
  "bullJobId" TEXT,
  "status" "PublishJobStatus" NOT NULL DEFAULT 'QUEUED',
  "resultUrl" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishJob_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");
CREATE INDEX "ContentVariant_campaignId_idx" ON "ContentVariant"("campaignId");
CREATE INDEX "DistributionTarget_campaignId_active_idx" ON "DistributionTarget"("campaignId", "active");
CREATE INDEX "CampaignRun_campaignId_createdAt_idx" ON "CampaignRun"("campaignId", "createdAt");
CREATE INDEX "PublishJob_runId_status_idx" ON "PublishJob"("runId", "status");
CREATE INDEX "PublishJob_targetId_idx" ON "PublishJob"("targetId");
CREATE INDEX "PublishJob_contentVariantId_idx" ON "PublishJob"("contentVariantId");

-- Foreign keys
ALTER TABLE "ContentVariant" ADD CONSTRAINT "ContentVariant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DistributionTarget" ADD CONSTRAINT "DistributionTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRun" ADD CONSTRAINT "CampaignRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CampaignRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "DistributionTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_contentVariantId_fkey" FOREIGN KEY ("contentVariantId") REFERENCES "ContentVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
