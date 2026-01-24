-- Migration: Add B2B SaaS Models
-- Companies, Subscriptions, Feature Flags, Enhanced Audit Logs

-- CreateTable: companies
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regon" TEXT,
    "krs" TEXT,
    "addressStreet" TEXT,
    "addressCity" TEXT,
    "addressPostalCode" TEXT,
    "addressCountry" TEXT NOT NULL DEFAULT 'PL',
    "vatStatus" TEXT,
    "stripeCustomerId" TEXT,
    "trialUsedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable: company_members
CREATE TABLE "company_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "invitedBy" TEXT,
    "invitedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "invitationToken" TEXT,
    "invitationExpires" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: company_secrets
CREATE TABLE "company_secrets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "secretType" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "encryptionKeyId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "company_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: subscriptions
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stripe_webhook_events
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: feature_usage
CREATE TABLE "feature_usage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "currentUsage" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_usage_pkey" PRIMARY KEY ("id")
);

-- Add new columns to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "baselinkerToken" TEXT;

-- Add new columns to exports
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

-- Add new columns to audit_logs
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "severity" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "targetType" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "targetId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "ip" TEXT;

-- CreateIndexes: companies
CREATE UNIQUE INDEX "companies_nip_key" ON "companies"("nip");
CREATE UNIQUE INDEX "companies_stripeCustomerId_key" ON "companies"("stripeCustomerId");
CREATE INDEX "companies_nip_idx" ON "companies"("nip");
CREATE INDEX "companies_stripeCustomerId_idx" ON "companies"("stripeCustomerId");
CREATE INDEX "companies_deletedAt_idx" ON "companies"("deletedAt");

-- CreateIndexes: company_members
CREATE UNIQUE INDEX "company_members_companyId_userId_key" ON "company_members"("companyId", "userId");
CREATE UNIQUE INDEX "company_members_invitationToken_key" ON "company_members"("invitationToken");
CREATE INDEX "company_members_companyId_idx" ON "company_members"("companyId");
CREATE INDEX "company_members_userId_idx" ON "company_members"("userId");
CREATE INDEX "company_members_invitationToken_idx" ON "company_members"("invitationToken");

-- CreateIndexes: company_secrets
CREATE UNIQUE INDEX "company_secrets_companyId_secretType_key" ON "company_secrets"("companyId", "secretType");
CREATE INDEX "company_secrets_companyId_idx" ON "company_secrets"("companyId");

-- CreateIndexes: subscriptions
CREATE UNIQUE INDEX "subscriptions_companyId_key" ON "subscriptions"("companyId");
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");
CREATE INDEX "subscriptions_stripeSubscriptionId_idx" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndexes: stripe_webhook_events
CREATE UNIQUE INDEX "stripe_webhook_events_stripeEventId_key" ON "stripe_webhook_events"("stripeEventId");
CREATE INDEX "stripe_webhook_events_stripeEventId_idx" ON "stripe_webhook_events"("stripeEventId");
CREATE INDEX "stripe_webhook_events_status_receivedAt_idx" ON "stripe_webhook_events"("status", "receivedAt");

-- CreateIndexes: feature_usage
CREATE UNIQUE INDEX "feature_usage_companyId_featureId_periodStart_key" ON "feature_usage"("companyId", "featureId", "periodStart");
CREATE INDEX "feature_usage_companyId_idx" ON "feature_usage"("companyId");
CREATE INDEX "feature_usage_companyId_featureId_idx" ON "feature_usage"("companyId", "featureId");

-- CreateIndexes: exports (new)
CREATE INDEX "exports_companyId_idx" ON "exports"("companyId");

-- CreateIndexes: audit_logs (new)
CREATE INDEX "audit_logs_companyId_idx" ON "audit_logs"("companyId");
CREATE INDEX "audit_logs_category_idx" ON "audit_logs"("category");
CREATE INDEX "audit_logs_severity_idx" ON "audit_logs"("severity");

-- AddForeignKeys
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_secrets" ADD CONSTRAINT "company_secrets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exports" ADD CONSTRAINT "exports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
