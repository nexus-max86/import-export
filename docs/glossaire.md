# Glossaire Konzia

Termes métier utilisés dans le code, les écrans et la documentation. Un terme = un sens.

| Terme (FR) | Nom dans le code | Définition |
|---|---|---|
| Client | `customer` | Personne qui achète via un commissionnaire. Peut avoir un compte Konzia ou être un « client géré ». |
| Client géré | `managed_customer` | Client enregistré par un commissionnaire, sans compte Konzia (ex. client WhatsApp). Peut réclamer son compte plus tard via un lien d'invitation. |
| Commissionnaire | `organization` (type `independent` ou `company`) | Professionnel qui achète à l'étranger pour ses clients. Chaque commissionnaire est un tenant isolé. |
| Membre | `organization_member` | Utilisateur rattaché à un commissionnaire, avec un rôle (administrateur, commercial, acheteur, logistique, comptable, livreur). |
| Service Konzia | `organization` avec `is_platform_operated = true` | Le service d'importation propre à la plateforme ; un commissionnaire comme les autres, sans accès privilégié. |
| Demande de devis | `quote_request` | Liste d'articles qu'un client souhaite acheter, envoyée à un ou plusieurs commissionnaires. |
| Article demandé | `quote_request_item` | Un produit (lien ou saisie manuelle) avec variante, quantité, instructions. |
| Devis | `quote` / `quote_version` | Proposition chiffrée d'UN commissionnaire. Chaque modification crée une nouvelle version ; l'ancienne reste consultable. |
| Estimation | `price_kind = estimate` | Prix indicatif, non engageant (ex. prix importé d'un lien). |
| Devis confirmé | `quote_version.status = sent` | Prix proposé par le commissionnaire, valable jusqu'à une date. |
| Montant final | `order.final_amount` | Montant réellement facturé après coûts vérifiés et ajustements acceptés. |
| Ajustement | `quote_adjustment` | Modification de prix après acceptation ; exige l'accord du client. |
| Commande | `order` | Créée à l'acceptation d'une version de devis. Appartient à un seul commissionnaire. |
| Ligne de commande | `order_item` | Un article de la commande, avec quantités commandées / achetées / reçues. |
| Achat fournisseur | `supplier_order` | Achat réel effectué par le commissionnaire sur la marketplace (référence, montant, preuve). |
| Colis | `parcel` | Unité physique. Peut contenir des articles de plusieurs commandes ; une commande peut être sur plusieurs colis. |
| Expédition | `shipment` | Transport d'un ou plusieurs colis (aérien, maritime, routier). |
| Événement de suivi | `parcel_event` / `tracking_event` | Étape horodatée et non modifiable d'un colis ou d'une expédition. |
| Paiement direct | `payment.method = direct` | Le client paie le commissionnaire hors plateforme ; le commissionnaire confirme ou refuse. |
| Ville / zone | `city` / `service_zone` | Lieu de remise configurable (Lubumbashi au pilote). |
| Journal d'audit | `audit_log` | Trace de toute action sensible : acteur, date, objet, ancienne/nouvelle valeur, motif. |
