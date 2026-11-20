# 06 — Maquettes Konzia

Maquettes cliquables (téléphone, thèmes clair et sombre) : **https://claude.ai/artifact/GkemHVvvzE4x9MRmmE7DkB**
Source : [`maquettes/konzia-maquettes.html`](maquettes/konzia-maquettes.html). Le lien est privé : utilisez le menu « Partager » de la page pour la montrer aux commissionnaires pilotes.

| # | Écran | Exigences illustrées |
|---|---|---|
| 01 | Accueil client | EF-40, EF-60 |
| 02 | Importer un lien | EF-30–34 (prix indicatif daté, saisie manuelle) |
| 03 | Choisir les commissionnaires | EF-24, EF-41 |
| 04 | Comparer les devis | EF-50–54, EF-75 (taux affiché) |
| 05 | Commande et paiement direct | EF-60, EF-61, EF-70, EF-71, EF-92 |
| 06 | Suivre mon colis | EF-83, EF-84 (seulement ses articles) |
| 07 | Tableau de bord commissionnaire | EF-25, EF-26, EF-72 |
| 08 | Rédiger un devis | EF-50, EF-51 (version figée) |
| 09 | Préparer un colis (multi-clients) | EF-80, EF-81, EF-83 |
| 10 | Vérifier un commissionnaire | EF-22, EF-104, EF-105 |

## Choix d'interface

- Une action principale par écran, en cuivre (clin d'œil au Katanga), libellée par un verbe.
- Nature du prix toujours écrite : « Prix indicatif », « Devis confirmé · v2 », « estimation ».
- Statut de paiement et statut opérationnel = deux pastilles distinctes.
- Numéros lisibles en police à chasse fixe : `KZ-2026-000123` (commande), `KZ-P-7KD3QX` (colis).
- Cibles tactiles ≥ 44 px ; libellés visibles sur chaque champ.

Questionnaire pour les commissionnaires (réponses copiées vers WhatsApp) : **https://claude.ai/artifact/NSbKLimsZaz4M2X9U2JrPi**, source [`questionnaire/konzia-questionnaire.html`](questionnaire/konzia-questionnaire.html).

## À valider avec les 2 commissionnaires pilotes

1. Les lignes du devis (écran 08) correspondent-elles à leur façon de chiffrer aujourd'hui dans Excel ?
2. Les étapes du suivi (écran 06) correspondent-elles à leur itinéraire réel ?
3. Facturent-ils au poids réel, au poids volumétrique, ou au forfait ?
4. Quels moyens de paiement leurs clients utilisent-ils réellement (M-Pesa, Orange Money, Airtel Money, espèces) ?
5. Quels documents peuvent-ils fournir pour la vérification ?
