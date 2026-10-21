#!/usr/bin/env bash
# Canonical LEADOS production deploy script — see docs/DEPLOYMENT.md.
#
# This is the ONE deploy script for this repository. Earlier/ad-hoc deploy
# scripts do not exist in this snapshot (see docs/CONSISTENCY-SWEEP.md); if
# you're tempted to add a second one, extend this file and document the
# change in docs/DEPLOYMENT.md instead.
#
# Usage:
#   DATABASE_URL=postgresql://... ./deploy-production.sh <image-tag>
#
# What it does, in order (matches docs/DEPLOYMENT.md "Production — health-gated rollout"):
#   1. Applies the schema (drizzle-kit push) BEFORE starting new containers.
#   2. Starts the new container on a staging port.
#   3. Polls /api/health on the new container until healthy (or times out).
#   4. Atomically swaps the "current" symlink/alias a reverse proxy reads from
#      (left as an integration point — see the REVERSE_PROXY_HOOK section).
#   5. Leaves the previous container running (not removed) for rollback
#      (see docs/ROLLBACK.md) until you explicitly run `docker rm` yourself.

set -euo pipefail

IMAGE_TAG="${1:?usage: deploy-production.sh <image-tag>}"
APP_NAME="leados"
NEW_CONTAINER="${APP_NAME}-${IMAGE_TAG//[:\/]/-}"
HEALTH_URL_PORT="${LEADOS_STAGING_PORT:-3001}"
PROD_PORT="${LEADOS_PROD_PORT:-3000}"
MAX_HEALTH_RETRIES=15
HEALTH_RETRY_DELAY_SECONDS=2

: "${DATABASE_URL:?DATABASE_URL must be set in the environment}"

echo "==> [1/4] Applying schema (drizzle-kit push) before starting new container"
npx drizzle-kit push --config drizzle.config.json

echo "==> [2/4] Starting new container: ${NEW_CONTAINER} on port ${HEALTH_URL_PORT}"
docker run -d \
  --name "${NEW_CONTAINER}" \
  -e DATABASE_URL="${DATABASE_URL}" \
  -p "${HEALTH_URL_PORT}:3000" \
  "${APP_NAME}:${IMAGE_TAG}"

echo "==> [3/4] Health-gating on http://127.0.0.1:${HEALTH_URL_PORT}/api/health"
attempt=0
until curl -fsS "http://127.0.0.1:${HEALTH_URL_PORT}/api/health" | grep -q '"ok":true'; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge "${MAX_HEALTH_RETRIES}" ]; then
    echo "!! Health check failed after ${MAX_HEALTH_RETRIES} attempts. Leaving old container in place."
    docker logs "${NEW_CONTAINER}" --tail 100 || true
    exit 1
  fi
  sleep "${HEALTH_RETRY_DELAY_SECONDS}"
done
echo "==> New container is healthy."

echo "==> [4/4] Reverse-proxy swap (integration point)"
echo "    REVERSE_PROXY_HOOK: point your load balancer / reverse proxy at"
echo "    port ${HEALTH_URL_PORT} (the now-healthy '${NEW_CONTAINER}'), then"
echo "    retire the container previously bound to port ${PROD_PORT}."
echo "    This script does not assume a specific proxy — see docs/DEPLOYMENT.md."
echo
echo "Previous production container (if any) was left running intentionally."
echo "To roll back: see docs/ROLLBACK.md."
