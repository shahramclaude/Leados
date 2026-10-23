import type {
  AlgorithmEntry,
  BenchmarkFigure,
  BoardCheck,
  Draft,
  EthicsCase,
  LedgerClaim,
  LegalDraft,
  NavItem,
  OrgNode,
  Recommendation,
  TimeBlock,
  Viewpoint,
} from "../types";

export const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "🏠", group: "Core", essential: true },
  { id: "assistant", label: "Conversation", icon: "💬", group: "Core", essential: true },
  { id: "crisis", label: "Crisis Mode", icon: "🚨", group: "Core", essential: true },
  { id: "ethics", label: "Ethics Flags", icon: "⚖️", group: "Decide", essential: true },
  { id: "recommender", label: "Recommender", icon: "🎯", group: "Decide" },
  { id: "benchmarks", label: "Industry Benchmarks", icon: "📊", group: "Decide" },
  { id: "reorg", label: "Reorg Simulator", icon: "🔄", group: "Decide" },
  { id: "legal", label: "Legal Drafts", icon: "📄", group: "Decide" },
  { id: "drafts", label: "Proactive Drafts", icon: "✍️", group: "Decide" },
  { id: "spatial", label: "Org / Spatial View", icon: "🗺️", group: "People" },
  { id: "coaching", label: "Coaching", icon: "🌱", group: "People" },
  { id: "collective", label: "Collective Intelligence", icon: "🧠", group: "People" },
  { id: "time", label: "Time Analytics", icon: "⏱️", group: "People" },
  { id: "leaderstate", label: "Leader State", icon: "🧭", group: "People" },
  { id: "board", label: "Board Readiness", icon: "🛡️", group: "Govern", essential: true },
  { id: "registry", label: "Algorithm Registry", icon: "📋", group: "Govern" },
  { id: "ledger", label: "Evidence Ledger", icon: "📒", group: "Govern", essential: true },
];

export const viewpoints: Viewpoint[] = [
  { id: "v1", author: "VP Sales", stance: "majority", text: "Accelerate the EMEA launch in Q3; demand signals are strong.", votes: 7 },
  { id: "v2", author: "Finance Lead", stance: "majority", text: "Q3 is fundable if marketing spend is capped at current run-rate.", votes: 6 },
  { id: "v3", author: "Support Director", stance: "minority", text: "Our support headcount can't absorb EMEA timezone coverage by Q3 — recommend Q4.", votes: 2 },
  { id: "v4", author: "Staff Engineer", stance: "minority", text: "Localization debt in billing will cause incidents if we rush EMEA before infra work lands.", votes: 1 },
];

export const timeBlocks: TimeBlock[] = [
  { category: "1:1s & coaching", hours: 9, color: "bg-indigo-500" },
  { category: "Strategic planning", hours: 6, color: "bg-violet-500" },
  { category: "Firefighting", hours: 5, color: "bg-rose-500" },
  { category: "Board & external", hours: 4, color: "bg-amber-500" },
  { category: "Deep work", hours: 3, color: "bg-emerald-500" },
  { category: "Unaccounted / admin", hours: 3, color: "bg-slate-400" },
];

export const ethicsCases: EthicsCase[] = [
  { id: "e1", title: "Automated layoffs shortlist for Ops restructuring", stage: "blocked", flags: ["No human sign-off path", "Disparate impact unchecked"], riskLevel: "high" },
  { id: "e2", title: "Customer churn model used to deprioritize support tickets", stage: "review", flags: ["Proxy discrimination risk", "No appeal mechanism"], riskLevel: "medium" },
  { id: "e3", title: "Internal promotion ranking assist", stage: "review", flags: ["Training data skew (pre-2022)"], riskLevel: "medium" },
  { id: "e4", title: "Meeting-load rebalancing nudge", stage: "approved", flags: [], riskLevel: "low" },
  { id: "e5", title: "Candidate resume pre-screen", stage: "proposed", flags: ["No bias audit yet"], riskLevel: "high" },
];

export const drafts: Draft[] = [
  { id: "d1", title: "Congratulate Growth team on retention win", audience: "Growth team (12)", cost: 1, status: "queued" },
  { id: "d2", title: "Flag budget variance to CFO before Friday close", audience: "CFO", cost: 2, status: "queued" },
  { id: "d3", title: "Draft all-hands note on EMEA timeline slip", audience: "Company (340)", cost: 3, status: "queued" },
  { id: "d4", title: "Thank departing exec publicly", audience: "LinkedIn (public)", cost: 2, status: "dismissed" },
];

export const orgTree: OrgNode = {
  id: "ceo",
  name: "You",
  role: "CEO",
  children: [
    {
      id: "vp-sales",
      name: "A. Okafor",
      role: "VP Sales",
      children: [
        { id: "sales-1", name: "EMEA Team", role: "6 reports" },
        { id: "sales-2", name: "AMER Team", role: "9 reports" },
      ],
    },
    {
      id: "vp-eng",
      name: "R. Chen",
      role: "VP Engineering",
      children: [
        { id: "eng-1", name: "Platform", role: "8 reports" },
        { id: "eng-2", name: "Product Eng", role: "11 reports" },
      ],
    },
    {
      id: "cfo",
      name: "M. Davies",
      role: "CFO",
      children: [{ id: "fin-1", name: "FP&A", role: "4 reports" }],
    },
  ],
};

export const benchmarks: BenchmarkFigure[] = [
  { id: "b1", metric: "Net revenue retention", yourOrg: "108%", industry: "104%", evidenceClass: "A", source: "Audited: board-approved FY25 financials" },
  { id: "b2", metric: "Employee eNPS", yourOrg: "+22", industry: "+14", evidenceClass: "A", source: "Audited: internal survey, 71% response rate" },
  { id: "b3", metric: "Sales cycle length (days)", yourOrg: "41", industry: "38", evidenceClass: "B", source: "Vendor estimate: industry analyst report (self-reported sample)" },
  { id: "b4", metric: "AI feature adoption rate", yourOrg: "63%", industry: "47%", evidenceClass: "C", source: "Modeled: synthetic composite, directional only, not for board use" },
];

export const recommendations: Recommendation[] = [
  {
    id: "r1",
    title: "Re-open EMEA pricing review before Q3 launch",
    rationale: "3 of 4 lost EMEA deals this quarter cited price tier mismatch vs. local competitors.",
    confidence: 0.71,
    lintPassed: true,
    lintNotes: ["Confidence stated, not rounded up", "Sample size disclosed (n=4)", "No causal claim made"],
  },
  {
    id: "r2",
    title: "Pause the candidate resume pre-screen model",
    rationale: "Bias audit has not run; model is in production for 2 roles.",
    confidence: 0.94,
    lintPassed: true,
    lintNotes: ["High confidence justified by policy breach, not prediction", "Action is reversible"],
  },
  {
    id: "r3",
    title: "Increase marketing spend 20% in APAC",
    rationale: "Early signal from 1 campaign in 1 city.",
    confidence: 0.38,
    lintPassed: false,
    lintNotes: ["FAILED: confidence too low for the strength of language used", "Needs more evidence before surfacing as a recommendation"],
  },
];

export const legalDrafts: LegalDraft[] = [
  { id: "l1", title: "Amended vendor data-processing addendum", summary: "Updates sub-processor list and breach notification window to 48h.", humanConfirmed: false },
  { id: "l2", title: "Severance letter template update", summary: "Aligns with new state pay-transparency law effective next quarter.", humanConfirmed: false },
  { id: "l3", title: "Customer MSA liability cap clause", summary: "Raises cap from 1x to 2x fees for enterprise tier.", humanConfirmed: true },
];

export const boardChecks: BoardCheck[] = [
  { id: "c1", label: "Audited financials attached", done: true },
  { id: "c2", label: "Risk register updated this quarter", done: true },
  { id: "c3", label: "Litigation / legal exposure summary included", done: false },
  { id: "c4", label: "Algorithmic decisions register reviewed (this doc)", done: true },
  { id: "c5", label: "Diversity & pay-equity snapshot attached", done: false },
  { id: "c6", label: "Prior meeting action items closed or carried", done: true },
];

export const algorithmRegistry: AlgorithmEntry[] = [
  { id: "a1", name: "Churn risk scorer", purpose: "Flag accounts at risk for CS outreach", inputs: "Usage telemetry, support tickets, invoice history", evidenceClass: "simulated", owner: "CS Ops", lastReviewed: "2026-01-12" },
  { id: "a2", name: "Candidate resume pre-screen", purpose: "Rank inbound applicants", inputs: "Resume text, role requirements", evidenceClass: "planned", owner: "People Team", lastReviewed: "Not yet audited" },
  { id: "a3", name: "Recommender honesty lint", purpose: "Block overclaiming recommendations before display", inputs: "Confidence score, sample size, claim text", evidenceClass: "simulated", owner: "Platform", lastReviewed: "2026-02-03" },
  { id: "a4", name: "Promotion ranking assist", purpose: "Suggest promotion-ready candidates", inputs: "Performance reviews (2019-2024), tenure", evidenceClass: "planned", owner: "People Team", lastReviewed: "Flagged: training data skew" },
  { id: "a5", name: "Meeting-load rebalancer", purpose: "Suggest meeting cuts to protect deep work", inputs: "Calendar metadata only", evidenceClass: "simulated", owner: "Platform", lastReviewed: "2026-01-29" },
];

export const ledgerClaims: LedgerClaim[] = [
  { id: "L1", claim: "The app builds with `npm run build` with zero errors.", status: "verified", proof: "Re-run at delivery time; see Verification Log in docs/PROGRAM-COMPLETION-REPORT.md." },
  { id: "L2", claim: "TypeScript compiles with no type errors (`tsc --noEmit`).", status: "verified", proof: "Re-run at delivery time; see Verification Log." },
  { id: "L3", claim: "Crisis Mode coherently degrades the whole UI (nav, banner, module access) in one state change.", status: "verified", proof: "Implemented via AppStateContext; toggle in Crisis Mode module, observable across Sidebar/TopBar/Dashboard." },
  { id: "L4", claim: "Collective Intelligence preserves minority/dissenting views rather than averaging them away.", status: "verified", proof: "Collective Intelligence module renders minority-stance cards distinctly; data includes dissent by construction." },
  { id: "L5", claim: "Proactive Drafts respect a finite daily attention budget and never auto-send.", status: "verified", proof: "Attention-budget meter in AppStateContext decrements on 'Send' only via explicit user click; no timers or auto-send code path exists." },
  { id: "L6", claim: "Spatial (org tree) and semantic (list) views show the same underlying data.", status: "verified", proof: "Both renderers in SpatialView.tsx consume the same `orgTree` object; no divergent data source." },
  { id: "L7", claim: "The Recommender flags its own overclaiming recommendation before display.", status: "verified", proof: "`r3` in mockData.ts is intentionally low-confidence and `lintPassed: false`; UI renders a visible lint failure, not a hidden one." },
  { id: "L8", claim: "Any AI-drafted chat action commits only after passing Draft → Review → Commit gates.", status: "verified", proof: "ConversationalAssistant.tsx state machine disallows 'Commit' before 'Review' step; see component." },
  { id: "L9", claim: "Industry benchmark figures are classified by evidence strength (A/B/C), not presented as uniformly authoritative.", status: "verified", proof: "Every row in `benchmarks` carries an explicit evidenceClass and source caveat, rendered in IndustryBenchmarks.tsx." },
  { id: "L10", claim: "Underlying business data (sales figures, churn, org chart, legal text) reflects a real customer's live state.", status: "simulated", proof: "This is a demo dataset in src/data/mockData.ts. No live integrations exist in this build." },
  { id: "L11", claim: "The chat assistant is powered by a live LLM.", status: "simulated", proof: "ConversationalAssistant.tsx uses a small scripted response table, not a model API call. Wiring a real LLM is a next-step, not done here." },
  { id: "L12", claim: "Legal drafts module performs actual legal review.", status: "simulated", proof: "UI enforces a human-confirmation checkbox gate before 'Finalize' is enabled; no legal content is machine-verified." },
  { id: "L13", claim: "A 58-part prior program (Parts 1-56) exists in this repository's history.", status: "planned", proof: "Not found in this workspace. No docs/, AI-SESSION-LOG.md, or prior audits existed before this session. Treat any claim of prior parts as unverified." },
  { id: "L14", claim: "This build has live write access to github.com/shahramclaude/Leados.", status: "planned", proof: "No GitHub credentials or network write path are available to these tools. Files are delivered for manual upload." },
];
