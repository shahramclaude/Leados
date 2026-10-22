const QUESTIONS = [
  {
    q: "1. Which of the 20 canonical questions is answered most weakly — is it data or design?",
    a: "market.sentiment and market.competitorMoves. It is a DATA gap, not a design gap: the answer compiler, narrative contract, and UI are fully wired (see the Market section of any Weekly Pack), but there is no live market-intelligence feed in this build (Part 27's seam), so both questions are one dataset connection away from being fully answerable — they currently resolve to a correct, honest NotAnswerableYet on the fledgling org and a single static snapshot on the sample org (no trend history). The weakest DESIGN point, by contrast, is strategy.competitivePosition: a single scalar delta is thin evidence for a decision as big as 'are we winning' and deserves a multi-factor breakdown (pricing, win-rate, logo churn vs. competitors) the current schema doesn't carve out drivers for.",
  },
  {
    q: "2. Where does executive simplification risk distortion — show your uncertainty-preserving rule working.",
    a: "The risk is in headline-only reading: a CEO skimming only `thread.verdict` could read 'Revenue forecast: $1.93M' as a fact. The rule enforced in `briefingCompiler.ts#answerToSentences`: any QuestionAnswer carrying an `interval` has its headline sentence rewritten to append the P10–P90 range AND the confidenceClass label before it is allowed into a section — simplification is not permitted to drop the interval even in the shortest surface. Try it: open Board Pack Studio -> 'Forecast range' section -> the one-sentence headline on the slide still reads 'between $X and $Y' with a forecast badge, not a bare number. The same rule is why `EvidenceDrawer` prints the interval even in its most compact form.",
  },
  {
    q: "3. What does the pack look like for an org with almost no data (honest emptiness)?",
    a: "Select 'Fledgling Co.' in any view. Its WeeklyPack has 20 sections, but ~10 resolve to explicit NotAnswerableYet sentences ('not answerable yet — reason'), never a fabricated 0% or empty chart presented as a real reading. Where zero is a TRUE and meaningful answer (e.g. zero control-test failures because zero control tests have run, zero attrition-risk teams because the org has 3 people), the compiler says so explicitly and distinguishes it from 'not tracked' — this distinction is the single most important honesty feature in this part.",
  },
  {
    q: "4. What did you deliberately NOT do?",
    a: "(a) No LLM call anywhere in this build — DailyBrief/WeeklyPack/BoardPack prose is the deterministic narrative itself, not a 'polish pass' over it, because we have no sandboxed model endpoint to run Part 11's citation-lint-gated polish against; the seam (`briefingCompiler.ts` header) documents exactly where that would plug in. (b) No live database / API routes — `domainData.ts` is a clearly-ledgered fixture standing in for Parts 07/08/09/27/29's real read-models; nothing here claims to be live. (c) No browser-driven Playwright e2e suite — the sandbox has no browser binaries pre-installed and a full install risked the step budget; `lib/journey.ts` + `scripts/verify.ts` give a real, repeatable interaction-count + compute-timing transcript instead, explicitly ledgered as a logic-level proxy, not a pixel-level one. (d) No real TTS wiring for the voice/ambient layer — `ssml.ts` renders a real, inspectable SSML document but nothing speaks it. (e) No dark mode / full design-token system — Part 02's design system is itself a documented stub in the real repo; we did not invent tokens under its name.",
  },
];

export function SelfReviewPanel() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">LEADOS · Part 32 self-review</p>
        <h1 className="text-2xl font-bold text-slate-900">Phase 5 — Attack</h1>
      </header>
      <div className="space-y-5">
        {QUESTIONS.map((item, i) => (
          <section key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">{item.q}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.a}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
