# Reference

Information-oriented, kept in sync with code by hand today (see "Keeping this page honest" at the
bottom — there is no code-generation step yet, which is itself disclosed, not hidden).

## Configuration variables

| Variable | Required | Read by | Default | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | Yes | `src/db/index.ts` | none — process throws at startup if unset | PostgreSQL connection string. See `.env.example`. |
| `NODE_ENV` | No | `src/db/index.ts` | `development` (Next.js default) | Controls whether the DB pool is cached on `globalThis` for hot-reload (`development`) or created fresh (`production`). Standard Next.js convention, not LEADOS-specific. |

That is the complete list. There are no feature-flag variables, no API keys, and no tenancy/locale
variables in this version — if a doc elsewhere implies otherwise, it is describing the roadmap and
must say so explicitly (see `docs/CONSISTENCY-SWEEP.md`).

## API families

Base path: none (single app, no `/api/v1` versioning yet — see "Versioning" below).

### `GET /api/health`
Returns process + DB status. Used by `Dockerfile` `HEALTHCHECK` and the platform's
`build_and_start` check.

**Response 200:** `{"ok": true, "service": "leados", "version": "0.1.0"}`
**Response 500:** `{"ok": false, "service": "leados", "version": "0.1.0"}` (DB unreachable)

### `GET /api/leads`
List leads, ordered by score descending.

Query params: `status` (optional) — one of the values in "Lead statuses" below.

**Response 200:** `{"leads": Lead[]}`

### `POST /api/leads`
Create a lead and compute its initial score.

**Body:** `{"name": string, "email": string, "company"?: string, "source"?: string, "notes"?: string}`

**Response 201:** `{"lead": Lead}`
**Response 400:** `{"error": string}` — missing/invalid `name` or `email`.
**Response 409:** `{"error": "a lead with this email already exists"}`

### `GET /api/leads/:id`
Fetch one lead plus its last 10 score events.

**Response 200:** `{"lead": Lead, "scoreHistory": ScoreEvent[]}`
**Response 404:** `{"error": "lead not found"}`

### `PATCH /api/leads/:id`
Update any of `name`, `company`, `source`, `notes`, `status`. Changing `company`, `source`, or
`notes` triggers a rescore and a new `score_events` row (`reason: "updated"`). Changing only
`status` does not rescore.

**Body:** any subset of `{"name", "company", "source", "notes", "status"}`

**Response 200:** `{"lead": Lead}`
**Response 400:** `{"error": "invalid status"}` — `status` not in `LEAD_STATUSES`.
**Response 404:** `{"error": "lead not found"}`

### `DELETE /api/leads/:id`
Hard-deletes a lead and cascades its `score_events`.

**Response 200:** `{"ok": true}`
**Response 404:** `{"error": "lead not found"}`

### `POST /api/leads/:id/score`
Force a rescore using current rules, regardless of whether any input changed. Always writes a new
`score_events` row (`reason: "recomputed"`).

**Response 200:** `{"lead": Lead}`
**Response 404:** `{"error": "lead not found"}`

### Versioning

There is no `/api/v1` prefix and no API versioning scheme yet. Because there are currently zero
external consumers (this is a single-process internal tool), breaking API changes are made
directly and called out in `CHANGELOG.md` under a `### Changed` heading with `BREAKING:` prefix.
If LEADOS grows external API consumers, introduce versioning before the first breaking change —
track that decision as an ADR (`docs/adr/`).

## Data types

```ts
// Lead (src/db/schema.ts)
{
  id: number;
  name: string;
  email: string;
  company: string | null;
  source: string;             // see "Lead sources" below
  status: string;              // see "Lead statuses" below
  score: number;                // 0-100
  scoreBreakdown: Record<string, number> | null;
  scoreVersion: string;         // e.g. "rule-v1"
  notes: string | null;
  createdAt: string;            // ISO timestamp
  updatedAt: string;            // ISO timestamp
}

// ScoreEvent (src/db/schema.ts)
{
  id: number;
  leadId: number;
  score: number;
  breakdown: Record<string, number>;
  scoreVersion: string;
  reason: "created" | "updated" | "recomputed" | "seed";
  createdAt: string;
}
```

### Lead statuses (`src/lib/scoring.ts` → `LEAD_STATUSES`)
`new`, `contacted`, `qualified`, `disqualified`, `converted`

### Lead sources (`src/lib/scoring.ts` → `LEAD_SOURCES`, suggested values for the `source` field)
`referral`, `website`, `event`, `cold-outreach`, `unknown` — `source` is stored as free text, so
other values are accepted but score 0 source points (treated like `unknown`) unless you add a
weight for them in `SOURCE_WEIGHTS`.

### Scoring breakdown keys (`src/lib/scoring.ts` → `computeScore`)
| Key | Max points | Rule |
|---|---|---|
| `source` | 30 | Looked up from `SOURCE_WEIGHTS` by the lead's `source` value. |
| `hasCompany` | 15 | Non-empty `company`. |
| `workEmailDomain` | 20 | Email domain is not in the free-email-provider list. |
| `hasContext` | 10 | `notes` is at least 10 characters. |
| `domainMatchesCompany` | 10 | Normalized company name appears inside the email domain. |

Total is clamped to 0–100.

## Event types

LEADOS does not have a message bus or event-streaming system (`FEATURES.md` — realtime is
planned). The only "events" that exist are rows in the `score_events` table, written synchronously
in the same request that causes them. The `reason` column is the event type discriminator:

| `reason` | Written by |
|---|---|
| `created` | `POST /api/leads` |
| `updated` | `PATCH /api/leads/:id` (only when company/source/notes changed) |
| `recomputed` | `POST /api/leads/:id/score` |
| `seed` | `scripts/seed.ts` |

If a future part adds a real event bus, this table must be updated in the same PR, and the old
`score_events` rows should be described here as "the pre-event-bus audit log", not silently
replaced.

## Keeping this page honest

There is no OpenAPI spec and no doc-generation step in this version — this page is maintained by
hand alongside the route handlers in `src/app/api/`. `scripts/check-docs-links.mjs` (run by
`npm run verify`) only checks that links resolve; it does not currently diff this page against the
route handlers' actual behavior. That gap is listed in `FEATURES.md` as a roadmap item: "Reference
kept in sync via generation" is aspirational, not yet true, and this sentence exists specifically
so that aspiration doesn't get mistaken for a shipped guarantee.
