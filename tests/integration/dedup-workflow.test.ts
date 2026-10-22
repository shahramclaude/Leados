import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { dedupCandidates, entities, entityLinks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { previewCsvImport, commitImportBatch } from "@/lib/import";
import { confirmCandidate, rejectCandidate, undoMerge, DedupActionError } from "@/lib/platform/mdm/dedupActions";
import { ensureConnectorsSeeded } from "@/lib/platform/connectors/seed";
import { truncateAll } from "../dbHelpers";

const FIRST_CSV = `Full Name,Email,Phone,Company,Job Title,Country,Updated At
Morgan Lee,morgan.lee@globalfreight.com,+1 206-555-0133,GlobalFreight,VP Ops,US,2026-01-01T00:00:00Z
`;

// Same company/phone, similar-but-not-identical name, DIFFERENT email -> ambiguous, must queue for review.
const AMBIGUOUS_SECOND_CSV = `Full Name,Email,Phone,Company,Job Title,Country,Updated At
Morgan  Lee,m.lee.ops@globalfreight.com,+1 206-555-0133,GlobalFreight,VP Operations,US,2026-01-10T00:00:00Z
`;

describe("Dedup Review workflow — human confirmation, never auto-merge on ambiguity", () => {
  beforeEach(async () => {
    await ensureConnectorsSeeded();
    await truncateAll();
  });

  async function seedAmbiguousCandidate() {
    const p1 = await previewCsvImport("csv-upload", FIRST_CSV);
    await commitImportBatch(p1.batchId, "test:dedup-suite");
    const p2 = await previewCsvImport("csv-upload", AMBIGUOUS_SECOND_CSV);
    const report2 = await commitImportBatch(p2.batchId, "test:dedup-suite");
    expect(report2.rowsMergedPending).toBe(1);
    expect(report2.rowsMergedAuto).toBe(0); // the gate under test: ambiguous case never auto-merges

    const [candidate] = await db.select().from(dedupCandidates);
    return candidate;
  }

  it("queues an ambiguous match for human review instead of auto-merging", async () => {
    const candidate = await seedAmbiguousCandidate();
    expect(candidate.status).toBe("pending");
  });

  it("confirm merges the candidate into the existing entity and is fully audited", async () => {
    const candidate = await seedAmbiguousCandidate();
    const result = await confirmCandidate(candidate.id, "reviewer:alice");

    const [updated] = await db.select().from(dedupCandidates).where(eq(dedupCandidates.id, candidate.id));
    expect(updated.status).toBe("confirmed");
    expect(updated.decidedBy).toBe("reviewer:alice");
    expect(updated.preMergeSnapshot).toBeTruthy();

    const [entity] = await db.select().from(entities).where(eq(entities.id, result.entityId));
    expect((entity.goldenRecord as { title: string }).title).toBe("VP Operations"); // most-recent field won

    const links = await db.select().from(entityLinks).where(eq(entityLinks.entityId, result.entityId));
    expect(links.length).toBe(2); // original + confirmed merge
  });

  it("reject keeps the two records as distinct entities", async () => {
    const candidate = await seedAmbiguousCandidate();
    const { newEntityId } = await rejectCandidate(candidate.id, "reviewer:bob");

    const allEntities = await db.select().from(entities);
    expect(allEntities).toHaveLength(2);
    expect(allEntities.map((e) => e.id)).toContain(newEntityId);

    const [updated] = await db.select().from(dedupCandidates).where(eq(dedupCandidates.id, candidate.id));
    expect(updated.status).toBe("rejected");
  });

  it("undo restores the pre-merge golden record and splits the raw record back out (real undo path)", async () => {
    const candidate = await seedAmbiguousCandidate();
    const confirmResult = await confirmCandidate(candidate.id, "reviewer:alice");

    const [beforeUndo] = await db.select().from(entities).where(eq(entities.id, confirmResult.entityId));
    expect((beforeUndo.goldenRecord as { title: string }).title).toBe("VP Operations");

    const undoResult = await undoMerge(candidate.id, "reviewer:alice");
    const [afterUndo] = await db.select().from(entities).where(eq(entities.id, confirmResult.entityId));
    expect((afterUndo.goldenRecord as { title: string }).title).toBe("VP Ops"); // restored to pre-merge value

    const allEntities = await db.select().from(entities);
    expect(allEntities).toHaveLength(2);
    expect(undoResult.newEntityId).toBeTruthy();

    const [updated] = await db.select().from(dedupCandidates).where(eq(dedupCandidates.id, candidate.id));
    expect(updated.status).toBe("rejected");
    expect(updated.decidedBy).toBe("reviewer:alice (undo)");
  });

  it("refuses to confirm/reject an already-decided candidate (no double-processing)", async () => {
    const candidate = await seedAmbiguousCandidate();
    await confirmCandidate(candidate.id, "reviewer:alice");
    await expect(confirmCandidate(candidate.id, "reviewer:alice")).rejects.toBeInstanceOf(DedupActionError);
  });

  it("refuses to undo a candidate that was never confirmed", async () => {
    const candidate = await seedAmbiguousCandidate();
    await expect(undoMerge(candidate.id, "reviewer:alice")).rejects.toThrow(/Only a confirmed merge/);
  });
});
