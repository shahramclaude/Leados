import "dotenv/config";
import { db, pool } from "@/db";
import { selectNextBestAction, Candidate } from "@/lib/actions";
import { runActionGate } from "@/lib/governance";
import { remeasureAllGates } from "@/lib/autonomy";

const POOL: Record<string, Candidate[]> = {
  manager: [
    { armId: "arm_1on1_prep", title: "Prepare for 1:1 with at-risk report", description: "Engagement dropped.", expectedValue: 0.8, costAttention: 1, riskTier: "low" },
    { armId: "arm_budget_review", title: "Review team budget burn-down", description: "Tracking over plan.", expectedValue: 0.6, costAttention: 1, riskTier: "low" },
    { armId: "arm_backlog_triage", title: "Triage support backlog spike", description: "Incident open.", expectedValue: 0.9, costAttention: 2, riskTier: "medium" },
    { armId: "arm_celebrate_win", title: "Recognize team win", description: "Deploy frequency high.", expectedValue: 0.4, costAttention: 1, riskTier: "low" },
  ],
  executive: [
    { armId: "arm_board_prep", title: "Draft board narrative on churn trend", description: "Conflict needs resolving.", expectedValue: 0.9, costAttention: 2, riskTier: "medium" },
    { armId: "arm_portfolio_review", title: "Review re-solved portfolio drops", description: "Two dropped last run.", expectedValue: 0.7, costAttention: 2, riskTier: "low" },
  ],
  contributor: [
    { armId: "arm_pr_review", title: "Review open pull request", description: "Waiting 2 days.", expectedValue: 0.5, costAttention: 1, riskTier: "low" },
  ],
};

async function main() {
  const roles = ["manager", "executive", "contributor"];
  // Spread draws across several synthetic "days" so the daily attention budget doesn't
  // block every draw after the first few (realistic multi-day usage pattern).
  for (let d = 0; d < 6; d++) {
    for (let i = 0; i < 6; i++) {
      const role = roles[(d + i) % roles.length];
      const pool = POOL[role];
      await selectNextBestAction(role, "/actions", pool, d * 100 + i);
    }
  }

  // A couple of governed actions to populate approvals + audit trail further.
  await runActionGate({ actionKey: "send-weekly-digest", actorId: "demo", costUsd: 1, blastRadius: 1, preview: { note: "weekly digest" }, voi: 0.1 });
  await runActionGate({ actionKey: "adjust-ad-spend", actorId: "demo", costUsd: 500, blastRadius: 2, preview: { note: "increase spend 10%" }, voi: 0.5 });
  await runActionGate({ actionKey: "change-pricing", actorId: "demo", costUsd: 0, blastRadius: 5, preview: { note: "raise enterprise tier 8%" }, voi: 0.8 });

  const gates = await remeasureAllGates();
  console.log("gates:", gates.map((g) => `${g.gateKey}=${g.status} (${g.measuredValue})`).join("\n"));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
