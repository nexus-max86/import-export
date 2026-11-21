-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" UUID NOT NULL,
    "notification_id" UUID,
    "recipient_user_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbound_messages_status_created_at_idx" ON "outbound_messages"("status", "created_at");

ALTER TABLE outbound_messages
  ADD CONSTRAINT om_channel CHECK (channel IN ('email', 'whatsapp')),
  ADD CONSTRAINT om_status CHECK (status IN ('queued', 'sent', 'failed', 'skipped'));
-- Chemin système uniquement (file d'envoi) : RLS activée, aucun droit pour konzia_app.
ALTER TABLE outbound_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON outbound_messages FROM konzia_app;
