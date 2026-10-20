import type { Decision, Page } from "@/lib/domain/types";
import { updateBeta } from "@/lib/domain/bayesian";
import {
  getDecisionById,
  insertDecision,
  listDecisionsPage,
  updateDecisionPosterior,
} from "@/lib/platform/db/decisionsRepository";
import { recordEvent } from "./events";
import { ValidationError } from "./findings";

export interface CreateDecisionInput {
  title: string;
  context?: string;
  priorAlpha?: number;
  priorBeta?: number;
}

export async function createDecision(input: CreateDecisionInput): Promise<Decision> {
  if (!input.title || input.title.trim().length === 0) {
    throw new ValidationError("title is required");
  }
  const priorAlpha = input.priorAlpha ?? 1;
  const priorBeta = input.priorBeta ?? 1;
  if (priorAlpha <= 0 || priorBeta <= 0) {
    throw new ValidationError("priorAlpha/priorBeta must be positive");
  }
  return insertDecision({
    title: input.title.trim(),
    context: input.context?.trim() ?? "",
    priorAlpha,
    priorBeta,
  });
}

export interface UpdateBeliefInput {
  successes: number;
  failures: number;
  decide?: boolean;
}

export async function updateDecisionBelief(
  id: number,
  input: UpdateBeliefInput,
): Promise<Decision> {
  if (
    !Number.isInteger(input.successes) ||
    !Number.isInteger(input.failures) ||
    input.successes < 0 ||
    input.failures < 0
  ) {
    throw new ValidationError("successes/failures must be non-negative integers");
  }
  const existing = await getDecisionById(id);
  if (!existing) {
    throw new NotFoundError(`decision ${id} not found`);
  }
  const posterior = updateBeta(
    { alpha: existing.posteriorAlpha, beta: existing.posteriorBeta },
    { successes: input.successes, failures: input.failures },
  );
  const status = input.decide ? "decided" : existing.status;
  const updated = await updateDecisionPosterior(id, posterior, status);
  if (!updated) {
    throw new NotFoundError(`decision ${id} not found`);
  }

  await recordEvent({
    type: "decision.belief_updated",
    version: 1,
    payload: { decisionId: id, successes: input.successes, failures: input.failures },
  });

  return updated;
}

export class NotFoundError extends Error {}

export async function listDecisions(searchParams: URLSearchParams): Promise<Page<Decision>> {
  return listDecisionsPage(searchParams);
}

export async function getDecision(id: number): Promise<Decision | null> {
  return getDecisionById(id);
}
