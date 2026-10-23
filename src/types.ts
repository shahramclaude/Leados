// LEADOS demo console — type contracts
// These mirror the shape of the specs this UI illustrates (Parts 66/67/69/73/75-style
// quality + governance + design-token concepts). They are demo-UI contracts only:
// nothing here is wired to a real CI pipeline, database, or GitHub repo.

export type Tier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export interface ActionPolicy {
  actionId: string;
  label: string;
  tier: Tier;
  budgetUsdPerDay: number;
  budgetCountPerDay: number;
  approvalMode: 'none' | 'single' | 'dual';
  undoWindowMin: number | null;
  burnPct: number; // 0-100, demo burn against daily budget
}

export interface EvalSuiteRow {
  id: string;
  surface: string;
  target: 'prompt' | 'model' | 'pipeline' | 'ui';
  golden: number;
  adversarial: number;
  meanScore: number; // 0-1
  p10: number; // 0-1
  mutationScore: number; // 0-1
  pass: boolean;
}

export interface MutationOperator {
  id: string;
  name: string;
  description: string;
  difficulty: 'low' | 'medium' | 'high';
  catchRatePct: number;
}

export interface DriftAlertRow {
  target: string;
  method: 'psi' | 'ks' | 'embedding';
  statistic: number;
  threshold: number;
  status: 'stable' | 'watch' | 'breach';
  since: string;
}

export interface SelfAuditFindingRow {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  area: string;
  evidence: string;
  owner: string;
  dueDate: string;
  status: 'open' | 'in-progress' | 'resolved';
  goodhartFlag: boolean;
}

export interface GrandGateRow {
  id: string;
  part: number;
  statement: string;
  accept: string;
  measured: string;
  status: 'pass' | 'fail' | 'unknown' | 'never-run';
}

export interface DesignTokenRow {
  name: string;
  kind: 'color' | 'space' | 'type' | 'radius' | 'elevation' | 'motion' | 'z';
  semantic: string;
  light: string;
  dark: string;
  highContrast: string;
  contrastVsBg: number; // computed ratio, demo value
  contrastPass: boolean;
}

export interface PipelineHealthRow {
  dataset: string;
  owner: string;
  freshnessSlaMin: number;
  observedLagMin: number;
  status: 'on-time' | 'degraded' | 'quarantined';
  lastHeal: string;
}
