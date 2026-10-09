-- ════════════════════════════════════════════════════════════════════════════
-- Webhooks from the dispatch delivery service (ADR-024)
--   • dispatch_events: every event received, keyed by the sender's event id, so a
--     repeated delivery of the same event is recognised and never applied twice.
--     A completed delivery for an order not yet dispatched waits here as PENDING.
-- Additive only: a new enum and a new table.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "DispatchEventOutcome" AS ENUM ('APPLIED', 'IGNORED', 'PENDING');

-- CreateTable
CREATE TABLE "dispatch_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "orderReference" TEXT NOT NULL,
    "orderId" TEXT,
    "outcome" "DispatchEventOutcome" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dispatch_events_orderId_idx" ON "dispatch_events"("orderId");

-- CreateIndex
CREATE INDEX "dispatch_events_receivedAt_idx" ON "dispatch_events"("receivedAt");

-- AddForeignKey
ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Private to the API like every other platform table (ADR-015): Row Level Security without
-- policies, and no privileges for Supabase's Data API roles (the check keeps plain PostgreSQL happy).
ALTER TABLE "dispatch_events" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.dispatch_events FROM anon, authenticated';
  END IF;
END
$$;
