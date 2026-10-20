#!/usr/bin/env bash
# Minimal, dependency-free secret scanner used as the "security suite" gate
# in docs/RELEASING.md. This is deliberately small: a handful of high-signal
# regexes plus a check that no real .env file is tracked by git. It is not a
# replacement for a dedicated tool (gitleaks/trufflehog) — see FEATURES.md
# roadmap — but it catches the most common accidental leaks and runs with
# zero extra dependencies.
set -euo pipefail

cd "$(dirname "$0")/.."

FAIL=0

echo "== Checking for tracked .env files (should only ever be committed as *.example) =="
if git ls-files 2>/dev/null | grep -E '(^|/)\.env($|\.[a-zA-Z0-9]+$)' | grep -vE '\.example$'; then
  echo "FAIL: a real .env file appears to be tracked by git."
  FAIL=1
else
  echo "OK: no tracked .env file (excluding *.example)."
fi

echo "== Scanning source for common secret patterns =="
PATTERN='(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[0-9A-Za-z-]{10,}|sk-[A-Za-z0-9]{20,})'
MATCHES=$(grep -RInE "$PATTERN" --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.json' --include='*.md' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git . || true)

if [ -n "$MATCHES" ]; then
  echo "FAIL: possible secret material found:"
  echo "$MATCHES"
  FAIL=1
else
  echo "OK: no known secret patterns found."
fi

if [ "$FAIL" -ne 0 ]; then
  echo "security:scan FAILED"
  exit 1
fi

echo "security:scan PASSED"
