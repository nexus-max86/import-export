# Image de sauvegarde : client PostgreSQL 16, age (chiffrement) et rclone (envoi vers R2).
FROM ubuntu:24.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-16 age rclone ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1001 konzia
COPY --chmod=755 backup.sh entrypoint.sh /usr/local/bin/
USER konzia
CMD ["/usr/local/bin/entrypoint.sh"]
