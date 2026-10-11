# Leadership Platform — Bilingual (Danish/English) Project & Personal Leadership

A fully self-contained, browser-based leadership application covering **engineering project leadership** and **personal leadership**. The app is **click-only by design** — there is no free-text input anywhere; every field is a dropdown, picker, or chip. It works in **both Danish and English** with **cultural context guidance** for Nordic and international settings.

No install, no build step, no server, works offline.

## Run it

**Locally:** open `index.html` in any modern browser (double-click, or drag it into a tab).

**Run tests:**
```bash
cd leadership-app
npm install           # install all dependencies
npm test              # engine + full-app smoke tests
npm run test:server   # server-backed audit API tests
npm run test:all      # all engine, browser-smoke and server tests
npm run verify        # all tests plus dependency security audit
npm start             # app + local append-only audit API on port 8001
npm run test:production-contracts # validate production schema and Docker contract
```

## Production profile

The portable production profile is `docker-compose.production.yml`. Copy `.env.production.example` to `.env.production`, replace every placeholder through a secret manager, and start with `docker compose --env-file .env.production -f docker-compose.production.yml up -d`. PostgreSQL initializes from `db/migrations/001_initial.sql`, and the profile enables the transactional adapter with `LEADERSHIP_PERSISTENCE=postgres`. Local development continues to use JSONL by default; set `LEADERSHIP_PERSISTENCE=jsonl` to force that mode.

GitHub Actions runs `npm run verify` automatically on every push and pull request using the locked dependencies in `package-lock.json`.

The Node server serves the same static app and exposes `/api/health`, `/api/audit`, `/api/approvals`, `/api/workspace`, `/api/workspace/history`, and `/api/alerts`. Audit and approval entries are validated, timestamped, chained with SHA-256 checksums, and stored in `server-data/audit.jsonl` and `server-data/approvals.jsonl`. Workspace data is validated and atomically stored in `server-data/workspace.json`; every save also creates a hash-chained revision in `server-data/workspace-history.jsonl`.

The automation API exposes `/api/automation` for the current governed queue, `/api/automation/run` for an authenticated queueing pass, and `/api/automation/ack` for human disposition. Set `LEADERSHIP_AUTOMATION_INTERVAL_MS` to a value of at least `60000` to enable the optional server scheduler. It queues audit-backed jobs only; risk, budget, approval, and other consequential actions still require an explicit human decision.

Set `LEADERSHIP_AUTOMATION_PAUSED=true` to stop new automation queueing and delivery while preserving read-only diagnostics. Automation also stops when the durable job hash chain is invalid; operators must review and resume explicitly.

For deployment, set `LEADERSHIP_API_TOKEN` for an admin token or `LEADERSHIP_API_TOKENS` to a JSON object mapping bearer tokens to roles (`viewer`, `auditor`, `editor`, `admin`). Audit reads require `auditor`; audit writes and workspace writes require `editor`; workspace reads require `viewer`. Viewer and auditor workspace reads redact sensitive conflict, feedback, reflection, one-on-one, recognition, and performance registers. Non-admin editors cannot mutate approval records through workspace saves. With no token configured, the server runs in unrestricted local-development mode.

## How it works

1. **Settings** — set your workspace name, method (Agile/PRINCE2/PMBOK/Kanban/Waterfall/Lean/SAFe/Hybrid), currency, language, and team roster.
2. **+ New Entry** — fill the form (all dropdowns + curated suggestions). Computed columns (RPN, SMART score, OKR progress, budget variance, etc.) calculate live.
3. A single task flows into PM Tasks, Kanban, Gantt, RACI, Risk Register, and more — automatically.
4. **Dashboard** — live KPIs across projects, tasks, risks, goals, and team.
5. **Link Explorer** — create and remove audited relationships between records across registers.
6. **Workflow Center** — deterministic, explainable follow-up suggestions linked to owning modules.
7. **Data Quality** — completeness scoring and source links for tasks, risks, controls, budgets, approvals and decisions.
8. **Portfolio Management** — compare project progress, risk, team coverage and budget variance across workspaces.
9. **Financial Control Center** — consolidate planned, actual, committed and forecast cost with alert actions.
10. **Cultural Context** — contextual guidance boxes appear throughout (feedback, delegation, meetings, conflict, motivation, decision, time, trust, development), each with Danish and international perspectives.
11. **Governance Automation** — normalized event history, chronology and completeness checks, and deterministic follow-up jobs for overdue work, high risks, control tests, approvals, and budget variance. Consequential jobs are explicitly marked for human approval.

## Learning guidance

The app includes a pedagogical layer across the full navigation surface:

- Every view begins with a contextual guide that names the current page, explains what it is for, and offers a named next destination.
- Every view also names the **related modules it is wired to** — a clickable strip of chips with live record counts — so the navigation itself teaches how the registers share data (a task links to Kanban, Gantt, RACI, WBS, burndown, critical path, sprint and more).
- **Help** provides five goal-based starting routes and an eight-area practice map for project, personal, team, strategy, finance, risk, business, and setup work.
- The **Dashboard** includes a data-aware five-step journey: workspace setup, scope, tasks, risk, and review/share. Completed steps are marked from the current workspace state.
- A persistent **TODO action list** propagates every registration into the modules that depend on it: adding a task, risk, goal, budget line, control or meeting enqueues the concrete follow-up actions ("assign RACI roles", "add a control", "take exceptions to Governance") with one-click jump buttons, a bell badge with the open count, and a per-view strip that points at what needs attention right now. State-derived TODOs (overdue tasks, high risks, budget variance, breached KRIs) complete themselves when the underlying condition is resolved.
- Guidance and navigation labels switch between English and Danish, and the journey controls are keyboard and screen-reader accessible.

The full-app smoke test derives its route list from the rendered navigation and verifies that every navigation view has an actionable, valid next step.

AI governance readiness requires `server-data/ai-governance.json` (or the configured `LEADERSHIP_DATA_DIR`) containing a hashed, non-expired manifest. In production it must also have an HMAC signature using `LEADERSHIP_AI_GOVERNANCE_SECRET`. Generate one with `require('./js/ai-governance').createManifest(models, { secret: process.env.LEADERSHIP_AI_GOVERNANCE_SECRET })` and persist the returned object. Each model must declare an owner, version, current calibration evidence, abstention behavior, and monitored drift status. Missing, expired, unsigned, or modified manifests keep `/api/readiness` in `NOT_READY`.

Production backups are HMAC-authenticated with `LEADERSHIP_BACKUP_SIGNING_SECRET`; restore rejects a signed manifest with an invalid signature before writing any data.

## Click-only by design

Every operational field is a **dropdown or picker**. Problem statements, root causes, targets, costs, hours, leadership vocabulary, and cultural guidance are all chosen from curated lists. The smoke test asserts `window.prompt` is **never called**.

## Bilingual (Danish/English)

Toggle between Danish (Dansk) and English from the top bar. The change is instant — navigation, labels, status values, priorities, and cultural notes all switch. Cultural guidance is **region-specific**: the app surfaces different advice for Nordic flat-hierarchy, consensus-driven contexts versus Anglo-Saxon decisive, deadline-driven contexts.

## Views (110 navigation views across 9 groups)

### Overview
- **Project Dashboard** — KPI cards (active projects, open tasks, high risks, team members, personal goals, overdue, due this week, avg completion), task status breakdown, risk band summary, budget summary

### Engineering Project Leadership
- **PM Tasks** — task register with priority, dates, estimated end, status, progress
- **Kanban Board** — drag-and-drop columns (Open → In Progress → On Hold → Blocked → Done)
- **Timeline (Gantt)** — visual bar chart of task durations
- **Risk Register** — severity × occurrence × detection → RPN with auto banding
- **FMEA** — risk-based view with RPN scoring
- **RACI Matrix** — Responsible/Accountable/Consulted/Informed per task × team member
- **Work Breakdown (WBS)** — hierarchical task view
- **Milestone Plan** — baseline/forecast/actual with slip calculation
- **Budget** — estimated vs actual with variance
- **Earned Value (EVM)** — BAC/PV/EV/AC → CPI/SPI/CV/SV/EAC/VAC
- **Daily Standup** — yesterday/today/blockers format
- **Retrospective** — Start/Stop/Continue + multiple frameworks
- **Sprint Planning** — backlog, capacity, sprint goal
- **Resource Planning** — team capacity overview
- **Scope & Charter** — project metadata and method
- **Quality Plan** — quality gates (design review, code review, test sign-off, UAT)
- **Communications Plan** — stakeholder/channel/frequency matrix
- **Procurement** — procurement status tracking
- **Change Log** — change type/reason/impact/approver/status
- **Lessons Learned** — reflection entries with action for next time

### Personal Leadership
- **Self-Assessment** — overview of goals, EI, DISC, Belbin
- **Personal Goals (SMART)** — 5-dimension SMART scoring with verdict
- **GROW Coaching** — auto-generated coaching questions per stage (Goal/Reality/Options/Will)
- **360° Feedback** — feedback types + frameworks (SBI, COIN, CEDAR, Radical Candor)
- **Emotional Intelligence** — 4-pillar self-rating with live score + verdict
- **Time Management Matrix** — Eisenhower quadrant (urgent × important)
- **Habit Tracker** — habit register with streak calculation
- **Personal OKRs** — linked to the OKR Scorecard
- **DISC Profile** — 4-dimension self-rating with dominant style
- **Belbin Team Roles** — 9 roles with top-3 identification
- **Johari Window** — Open/Blind/Hidden/Unknown quadrants
- **Reflection Journal** — curated reflection entries with energy/mood
- **Personal Values** — 10 value categories as chips
- **Energy Audit** — 4 energy types (high/low positive/negative)
- **Delegation Planner** — 5-level delegation scale per task

### Team & People
- **Team Roster** — team members with roles (click-only name selection)
- **1-on-1 Meetings** — person/date/topic/outcome/follow-up
- **Team Health Check** — 5 Lencioni pillars (Trust/Conflict/Commitment/Accountability/Results)
- **Conflict Resolution** — stages, resolution approaches, scenarios + Thomas-Kilmann model
- **Meeting Management** — type/purpose/date/facilitator/duration/outcome
- **Performance Review** — focus area + rating per team member
- **Training & Development** — 70-20-10 model, training types
- **Recognition & Rewards** — 7 recognition types
- **Psychological Safety** — 7-item Edmondson scale with live score + verdict
- **Culture Canvas** — Values/Rituals/Heroes/Symbols

### Strategy & Decision
- **SWOT Analysis** — 4 quadrants with auto-strategy (SO/WO/ST/WT)
- **PESTLE Analysis** — 6 external factors
- **Decision Matrix** — weighted scoring + decision methods (including RAPID)
- **Prioritisation (RICE/WSJF)** — formula reference
- **OKR Scorecard** — baseline/target/current → auto progress + status
- **Scenario Planning** — best/base/worst case + stress test
- **Stakeholder Map** — influence × interest → auto strategy
- **Balanced Scorecard** — 4 perspectives (Financial/Customer/Internal/Learning)
- **Strategy Map** — layered strategy view

### Financial Leadership
- **Financial Tracking** — income, cost and commitment visibility
- **ROI / NPV / IRR** — investment value and timing analysis
- **Break-even / Burn Rate** — volume thresholds and runway awareness
- **Financial Ratios / Cost-Benefit** — financial health and change-case comparison

### Risk Management
- **Bow-tie Analysis** — prevention and recovery barriers around a top event
- **Risk Appetite** — acceptable uncertainty and escalation boundaries
- **Monte Carlo Simulation** — delivery ranges from uncertain estimates
- **COSO ERM / ISO 31000** — structured risk-management principles
- **Risk Heat Map** — likelihood and impact prioritisation

### Business Strategy
- **Porter’s Five Forces** — competitive pressure analysis
- **BCG / Ansoff Matrices** — portfolio and growth choices
- **VRIO** — capability-based advantage
- **Business Model Canvas** — customers, value, activities and economics
- **Value Chain / Blue Ocean** — value creation and differentiation choices

### Setup
- **Report Pack** — printable dashboard view
- **Audit Log** — every action logged with timestamp
- **Snapshots & Backups** — create/restore/delete snapshots
- **Settings** — workspace config, language, currency, accent colour, export/import JSON, reset
- **Help** — goal-based routes, eight practice areas, learning steps and cultural guidance

## Cultural Context

The app surfaces **context-specific cultural guidance** throughout. Each guidance box has both a Danish and an English perspective:

| Context | Example (EN) | Example (DA) |
|---------|-------------|-------------|
| Feedback | "Frame feedback as specific observations + impact, not personal judgement." | "Rammer feedback som specifikke observationer + effekt, ikke personlig dom." |
| Delegation | "Delegate the outcome, not the method — trust your team to find the path." | "Deleger resultatet, ikke metoden — stol på at teamet finder vejen." |
| Meetings | "Danish meetings have an agenda sent in advance — deviation is seen as disrespectful." | "Danske møder har en dagsorden sendt i forvejen — afvigelse opfattes som respektløst." |
| Conflict | "Address conflict early — Nordic cultures prefer direct, private conversations." | "Håndtér konflikt tidligt — nordiske kulturer foretrækker direkte, private samtaler." |
| Motivation | "Danish workers are motivated by autonomy, mastery and purpose — not by carrot/stick." | "Danske medarbejdere motiveres af autonomi, mestring og mening — ikke af gulerod/pisk." |
| Decision | "Danish decision-making favours 'forankring' — building broad buy-in before acting." | "Dansk beslutningstagen foretrækker 'forankring' — at skabe bred opbakning før handling." |
| Time | "Nordic workdays are efficient by design — long hours signal poor planning, not dedication." | "Nordiske arbejdsdage er effektive af design — lange timer signalerer dårlig planlægning." |
| Trust | "Trust in Nordic cultures is cognitive (reliability) more than affective (closeness)." | "Tillid i nordiske kulturer er kognitiv (pålidelighed) mere end affektiv (nærhed)." |
| Development | "Danish employment law guarantees 'kompetenceudvikling' — development is a right." | "Dansk ansættelsesret garanterer 'kompetenceudvikling' — udvikling er en rettighed." |

## Files

```
index.html        app shell
css/styles.css    theme (light/dark, responsive)
js/i18n.js        bilingual engine + cultural dictionary
js/calc.js        pure calculation engine (RPN, SMART, RICE, WSJF, EVM, DISC, EI, etc.) + curated vocabularies
js/store.js       state, localStorage persistence, derived KPI views
js/ui.js          navigation, views, forms, click-only register tables
test.js           129 engine and store unit tests
smoke.js          79 full-app jsdom smoke tests (115 navigation views, renderer coverage, linked records, workflow actions, data quality, portfolio, financial controls, language toggle, accessibility, click-only check)
```

## Trust layer (round-15)

A set of cross-cutting modules make the platform's trust *provable*, not just claimed:

- **External chain anchoring** — `/api/trust/anchor` cuts a point-in-time notarization (root hash of every chain + timestamp); `/api/trust/anchor/verify` recomputes all roots so any third party can verify tamper-freedom independently.
- **Cross-module consistency verifier** — `/api/consistency/scan` extracts the same figure wherever it appears (budget variance, EVM EAC, KRI thresholds) and flags irreconcilable values.
- **Incident lifecycle** — `/api/incidents` opens/escalates/closes incidents with severity policy, RCA, corrective actions and lessons; auto-opens from KRI breaches.
- **Retention & legal hold** — `/api/retention/*` schedules, freezes records under legal hold, and dry-runs purges before any deletion.
- **Person master-index** — `/api/people/*` resolves aliases to one canonical person across feedback, conflicts, reviews and mentorship.
- **Mentorship & succession** — `/api/mentorship/*` pairs mentees to mentors by declared needs and scores succession readiness.
- **Intervention experiments** — `/api/experiments/*` runs A/B interventions (recognition, coaching, 1:1 cadence) with deterministic assignment, Welch's t-test and a Bayesian Beta posterior; small samples report "inconclusive", never a fake verdict.
- **Automation proof-of-execution** — `/api/automation/evidence` hash-chains *what automation actually ran* (input snapshot + output) so automation can be audited after the fact.
- **Verifiable LLM narrative** — optional `js/llm-narrative.js`: with keys it drafts narratives and verifies every claim; without keys it degrades to the deterministic engine. It never speaks unverified.

## Round-16: policy engine, outbound webhooks, bank-feed connector, OIDC SSO, analytics

- **Policy engine** — `/api/policy` + `/api/policy/evaluate` turn governance into data: declarative rules (finance thresholds, FX review, critical-risk review, admin-role protection, automation default-deny) with an explicit kill-switch override. Every decision returns the matched rule + reason, is audited, and can be chained as evidence.
- **Outbound webhooks** — `/api/webhooks` for Slack/Teams/generic subscriptions with HMAC signing, exponential-backoff retries, idempotency windows, and dead-letter state after 5 failures. Env-preseedable via `LEADERSHIP_OUTBOUND_WEBHOOKS`.
- **Bank-feed connector** — `/api/connector/bank-import` turns the manual import into a pluggable connector: `bik` (Danish bank CSV, handles `1.250,75` decimals), `sandbox` (OAuth-shaped dev fixture), `http` (fetch+parse). Transactions are normalized, deduped against prior imports, stored via the finance-operations store, and every import lands on the automation-evidence hash chain.
- **OIDC SSO** — `/api/oidc/start` + `/api/oidc/callback` implement the authorization-code flow: discovery, JWKS fetch, RS256/ES256 ID-token verification (iss/aud/exp/nonce), and role derivation from group claims. 503 until `LEADERSHIP_OIDC_*` env vars are set.
- **Usage analytics** — `/api/analytics/usage` (auditor) reports route adoption, unique users, and dead-end detection from a bounded in-memory capture. Nothing leaves the device.
- **New eval gates** — `npm run eval:llm-golden` (LLM claim-drift gate: deterministic path always, live path with keys) and `npm run eval:dast` (adversarial probes: prompt injection, JSON smuggling, prototype pollution, oversized payloads, path traversal, burst rate-limit). Both wired into the nightly CI eval job with artifact uploads.

## Round-17: Control Center, learning loops, risk portfolio, evidence packs

- **Control Center** — `control-center.html` (admin console served by the app) renders the whole governance surface from `/api/control-center`: a 0–100 governance score with explicit penalties (blocked actions, open incidents, dead-lettered automation, evidence integrity breach, kill-switch), queue counts (pending decisions, approval backlog, webhook/delivery failures, open incidents), recent policy decisions with reasons, evidence-chain integrity, top systemic risks, weekly personal insight, experiment auto-stop status and webhook registry. Read-only except the policy-recalibration button; token via `?token=` or `localStorage.leadership_token`.
- **Learning loop** — `/api/policy/recalibrate` (admin) feeds automation accept/decline acks into the policy engine: a rule accepted ≥90% auto-promotes to `allow`, ≤50% downgrades to `review`; every change is audited. `/api/learning/weekly` turns habits + reflections + energy + OKRs into a deterministic coaching brief. `/api/learning/experiments` recommends auto-stop for intervention A/Bs (sufficient n + significant/Bayesian signal only).
- **Risk portfolio** — `/api/risk/portfolio` aggregates single-register risks into systemic themes across projects (top-10 systemic risks), computes RAROC-lite (income − cost − expectedLoss ÷ riskCapital) with explicit source basis, and surfaces the vendor risk feed (scorecard quadrants + high-risk-weak vendors).
- **Evidence packs** — `/api/evidence/package` (auditor) builds a point-in-time pack: audit chain, approvals, control test results, incident register, automation evidence + integrity, finance integrity, external chain anchor — with a SHA-256 manifest verified by `js/evidence-pack.js` (tamper = invalid manifest).
- **New eval gate** — `npm run eval:round17-golden` (policy, risk portfolio, evidence pack, learning, control-center) with committed baseline + drift detection; wired into PR + nightly CI. DAST and all golden gates are now hard gates on every push.

Adds 6 endpoints (control-center, policy/recalibrate, learning/weekly, learning/experiments, evidence/package, risk/portfolio) — API conformance now covers them.

## Round-18: period close, decision outcomes, conflict outcomes, secrets rotation, endorse

- **Period close + certificate** — `/api/finance/close` seals a month: trial-balance check, freeze (no automated postings into the period), SHA-256 close certificate manifest + chain anchor. `/api/finance/close/reopen` is the ONLY audited way to change a sealed period (every reopen hits the audit chain); `/api/finance/close/status` lists seals. The policy engine consults the freeze before any automated finance job.
- **Decision outcome ledger** — `/api/decisions/outcomes` registers decisions with expected outcomes + due dates; `/resolve` scores the actual result (0–10). `/api/decisions/outcomes` returns per-domain calibration (strong/acceptable/weak — your decision shine-line), and overdue decisions auto-flag as stale-review jobs.
- **Conflict outcomes + personal register** — `/api/conflicts/outcome` resolves a case (resolved/recurred/escalated); a recurrence **auto-opens an incident**. `/api/conflicts/personal` keeps a leader's own stress-relationship register feeding the weekly wellbeing pulse.
- **Secrets rotation** — `/api/secrets/due` + `/api/secrets/rotate` operationalize rotation: due schedule, fingerprints (never raw values), old-credential-usage detection, rotation records on the evidence chain, and the audit/report surface kept backward-compatible (the pre-existing `/api/security/secrets-audit|report` latent crash is fixed).
- **Endorse + trend** — `npm run endorse` runs the ordered matrix through ONE `DEPLOY_READY` certificate (manifest-hashed). `npm run eval:trend` reads all eval-reports and produces a 90-day regression history (golden, DAST, conformance, calibration, endorse), served at `/api/trend`.

## Round-19: watchdog, forecast accuracy, external attestation, compliance calendar

- **Watchdog + daily attestation** — `/api/watchdog/status` verifies EVERY chain (audit, workspace history, approvals, finance, evidence, decisions) live and computes a 0–100 **Trust Score** (chains 35 / decisions 25 / forecasts 20 / calibration 20, explicit). `/api/watchdog/attest` signs a manifest-hashed DAILY ATTESTATION with a fresh chain anchor; `/api/watchdog/verify` re-hashes it — tamper anywhere flips it to FAIL. The Control Center now shows the Trust Score.
- **Forecast → actual loop** — `/api/forecasts` + `/api/forecasts/actual` grade every numeric forecast by horizon (MAPE + bias); `/api/forecasts` returns accuracy + due-for-grading, and the module computes a BIAS-ADJUSTED projection (≥2 matured samples) with the adjustment disclosed. The app now shows its own error, honestly.
- **External notarization** — `/api/attestation/export` builds the signed minimal bundle (schema v1, roots, manifest, HMAC) and POSTs it to `LEADERSHIP_NOTARY_URL` when configured. With no notary it returns an honest 502 — never faked success. The notary echoing our root back is verified (`verifyNotaryResponse`).
- **Compliance calendar** — `/api/compliance/*` tracks external obligations (GDPR 72h, VAT, ISO audit windows): lead-day urgency, upcoming window, submission proof (evidence-pack manifest) and automatic advancement of recurring due dates.
- **New eval gates** — `npm run test:round19` (round-19 modules **+ chain-tamper property** — tamper any chain → attestation FAIL — **+ i18n coverage**: all 414 UI keys, 9 culture contexts, 85 glossary terms in both EN/DA) and `npm run eval:round19-golden` (deterministic baseline). All wired into PR + nightly CI.

## Evaluation & CI (round-15)

- **API conformance** — `node scripts/eval/api-conformance.mjs` boots the server and live-probes every route documented in `api-spec.yaml` (59 endpoints), failing on silent spec drift.
- **Coverage floor** — `npm run coverage:gate` fails CI below 50% lines / 35% functions / 45% branches.
- **Security scanning** — gitleaks (secrets) + CycloneDX SBOM + CodeQL in CI.
- **Multi-browser E2E** — the Playwright suite runs on chromium, firefox and webkit.
- **Model agreement** — `test/model-agreement.test.js` runs digital-twin vs longitudinal-sim differential invariants; it already caught and fixed a real bug where the simulator's terminal health was always 0.
- **Self-heal discover** — `scripts/self-heal/discover.mjs` turns diagnostics findings into candidate patches (dry-run → real test gate → apply), with a hard blocklist against touching secrets, auth, or ops/deploy config.

## Data

## Calculations

- **RPN** = Severity × Occurrence × Detection. Bands: ≥200 Critical, 100–199 High, 50–99 Medium, <50 Low.
- **SMART** = average of 5 dimensions (Specific/Measurable/Achievable/Relevant/Time-bound), each 1–5.
- **RICE** = (Reach × Impact × Confidence%) ÷ Effort.
- **WSJF** = (User value + Time-criticality + Risk-reduction) ÷ Job size.
- **EVM**: CPI = EV/AC, SPI = EV/PV, EAC = BAC/CPI, VAC = BAC − EAC.
- **DISC**: highest of D/I/S/C → dominant style.
- **EI**: average of 4 pillars (self-awareness, self-management, social awareness, relationship management).
- **Psychological safety**: mean of 7-item Edmondson scale.
- **Thomas-Kilmann**: assertiveness × cooperativeness → 5 conflict styles.
- **Habit streak**: walks backwards from today counting consecutive completed days.
- **OKR progress**: (current − baseline) ÷ (target − baseline), clamped 0–1.

## Deep process-safety layer

Beyond the core hazard toolbox (HAZID/HAZOP/LOPA/SIL/ATEX/JSA/FMEA/bow-tie, MOC, PTW, incidents/TRIFR), the **Risk Management & Process Safety** board now carries a deep layer across three views:

- **Process Safety Toolbox** — QRA with UK-HSE tolerability bands; a chemical register using **official international designations only** (GHS01–GHS09 pictogram codes, H-statements, CAS/UN numbers, ADR classes) with a hazard-class segregation screen; Ex equipment compliance checked from the official marking (`Ex II 2G Ex h IIC T4 Gb`) against zone/category/EPL/T-class/group/certificate; PSSR startup gates (all-or-nothing); CAPEX FEL1→FID stage-gates with ESG + process-safety deliverables (AACE classes); Life-Saving Rules incl. stop-work authority; contractor prequalification (Zero Harm counts contractors); Zero-Harm walks.
- **Management Systems & Compliance** — element registers for ISO 9001/14001/45001/50001/27001/31000/55001/22301/37001, Seveso III MAPP, OSHA PSM (14 elements), CCPS RBPS and the IEC 61511 SIS lifecycle, each with owner, evidence and next review. Coverage is scored; certification is never claimed.
- **Policy targets** — a sustainability-policy commitment register modelled on published chemical-industry frameworks and fully adaptable to the organization (Zero Harm TRIFR ≤ 0.4 employees+contractors, net zero 2040 with Scope 1+2 −95% by 2030, SBTi 74% by 2027, circularity 2029, LCA 80% by 2030, DE&I 30% by 2030, engagement top 10%, human rights, minerals, CoC training, responsible supplier management, ESG-in-investments, community impact).

New API surface: `/api/risiko/report` (one read for all registers), `/api/risiko/compute` (stateless QRA/LOPA/FMEA/marking/chemicals/Ex/PSSR/CAPEX/LSR/frameworks), `/api/risiko/reference` (vocabularies + official reference data), and PATCH `/api/risiko/:section` for chemicals, exItems, pssrs, capex, lsrChecks, contractors, zhWalks, frameworkRows and qra. Every mutation is audit-logged. Reference values (CAS/UN/ADR/GHS data) are selected common values for awareness — the current SDS and the Danish grænseværdiliste (AT-vejledning C.0.1) are always authoritative.

## Qualification & acceptance testing (DQ/FAT/SAT/IQ/OQ/PQ)

The **Qualification & Acceptance Testing** view qualifies critical power and production systems end-to-end: protocol phases DQ → FAT → SAT → IQ → OQ → PQ with phase-order validation; an electrical/functional test catalog with **official designations and standard references** (IEC 60364-6 initial verification, IEC 61439 LV assemblies, IEC 60204-1 stop categories, IEC 60079-17 Ex inspection, IEEE 400.2 VLF cable, IEEE 43 rotating machines, IEC 62040 UPS, ISO 8528 gensets, IEC 60255 protection relays); URS traceability (a requirement without protocol coverage is a named gap that blocks release); critical/major/minor deviations where closeout **requires evidence** and waivers **require a written rationale**; executor/verifier/quality/owner sign-offs scaled by criticality; PQ re-qualification watch; and an all-or-nothing release verdict — RELEASED only with every phase accepted and zero open critical/major deviations, otherwise RELEASE-BLOCKED with the explicit blocker list. API: `/api/kvalificering/report`, `/api/kvalificering/reference`, PATCH `/api/kvalificering/:section` (protocols, runs, deviations, signOffs, urs), all audit-logged. Qualification signals feed the daily risk digest. The engine structures and tracks — it does not replace the tester, the calibration lab (ISO/IEC 17025 traceability) or the site's validation master plan.

## Calibration & traceability (ISO/IEC 17025-style)

The **Kalibrering & sporbarhed** view registers the measurement equipment behind every acceptance decision: instruments with official type designations and standard references, accuracy class, calibration interval and status — calibrations with certificate no., traceable-to (national standard), laboratory + accreditation no., uncertainty and as-found/as-left values. The status engine is honest: a failed calibration never extends validity; an instrument with no calibration is `unknown`, never fabricated. A twin-check cross-references the qualification engine's test runs and names any run measured with an instrument whose calibration had expired at run time as a measurement-integrity finding (advisory — it never rewrites verdicts). Signals feed the daily risk digest. API: `/api/kalibrering/report`, `/api/kalibrering/reference`, PATCH `/api/kalibrering/:section` (instruments, calibrations).

## Everyday team leadership (the hverdag registers)

Six registers built for the team leader's daily work, each wired into the Monday briefing (**ugebriefing**) so the day's leadership decisions surface themselves: **Forbedringsforslag** — the employee suggestion system with response-deadline discipline (14 days), mandatory written rejection reasons, owner + deadline on acceptance and effect evaluation after implementation; **1:1-samtalen** — the recurring employee-agenda-first conversation cadence with never-held / overdue / due-soon states and stale-action tracking; **Løsningsfokuseret ledelse** — preferred future, exceptions and the 0–10 skalasamtale with automatic +1 follow-ups, a Danish question bank, and honest stagnation detection (flat scores mean the approach changes, not the employee); **Ofmans kernekvadrant** — core quality / pit / challenge / allergy per person with automated team-clash analysis (one's pit hitting another's allergy is the team's shared development agenda); **IBIS-runden** — ideas before concerns, every concern anchored to a concrete idea, closing syntheses with recorded decisions, unanswered concerns open the next meeting; and **Distancedledelse (KN/LOA)** — planned + random contact, written reachability agreements, channel-preference matching and office-day overlap with the hybrid agreement. Conflict handling is guided through the triage-gated phases model (**afklaring → grænsesætning → konsekvens**) on top of the existing Glasl/NVC/mediation engine. All live under `/api/forbedring|entilen|loesningsfokus|kernekvadrant|ibis|distanced/{report,reference,PATCH :section}`, and all six methods are registered in the method registry with full playbooks.

## The daily practice layer (dagsledelse · mødestrategi · vedligeholdsmetoder)

The layer the leader opens every morning. **Dagsledelse** (`/api/dagsledelse/report`) is one read over ALL registers answering "what needs action TODAY?": formal-route conflicts first, conflict follow-ups due with the phases model's next step, suggestions past their answer window, 1:1s never held or overdue, 1-5-10 sickness contacts, distance-contact debt, uncovered shifts and overdue competence activities — each with priority (alerts before watch) and a click through to the owning module, plus the three daily leadership questions. **Mødestrategi** (`/api/moeder/report`) auto-generates the three recurring team-leader meetings from the app's own registers: the tavlemøde (safety first, production, blockers), the personalemøde (suggestions answered on the record — overdue ones by name — and open conflicts with their next phase step) and the per-employee 1:1 (her cadence, her agreements, her scale questions); every item carries its opening question. **Vedligeholdsmetoder** (`/api/vedligehold-metoder/*`) runs maintenance as leadership discipline: RCM (hidden failures require failure-finding tasks; safety consequences without a task flag high), TPM (autonomy steps + honestly computed OEE), 5S (re-audit dates — "Oprethold" dies first) and RCA/5-why (done actions without effect check keep the root cause a hypothesis); signals feed the ugebriefing. All read layers stay honest: empty registers give calm onboarding states, never fabricated urgency.

## The leader's mirror, printable meetings and the employee's own page

The practice layer closes its loop three ways. **Leder-rytmen** (`/api/leder-rytme/report`) turns the leadership lens around and asks the question nobody else dares ask: are YOU working the rhythms you expect of the team? Five rhythms are measured honestly — the 1:1 cadence per member, the staff meeting with its minutes discipline, the board meeting, the suggestion answer window (alive = no answer debt) and the wellbeing pulse; "not started" is an honest beginning, never a verdict, and the summary always names the one rhythm to resume this week. The **daily cockpit and the auto-generated agendas are printable** (`/api/dagsledelse/report.pdf`, `/api/moeder/report.pdf`) — today's actions as a desk sheet, the tavlemøde/personalemøde/1:1 dagsordener with their opening questions. And the **employee's own page** (medarbejdersiden) now carries her everyday block: her 1:1 cadence and its state, her own suggestions with status and answer debt, her own core quadrant, and assembled prompts for the next 1:1 — so both sides arrive prepared. Only her own rows, never others'; empty registers stay silent.

Three everyday registers close the personaleledelse / teamledelse / driftsledelse triangle, each wired through cockpit → briefing → signals → watchers:
- **Velkomstprogrammet** (`/api/velkomst/*`, view 🌱) — onboarding as a discipline: statutory starter checklist, buddy from day one (kollegaordningen), four check-ins (day 1, week 2, month 1, month 3 before probation). Overdue check-ins are cockpit alerts; a plan-less newcomer is "uden plan", never "bagud".
- **Anerkendelses-loggen** (`/api/anerkendelse/*`, view 🌟) — concrete ros with a fairness view: who has NOT been recognised in 60+ days is named, because the quiet ones disappear first. The daily cockpit question "hvem har fortjent en anerkendelse i dag?" gets live candidates. The log judges the leader's practice, never the people.
- **Skiftoverleveringen** (`/api/overlevering/*`, view 🔁) — structured handover where open points carry owner, next step and due date, get a deterministic id, and close only in a LATER handover with a name and a date. Open HMS points are always high signals — safety is handed over, never "kun til orientering" — and sit in the cockpit until closed.
- **Reservedels-dækningen** (`/api/reservedele/*`, view ⚙) — a critical asset without its critical spare is planned downtime nobody signed. Coverage = stock on the shelf, a supplier with a lead time on file, or an explicit dated acceptance of the gap — never silence. Open gaps are cockpit alerts; the register judges PREPAREDNESS, never people.

The **driftsmøde** joins the auto-generated meetings: the daily/weekly operations huddle built from the registers (safety, handover carry-over, the PM to protect, spare gaps, staffing, blockers) — served in `/api/moeder/report` alongside tavlemøde and personalemøde. And the coach answers questions about the velkomstprogram, the recognition log, the handover and the spares from the live registers — grounded, never generic.

## Automation: the registers speak through alerts, cockpit and coach

The everyday layer is fully wired into the app's automation chain. **`js/hverdag-signaler.js`** emits count-only signals from seven sources (suggestion answer debt, 1:1 cadence gaps, unanswered IBIS concerns, missing meeting minutes, conflict formal-routes and due follow-ups, maintenance-method discipline gaps, and the leader's own fallen-out rhythms) into the alert pipeline, where ten built-in watchers turn them into alerts and warnings — formal-route conflicts and answer debt are ALERTs; the leader's own rhythm slip is a private WARNING. The **daily cockpit** covers all twelve TODAY sources, including staff-meeting decisions past deadline, unanswered IBIS concerns and delegation checkpoints ("delegation uden opfølgning er overgivelse"). And the **Danish coach** answers questions about forbedringsforslag, 1:1, løsningsfokus, kernekvadrant, IBIS, distancedledelse, leder-rytme, dagsledelse and the maintenance methods (RCM/TPM/5S/RCA) grounded in the live registers — never a generic script.

## Two-way 1:1 and the quarterly cooperation review

The 1:1 is two-way by design (**medbestemmelse**): the employee proposes items for the next talk from her own page (`PATCH /api/entilen/prep`, an append-only log moving from open → taken-up → done), her proposals lead the auto-built 1:1 agenda, and a proposal left open raises a register signal — the employee's own agenda does not wait forever. Once a quarter, the **teamsamarbejds-rapport** (`/api/team-samarbejde/report{,.pdf}`, view 🤝) assembles six sources into one document to read WITH the team: the core quadrants' clash pairs (shared development, never verdicts), the charter's rules under pressure, the pulse trend with honest small-n boundaries, 1:1 coverage, IBIS dialogue health and the suggestion system as the trust barometer — judging the SYSTEM, never the people. The **daily digest email leads with the cockpit**: today's leadership actions before the register alarms.

## Advanced verification & governance

Five verification engines close the gap between tracking and verifying: **FTA/ETA** (IEC 61025/62740 — minimal cut sets, disclosed union-bound top-event probability, Fussell-Vesely/Birnbaum importance, event-tree sequences with unmapped end states named); **SIL verification** (IEC 61508/61511 — Route 1H PFDavg/PFH from λDU, proof-test interval and coverage, plus Route 2L SFF and hardware-fault-tolerance tables: a loop that passes PFD but fails the HFT constraint is **not verified**); **Business Impact Analysis** (ISO 22301 §8.2 — MTPD/RTO/RPO/MBCO per critical process, dependencies, recovery strategies; RTO > MTPD is a KRI); **NIS2** (EU 2022/2555 — art. 23 clocks 24h/72h/1-month with live countdown and breached state, entity classification with size presumption, art. 20 management-body governance register); and **measurement quality** (AIAG MSA GR&R + ISO 22514 Cp/Cpk — a passing PQ run from a not-capable process, or a study measured with a bad gauge, is called out). Three governance registers sit alongside: the **ISO/IEC 27001:2022 Statement of Applicability** (all 93 Annex A controls, exclusions require justification), the **Hoshin Kanri X-matrix** (an annual objective without a metric or a long-term goal is not deployed) and **EU AI Act readiness** (risk tiering with art. 5 screening, per-system obligation tracking, art. 4 literacy records). All live under `/api/fta|sil|bia|nis2|mq|soa27001|hoshin|aiact/{report,reference,PATCH :section}`, all feed the daily risk digest, and SIL + NIS2 have printable PDF dossiers alongside the qualification protocol dossier.

## Data

- Saved automatically in your browser (`localStorage`) — nothing is sent anywhere.
- **Export JSON** (Settings) to back up or move your data; **Import JSON** to restore.
- **Print** any view to paper or PDF.
