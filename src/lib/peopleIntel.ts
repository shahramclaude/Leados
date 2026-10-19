import { clamp01 } from "./beliefFabric";

export type Person = {
  id: number;
  name: string;
  role: string;
  department: string;
  managerId: number | null;
  performanceScore: number; // 0..1
  potentialScore: number; // 0..1
  flightRiskScore: number; // 0..1
  burnoutRiskScore: number; // 0..1
  tenureMonths: number;
  skills: string[];
  isCritical: boolean;
};

export function computeFlightRisk(person: Pick<Person, "tenureMonths" | "burnoutRiskScore" | "performanceScore">): number {
  const tenureFactor = person.tenureMonths < 6 ? 0.3 : person.tenureMonths > 48 ? 0.1 : 0.15;
  const burnoutFactor = person.burnoutRiskScore * 0.5;
  const performancePenalty = person.performanceScore < 0.4 ? 0.15 : 0;
  return clamp01(tenureFactor + burnoutFactor + performancePenalty);
}

const EXIT_SIGNAL_PHRASES = [
  "recruiter reached out",
  "looking elsewhere",
  "update my resume",
  "updating my resume",
  "job offer",
  "interviewing",
  "exploring other opportunities",
  "thinking about leaving",
  "counteroffer",
  "linkedin message from a recruiter",
];

export type NoteAnalysis = {
  hasExitSignal: boolean;
  matchedPhrases: string[];
  sentiment: "positive" | "neutral" | "negative";
};

export function analyzeOneOnOneNotes(notes: string): NoteAnalysis {
  const lower = notes.toLowerCase();
  const matchedPhrases = EXIT_SIGNAL_PHRASES.filter((p) => lower.includes(p));
  const positiveWords = ["great day", "excited", "happy", "thrilled", "proud", "motivated"];
  const negativeWords = ["frustrated", "burned out", "burnt out", "overwhelmed", "unhappy"];
  const hasPositive = positiveWords.some((w) => lower.includes(w));
  const hasNegative = negativeWords.some((w) => lower.includes(w));
  return {
    hasExitSignal: matchedPhrases.length > 0,
    matchedPhrases,
    sentiment: hasNegative ? "negative" : hasPositive ? "positive" : "neutral",
  };
}

export type NineBoxLabel =
  | "star"
  | "high_potential"
  | "high_performer"
  | "core_player"
  | "inconsistent_player"
  | "trusted_professional"
  | "risk"
  | "underperformer"
  | "solid_contributor";

export type NineBoxPlacement = { personId: number; box: NineBoxLabel; row: number; col: number };

function bucket(score: number): 0 | 1 | 2 {
  if (score >= 0.66) return 2;
  if (score >= 0.33) return 1;
  return 0;
}

const NINE_BOX_GRID: NineBoxLabel[][] = [
  ["underperformer", "inconsistent_player", "risk"],
  ["solid_contributor", "core_player", "high_performer"],
  ["trusted_professional", "high_potential", "star"],
];

/** Places every person into exactly one of the 9 boxes. */
export function buildNineBox(people: Person[]): NineBoxPlacement[] {
  const seen = new Set<number>();
  const placements: NineBoxPlacement[] = [];
  for (const p of people) {
    if (seen.has(p.id)) continue; // guarantee no duplicates
    seen.add(p.id);
    const col = bucket(p.performanceScore);
    const row = bucket(p.potentialScore);
    placements.push({ personId: p.id, box: NINE_BOX_GRID[row][col], row, col });
  }
  return placements;
}

export type SuccessionRisk = {
  personId: number;
  risk: number;
  candidateIds: number[];
};

/** Candidates are always drawn from peers / reports — never the person themself. */
export function computeSuccessionRisk(person: Person, allPeople: Person[]): SuccessionRisk {
  const candidates = allPeople
    .filter((p) => p.id !== person.id)
    .filter((p) => p.department === person.department)
    .filter((p) => p.performanceScore >= 0.5)
    .map((p) => p.id);

  const criticalityFactor = person.isCritical ? 0.4 : 0.1;
  const benchFactor = candidates.length === 0 ? 0.5 : 0.5 / (candidates.length + 1);
  const risk = clamp01(criticalityFactor + benchFactor);

  return { personId: person.id, risk, candidateIds: candidates };
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a.map((x) => x.toLowerCase()));
  const setB = new Set(b.map((x) => x.toLowerCase()));
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const v of setA) if (setB.has(v)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export type TeamRedFlag = {
  type: "exit_cluster" | "burnout_cluster" | "skill_gap";
  description: string;
  severity: "low" | "medium" | "high";
};

export type TeamChemistryReport = {
  teamSize: number;
  avgFlightRisk: number;
  redFlags: TeamRedFlag[];
};

export function buildTeamChemistryReport(team: Person[]): TeamChemistryReport {
  const redFlags: TeamRedFlag[] = [];
  const atRisk = team.filter((p) => p.flightRiskScore > 0.5);
  if (atRisk.length >= 3) {
    redFlags.push({
      type: "exit_cluster",
      description: `${atRisk.length} people on this team have flight risk > 0.5`,
      severity: "high",
    });
  }
  const burnedOut = team.filter((p) => p.burnoutRiskScore > 0.6);
  if (burnedOut.length >= 3) {
    redFlags.push({
      type: "burnout_cluster",
      description: `${burnedOut.length} people show elevated burnout risk`,
      severity: "medium",
    });
  }
  const avgFlightRisk =
    team.length === 0 ? 0 : team.reduce((sum, p) => sum + p.flightRiskScore, 0) / team.length;

  return { teamSize: team.length, avgFlightRisk, redFlags };
}
