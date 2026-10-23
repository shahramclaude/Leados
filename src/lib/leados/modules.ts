// Registry of the 16 modules in Pack 4 (Parts 108-123). Used to render
// navigation and the capstone overview consistently from one source of truth.
export interface ModuleDef {
  part: string;
  slug: string;
  name: string;
  tagline: string;
  group: "Strategic Frontier" | "AI-Native Organization" | "Program Gate";
}

export const MODULES: ModuleDef[] = [
  { part: "108", slug: "innovation", name: "Innovation & R&D Portfolio", tagline: "Stage-gates, kill criteria, real options", group: "Strategic Frontier" },
  { part: "109", slug: "brand", name: "Brand & Reputation", tagline: "Media monitoring, crisis state machine", group: "Strategic Frontier" },
  { part: "110", slug: "partnerships", name: "Partnerships & Ecosystem", tagline: "Sourced vs influenced revenue, HHI", group: "Strategic Frontier" },
  { part: "111", slug: "mna", name: "M&A Integration", tagline: "Day-1 checklists, verified synergies", group: "Strategic Frontier" },
  { part: "112", slug: "regulatory", name: "Regulatory Affairs", tagline: "Evidence-class horizon, obligations", group: "Strategic Frontier" },
  { part: "113", slug: "team", name: "Executive Team Effectiveness", tagline: "Decision quality, no individual scoring", group: "Strategic Frontier" },
  { part: "114", slug: "negotiation", name: "Negotiation Workbench", tagline: "ZOPA, BATNA, manipulation denylist", group: "Strategic Frontier" },
  { part: "115", slug: "succession", name: "Succession & Pipeline", tagline: "Evidence-gated readiness, emergency slates", group: "Strategic Frontier" },
  { part: "116", slug: "agents", name: "Digital Coworkers", tagline: "Supervised agent roles & delegation", group: "AI-Native Organization" },
  { part: "117", slug: "architecture", name: "Self-Evolving Architecture", tagline: "Fitness functions & debt burn-down", group: "AI-Native Organization" },
  { part: "118", slug: "rituals", name: "Management System Loop", tagline: "Rituals & policy lifecycle", group: "AI-Native Organization" },
  { part: "119", slug: "deployment", name: "Enterprise Deployment", tagline: "Rollout waves & tenant isolation", group: "AI-Native Organization" },
  { part: "120", slug: "formal", name: "Formal Methods", tagline: "Model-checked management processes", group: "AI-Native Organization" },
  { part: "121", slug: "value", name: "Value Realization & ROI", tagline: "Honest benefit attribution", group: "AI-Native Organization" },
  { part: "122", slug: "research", name: "Methodology Research", tagline: "Experiment registry & adoption gates", group: "AI-Native Organization" },
  { part: "123", slug: "capstone", name: "Capstone V — Program Gate", tagline: "Living gate over Parts 108-122", group: "Program Gate" },
];
