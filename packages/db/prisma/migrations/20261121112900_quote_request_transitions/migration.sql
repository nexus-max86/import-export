-- Transitions de statut permises au rôle applicatif sur une demande de devis.
-- Les autres (envoi, devis reçus, conversion, expiration) passent par des chemins système audités.
CREATE OR REPLACE FUNCTION quote_requests_app_transition() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF current_user = 'konzia_app' AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'draft' AND NEW.status = 'cancelled')
        OR (OLD.status IN ('sent', 'partially_quoted', 'quoted') AND NEW.status = 'cancelled')
      ) THEN
        RAISE EXCEPTION 'transition de statut interdite : % → %', OLD.status, NEW.status;
      END IF;
    END IF;
    -- Hors brouillon, seul le statut peut encore changer (annulation).
    IF current_user = 'konzia_app' AND OLD.status <> 'draft'
       AND (NEW.city_id IS DISTINCT FROM OLD.city_id
            OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
            OR NEW.note IS DISTINCT FROM OLD.note
            OR NEW.deadline_at IS DISTINCT FROM OLD.deadline_at) THEN
      RAISE EXCEPTION 'une demande envoyée ne peut plus être modifiée';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER quote_requests_transition
  BEFORE UPDATE ON quote_requests
  FOR EACH ROW EXECUTE FUNCTION quote_requests_app_transition();

-- La politique d'UPDATE autorise désormais l'annulation d'une demande envoyée.
DROP POLICY qr_update ON quote_requests;
CREATE POLICY qr_update ON quote_requests FOR UPDATE TO konzia_app
  USING (app_can_see_request(id)
         AND (customer_user_id = app_current_user_id()
              OR app_user_org_role(created_by_organization_id) IN ('owner', 'sales')))
  WITH CHECK (customer_user_id = app_current_user_id()
              OR app_user_org_role(created_by_organization_id) IN ('owner', 'sales'));
