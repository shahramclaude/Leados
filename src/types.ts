// Shared domain types for the LEADOS demo product.
// Every mock record below carries an `evidence` class so the UI can be
// honest about what is real vs simulated. See docs/EVIDENCE-LEDGER.md.

export type EvidenceClass =
  | "verified" // backed by a real, runnable check in this codebase
  | "simulated" // deterministic mock data, UI behavior is real, content is fake
  | "planned"; // described in docs, not implemented

export interface EvidenceTagProps {
  level: EvidenceClass;
}

export interface NavItem {
  id: ModuleId;
  label: string;
  icon: string;
  group: "Core" | "Decide" | "People" | "Govern";
  essential?: boolean; // stays visible in crisis mode
}

export type ModuleId =
  | "dashboard"
  | "assistant"
  | "coaching"
  | "collective"
  | "time"
  | "ethics"
  | "crisis"
  | "drafts"
  | "spatial"
  | "benchmarks"
  | "recommender"
  | "leaderstate"
  | "legal"
  | "reorg"
  | "board"
  | "registry"
  | "ledger";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  gate?: "draft" | "review" | "committed";
}

export interface Viewpoint {
  id: string;
  author: string;
  stance: "majority" | "minority";
  text: string;
  votes: number;
}

export interface TimeBlock {
  category: string;
  hours: number;
  color: string;
}

export interface EthicsCase {
  id: string;
  title: string;
  stage: "proposed" | "review" | "approved" | "blocked";
  flags: string[];
  riskLevel: "low" | "medium" | "high";
}

export interface Draft {
  id: string;
  title: string;
  audience: string;
  cost: 1 | 2 | 3; // attention-budget cost
  status: "queued" | "sent" | "dismissed";
}

export interface OrgNode {
  id: string;
  name: string;
  role: string;
  children?: OrgNode[];
}

export interface BenchmarkFigure {
  id: string;
  metric: string;
  yourOrg: string;
  industry: string;
  evidenceClass: "A" | "B" | "C";
  source: string;
}

export interface Recommendation {
  id: string;
  title: string;
  rationale: string;
  confidence: number; // 0-1, calibrated
  lintPassed: boolean;
  lintNotes: string[];
}

export interface LegalDraft {
  id: string;
  title: string;
  summary: string;
  humanConfirmed: boolean;
}

export interface BoardCheck {
  id: string;
  label: string;
  done: boolean;
}

export interface AlgorithmEntry {
  id: string;
  name: string;
  purpose: string;
  inputs: string;
  evidenceClass: EvidenceClass;
  owner: string;
  lastReviewed: string;
}

export interface LedgerClaim {
  id: string;
  claim: string;
  status: EvidenceClass;
  proof: string;
}
