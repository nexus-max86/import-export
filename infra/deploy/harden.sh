#!/usr/bin/env bash
# Préparation et durcissement du VPS Hostinger (Ubuntu 24.04), à lancer UNE fois en root :
#   DEPLOY_PUBKEY="ssh-ed25519 AAAA… deploy@github" ADMIN_PUBKEY="ssh-ed25519 AAAA… vous@pc" ./harden.sh
# Relançable sans risque (idempotent). Ne coupe la connexion par mot de passe qu'APRÈS avoir
# installé vos clés : gardez la session ouverte et testez une nouvelle connexion avant de fermer.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "À lancer en root."; exit 1; }
: "${DEPLOY_PUBKEY:?clé publique SSH de GitHub Actions (utilisateur deploy)}"
: "${ADMIN_PUBKEY:?votre clé publique SSH (utilisateur deploy, accès administrateur)}"
export DEBIAN_FRONTEND=noninteractive

echo "→ Mises à jour et paquets"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ufw fail2ban unattended-upgrades ca-certificates curl gnupg age rclone postgresql-client-16

echo "→ Docker (dépôt officiel)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Journaux des conteneurs limités (le disque ne se remplit pas en silence).
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" }, "live-restore": true }
JSON
systemctl restart docker

echo "→ Utilisateur deploy (sans mot de passe, clés SSH seulement)"
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf '%s\n%s\n' "$DEPLOY_PUBKEY" "$ADMIN_PUBKEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "→ SSH : clés seulement, pas de root"
cat > /etc/ssh/sshd_config.d/99-konzia.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
MaxAuthTries 3
X11Forwarding no
AllowUsers deploy
SSHD
sshd -t
systemctl reload ssh

echo "→ Pare-feu : SSH, HTTP, HTTPS uniquement"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "→ fail2ban (SSH) et mises à jour de sécurité automatiques"
cat > /etc/fail2ban/jail.d/konzia.conf <<'JAIL'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
JAIL
systemctl enable --now fail2ban
systemctl restart fail2ban
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";' > /etc/apt/apt.conf.d/20auto-upgrades

echo "→ Heure UTC et mémoire d'échange (2 Go)"
timedatectl set-timezone UTC
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "→ Dossier de l'application"
install -d -m 750 -o deploy -g deploy /opt/konzia
docker network inspect konzia-edge >/dev/null 2>&1 || docker network create konzia-edge >/dev/null

echo "✓ Serveur prêt. Testez MAINTENANT dans un autre terminal : ssh deploy@<ip-du-serveur>"
echo "  Puis placez /opt/konzia/{edge,production,staging}.env (chmod 600, propriétaire deploy)."
