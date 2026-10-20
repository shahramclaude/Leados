#!/usr/bin/env bash
# One canonical deploy command. See docs/DEPLOYMENT.md.
#
# Usage:
#   ./scripts/deploy.sh --env=production [--tag=vX.Y.Z]
#   ./scripts/deploy.sh --env=staging
#
# Requires a `.env` file in the repo root (copy from .env.production.example
# and fill in real values — never commit it). Requires Docker + the Compose
# plugin.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_NAME="production"
TAG=""

for arg in "$@"; do
  case "$arg" in
    --env=*) ENV_NAME="${arg#*=}" ;;
    --tag=*) TAG="${arg#*=}" ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.production.example to .env and fill in real values first." >&2
  exit 1
fi

COMPOSE="docker compose -f docker-compose.production.yml"

echo "==> [$ENV_NAME] Checking out release tag ${TAG:-<current checkout>}"
if [ -n "$TAG" ]; then
  git fetch --tags
  git checkout "$TAG"
fi

echo "==> [$ENV_NAME] Building images"
$COMPOSE build db-backup app migrate

echo "==> [$ENV_NAME] Starting db + app (recreate app in place)"
$COMPOSE up -d db
echo "==> [$ENV_NAME] Waiting for db healthcheck..."
for i in $(seq 1 30); do
  STATUS=$($COMPOSE ps db --format '{{.Health}}' 2>/dev/null || echo "")
  if [ "$STATUS" = "healthy" ]; then
    break
  fi
  sleep 2
  if [ "$i" -eq 30 ]; then
    echo "db did not become healthy in time" >&2
    $COMPOSE logs db --tail=100
    exit 1
  fi
done

echo "==> [$ENV_NAME] Running migrations (npm run db:migrate inside the built image)"
$COMPOSE run --rm migrate

echo "==> [$ENV_NAME] Starting app + db-backup"
$COMPOSE up -d --force-recreate app db-backup

echo "==> [$ENV_NAME] Polling /api/health..."
APP_PORT="${PORT:-3000}"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" -o /tmp/leados-deploy-health.json; then
    STATUS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/leados-deploy-health.json','utf8')).status)" 2>/dev/null || echo "unknown")
    echo "    /api/health -> $STATUS"
    if [ "$STATUS" = "healthy" ] || [ "$STATUS" = "degraded" ]; then
      echo "==> [$ENV_NAME] Deploy succeeded (status: $STATUS)."
      exit 0
    fi
  fi
  sleep 2
done

echo "Deploy did NOT reach a healthy/degraded state in time. Last response:" >&2
cat /tmp/leados-deploy-health.json >&2 || true
echo "See docs/RUNBOOKS.md for diagnosis steps." >&2
exit 1
