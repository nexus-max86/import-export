-- Une fonction STABLE ne voit pas la ligne en cours d'insertion (INSERT … RETURNING) :
-- on teste d'abord directement la colonne du client.
DROP POLICY qr_select ON quote_requests;
CREATE POLICY qr_select ON quote_requests FOR SELECT TO konzia_app
  USING (customer_user_id = app_current_user_id() OR app_can_see_request(id));
