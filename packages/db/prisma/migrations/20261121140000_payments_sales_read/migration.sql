-- Les commerciaux consultent les paiements (matrice des rôles : payment.view) sans pouvoir les confirmer.
-- (Les politiques actuelles les incluaient déjà ; on les recrée pour l'expliciter.)
DROP POLICY payments_select ON payments;
CREATE POLICY payments_select ON payments FOR SELECT TO konzia_app
  USING (app_user_org_role(organization_id) IN ('owner', 'sales', 'accountant')
         OR customer_user_id = app_current_user_id());
