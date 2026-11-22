# Guide de déploiement — VPS Hostinger

Ce guide met Konzia en ligne sur le VPS Hostinger KVM 2, avec deux environnements :

- **production** : `https://app.<domaine>` (les commissionnaires et leurs clients) ;
- **staging** : `https://staging.<domaine>` (essais, protégé par mot de passe).

Tout ce qui est marqué **[Vous]** demande un accès que seul le propriétaire possède (achat, comptes, clés). Le reste est automatisé.

Temps estimé la première fois : 2 à 3 heures.

---

## 1. Avant de commencer [Vous]

| Quoi | Où | Pour |
|---|---|---|
| Nom de domaine (ex. `konzia.app`) | Hostinger ou autre registrar | Adresses `app.` et `staging.` |
| VPS KVM 2, **Ubuntu 24.04** | Hostinger | Le serveur |
| Compte **Cloudflare R2** : deux seaux privés `konzia-files` et `konzia-backups`, deux jetons d'API (un par seau) | dash.cloudflare.com → R2 | Fichiers chiffrés et sauvegardes |
| Compte **Brevo** : clé SMTP, domaine d'envoi authentifié (SPF, DKIM) | app.brevo.com | E-mails |
| Une paire de clés **age** pour les sauvegardes | votre ordinateur (voir § 4) | Chiffrer les sauvegardes |

## 2. DNS [Vous]

Chez le registrar, créez trois enregistrements **A** vers l'adresse IP du VPS :

```
<domaine>          A   <ip-du-vps>
app.<domaine>      A   <ip-du-vps>
staging.<domaine>  A   <ip-du-vps>
```

Plus ceux demandés par Brevo (SPF, DKIM, DMARC) pour que les e-mails n'arrivent pas en indésirables.

## 3. Préparer le serveur (une seule fois)

1. **[Vous]** Créez deux clés SSH sur votre ordinateur :
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/konzia_admin -C "vous"
   ssh-keygen -t ed25519 -f ~/.ssh/konzia_deploy -C "github-actions" -N ""
   ```
2. Copiez `infra/deploy/harden.sh` sur le serveur et lancez-le en root (console Hostinger ou `ssh root@<ip>`) :
   ```bash
   DEPLOY_PUBKEY="$(cat konzia_deploy.pub)" ADMIN_PUBKEY="$(cat konzia_admin.pub)" bash harden.sh
   ```
   Le script installe Docker, crée l'utilisateur `deploy` et coupe la connexion par mot de passe et en root. Il active aussi le pare-feu (22, 80, 443), fail2ban, les mises à jour de sécurité automatiques et une mémoire d'échange de 2 Go.
3. **Avant de fermer la session root**, testez dans un autre terminal : `ssh -i ~/.ssh/konzia_admin deploy@<ip>`.

## 4. Secrets sur le serveur [Vous]

1. Clé des sauvegardes, **sur votre ordinateur** :
   ```bash
   age-keygen -o konzia-backup.key     # clé PRIVÉE : gardez-la hors du serveur (gestionnaire de mots de passe + clé USB)
   ```
   La ligne `# public key: age1…` est la clé **publique**, qui va sur le serveur.
2. Sur le serveur, en tant que `deploy`, créez à partir des modèles du dépôt :
   - `/opt/konzia/edge.env` ← `infra/deploy/edge.env.example`
   - `/opt/konzia/production.env` ← `infra/deploy/production.env.example`
   - `/opt/konzia/staging.env` ← idem, avec **d'autres mots de passe** et `APP_URL=https://staging.<domaine>`

   Puis `chmod 600 /opt/konzia/*.env`. Générez chaque secret avec `openssl rand -hex 32` (et `openssl rand -base64 32` pour `FILES_ENCRYPTION_KEY`).
3. **Conservez aussi `FILES_ENCRYPTION_KEY` hors du serveur** : sans elle, les fichiers déjà stockés (RCCM, preuves de paiement) sont illisibles.
4. Démarrez le frontal HTTPS (une fois) :
   ```bash
   cd /opt/konzia && docker compose -f edge/compose.yml --env-file edge.env up -d
   ```
   Caddy obtient seul les certificats Let's Encrypt.

## 5. GitHub [Vous]

Dans le dépôt, **Settings → Environments** : créez `staging` et `production`. Pour `production`, ajoutez une approbation obligatoire (vous). Puis, dans **Secrets and variables → Actions** :

| Type | Nom | Valeur |
|---|---|---|
| Secret | `DEPLOY_HOST` | adresse IP du VPS |
| Secret | `DEPLOY_USER` | `deploy` |
| Secret | `DEPLOY_SSH_KEY` | contenu de `~/.ssh/konzia_deploy` (clé privée) |
| Secret | `DEPLOY_KNOWN_HOSTS` | résultat de `ssh-keyscan <ip-du-vps>` |
| Variable | `KONZIA_DOMAIN` | ex. `konzia.app` |

## 6. Déployer

- **Staging** : automatique à chaque fusion sur `main`. Le workflow « Déploiement » construit les images (GitHub Container Registry), les déploie, puis vérifie `https://staging.<domaine>/api/health`.
- **Production** : **Actions → Déploiement → Run workflow**, environnement `production` et tag = SHA du commit déjà validé en staging. L'approbation vous est demandée.
- **À la main**, depuis le serveur : `/opt/konzia/deploy.sh production <tag>`. Les étapes sont : images, migrations (avant l'API), redémarrage, puis contrôle de santé.

Vérification : `curl -I https://app.<domaine>/api/health` doit répondre `200`.

### Revenir à la version précédente

```bash
cat /opt/konzia/production.previous          # tag précédent
/opt/konzia/deploy.sh production <tag-précédent>
```

Les migrations de base ne reviennent jamais en arrière. Elles sont écrites pour rester compatibles avec la version précédente de l'application.

## 7. Premier administrateur

1. Inscrivez-vous normalement sur `https://app.<domaine>/inscription` et confirmez votre e-mail.
2. Sur le serveur :
   ```bash
   cd /opt/konzia && export KONZIA_ENV=production IMAGE_TAG=$(cat production.version) KONZIA_ENV_FILE=/opt/konzia/production.env
   docker compose -p konzia-production --env-file production.env -f compose.yml --profile tools \
     run --rm migrate node scripts/promote-admin.cjs vous@exemple.com
   ```
3. Ouvrez `https://app.<domaine>/admin` : la double authentification vous est demandée (Google Authenticator, Aegis…).

## 8. Sauvegardes

- Chaque nuit à 00:15 UTC (02:15 à Lubumbashi), le conteneur `backup` envoie vers `r2:konzia-backups/<environnement>/` une copie de la base, chiffrée avec la clé publique age. Les copies de plus de 30 jours sont supprimées.
- **Test de restauration** avant le pilote, puis **chaque mois**. Depuis votre ordinateur (ou le serveur, sans y laisser la clé) :
  ```bash
  AGE_IDENTITY_FILE=konzia-backup.key BACKUP_REMOTE=r2:konzia-backups KONZIA_ENV=production \
  PGHOST=<serveur-postgres-de-test> PGUSER=… PGPASSWORD=… PGDATABASE=postgres \
  infra/deploy/restore-test.sh
  ```
  Le script restaure la dernière sauvegarde dans une base **vide**, vérifie les migrations, les tables, la RLS et les données, puis supprime la base de test. Il doit afficher `RESTAURATION RÉUSSIE`. Notez la date et le résultat dans le tableau ci-dessous.
- Activez aussi l'**instantané hebdomadaire** du VPS dans le panneau Hostinger.
- Les fichiers (seau `konzia-files`) sont déjà hors du VPS. Activez dans R2 une règle de conservation des objets supprimés si votre offre le permet.

| Date | Environnement | Sauvegarde restaurée | Résultat | Par |
|---|---|---|---|---|
| | | | | |

## 9. Surveillance

- **Disponibilité** : une sonde gratuite (UptimeRobot) sur `https://app.<domaine>/api/health`, toutes les 5 minutes, alerte par e-mail.
- **Journaux** : `docker compose -p konzia-production logs -f api` (aucune donnée personnelle n'y est écrite).
- **Disque** : `df -h` et `docker system df` une fois par mois. Les journaux des conteneurs sont limités à 50 Mo chacun.

## Ce qui a été vérifié avant livraison

Tout le parcours a été joué en local, avec Docker, sur des images identiques à celles de production :

- construction des quatre images ;
- frontal Caddy en HTTPS : en-têtes de sécurité, redirection depuis HTTP et depuis le domaine nu, staging protégé sauf la sonde de santé ;
- migrations, puis API et web en bonne santé ;
- inscription et connexion par HTTPS, avec un cookie `Secure` et `HttpOnly` ;
- mise à jour d'une version à la suivante, avec la version précédente enregistrée ;
- désignation de l'administrateur ;
- sauvegarde depuis le conteneur, puis restauration réussie dans une base vide sur un autre serveur ;
- rétention à 30 jours, et refus d'une mauvaise clé.

**Pas encore éprouvé, faute d'accès :**

- le VPS réel ;
- les certificats Let's Encrypt (en local, Caddy a utilisé son autorité interne) ;
- l'envoi réel par Brevo ;
- les seaux R2 réels ;
- le workflow GitHub de déploiement, qui demande les secrets ci-dessus.
