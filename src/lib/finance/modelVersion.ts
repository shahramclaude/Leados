// Part 08 — model version history, in the `modelVersion.ts` style referenced
// from Part 06 (not present in this repo snapshot; this is a self-contained
// equivalent scoped to the finance DAG). Every time the model is evaluated
// for a "record" action (e.g. a board pack is generated, or a driver
// override is saved), we persist an immutable snapshot: hash, label, node
// count, and a compact summary of key output series. Full change history,
// queryable, never mutated in place.

import { db } from "@/db";
import { financeModelVersions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { EvaluatedModel } from "./dag";

const SUMMARY_NODE_IDS = [
  "totalRevenue",
  "grossProfit",
  "ebitda",
  "netIncome",
  "cashBalance",
  "runwayMonths",
  "arr",
];

export interface ModelVersionSnapshot {
  months: string[];
  nodeCount: number;
  summary: Record<string, number[]>;
}

export function buildSnapshot(model: EvaluatedModel): ModelVersionSnapshot {
  const summary: Record<string, number[]> = {};
  for (const id of SUMMARY_NODE_IDS) {
    if (model.nodes[id]) summary[id] = model.nodes[id].values;
  }
  return { months: model.months, nodeCount: Object.keys(model.nodes).length, summary };
}

export async function recordModelVersion(model: EvaluatedModel, label: string): Promise<number> {
  const snapshot = buildSnapshot(model);
  const rows = await db
    .insert(financeModelVersions)
    .values({
      hash: model.hash,
      label,
      nodeCount: String(snapshot.nodeCount),
      snapshot,
    })
    .returning({ id: financeModelVersions.id });
  return rows[0].id;
}

export async function listModelVersions(limit = 20) {
  return db
    .select()
    .from(financeModelVersions)
    .orderBy(desc(financeModelVersions.createdAt))
    .limit(limit);
}
