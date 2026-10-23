"use server";

import { revalidatePath } from "next/cache";
import { selectNextBestAction, markRecommendation, Candidate } from "@/lib/actions";

const ROLE_CANDIDATE_POOL: Record<string, Candidate[]> = {
  manager: [
    { armId: "arm_1on1_prep", title: "Prepare for 1:1 with at-risk report", description: "Engagement score dropped 15% in two weeks.", expectedValue: 0.8, costAttention: 1, riskTier: "low" },
    { armId: "arm_budget_review", title: "Review team budget burn-down", description: "Team is tracking 8% over plan this month.", expectedValue: 0.6, costAttention: 1, riskTier: "low" },
    { armId: "arm_backlog_triage", title: "Triage support backlog spike", description: "Backlog incident open — top cause not yet tested.", expectedValue: 0.9, costAttention: 2, riskTier: "medium" },
    { armId: "arm_celebrate_win", title: "Recognize team win in weekly update", description: "Deploy frequency hit a new high this sprint.", expectedValue: 0.4, costAttention: 1, riskTier: "low" },
  ],
  executive: [
    { armId: "arm_board_prep", title: "Draft board narrative on churn trend", description: "Churn claim is in active conflict — resolve before the board meeting.", expectedValue: 0.9, costAttention: 2, riskTier: "medium" },
    { armId: "arm_portfolio_review", title: "Review re-solved portfolio drops", description: "Two initiatives were dropped on the last optimizer run.", expectedValue: 0.7, costAttention: 2, riskTier: "low" },
    { armId: "arm_pricing_decision", title: "Decide on enterprise pricing change", description: "Pending T3 dual-control approval is waiting on you.", expectedValue: 0.85, costAttention: 1, riskTier: "high" },
  ],
  contributor: [
    { armId: "arm_pr_review", title: "Review open pull request", description: "A teammate's PR has been waiting 2 days.", expectedValue: 0.5, costAttention: 1, riskTier: "low" },
    { armId: "arm_doc_update", title: "Update runbook after incident", description: "Last incident postmortem recommends a runbook update.", expectedValue: 0.4, costAttention: 1, riskTier: "low" },
  ],
};

export async function generateRecommendationAction(formData: FormData) {
  const role = String(formData.get("role") ?? "manager");
  const pool = ROLE_CANDIDATE_POOL[role] ?? ROLE_CANDIDATE_POOL.manager;
  const seed = Math.floor(Math.random() * 1_000_000);
  await selectNextBestAction(role, "/actions", pool, seed);
  revalidatePath("/actions");
}

export async function markRecommendationAction(formData: FormData) {
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as "done" | "dismissed";
  await markRecommendation(id, status);
  revalidatePath("/actions");
}
