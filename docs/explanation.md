# Explanation

Understanding-oriented. This is where we justify decisions and admit limits, rather than just
describing how to use the system.

## Architecture

LEADOS is one Next.js (App Router) process talking to one PostgreSQL database. See the mermaid
diagram in `README.md` for the shape. Specifically:

- **Server components** (`src/app/page.tsx`) query the database directly via Drizzle for the
  initial page render — no internal HTTP round-trip for the first paint.
- **Client components** (`src/components/LeadBoard.tsx`) call the same API routes a third-party
  integration would use (`src/app/api/leads/**`), so there is exactly one write path into the
  database, not two.
- **API routes** are the only place business rules run (validation, scoring, status transitions).
  They are thin: parse → validate → call `computeScore()` → write → respond.
- **The database** holds two tables (`leads`, `score_events`). There is no cache layer, because
  there is no load yet that would justify one — adding Redis before you have a performance problem
  to point at would itself be a violation of the "every claim traceable to code" principle this
  release is built around.

### Why no migration files yet

`npm run db:push` applies `src/db/schema.ts` directly via `drizzle-kit push`, with no generated SQL
migration files checked in. This is appropriate for a pre-v1, pre-production, single-environment
project where schema and code deploy together. It stops being appropriate the moment there are two
environments with independently-evolving data (e.g. a staging DB that must not be dropped and
recreated) — at that point, switch to `drizzle-kit generate` + `drizzle-kit migrate` and track that
switch as an ADR. `docs/RELEASING.md` already assumes expand/contract discipline for the day this
matters.

## The intelligence methodology, and its honest limitations

LEADOS's "intelligence" is `computeScore()` in `src/lib/scoring.ts`. Being precise about what that
is and isn't:

**What it is:** a deterministic, additive, fully-inspectable point system. Every point awarded has
a name, a cap, and a one-line rule a non-engineer can read. The entire "model" fits in 90 lines of
TypeScript with no dependencies.

**What it is not:**
- Not machine learning. There is no training step, no model file, no gradient, no probability.
- Not validated against outcomes. The weights (30/20/15/10/10) were chosen by the people who wrote
  this code as plausible defaults. Nobody has measured whether a lead scoring 85 actually converts
  more often than one scoring 40, because there is no conversion-outcome data captured anywhere in
  the schema yet.
- Not adaptive. Scores do not change unless a human edits the rules or the lead's own data changes.
  There is no feedback loop from `status: converted` back into the scoring function.
- Not personalized. Every tenant (there is only one) and every user sees the same rules.

**Why ship this instead of waiting for a real model:** a transparent, wrong-sometimes heuristic
that a salesperson can argue with ("why did this get a 20, not a 40?" → "because it has no
company field, see the breakdown") is more useful at this stage than an opaque model with no
training data behind it anyway. The honest claim is "LEADOS sorts your leads by a checklist you can
edit," not "LEADOS predicts conversion." The README and `FEATURES.md` are written to never claim
the latter.

**What would need to be true before this becomes real ML:** a conversion outcome column, enough
rows to split train/test, a chosen model class, an evaluation harness with a held-out set, and a
calibration check comparing predicted vs. observed conversion rate by score bucket. None of that
exists. If it's built later, this section must be rewritten, not appended to.

## Fairness posture

LEADOS makes one fairness claim today, and it is a negative one, verifiable by reading
`src/db/schema.ts`: **no protected-class or demographic attribute is collected or stored anywhere**
— no race, gender, age, disability, nationality, or proxy fields like zip code or name-derived
ethnicity inference. `computeScore()` only reads `email`, `company`, `source`, and `notes`.

This is a narrow, deliberately modest posture:
- It does not mean the scoring is fair in any statistical sense — fairness metrics (demographic
  parity, equalized odds, etc.) require a protected attribute to measure against, and since none is
  collected, no such metric can be computed, for better or worse. We are not claiming the absence
  of data proves the absence of bias; a rule like "work email domain" can still correlate with
  socioeconomic or geographic factors indirectly.
- There is no fairness-auditing tooling (`FEATURES.md`), because there is no model to audit and no
  outcome data to audit against. Building an audit harness before there's anything to audit would
  produce theater, not safety.
- When a learned model or an outcome-feedback loop is introduced (see "Intelligence methodology"
  above), this section must be expanded with: what attribute(s) are collected, what fairness
  metric is tracked, what the acceptable threshold is, and who is accountable for monitoring it —
  before that model ships, not after.

## The attention philosophy

LEADOS deliberately does not try to grab attention. Concretely, as implemented today:

- No notifications, no badges, no "you have N new leads" banners exist.
- The dashboard is pull-based: you open it, you see the current state, you act, it refreshes once
  to confirm your own action. It does not poll in the background and does not push updates from
  other users' actions into your open tab (`FEATURES.md` — realtime is planned, not built).
- The score breakdown is shown on request (hover/click), not forced into view — the summary number
  is the default, the explanation is one click deeper, matching the idea that attention should be
  spent by the user's choice, not captured by the interface.

This is as much a statement of current limitation as of philosophy: a future realtime layer (M4 in
the roadmap) should be built to *inform*, not to *interrupt* — e.g. a quiet in-page indicator that
new data exists, not a sound or a modal. That design intent is recorded here now, before the
feature exists, specifically so it constrains the implementation later.

## Security posture

Stated plainly, matching `README.md`:

- **No authentication or authorization anywhere.** Every route in `src/app/api/` and the `/`
  dashboard will serve any request that reaches the process. This is the single largest risk in
  the project. Mitigation today is purely topological: run this only on a network you control
  (localhost, VPN, private subnet with a security group that restricts inbound access).
- **No rate limiting.** Combined with no auth, this means the app has no defense against being
  used as a write amplifier (e.g. scripted `POST /api/leads` spam) beyond whatever sits in front of
  it at the network layer.
- **SQL injection:** not applicable in the ordinary sense — all queries go through Drizzle's
  parameterized query builder (`src/app/api/leads/**`), no raw string interpolation into SQL
  anywhere in the codebase.
- **Secrets:** exactly one, `DATABASE_URL`, read once at process start from `.env`/the environment
  (`src/db/index.ts`). It is never logged, never returned in any API response, and `.env` is not
  committed (see `.gitignore`-equivalent expectation — ensure your deployment doesn't bake `.env`
  into an image; `Dockerfile` does not copy it).
- **Dependency posture:** `npm install` currently reports pre-existing `npm audit` findings in
  transitive dependencies of the base Next.js/Tailwind toolchain. None are exploitable through any
  code path LEADOS itself exercises at runtime (they are build-tooling-only transitive deps); they
  are listed here rather than silently ignored. Re-run `npm audit` before each release
  (`docs/RELEASING.md`).

See `docs/DEPLOYMENT.md` for how the deployment story accounts for all of the above (reverse proxy,
network placement) given that in-app auth does not exist yet.
