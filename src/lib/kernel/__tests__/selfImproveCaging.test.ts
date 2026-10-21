import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { kernelActiveRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  approveProposal,
  evaluateProposal,
  mergeProposal,
  proposeChange,
  seedGoldenCasesIfEmpty,
  SelfImproveCagingError,
} from "@/lib/kernel/selfImprove";
import { getDriftThreshold } from "@/lib/kernel/severity";
import { resetKernelTables } from "./testDb";

const AGENT = { kind: "agent" as const, id: "self-improver" };
const HUMAN = { kind: "human" as const, id: "reviewer" };

describe("self-improvement is caged: silent self-modification is architecturally impossible", () => {
  beforeEach(async () => {
    await resetKernelTables();
    await seedGoldenCasesIfEmpty();
  });

  it("an agent can propose a change, but it does not take effect on proposal alone", async () => {
    const before = await getDriftThreshold();
    const proposal = await proposeChange({
      kind: "threshold",
      ruleKey: "tripwire.drift.severity5Threshold",
      title: "Lower the drift threshold",
      rationale: "test",
      before: { threshold: before },
      after: { threshold: 0.3 },
      proposedBy: AGENT,
    });
    expect(proposal.status).toBe("proposed");
    expect(await getDriftThreshold()).toBe(before); // unchanged
  });

  it("merge is refused before evaluation", async () => {
    const proposal = await proposeChange({
      kind: "threshold",
      ruleKey: "tripwire.drift.severity5Threshold",
      title: "x",
      rationale: "x",
      before: { threshold: 0.4 },
      after: { threshold: 0.3 },
      proposedBy: AGENT,
    });
    await expect(mergeProposal(proposal.id, HUMAN)).rejects.toThrow(SelfImproveCagingError);
  });

  it("an agent cannot approve its own (or any) proposal — approveProposal requires a human actor", async () => {
    const proposal = await proposeChange({
      kind: "threshold",
      ruleKey: "tripwire.drift.severity5Threshold",
      title: "x",
      rationale: "x",
      before: { threshold: 0.4 },
      after: { threshold: 0.3 },
      proposedBy: AGENT,
    });
    await evaluateProposal(proposal.id, AGENT);
    await expect(approveProposal(proposal.id, "approved", AGENT)).rejects.toThrow(SelfImproveCagingError);
  });

  it("merge is refused even after evaluation, until a human has approved", async () => {
    const proposal = await proposeChange({
      kind: "threshold",
      ruleKey: "tripwire.drift.severity5Threshold",
      title: "x",
      rationale: "x",
      before: { threshold: 0.4 },
      after: { threshold: 0.3 },
      proposedBy: AGENT,
    });
    await evaluateProposal(proposal.id, HUMAN);
    await expect(mergeProposal(proposal.id, HUMAN)).rejects.toThrow(SelfImproveCagingError);
  });

  it("full honest path: propose -> evaluate -> human approve -> merge actually changes production rule state, with a before/after scorecard recorded", async () => {
    const before = await getDriftThreshold();
    const proposal = await proposeChange({
      kind: "threshold",
      ruleKey: "tripwire.drift.severity5Threshold",
      title: "Retune drift threshold",
      rationale: "golden dataset shows better accuracy at 0.35",
      before: { threshold: before },
      after: { threshold: 0.35 },
      proposedBy: AGENT,
    });

    const evaluated = await evaluateProposal(proposal.id, HUMAN);
    expect(evaluated.status).toBe("evaluated");
    expect(evaluated.scorecard).toBeTruthy();
    const scorecard = evaluated.scorecard as { beforeAccuracy: number; afterAccuracy: number };
    expect(typeof scorecard.beforeAccuracy).toBe("number");
    expect(typeof scorecard.afterAccuracy).toBe("number");

    const approved = await approveProposal(proposal.id, "approved", HUMAN, "looks right");
    expect(approved.status).toBe("approved");

    const merged = await mergeProposal(proposal.id, HUMAN);
    expect(merged.status).toBe("merged");

    const [rule] = await db.select().from(kernelActiveRules).where(eq(kernelActiveRules.ruleKey, "tripwire.drift.severity5Threshold")).limit(1);
    expect((rule.value as { threshold: number }).threshold).toBe(0.35);
    expect(await getDriftThreshold()).toBe(0.35);
  });

  it("rejecting a proposal also blocks merge", async () => {
    const proposal = await proposeChange({
      kind: "threshold",
      ruleKey: "tripwire.drift.severity5Threshold",
      title: "bad idea",
      rationale: "x",
      before: { threshold: 0.4 },
      after: { threshold: 0.9 },
      proposedBy: AGENT,
    });
    await evaluateProposal(proposal.id, HUMAN);
    const rejected = await approveProposal(proposal.id, "rejected", HUMAN);
    expect(rejected.status).toBe("rejected");
    await expect(mergeProposal(proposal.id, HUMAN)).rejects.toThrow(SelfImproveCagingError);
  });
});
