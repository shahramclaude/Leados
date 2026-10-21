# Tutorial: your first hour with LEADOS

This is a *learning-oriented* walkthrough (Diátaxis "Tutorial"): follow it top to bottom the
first time, on a machine with Node.js 20+ and a PostgreSQL instance you're allowed to write to.
Every command below was actually run against this repository while writing this document — see
the verification log in the Part 19 delivery notes for the transcript.

## 0. Before you start

You need:
- Node.js 20 or newer (`node -v`).
- A reachable PostgreSQL 14+ database and its connection string.

You do **not** need: Docker, Redis, a message queue, or any API keys. LEADOS has exactly one
runtime dependency (PostgreSQL) in this version.

## 1. Install

```bash
git clone https://github.com/shahramclaude/Leados.git
cd Leados
cp .env.example .env
```

Open `.env` and set `DATABASE_URL` to your PostgreSQL connection string. The default value points
at `postgresql://postgres:postgres@127.0.0.1:5432/app_db`, which matches the sandbox this project
was developed in — change it if your database lives elsewhere.

```bash
npm install
```

**What you should see:** a normal npm install log ending in a package count, plus an `npm audit`
summary. The audit warnings are pre-existing in the base template's transitive dependencies; they
do not block anything in this tutorial.

## 2. Create the schema

```bash
npm run db:push
```

This runs `drizzle-kit push` using `drizzle.config.json` against `src/db/schema.ts`. **What you
should see:** Drizzle prints the two tables it is creating or confirms they already match
(`leads`, `score_events`) and exits 0. There are no migration files to review — see
`docs/explanation.md` → "Why no migration files yet" for why that's an intentional tradeoff at this
project size.

If this step fails, it is almost always `DATABASE_URL` pointing at a database that doesn't exist
yet or isn't reachable — fix `.env` and re-run.

## 3. Seed — get your first data

```bash
npm run seed
```

**What you should see:** four lines like:

```
  created Priya Shah <priya.shah@globex-industrial.com> — score 85
  created Jordan Lee <jordan.lee@brightfield.io> — score 75
  created Sam Carter <sam.carter@gmail.com> — score 5
  created Ana Kowalski <ana@northwind-events.com> — score 70
```

(This is real output, captured by running `npm run seed` against this repository while writing
this tutorial — see the verification log in the Part 19 delivery notes.)

The exact scores depend on the weights currently in `src/lib/scoring.ts`; if you've already edited
that file, your numbers will differ — that's expected, and is the whole point of the next how-to
guide (`docs/how-to-guides.md` → "Add a scoring rule").

## 4. Run the app and get your first insight

```bash
npm run dev
```

Open `http://localhost:3000`. You should see a table with the four seeded leads, sorted highest
score first. Click any score pill (e.g. "85") — a tooltip shows the raw breakdown, something like:

```json
{ "source": 30, "hasCompany": 15, "workEmailDomain": 20, "hasContext": 10, "domainMatchesCompany": 10 }
```

That breakdown *is* the "insight": every point is traceable to a named rule, and you can read the
rule in `src/lib/scoring.ts` in under a minute. There is no hidden model behind this number.

## 5. Make your first decision

In the **Decision** column, change Priya Shah's status from `new` to `qualified`. The dropdown
PATCHes `/api/leads/:id` immediately and the row's status pill updates. That status is now
persisted — refresh the page and it's still `qualified`.

You've now completed the full loop the product exists for: **intake → score → decide.** From here:

- To add your own leads instead of the seed data, use the form at the top of the dashboard, or
  `POST /api/leads` directly (see `docs/reference.md`).
- To change how scoring works, see `docs/how-to-guides.md` → "Add a scoring rule".
- To understand what's deliberately not built yet (auth, multi-tenancy, realtime), read
  `FEATURES.md` before you show this to anyone outside your own machine.

## Where a new contributor is likely to get stuck

Documented honestly, because we walked this tutorial ourselves while writing it (see the
adversarial self-review in the Part 19 delivery notes):

- **`DATABASE_URL` pointing at a database/user that doesn't exist.** `npm run db:push` fails with
  a Postgres connection error, not a friendly message. Fix: create the database first
  (`createdb app_db` or equivalent) and confirm with `psql "$DATABASE_URL" -c 'select 1'`.
- **Running `npm run seed` twice.** It's safe — duplicate emails are skipped via
  `onConflictDoNothing`, you'll just see `skipped (already exists)` lines — but if you expected
  eight leads and still see four, that's why.
- **Expecting a second browser tab to update live.** It won't; there's no realtime transport yet
  (`FEATURES.md`). Refresh the second tab.
