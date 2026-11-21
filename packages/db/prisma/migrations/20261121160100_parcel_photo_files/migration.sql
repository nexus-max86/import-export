-- Photos de colis : visibles des membres de l'organisation (comme les colis).
CREATE POLICY files_select_parcel ON files FOR SELECT TO konzia_app
  USING (purpose = 'parcel_photo' AND organization_id IS NOT NULL
         AND organization_id IN (SELECT app_user_org_ids()));
