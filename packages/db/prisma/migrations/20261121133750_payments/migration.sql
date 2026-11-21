-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "payment_instructions" JSONB;

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('payment', 'refund');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('mobile_money', 'cash', 'bank_transfer', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending_verification', 'confirmed', 'rejected', 'cancelled');

-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'payment_proof';

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "org_customer_id" UUID NOT NULL,
    "customer_user_id" UUID,
    "kind" "PaymentKind" NOT NULL DEFAULT 'payment',
    "method" "PaymentMethod" NOT NULL,
    "provider" TEXT,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "order_amount" BIGINT NOT NULL,
    "fx_rate" DECIMAL(18,8),
    "payer_reference" TEXT,
    "proof_file_id" UUID,
    "note" TEXT,
    "status" "PaymentStatus" NOT NULL,
    "declared_by" UUID NOT NULL,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actor_user_id" UUID,
    "note" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_organization_id_status_idx" ON "payments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_org_customer_id_idx" ON "payments"("org_customer_id");

-- CreateIndex
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events"("payment_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT UPDATE (payment_instructions) ON organizations TO konzia_app;

ALTER TABLE payments
  ADD CONSTRAINT pay_amount CHECK (amount > 0 AND order_amount > 0),
  ADD CONSTRAINT pay_currency CHECK (currency IN ('USD', 'CDF')),
  ADD CONSTRAINT pay_confirmed CHECK (status <> 'confirmed' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  ADD CONSTRAINT pay_rejected CHECK (status <> 'rejected' OR coalesce(trim(rejection_reason), '') <> '');

-- Un paiement confirmé ne change plus jamais ; jamais de suppression (correction = remboursement).
CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'suppression interdite : utilisez un statut ou un remboursement'; END IF;
    IF OLD.status IN ('confirmed', 'rejected', 'cancelled') THEN
      RAISE EXCEPTION 'paiement clos : aucune modification possible';
    END IF;
    IF (NEW.amount, NEW.currency, NEW.order_id, NEW.kind, NEW.declared_by) IS DISTINCT FROM
       (OLD.amount, OLD.currency, OLD.order_id, OLD.kind, OLD.declared_by) THEN
      RAISE EXCEPTION 'montant et commande d''un paiement non modifiables';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER payments_guard BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_guard();
CREATE TRIGGER payment_events_no_update_delete BEFORE UPDATE OR DELETE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- Lecture : commissionnaire (membres autorisés) et client de la commande.
-- Écritures : chemins système audités (déclaration par le client, confirmation…).
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON payments TO konzia_app;
CREATE POLICY payments_select ON payments FOR SELECT TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'sales', 'accountant')
         OR customer_user_id = app_current_user_id());

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON payment_events TO konzia_app;
CREATE POLICY payment_events_select ON payment_events FOR SELECT TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'sales', 'accountant')
         OR EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id AND p.customer_user_id = app_current_user_id()));

