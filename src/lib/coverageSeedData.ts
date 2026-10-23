// Seed data transcribed verbatim from the Part 59 dry-run's
// "COVERAGE MATRIX SEED — PARTS 00-58" document. Every row is a claim to
// verify, not a fact — see docs/PHASE-0-VERIFICATION.md.

export type SeedStatus = "canonical" | "partial" | "absent";

export interface CoverageSeedRow {
  partNumber: number;
  title: string;
  seedStatus: SeedStatus;
  evidence: string;
  note: string;
}

export const coverageSeedData: CoverageSeedRow[] = [
  { partNumber: 0, title: "Master blueprint & constitution", seedStatus: "canonical", evidence: "docs/FINDINGS-2026-PART-00.md, docs/PART-00-SELF-REVIEW.md, docs/adr/ADR-0001-event-sourcing-truth-core.md", note: "constitution + self-review present" },
  { partNumber: 1, title: "Knowledge substrate: ontology + event-sourced truth core", seedStatus: "canonical", evidence: "docs/adr/ADR-0001-event-sourcing-truth-core.md, docs/adr/0005-event-versioning-posture.md, tests/unit/eventSchema.test.ts", note: "event-sourcing posture recorded" },
  { partNumber: 2, title: "Design intelligence system", seedStatus: "canonical", evidence: "src/app/styleguide/ColorTokens.tsx, docs/DESIGN-SYSTEM.md, gen-tokens*.mjs", note: "token generators exist (3 variants — see Divergences)" },
  { partNumber: 3, title: "Interaction architecture & state orchestration", seedStatus: "canonical", evidence: "src/app/api/agent/runs/[id]/replay/route.ts, 94 hits (orchestrat/state-machine)", note: "" },
  { partNumber: 4, title: "Reasoning core: probabilistic decision intelligence", seedStatus: "canonical", evidence: "tests/unit/bayesian.test.ts, src/app/hypotheses/, src/app/inference/", note: "" },
  { partNumber: 5, title: "Causal & counterfactual engine", seedStatus: "canonical", evidence: "src/app/causal/, src/app/api/causal/counterfactual/route.ts", note: "route + UI family present" },
  { partNumber: 6, title: "Organizational digital twin & simulation lab", seedStatus: "canonical", evidence: "src/app/scenarios/, src/app/api/cadence/policies/simulate/route.ts, src/app/resilience-lab/", note: "" },
  { partNumber: 7, title: "Strategy & execution operating system", seedStatus: "canonical", evidence: "src/app/act/strategic/, src/app/strategic/, src/app/strategy/", note: "three overlapping families — watch for duplication (C3)" },
  { partNumber: 8, title: "Financial intelligence", seedStatus: "canonical", evidence: "src/app/act/financial/, src/app/finance/, src/app/financial/", note: "again overlapping families" },
  { partNumber: 9, title: "People & organization intelligence", seedStatus: "canonical", evidence: "docs/FAIRNESS.md, tests/fairness.test.ts, src/app/admin/fairness/", note: "fairness posture documented + tested" },
  { partNumber: 10, title: "Autonomous operations layer", seedStatus: "canonical", evidence: "src/app/api/autonomous/, src/app/api/automation/, src/app/api/automation-runs/", note: "" },
  { partNumber: 11, title: "LLM language & reasoning layer", seedStatus: "canonical", evidence: "src/__tests__/language-policy.seam.test.ts, src/__tests__/injection-guard.seam.test.ts", note: "language policy + injection guard tested" },
  { partNumber: 12, title: "Institutional memory & knowledge graph", seedStatus: "partial", evidence: "src/app/memory/, src/app/api/knowledge/digest/route.ts", note: "src/views/MemoryView.tsx is legacy-gen; verify canonical depth" },
  { partNumber: 13, title: "Sensing & early warning", seedStatus: "canonical", evidence: "src/app/api/decisions/signals/route.ts, src/app/api/forecasting/questions/route.ts, src/app/signals/", note: "" },
  { partNumber: 14, title: "Realtime & attention economics", seedStatus: "canonical", evidence: "docs/REALTIME.md, src/app/attention-report/, src/app/api/adaptation/attention/route.ts", note: "" },
  { partNumber: 15, title: "Universality: i18n, multi-tenancy, roles, PWA", seedStatus: "canonical", evidence: "src/i18n/, docs/SECURITY.md (tenant posture), 248 hits", note: "" },
  { partNumber: 16, title: "Open platform: API, webhooks, SDK & extensions", seedStatus: "canonical", evidence: "api-spec.yaml, openapi.yaml, sdk.ts, src/app/api/integrations/test-webhook/route.ts", note: "3 spec files (api-spec.json/yaml + openapi.yaml) — dedupe candidate" },
  { partNumber: 17, title: "Quality engineering & verification", seedStatus: "canonical", evidence: "tests/visual/visual.spec.ts, stryker.config.mjs, vitest.mutation.config.ts", note: "mutation testing configured" },
  { partNumber: 18, title: "Performance engineering & scale", seedStatus: "canonical", evidence: "perf-budgets.json, docs/PERFORMANCE.md, docs/SLO.md", note: "budgets are files, not proof — re-measure in-run" },
  { partNumber: 19, title: "Security, privacy & compliance", seedStatus: "canonical", evidence: "docs/THREAT-MODEL.md, docs/SECURITY.md, src/app/api/auth/login/route.ts", note: "note: auth surface is thin per FEATURES.md" },
  { partNumber: 20, title: "Observability, reliability & SRE", seedStatus: "canonical", evidence: "docs/SLO.md, src/app/degradation-status/, src/app/failure-domain-coverage/", note: "" },
  { partNumber: 21, title: "Release engineering & documentation", seedStatus: "canonical", evidence: "docs/RELEASING.md, CHANGELOG.md, docs/adr/ADR-0002-evidence-ledger-release-gate.md", note: "evidence-ledger release gate recorded" },
  { partNumber: 22, title: "Grand unification & adversarial red team", seedStatus: "canonical", evidence: "docs/RED-TEAM-PROGRAM.md, docs/RED-TEAM-FINAL.md", note: "" },
  { partNumber: 23, title: "Decision governance & decision operations", seedStatus: "canonical", evidence: "src/app/api/decisions/[id]/commit/route.ts, src/app/my-decisions/", note: "commit semantics exist" },
  { partNumber: 24, title: "Strategic foresight & war-gaming", seedStatus: "canonical", evidence: "src/app/api/contagion/scenarios/route.ts, src/app/scenarios/, src/app/resilience-lab/", note: "contagion/cascade modeling present" },
  { partNumber: 25, title: "Operating cadence & ritual automation", seedStatus: "canonical", evidence: "src/app/cadence/, src/app/api/cadence/effectiveness/route.ts, src/app/api/cadence/graph/route.ts", note: "" },
  { partNumber: 26, title: "Change & transformation OS", seedStatus: "partial", evidence: "src/lib/changeManagement.ts, src/app/api/change/programs/[id]/route.ts", note: "thin (14 hits) — verify breadth" },
  { partNumber: 27, title: "Customer, market & competitive intelligence", seedStatus: "partial", evidence: "src/views/StrategyView.tsx (legacy), weak canonical hits", note: "legacy-only evidence — rebuild-target risk; extend canonical instead" },
  { partNumber: 28, title: "Process intelligence & operational excellence", seedStatus: "canonical", evidence: "src/app/process-mining/, src/app/api/process-mining/automation/propose/route.ts", note: "" },
  { partNumber: 29, title: "GRC operating system", seedStatus: "absent", evidence: "src/lib/beta.ts, src/lib/findings.ts (incidental, 5 hits)", note: "effectively absent despite src/app/governance + src/app/risk shells — verify those two families first" },
  { partNumber: 30, title: "Organizational learning & experimentation", seedStatus: "canonical", evidence: "src/app/api/adaptation/*, learning-loop hits (64)", note: "" },
  { partNumber: 31, title: "Ecosystem, partner & stakeholder intelligence", seedStatus: "canonical", evidence: "src/app/api/directory/route.ts, src/app/api/industry/value-chain/route.ts", note: "" },
  { partNumber: 32, title: "The executive experience", seedStatus: "canonical", evidence: "src/app/cockpit/, src/app/dashboard/", note: "" },
  { partNumber: 33, title: "Multi-model AI orchestration & agent teams", seedStatus: "canonical", evidence: "src/lib/agent*.ts, src/app/agents/, src/app/api/agent/runs/", note: "many agent files — one-agent-core rule (interface spine) applies" },
  { partNumber: 34, title: "Data platform & interoperability", seedStatus: "canonical", evidence: "tests/lineage/graph.test.ts, src/app/lineage-explorer/", note: "" },
  { partNumber: 35, title: "Resilience, continuity & chaos engineering", seedStatus: "canonical", evidence: "docs/RESILIENCE.md, src/app/continuity-plans/, src/app/drills/, src/app/resilience-lab/", note: "" },
  { partNumber: 36, title: "Sustainability & ESG intelligence", seedStatus: "partial", evidence: "src/app/esg/ (29 hits)", note: "route family exists; depth unverified" },
  { partNumber: 37, title: "Global & multi-entity operations", seedStatus: "canonical", evidence: "src/app/jurisdiction/, src/app/group-consolidation/, src/app/entity-compare/", note: "" },
  { partNumber: 38, title: "Continuous assurance & self-audit", seedStatus: "canonical", evidence: "src/lib/assurance.ts, src/app/api/assurance/route.ts, src/app/audit/", note: "" },
  { partNumber: 39, title: "Organizational fitness & evolution", seedStatus: "canonical", evidence: "src/app/fitness/, src/workers/computeWorker.ts", note: "" },
  { partNumber: 40, title: "Capstone: the autonomous organization", seedStatus: "absent", evidence: "src/lib/autonomy.ts only (1 hit)", note: "capstone — expected to be assembled, not pre-built; assemble from 10/33/38/39 in-place" },
  { partNumber: 41, title: "Adaptive & personalized executive interface", seedStatus: "canonical", evidence: "src/app/adaptive-demo/, src/app/api/adaptation/*", note: "" },
  { partNumber: 42, title: "Conversational management & meeting copilot", seedStatus: "partial", evidence: "src/app/meetings/, src/app/manager/ (11 hits)", note: "thin; verify canonical vs legacy" },
  { partNumber: 43, title: "Coaching & leadership development engine", seedStatus: "partial", evidence: "tests/leaderState.*.test.ts, docs mentions", note: "mostly docs + leader-state seams; canonical depth unverified" },
  { partNumber: 44, title: "Collective intelligence & prediction aggregation", seedStatus: "canonical", evidence: "src/app/collective/, src/views/SignalBoardView.tsx (legacy)", note: "canonical family exists" },
  { partNumber: 45, title: "Time, calendar & meeting economics", seedStatus: "canonical", evidence: "src/app/time/, src/app/fiscal-calendar/, src/app/meetings/", note: "" },
  { partNumber: 46, title: "Ethics, power & conflict governance", seedStatus: "canonical", evidence: "src/app/ethics/, src/app/power/, src/lib/antiRetaliation.ts", note: "anti-retaliation in canonical lib" },
  { partNumber: 47, title: "Crisis management OS", seedStatus: "canonical", evidence: "src/app/crisis/ (69 hits)", note: "" },
  { partNumber: 48, title: "The proactive chief of staff", seedStatus: "partial", evidence: "src/app/proactive/ (21 hits)", note: "route exists; depth unverified" },
  { partNumber: 49, title: "Immersive & spatial analytics", seedStatus: "partial", evidence: "docs/part49-spatial-analytics.md, src/views/Network.tsx (legacy)", note: "docs + legacy only" },
  { partNumber: 50, title: "Multi-organization & industry intelligence", seedStatus: "partial", evidence: "tests/industry-metrics.test.ts, src/app/organizations/, src/app/entity-compare/", note: "test exists; verify breadth" },
  { partNumber: 51, title: "Management action recommender & intervention marketplace", seedStatus: "canonical", evidence: "src/app/intervention-library/ (88 hits)", note: "" },
  { partNumber: 52, title: "Leader state & decision-load science", seedStatus: "canonical", evidence: "tests/leaderState.decisionLoad.test.ts, tests/leaderState.selfScope.test.ts, src/app/my-state/", note: "strongest-tested area in repo" },
  { partNumber: 53, title: "Legal, contract & obligational intelligence", seedStatus: "canonical", evidence: "src/app/legal/, src/app/obligations/ (246 hits)", note: "ContractView.tsx is legacy-gen" },
  { partNumber: 54, title: "Structural change & M&A simulation", seedStatus: "partial", evidence: "src/app/org-design/, src/lib/eventSchema.ts mentions (27 hits)", note: "thin; M&A sim likely partial" },
  { partNumber: 55, title: "Board & governance automation", seedStatus: "canonical", evidence: "src/app/board/, board-pack/, board-report/, boardpack/ (484 hits)", note: "four overlapping families — dedupe candidate (C3)" },
  { partNumber: 56, title: "Algorithmic accountability & regulatory conformity", seedStatus: "canonical", evidence: "src/app/accountability/{assessments,conformity,oversight,registry}/, src/app/model-cards/", note: "" },
  { partNumber: 57, title: "Capstone II: the self-evolving organization", seedStatus: "absent", evidence: "src/app/fitness/layout.tsx (4 hits)", note: "capstone — assemble from 30/39/57-parts in place" },
  { partNumber: 58, title: "Autonomous executive agent kernel", seedStatus: "canonical", evidence: "src/lib/agentCore.ts, src/lib/agentScheduler.ts, src/instrumentation.ts", note: "interface spine says: ONE agent kernel — extend these, never add a second" },
];

export const contractGaps = [
  {
    id: 1,
    title: "Wrong-checkout trap",
    status: "fixed" as const,
    description:
      "The opener's Phase 0 now requires git remote get-url origin = https://github.com/shahramclaude/Leados and the Leados root as tree root before anything else; foreign history must halt the session.",
  },
  {
    id: 2,
    title: "Git history ≠ part evidence",
    status: "fixed" as const,
    description:
      "Phase 0 now says explicitly that the bulk-upload history proves nothing; LEADOS-STATE.md + docs are the continuity record.",
  },
  {
    id: 3,
    title: "Case-colliding filenames",
    status: "open" as const,
    description:
      "src/lib/monteCarlo.ts / src/lib/montecarlo.ts / src/lib/intelligence/montecarlo.ts need one canonical owner and a Decommission decision (C2). Until then, sessions on Windows may not find spec-named files.",
  },
  {
    id: 4,
    title: "Overlapping route families",
    status: "open" as const,
    description:
      "board/board-pack/board-report/boardpack; strategic/strategy/act/strategic; finance/financial/act/financial; three gen-tokens scripts; three API spec files. Each is a C3 case: pick the canonical family, extend it, log the rest as deprecated.",
  },
];
