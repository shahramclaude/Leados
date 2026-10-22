import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { previewCsvImport, commitImportBatch } from "@/lib/import";
import { traceLineageForProjection } from "@/lib/platform/lineage/store";
import { ensureConnectorsSeeded } from "@/lib/platform/connectors/seed";
import { truncateAll } from "../dbHelpers";

const CSV = `Full Name,Email,Phone,Company,Job Title,Country,Updated At
Lineage Test,lineage.test@tracecorp.com,+1 212-555-0177,TraceCorp,Director,US,2026-01-05T00:00:00Z
`;

describe("Lineage query — end-to-end for a seeded value", () => {
  beforeEach(async () => {
    await ensureConnectorsSeeded();
    await truncateAll();
  });

  it("resolves source -> transform -> projection -> surface for a committed value", async () => {
    const preview = await previewCsvImport("csv-upload", CSV);
    await commitImportBatch(preview.batchId, "test:lineage-suite");

    const [entity] = await db.select().from(entities);
    expect(entity).toBeDefined();

    const trace = await traceLineageForProjection("entities", entity.id);
    expect(trace.found).toBe(true);
    const fullChain = trace.chains.find((c) => c.nodes[c.nodes.length - 1].nodeType === "surface");
    expect(fullChain).toBeDefined();
    expect(fullChain!.nodes.map((n) => n.nodeType)).toEqual(["source", "transform", "projection", "surface"]);
    expect(fullChain!.nodes[0].refTable).toBe("raw_records");
    expect(fullChain!.nodes[2].refId).toBe(entity.id);
  });

  it("says so honestly (found:false) when asked about a value that was never ingested", async () => {
    const trace = await traceLineageForProjection("entities", "nonexistent-entity-id");
    expect(trace.found).toBe(false);
  });
});
