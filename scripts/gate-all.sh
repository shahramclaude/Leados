#!/usr/bin/env bash
# gate-all.sh
# ----------------------------------------------------------------------
# Honesty note: the standing instructions for this environment forbid
# editing package.json directly, so this cannot be wired as `npm run
# gate:all` without a human applying that one-line script addition
# manually (see docs/PROGRAM-COMPLETION-REPORT.md, "Known Gap: npm
# script wiring"). Until then, run it directly:
#
#   bash scripts/gate-all.sh            # fast tier
#   bash scripts/gate-all.sh --slow     # fast + build
#
# To wire it as `npm run gate:all`, add to package.json "scripts":
#   "gate:all": "bash scripts/gate-all.sh --slow",
#   "ledger:check": "node scripts/check-ledger.mjs",
#   "verify": "bash scripts/gate-all.sh --slow"
# ----------------------------------------------------------------------
set -e

echo "== GATE 1/3: TypeScript (tsc --noEmit) =========================="
npx tsc --noEmit
echo "PASS: no type errors"
echo

echo "== GATE 2/3: Evidence ledger structural check ===================="
node scripts/check-ledger.mjs
echo

if [[ "$1" == "--slow" ]]; then
  echo "== GATE 3/3: Production build (vite build) ======================="
  npm run build
  echo "PASS: build succeeded"
else
  echo "(fast tier only — pass --slow to also run the production build)"
fi

echo
echo "gate:all complete."
