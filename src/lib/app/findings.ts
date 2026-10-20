import type { Finding, Page } from "@/lib/domain/types";
import { scoreFinding } from "@/lib/domain/scoring";
import {
  getFindingById,
  insertFinding,
  listFindingsPage,
} from "@/lib/platform/db/findingsRepository";
import { recordEvent } from "./events";

export interface CreateFindingInput {
  title: string;
  summary?: string;
  impact: number;
  confidence: number;
  effort: number;
}

export class ValidationError extends Error {}

function assertInRange(name: string, value: number) {
  if (!Number.isFinite(value) || value < 1 || value > 10) {
    throw new ValidationError(`${name} must be a number between 1 and 10`);
  }
}

export async function createFinding(input: CreateFindingInput): Promise<Finding> {
  if (!input.title || input.title.trim().length === 0) {
    throw new ValidationError("title is required");
  }
  assertInRange("impact", input.impact);
  assertInRange("confidence", input.confidence);
  assertInRange("effort", input.effort);

  const score = scoreFinding(input);
  const finding = await insertFinding({
    title: input.title.trim(),
    summary: input.summary?.trim() ?? "",
    impact: input.impact,
    confidence: input.confidence,
    effort: input.effort,
    score,
  });

  await recordEvent({
    type: "finding.created",
    version: 1,
    payload: { findingId: finding.id, title: finding.title },
  });

  return finding;
}

export async function listFindings(searchParams: URLSearchParams): Promise<Page<Finding>> {
  return listFindingsPage(searchParams);
}

export async function getFinding(id: number): Promise<Finding | null> {
  return getFindingById(id);
}
