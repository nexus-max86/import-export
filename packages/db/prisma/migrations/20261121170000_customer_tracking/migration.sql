-- Suivi côté client (EF-84) : dans un colis partagé, un client ne voit que SES articles et les
-- étapes visibles du colis — jamais les autres clients, les notes internes ni les coûts.
-- Les vues appartiennent au propriétaire du schéma : elles lisent les tables sans la RLS
-- et appliquent elles-mêmes le filtre sur l'utilisateur courant (app.user_id).
-- L'identité passe par la fiche client (org_customers.user_id) : un client géré qui réclame
-- son compte retrouve aussi le suivi de ses colis.

CREATE VIEW customer_parcel_tracking WITH (security_barrier = true) AS
  SELECT pi.id            AS parcel_item_id,
         p.id             AS parcel_id,
         p.code           AS parcel_code,
         p.status::text   AS parcel_status,
         oi.order_id      AS order_id,
         o.number         AS order_number,
         oi.description   AS description,
         pi.quantity      AS quantity
  FROM parcel_items pi
  JOIN parcels p        ON p.id = pi.parcel_id
  JOIN order_items oi   ON oi.id = pi.order_item_id
  JOIN orders o         ON o.id = oi.order_id
  JOIN org_customers oc ON oc.id = pi.org_customer_id
  WHERE pi.removed_at IS NULL
    AND p.status <> 'cancelled'
    AND oc.user_id = app_current_user_id();

CREATE VIEW customer_parcel_events WITH (security_barrier = true) AS
  SELECT e.id, e.parcel_id, e.kind, e.step_code, e.anomaly_type, e.occurred_at, e.location,
         coalesce(s.label_fr, e.step_code) AS label
  FROM parcel_events e
  JOIN parcels p ON p.id = e.parcel_id
  LEFT JOIN route_template_steps s
         ON s.route_template_id = coalesce(p.route_template_id, '00000000-0000-7000-8000-000000000001')
        AND s.code = e.step_code
  WHERE e.visible_to_customer
    AND p.status <> 'cancelled'
    AND EXISTS (SELECT 1 FROM parcel_items pi JOIN org_customers oc ON oc.id = pi.org_customer_id
                WHERE pi.parcel_id = e.parcel_id AND pi.removed_at IS NULL
                  AND oc.user_id = app_current_user_id());

REVOKE ALL ON customer_parcel_tracking, customer_parcel_events FROM PUBLIC;
GRANT SELECT ON customer_parcel_tracking, customer_parcel_events TO konzia_app;

-- Fusion et rattachement lors d'une réclamation de compte (chemin système, rôle propriétaire) :
-- ils réaffectent org_customer_id / customer_user_id. Le rôle applicatif reste limité au
-- marquage d'un retrait.
CREATE OR REPLACE FUNCTION parcel_items_check_qty() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE received int; packed int;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      -- session_user : rôle de connexion (current_user vaut le propriétaire dans cette fonction).
      IF session_user <> 'konzia_app'
         AND NEW.parcel_id = OLD.parcel_id AND NEW.order_item_id = OLD.order_item_id
         AND NEW.quantity = OLD.quantity THEN
        RETURN NEW;
      END IF;
      IF NEW.parcel_id <> OLD.parcel_id OR NEW.order_item_id <> OLD.order_item_id
         OR NEW.quantity <> OLD.quantity OR NEW.added_at <> OLD.added_at OR NEW.added_by <> OLD.added_by
         OR NEW.org_customer_id <> OLD.org_customer_id
         OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
         OR (OLD.removed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'un article de colis ne se modifie pas : retirez-le puis ajoutez-le à nouveau';
      END IF;
      RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.order_item_id::text, 0));
    SELECT qty_received INTO received FROM order_items WHERE id = NEW.order_item_id;
    SELECT coalesce(sum(quantity), 0) INTO packed FROM parcel_items
      WHERE order_item_id = NEW.order_item_id AND removed_at IS NULL;
    IF packed + NEW.quantity > received THEN
      RAISE EXCEPTION 'quantité en colis supérieure aux articles reçus';
    END IF;
    RETURN NEW;
  END
  $$;

-- Paiements : un paiement clos reste figé, sauf le rattachement au client (fusion de fiches,
-- réclamation de compte) fait par un chemin système. Le montant, le statut, etc. ne bougent jamais.
CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
  DECLARE probe payments;
  BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'suppression interdite : utilisez un statut ou un remboursement'; END IF;
    IF session_user <> 'konzia_app' THEN
      probe := NEW;
      probe.org_customer_id := OLD.org_customer_id;
      probe.customer_user_id := OLD.customer_user_id;
      IF probe IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
    END IF;
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
