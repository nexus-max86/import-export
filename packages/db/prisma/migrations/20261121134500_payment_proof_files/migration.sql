-- Séparé de la migration précédente : une nouvelle valeur d'énumération
-- ne peut pas être utilisée dans la transaction qui la crée.
-- Preuves de paiement : visibles du commissionnaire concerné.
CREATE POLICY files_select_payment ON files FOR SELECT TO konzia_app
  USING (purpose = 'payment_proof'
         AND EXISTS (SELECT 1 FROM payments p WHERE p.proof_file_id = files.id
                     AND app_user_org_role(p.organization_id) IN ('owner', 'sales', 'accountant')));
