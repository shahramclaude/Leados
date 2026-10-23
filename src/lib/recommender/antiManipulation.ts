/**
 * Part 51 — Anti-manipulation policy (Phase 1 / Phase 3b).
 *
 * POLICY: engagement signals (accept/reject clicks, views, dwell time) are
 * logged for product-quality purposes ONLY. They are never read by the
 * ranking engine and never passed to belief-update. The only two inputs that
 * can move `rec_context_effects` are:
 *   1. a measured commitment follow-through (Part 48 stand-in), or
 *   2. an experiment result (Part 30 stand-in).
 *
 * This module is intentionally the *only* place that writes to
 * `rec_feedback`, and it is intentionally thin — it must not import or call
 * anything from beliefUpdate.ts. The property-test suite
 * (scripts/property-tests.ts) seeds a "manipulation attack" — spamming
 * accepts with no verified outcome — and asserts the context-effect row and
 * the resulting ranking score are byte-for-byte unchanged.
 */

import { randomUUID } from "crypto";
import { db } from "@/db";
import { recFeedback } from "@/db/schema";

export interface FeedbackInput {
  recommendationId: string;
  orgId: string;
  action: "accept" | "reject";
  reason: string;
  reasonDetail?: string;
}

export async function recordFeedback(input: FeedbackInput): Promise<void> {
  await db.insert(recFeedback).values({
    id: randomUUID(),
    recommendationId: input.recommendationId,
    orgId: input.orgId,
    action: input.action,
    reason: input.reason,
    reasonDetail: input.reasonDetail ?? null,
  });
  // Deliberately: no call to beliefUpdate, no score mutation, no popularity
  // counter. If you are tempted to add one here, don't — see Phase 5 attack
  // answer #3 in AI-SESSION-LOG.md for why that is the most abusable term.
}
