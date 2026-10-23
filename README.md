# LEADOS — Decision Operating System (founding build)

LEADOS is an executive decision-operations platform. This workspace contains
a real, working founding build: a multi-tenant ontology substrate, a
deterministic and explainable lead-scoring engine, and a hash-chained,
tamper-evident evidence ledger — built on Next.js (App Router), Drizzle ORM,
PostgreSQL, and Tailwind CSS.

**Read `LEADOS-STATE.md` first.** It records exactly what exists here and
explicitly flags that this build does not — and does not claim to —
represent a 139-part "LEADOS Integration Master" program; it was founded
honestly in a workspace that contained only the bare starter template.

## What's in this build

- **Scoring engine** (`src/lib/scoring.ts`) — every lead score decomposes
  into named, weighted criteria (budget, company size, engagement, title
  seniority, ICP fit, response history) with a human-readable rationale per
  criterion.
- **Evidence ledger** (`src/lib/ledger.ts`, `decisions` table) — every score
  and stage change is appended as a SHA-256 hash-chained record. Visit
  `/decisions` and click "Verify chain" to recompute and confirm integrity.
- **Knowledge substrate** (`knowledge_entries` table, `/knowledge`) — notes
  and findings, each labeled `measured` / `estimated` / `association` /
  `effect`.
- **Multi-tenant schema** — every table carries `tenant_id`; a single demo
  tenant (`leados-demo`) is auto-created on first use.

## Running locally

```bash
npm install
npx drizzle-kit push      # apply schema to PostgreSQL (uses DATABASE_URL from .env)
npx tsx scripts/seed.ts   # optional: load demo leads + knowledge entries
npm run dev
```

## API surface

| Route | Methods | Purpose |
|---|---|---|
| `/api/health` | GET | Liveness probe |
| `/api/leads` | GET, POST | List leads / create + score a lead |
| `/api/leads/[id]` | PATCH | Change a lead's pipeline stage (writes a ledger entry) |
| `/api/decisions` | GET, POST | Read the evidence ledger / append a manual decision |
| `/api/decisions/verify` | GET | Recompute and verify the hash chain |
| `/api/knowledge` | GET, POST | List / create knowledge entries |
| `/api/stats` | GET | Dashboard aggregate stats |

## Screens

- `/` — executive overview (KPIs, top leads, recent ledger activity)
- `/leads` — leads board with scoring breakdown and stage control
- `/decisions` — evidence ledger with chain verification
- `/knowledge` — institutional knowledge entries
