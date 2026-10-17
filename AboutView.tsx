import { Card, SectionTitle, Badge } from "./ui";

const ROWS: { claim: string; status: "verified" | "not-found" | "fabricated"; detail: string }[] = [
  {
    claim: "github.com/wbweve/Leados exists; root is a React 19 + Vite 7 + Tailwind 4 project (vite-plugin-singlefile)",
    status: "verified",
    detail: "Raw-fetched package.json this session: name react-vite-tailwind, deps react 19.2.6 / vite 7.3.2 / vite-plugin-singlefile 2.3.0.",
  },
  {
    claim: 'A separate vanilla window.LeadOS lineage exists at repo root: store.js (schemaVersion 5, KEY="leados:data") and engine.js',
    status: "verified",
    detail: "Raw-fetched store.js and engine.js this session. store.js literally contains heatmapDecayFactor: 0.85.",
  },
  {
    claim: "heatmapDecayFactor: 0.85 and correlationWindowDays: 90 and decisionMaxOpenDays: 21 are real settings in that repo",
    status: "verified",
    detail: "Read directly from store.js's V1/V5_SETTING_DEFAULTS this session — reused here as this build's DECAY, correlation window, and decision-staleness constants.",
  },
  {
    claim: "engine.js has a per-domain decay-weighted severity rollup conceptually like a heatmap",
    status: "verified",
    detail: 'Fragments independently located this session: `const w = r.sev * Math.pow(decay, r.ageDays)` inside a cluster/correlation routine — confirms the concept exists, under different names.',
  },
  {
    claim: "A function literally named LEADOS.correlate.heatmap, LEADOS.correlate.measureVelocity, or a shape P.state.events exists in the real repo",
    status: "not-found",
    detail: "Not located in anything fetched this session (package.json, store.js, engine.js, README.md). The real engine's entity shapes are per-module (finRisks, legalRisks, deals, …), not a generic domain/severity event stream.",
  },
  {
    claim: "LEADOS.orgPhysics (computeChangePhysics / measureOrgEntropy / computeLeadershipEnergyBudget / measureResonance) exists in the real repo",
    status: "not-found",
    detail: "Not located anywhere fetched this session. This build implements it fresh, per the pasted brief, against this build's own Projection shape.",
  },
  {
    claim: "This sandbox's 5 domains, seed people/goals/decisions/commitments/pipelines, and the LEGAL domain's calibrated +0.070/d trajectory",
    status: "fabricated",
    detail: "Hand-placed for this demo so it deterministically reproduces this task's own illustrative numbers (score ≈5.2, velocity ≈+0.070/d, 30d projection ≈7.3). Disclosed in src/lib/seed.ts. Will drift slightly day to day because scores are computed live from \"now\".",
  },
];

export function AboutView() {
  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Disclosure"
        title="Verified vs. fabricated, at a glance"
        desc="Per this session's own instruction to inspect the real repo before claiming anything about it. Full method is in AI-SESSION-LOG.md."
      />
      <div className="space-y-3">
        {ROWS.map((r, i) => (
          <Card key={i}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-slate-800">{r.claim}</p>
              <Badge color={r.status === "verified" ? "green" : r.status === "not-found" ? "amber" : "slate"}>
                {r.status === "verified" ? "✅ verified" : r.status === "not-found" ? "⚠️ not found" : "⚠️ fabricated"}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-slate-500">{r.detail}</p>
          </Card>
        ))}
      </div>
      <Card className="bg-slate-900 text-slate-200">
        <p className="text-sm">
          This app is <strong>not</strong> a patch to the real <code>wbweve/Leados</code> repo. It is a fresh, self-contained
          implementation of the pasted "Organizational Physics Engine" (Part 2) and "Temporal Velocity Measurement" (Part 1)
          briefs, built inside this sandbox's required React + Vite + Tailwind architecture (not the real repo's vanilla
          single-file convention). See README.md for the full changelog and AI-SESSION-LOG.md for the raw verification trail.
        </p>
      </Card>
    </div>
  );
}
