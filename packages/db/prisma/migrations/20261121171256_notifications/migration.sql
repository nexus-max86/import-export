-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "organization_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "entity_type" TEXT,
    "entity_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","type","channel")
);

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_created_at_idx" ON "notifications"("recipient_user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_entity_id_type_idx" ON "notifications"("entity_id", "type");

ALTER TABLE notification_preferences
  ADD CONSTRAINT np_channel CHECK (channel IN ('email', 'whatsapp'));

-- Notifications : créées par le chemin système (destinataires d'autres organisations ou clients) ;
-- chacun ne lit et ne marque comme lues que les siennes. Jamais supprimées par l'application.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON notifications TO konzia_app;
GRANT UPDATE (read_at) ON notifications TO konzia_app;
CREATE POLICY notif_select ON notifications FOR SELECT TO konzia_app
  USING (recipient_user_id = app_current_user_id());
CREATE POLICY notif_update ON notifications FOR UPDATE TO konzia_app
  USING (recipient_user_id = app_current_user_id())
  WITH CHECK (recipient_user_id = app_current_user_id());

-- Préférences : strictement personnelles.
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE (enabled, updated_at) ON notification_preferences TO konzia_app;
CREATE POLICY np_all ON notification_preferences FOR ALL TO konzia_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
