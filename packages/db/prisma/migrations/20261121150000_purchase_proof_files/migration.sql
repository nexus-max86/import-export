-- Preuves d'achat : visibles des membres du commissionnaire qui gèrent les achats.
CREATE POLICY files_select_purchase ON files FOR SELECT TO konzia_app
  USING (purpose = 'purchase_proof' AND organization_id IS NOT NULL
         AND app_user_org_role(organization_id) IN ('owner', 'buyer', 'accountant'));
