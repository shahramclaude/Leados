#!/usr/bin/env bash
# Scheduled backup script (docs/RUNBOOKS.md#restore-drill, docs/SLO.md RPO/RTO).
#
# Dumps the full database with pg_dump in custom format, writes it under
# backups/ with a UTC timestamp, and prunes anything older than
# BACKUP_RETENTION_DAYS (default 14). Intended to run on a schedule (cron /
# systemd timer / k8s CronJob — see docs/DEPLOYMENT.md) with RPO bounded by
# the schedule interval.
set -euo pipefail

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:5432/app_db}"
BACKUP_DIR="${BACKUP_DIR:-$(pwd)/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${BACKUP_DIR}/leados-${STAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "[backup] starting pg_dump -> ${OUT_FILE}"
pg_dump --format=custom --no-owner --no-privileges --dbname="${DATABASE_URL}" --file="${OUT_FILE}"

SHA256=$(sha256sum "${OUT_FILE}" | awk '{print $1}')
echo "${SHA256}  $(basename "${OUT_FILE}")" > "${OUT_FILE}.sha256"
echo "[backup] wrote $(du -h "${OUT_FILE}" | cut -f1) checksum=${SHA256}"

echo "[backup] pruning backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -maxdepth 1 -name 'leados-*.dump*' -mtime "+${RETENTION_DAYS}" -print -delete || true

echo "[backup] done: ${OUT_FILE}"
