#!/usr/bin/env bash
# Restores a pg_dump custom-format backup into a target database. Used both
# for disaster recovery and as the restore half of the backup→restore drill
# (docs/RUNBOOKS.md#restore-drill). Verifies the checksum sidecar file before
# touching the database.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: restore.sh <backup-file.dump> [target-database-url]" >&2
  exit 1
fi

BACKUP_FILE="$1"
TARGET_URL="${2:-${RESTORE_TARGET_URL:-postgresql://postgres:postgres@127.0.0.1:5432/app_db_restore_drill}}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[restore] backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [ -f "${BACKUP_FILE}.sha256" ]; then
  echo "[restore] verifying checksum"
  (cd "$(dirname "${BACKUP_FILE}")" && sha256sum -c "$(basename "${BACKUP_FILE}").sha256")
else
  echo "[restore] WARNING: no checksum sidecar found for ${BACKUP_FILE}, skipping verification" >&2
fi

TARGET_DB=$(echo "${TARGET_URL}" | sed -E 's#.*/([^/?]+).*#\1#')
ADMIN_URL=$(echo "${TARGET_URL}" | sed -E "s#/${TARGET_DB}(\?.*)?\$#/postgres#")

echo "[restore] (re)creating target database: ${TARGET_DB}"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\";"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TARGET_DB}\";"

echo "[restore] running pg_restore into ${TARGET_URL}"
pg_restore --no-owner --no-privileges --dbname="${TARGET_URL}" "${BACKUP_FILE}"

echo "[restore] done. Target database ready at ${TARGET_URL}"
