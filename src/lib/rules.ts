// Reasoning compiler (scoped): declarative decision tables over plain data,
// never scattered `if` statements. Each table is data; `applyTable` is the
// one runtime that evaluates it and returns a trace explaining the match.

export type Condition = {
  field: string;
  op: "eq" | "lt" | "le" | "gt" | "ge" | "in";
  value: unknown;
};

export type DecisionRow<TOut> = {
  when: Condition[];
  then: TOut;
  because: string;
};

export type DecisionTable<TOut> = {
  id: string;
  rows: DecisionRow<TOut>[];
  default: TOut;
};

export type RuleTrace<TOut> = {
  tableId: string;
  matchedRowIndex: number | null;
  output: TOut;
  explanation: string;
};

function evalCondition(cond: Condition, input: Record<string, unknown>): boolean {
  const actual = input[cond.field];
  switch (cond.op) {
    case "eq":
      return actual === cond.value;
    case "lt":
      return typeof actual === "number" && actual < (cond.value as number);
    case "le":
      return typeof actual === "number" && actual <= (cond.value as number);
    case "gt":
      return typeof actual === "number" && actual > (cond.value as number);
    case "ge":
      return typeof actual === "number" && actual >= (cond.value as number);
    case "in":
      return Array.isArray(cond.value) && cond.value.includes(actual);
    default:
      return false;
  }
}

/** First-match-wins evaluation with a full explanation trace. */
export function applyTable<TOut>(
  table: DecisionTable<TOut>,
  input: Record<string, unknown>,
): RuleTrace<TOut> {
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (row.when.every((c) => evalCondition(c, input))) {
      return {
        tableId: table.id,
        matchedRowIndex: i,
        output: row.then,
        explanation: row.because,
      };
    }
  }
  return {
    tableId: table.id,
    matchedRowIndex: null,
    output: table.default,
    explanation: "No row matched; default applied.",
  };
}

// --- Rule library ----------------------------------------------------------

/** Approval routing: risk tier + amount → who/what must sign off. */
export const approvalRoutingTable: DecisionTable<{
  autoApprovable: boolean;
  requiredApprover: string;
}> = {
  id: "approval-routing-v1",
  default: { autoApprovable: false, requiredApprover: "exec-sponsor" },
  rows: [
    {
      when: [{ field: "riskTier", op: "in", value: ["T0", "T1"] }, { field: "amountUsd", op: "le", value: 1000 }],
      then: { autoApprovable: true, requiredApprover: "none" },
      because: "T0/T1 actions under $1,000 are reversible and low-stakes; auto-approved.",
    },
    {
      when: [{ field: "riskTier", op: "eq", value: "T2" }],
      then: { autoApprovable: false, requiredApprover: "team-lead" },
      because: "T2 actions require a team-lead sign-off before execution.",
    },
    {
      when: [{ field: "riskTier", op: "in", value: ["T3", "T4"] }],
      then: { autoApprovable: false, requiredApprover: "exec-sponsor" },
      because: "T3/T4 actions are materially hard to reverse; an executive sponsor must approve.",
    },
    {
      when: [{ field: "riskTier", op: "eq", value: "T5" }],
      then: { autoApprovable: false, requiredApprover: "board" },
      because: "T5 actions are irreversible at scale; board-level approval is required.",
    },
  ],
};

/** Metric status → severity badge, used consistently across every surface. */
export const metricSeverityTable: DecisionTable<{ severity: "good" | "watch" | "critical" }> = {
  id: "metric-severity-v1",
  default: { severity: "watch" },
  rows: [
    { when: [{ field: "pctOfTarget", op: "ge", value: 100 }], then: { severity: "good" }, because: "At or above target." },
    { when: [{ field: "pctOfTarget", op: "ge", value: 80 }], then: { severity: "watch" }, because: "Within 20% of target." },
    { when: [{ field: "pctOfTarget", op: "lt", value: 80 }], then: { severity: "critical" }, because: "More than 20% below target." },
  ],
};
