# Fairness Posture

## What exists today

**No automated fairness or bias auditing exists in this codebase.** There is no disparate-impact
analysis, no protected-attribute detection, no fairness metric computation (demographic parity, equalized
odds, etc.), and no dataset/outcome analysis of any kind. This is stated plainly rather than implied by
silence.

## Why this matters for a scoring system

Because scoring rules (`docs/explanations/intelligence-methodology.md`) are authored freely by tenants via
`POST /api/rules`, nothing in LEADOS today prevents a tenant from creating a rule keyed on a field that
correlates with a protected characteristic (e.g. a `zipCode`-based rule that proxies for race or income).
LEADOS has no mechanism to detect, flag, or block this.

## What a tenant/operator can do today, manually

- Review the `rules` table for a tenant (`GET /api/rules`) and inspect each rule's `field` for anything
  that could be a proxy for a protected characteristic.
- Review the evidence ledger (`GET /api/decisions`) for a sample of leads to manually audit whether scoring
  outcomes correlate with anything concerning, since every score's full rule breakdown is recorded.

Neither of these is automated, enforced, or tested — they are manual review steps enabled by the fact that
the scoring engine is fully transparent (every decision has an inspectable breakdown), not a feature
LEADOS performs on anyone's behalf.

## Roadmap intent (not built, not scheduled)

- A rule-authoring linter that flags fields commonly associated with protected characteristics.
- Automated disparate-impact reporting across score bands, if/when outcome and demographic data exist.
- A documented fairness review step in `docs/RELEASING.md`'s checklist (today that checklist does not
  include a fairness gate, because there is no fairness tooling to run).
