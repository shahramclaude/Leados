import { Card, Pill, SectionTitle } from "../components/shared";

interface Row {
  claim: string;
  status: "verified" | "verified-absent" | "unverified" | "partially-verified";
  evidence: string;
}

const ROWS: Row[] = [
  {
    claim: "github.com/wbweve/Leados is a real, public repository with 42 files at root (main branch).",
    status: "verified",
    evidence: "GitHub Git Trees API, recursive=1, this session. Full file list + byte sizes captured.",
  },
  {
    claim: '"js/automation.js" (the path the pt-D brief asks for) does not exist, and no `js/` directory exists at all.',
    status: "verified-absent",
    evidence: "Same Trees API call — all files are flat at repo root, not under a js/ subfolder.",
  },
  {
    claim: '"ambient.js" (which the brief says automation.js loads "after") does not exist anywhere in the repo.',
    status: "verified-absent",
    evidence: "Full-text search across all .js/.md files fetched this session, and against health.js's own MANIFEST (10 mandated files, no ambient.js).",
  },
  {
    claim: "The real events.js registry defines exactly 92 event types, none named oneonone.logged, pulse.recorded, commitment.made, sprint.*, crisis.detected, war.room.opened, incident.comms.sent, succession.candidate, plan.created, narrative.drafted, message.tested, or fin.unit.logged.",
    status: "verified-absent",
    evidence: "events.js fetched and parsed in full this session; registry keys extracted and diffed against the brief's vocabulary.",
  },
  {
    claim: "The real repo DOES verify a prefill(ctx, P) -> {ok, kind, title, facts[], suggest{}, missing[]} contract, which this delivery's smartPrefill() extends.",
    status: "verified",
    evidence: "playbooks.js header comment, read in full this session, quoted verbatim in src/automation/prefill.ts.",
  },
  {
    claim: 'Finding keys in the real engine are built as `rule + ":" + scope` (e.g. "R1:ana"), not the brief\'s "AUTO:R1:cadence-drift:[personId]" format.',
    status: "partially-verified",
    evidence: 'engine.js, read this session: `key: o.rule + \':\' + scope`. The brief\'s literal AUTO: prefix was not found anywhere in the repo — adopted here only for the module\'s own system-generated findings (Task 5, backup), clearly labeled.',
  },
  {
    claim: "Real rule IDs run R1–R40. The brief references R86, R117, R118.",
    status: "verified-absent",
    evidence: "engine.js and health.js both searched for rule-id patterns (regex `R[0-9]+`); highest id found across both files is R40.",
  },
  {
    claim: 'The repo has no LEADOS._mod module registry, no snoozed/dismissed state, and no "command palette" feature — the real suppression mechanism is an `insight.acknowledged` event.',
    status: "verified-absent",
    evidence: 'Full-text search for "_mod", "snoozed", "dismissed", "palette", "commandPalette" across all .js files; only one unrelated hit ("palette" in a design-token comment in health.js).',
  },
  {
    claim: "The repo's root index.html is a tiny Vite template pointing at /src/main.tsx, while every root-level file (engine.js, store.js, …) lives at the repo root with no src/ directory — so the hosted repo as-is cannot build the app engine.js etc. belong to.",
    status: "verified",
    evidence: "index.html fetched and read in full (328 bytes); Trees API confirms no src/ path exists anywhere in the tree.",
  },
  {
    claim: "The repo's own README/AI-SESSION-LOG are from an unrelated prior delivery (pt-C, a React chart library), not from the vanilla-JS LeadOS app that engine.js/health.js/ui.js belong to.",
    status: "verified",
    evidence: 'README.md and AI-SESSION-LOG.md fetched and read in full this session; both are self-titled "pt-C — Data Visualization Engine" and describe charts, not automation.',
  },
  {
    claim: '"pulse" and "1:1" (oneonone) concepts existed in some earlier iteration of this fictional project\'s history.',
    status: "partially-verified",
    evidence: 'SESSION-3.patch.md (found in the repo tree) references "pulse sliders" and "oo-finish" (one-on-one finish) — but that file is explicitly a tombstone/patch doc for a lineage not reflected in the current events.js registry.',
  },
  {
    claim: "This delivery's event vocabulary, bundle effects, and sample people/log are fabricated for this demo.",
    status: "verified",
    evidence: "Authored this session in src/automation/seed.ts — no claim of sourcing from the real repo.",
  },
];

const STATUS_STYLE: Record<Row["status"], { label: string; tone: "slate" | "violet" | "emerald" | "amber" }> = {
  verified: { label: "✅ verified", tone: "emerald" },
  "verified-absent": { label: "✅ verified absent", tone: "amber" },
  "partially-verified": { label: "◐ partially verified", tone: "violet" },
  unverified: { label: "◯ unverified", tone: "slate" },
};

export function ProvenanceView() {
  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Every row below was checked against the live github.com/wbweve/Leados repository this session (Git Trees API + raw file fetches). Nothing here is relayed from an earlier, unverified session.">
          Provenance — what was actually inspected
        </SectionTitle>
        <div className="space-y-3">
          {ROWS.map((r, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-800">{r.claim}</p>
                <Pill tone={STATUS_STYLE[r.status].tone}>{STATUS_STYLE[r.status].label}</Pill>
              </div>
              <p className="text-xs text-slate-500">{r.evidence}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
