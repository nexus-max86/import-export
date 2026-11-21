-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "pair" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rates_pair_valid_from_idx" ON "exchange_rates"("pair", "valid_from");

ALTER TABLE exchange_rates
  ADD CONSTRAINT fx_pair CHECK (pair IN ('USD_CDF', 'USD_CNY')),
  ADD CONSTRAINT fx_positive CHECK (rate > 0);

-- Un taux publié n'est jamais modifié : un nouveau taux le remplace (historique intact).
CREATE TRIGGER exchange_rates_no_update_delete
  BEFORE UPDATE OR DELETE ON exchange_rates
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON exchange_rates TO konzia_app;
CREATE POLICY fx_select ON exchange_rates FOR SELECT TO konzia_app USING (true);
