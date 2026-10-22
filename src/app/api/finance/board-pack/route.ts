// Part 08 — GET: preview a board pack (not persisted). POST: generate +
// persist a versioned board pack + record a model version snapshot.

import { NextRequest } from "next/server";
import { evaluateModel, monteCarloForecast, CUTOVER_INDEX } from "@/lib/finance/financeEngine";
import { generateBoardPack } from "@/lib/finance/financialStory";
import { checkCitations, FactLedger } from "@/lib/finance/citations";
import { allSentences } from "@/lib/finance/financialStory";
import { MONTHS } from "@/lib/finance/timeline";
import { loadOverrideMap } from "@/lib/finance/overridesStore";
import { db } from "@/db";
import { financeBoardPacks } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { recordModelVersion } from "@/lib/finance/modelVersion";

export const dynamic = "force-dynamic";

function resolveMonthIndex(month: string | null): number {
  if (!month) return CUTOVER_INDEX;
  const idx = MONTHS.indexOf(month);
  return idx === -1 ? CUTOVER_INDEX : idx;
}

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  const monthIndex = resolveMonthIndex(month);
  const persisted = await loadOverrideMap();
  const model = evaluateModel(persisted);
  const forecast = monthIndex >= CUTOVER_INDEX ? monteCarloForecast(model, persisted, undefined, 80) : undefined;
  const pack = generateBoardPack(model, monthIndex, 0, forecast);
  const ledger = FactLedger.fromJSON(pack.facts);
  const issues = checkCitations(allSentences(pack), ledger);
  return Response.json({ pack, citationIssues: issues, persisted: false });
}

export async function POST(req: NextRequest) {
  const payload = (await req.json().catch(() => ({}))) as { month?: string };
  const monthIndex = resolveMonthIndex(payload.month ?? null);
  const month = MONTHS[monthIndex];
  const persisted = await loadOverrideMap();
  const model = evaluateModel(persisted);
  const forecast = monthIndex >= CUTOVER_INDEX ? monteCarloForecast(model, persisted, undefined, 80) : undefined;

  const existing = await db
    .select({ version: financeBoardPacks.version })
    .from(financeBoardPacks)
    .where(eq(financeBoardPacks.month, month))
    .orderBy(desc(financeBoardPacks.version))
    .limit(1);
  const nextVersion = existing.length > 0 ? Number(existing[0].version) + 1 : 1;

  const pack = generateBoardPack(model, monthIndex, nextVersion, forecast);
  const ledger = FactLedger.fromJSON(pack.facts);
  const issues = checkCitations(allSentences(pack), ledger);
  if (issues.length > 0) {
    return Response.json({ error: "Generated board pack failed citation check", issues }, { status: 500 });
  }

  await db.insert(financeBoardPacks).values({
    month,
    version: String(nextVersion),
    modelHash: model.hash,
    content: pack,
  });
  const modelVersionId = await recordModelVersion(model, `Board pack ${month} v${nextVersion}`);

  return Response.json({ pack, citationIssues: issues, persisted: true, modelVersionId });
}
