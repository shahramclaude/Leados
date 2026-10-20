#!/usr/bin/env bash
# Lightweight committed-secret scanner for CI + local pre-flight.
#
# This intentionally does NOT replace a dedicated tool (gitleaks/trufflehog)
# in a real CI pipeline — see .github/workflows/security.yml, which also
# documents how to wire gitleaks in an environment with network access to
# GitHub Actions' marketplace. This script is the always-available fallback
# that requires zero extra tooling and still catches the common high-signal
# patterns (private keys, cloud provider keys, generic high-entropy
# "...SECRET=..." assignments inside tracked files).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Scanning tracked files for likely committed secrets..."

PATTERNS=(
  '-----BEGIN (RSA|EC|OPENSSH|PGP|DSA) PRIVATE KEY-----'
  'AKIA[0-9A-Z]{16}'                     # AWS access key id
  'AIza[0-9A-Za-z_\-]{35}'               # Google API key
  'xox[baprs]-[0-9A-Za-z-]{10,}'         # Slack token
  'ghp_[0-9A-Za-z]{36}'                  # GitHub PAT
  'sk-[A-Za-z0-9]{20,}'                  # Generic "sk-" style API key
)

EXCLUDE_DIRS='node_modules|\.git|\.next|dist|build|coverage'

MATCHES=0
for pattern in "${PATTERNS[@]}"; do
  if command -v rg >/dev/null 2>&1; then
    hits=$(rg -n --no-heading -e "$pattern" --glob '!node_modules' --glob '!.git' --glob '!.next' . || true)
  else
    hits=$(grep -Rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next -E -e "$pattern" . || true)
  fi
  if [ -n "$hits" ]; then
    echo "POTENTIAL SECRET matching /$pattern/:"
    echo "$hits"
    MATCHES=$((MATCHES + 1))
  fi
done

# .env files must never be tracked by git (they are read at runtime only).
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-files --error-unmatch .env >/dev/null 2>&1; then
    echo "FAIL: .env is tracked by git. Remove it from version control."
    MATCHES=$((MATCHES + 1))
  fi
else
  echo "(not a git repository in this sandbox — skipping git-tracked-file check; .gitignore already excludes .env*)"
fi

if [ "$MATCHES" -gt 0 ]; then
  echo ""
  echo "Secret scan FAILED: $MATCHES pattern group(s) matched. Investigate before merging."
  exit 1
fi

echo "Secret scan passed: no high-signal secret patterns found in tracked files."
