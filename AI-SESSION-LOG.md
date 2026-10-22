# AI Session Log

## Part 42 — Conversational layer (Ask-LEADOS) & Meeting Copilot

**Scope:** multi-turn dialogue-state agent over the Part 32 question ontology
and Part 33 orchestration shape; meeting copilot (pre/live/post) with
consent-gated transcript ingestion, drafted-artifact generation, and a
mandatory human-confirmation gate before anything commits as a Decision
(Part 23) or Task (Part 10).

### Sandbox reality check (read-before-write honesty note)

This sandbox's repository checkout contained only the bare Next.js +
Drizzle starter template (`src/db/{index,schema}.ts`, `src/app/{layout,page}.tsx`,
`src/app/api/health/route.ts`) — none of Parts 1–41's files were present on
disk to read, including the specific files the standing order named
(`src/lib/ai/*`, `briefing.ts`, `storytelling.ts`, Part 32's ontology file,
Part 33's router, `CommandPalette.tsx`). This is recorded here rather than
silently assumed away. To keep Part 42 buildable, verifiable, and honest
about its foundations, this session reconstructed **minimal, clearly
commented, narrow-surface stand-ins** for the specific contracts Part 42
depends on:

- `src/lib/ai/grounding.ts` + `src/lib/ai/llmClient.ts` — Part 11's
  cite-or-refuse contract, implemented deterministically (no LLM API key is
  provisioned in this sandbox — see "What we deliberately did not do" below).
- `src/lib/ontology/questions.ts` — Part 32's six-intent ontology
  (`query | compare | explain | simulate | draft | act`).
- `src/lib/orchestration/router.ts` — Part 33's single-entry-point router.
- `src/lib/policy/actionPolicy.ts` — Part 10's T1/T2/T3 action-tier gate.
- `src/db/schema.ts` additions for `decisions` (Part 23) and `tasks`
  (Part 10) as committed-entity sinks for confirmed meeting artifacts.
- `src/lib/consent/consent.ts` — Part 09's opt-in-only consent contract.

Every file above is additive and isolated; nothing here contradicts or
forecloses a later part dropping in the "real" Part 11/32/33 modules — the
import surfaces (`groundAnswer`, `classifyIntent`, `routeIntent`,
`gateAction`) are the seams a future part would replace.

### What was built

**Phase 1–3 (model/design/build):**
- `src/lib/conversation/dialogueState.ts` — dialogue state
  `{ turns, resolvedEntities, activeContext, groundingSet }`; scope
  inheritance so "and for Q3?" keeps the metric from the prior turn while
  letting an explicit mention override just the timeframe.
- `src/lib/conversation/contradiction.ts` — self-correction: if a new
  grounded answer disagrees with a prior assistant assertion for the same
  (metric, timeframe), the agent prepends an explicit correction rather than
  silently overwriting.
- `src/lib/conversation/engine.ts` — turn persistence, intent
  classification, routing, grounding, contradiction check, in that order,
  end to end.
- `src/lib/meeting/pipeline.ts` — pre-meeting brief (agenda + cited
  evidence), consent-gated transcript ingestion, post-meeting artifact
  generation (summary/decision/action/open-question, each cited to
  transcript spans), and `confirmArtifact` — the **only** path by which a
  drafted artifact becomes a committed `decisions`/`tasks` row. T2/T3
  actions throw `GatedConfirmationRequiredError` unless `acknowledgeGated`
  is explicitly passed.
- `src/lib/redaction/redact.ts` — two-gate redaction: at capture time
  (`shouldRedactAtCapture`) and again defensively at generation time
  (`filterConsentedSegments`), re-checked against *current* consent state.
- `src/lib/voice/seam.ts` — ledgered as deferred: `toSpeechReadyText` is
  real (strips markdown/citation noise), live ASR/TTS vendor wiring is not
  implemented and is explicitly labeled `deferred` in
  `VOICE_SEAM_STATUS`, not silently stubbed as if it worked.
- UI: `CommandPalette.tsx` (global ⌘K layer, pinned context chips, renders
  citations/abstention/contradiction/action-gate inline),
  `AskFollowUpButton.tsx` (inline follow-up affordance usable on any data
  surface — wired onto the homepage revenue card as a reference example),
  `MeetingRoomClient.tsx` (pre/live/post tabs with a visibly distinct
  "verbatim" vs "redacted"/"generated" styling), `ConsentBadge`/consent
  toggles per participant.

**Phase 3(e) eval slice:** `scripts/eval-llm.ts` — 40 multi-turn dialogues
(scope-inheritance grid across 4 metrics × 2 timeframes × 3 phrasings, plus
abstention, compare→explain, simulate→follow-up, draft→gated-act, and
3-turn scope chains), plus three dedicated probes: self-correction
(seeded contradiction), consent/redaction leak-attempt, and the
confirmation gate. `scripts/verify.ts` runs typecheck → lint → the eval
slice and is wired as `npm run verify`.

### Honesty rules applied
- Every conversational answer either carries ≥1 citation or abstains
  explicitly (`abstained: true`, `abstentionReason`) — never a fabricated
  number. Verified by the citation-continuity metric (1.000 in this run)
  and the dedicated abstention dialogues.
- Meeting artifacts are always labeled `generated: true` / drafted, and the
  UI visually distinguishes verbatim transcript lines from generated
  summary/decision/action text. Redacted lines never render as if they were
  verbatim.
- `act`-intent turns are never executed — only ever gated drafts
  (`actionGate.status === "blocked_needs_confirmation"` for T2/T3).

### Self-review / Phase 5 attack answers
1. **Wrong assumption carried forward:** scope inheritance trusts the prior
   turn's `activeContext` blindly when the new utterance reads as a
   follow-up. If the user says "and the number for last quarter" after an
   agent *misclassified* metric in turn 1, the wrong metric rides along
   silently. **Recovery path implemented:** the contradiction checker
   catches it the moment a *new* grounded value disagrees with a prior
   claim for the same scope key and forces an explicit correction turn
   rather than compounding the error. It does not catch a wrong metric
   inherited into a *first-time* claim (no prior claim to contradict) —
   that gap is real and is the honest limit of this build: the mitigation
   is the visible context chip in the palette, so a human sees and can
   correct the inherited scope before trusting the answer.
2. **Narrative capture risk:** the generated summary is explicitly labeled
   `generated: true`, always ships with citations into transcript span IDs,
   and commits nothing on its own — the decision/action drafts are the only
   artifacts that can become permanent record, and only after a named human
   confirms them (`confirmedBy` is stored). The verbatim transcript is
   retained independently of the summary, so the "official" generated
   narrative can always be checked against the source material later — it
   doesn't overwrite or discard the verbatim record.
3. **Power-dynamic risk (the boss hears everything):** consent is per
   person, opt-in only (`pending` is treated as non-consent, not a default
   yes), and enforced at two points (capture + generation) so an organizer
   cannot simply generate artifacts that include a non-consenting
   subordinate's words. The attempt-to-leak probe in `eval:llm` asserts
   this structurally, not just by policy text. What this build does **not**
   solve: a boss who is in the room can still *verbally* pressure someone
   into opting in, and the tool has no way to detect coerced consent — that
   is a people/process problem outside what software can enforce, and is
   named here rather than claimed as solved.
4. **Deliberately not done:**
   - No real LLM call is wired (no API key in this sandbox); grounding uses
     deterministic keyword scoring and template narration. The seam
     (`llmClient.ts`) is real and ready for a provider swap.
   - No live ASR/TTS integration — `voice/seam.ts` documents this as
     deferred rather than faking it.
   - No auth/multi-tenant org boundary beyond a single `orgId` column —
     out of scope for this part.
   - No org-level retention-policy enforcement job (e.g. auto-purge after N
     days) — the schema has the hooks (`createdAt` on every row) but no
     scheduler exists yet.

### Verification
See VERIFICATION LOG in the delivery message for full command output:
`npx next typegen`, `npm exec tsc --noEmit`, `npm run build`,
`npm run verify` (typecheck + lint + 40-dialogue eval slice + 3 gate
probes), and a live `build_and_start` + curl transcript against
`/api/conversations`, `/api/meetings/*` showing scope inheritance,
cite-or-refuse abstention, consent-gated redaction, and the confirmation
gate (including a blocked T2 action without explicit acknowledgement).
