import type { BoardPack, BoardPackSummary } from "@/lib/domain/types";
import { countEvents } from "@/lib/platform/db/eventsRepository";
import { countFindings, listTopFindings } from "@/lib/platform/db/findingsRepository";
import { countDecisions, listRecentDecisions } from "@/lib/platform/db/decisionsRepository";
import { countRuns } from "@/lib/platform/db/runsRepository";
import { getLatestBoardPack, insertBoardPack } from "@/lib/platform/db/boardPacksRepository";
import { recordEvent } from "./events";

export async function generateBoardPack(periodLabel?: string): Promise<BoardPack> {
  const [eventTotal, findingTotal, openFindings, decisionTotal, decidedDecisions, runTotal] =
    await Promise.all([
      countEvents(),
      countFindings(),
      countFindings("open"),
      countDecisions(),
      countDecisions("decided"),
      countRuns(),
    ]);

  const [topFindings, recentDecisions] = await Promise.all([
    listTopFindings(5),
    listRecentDecisions(5),
  ]);

  const summary: BoardPackSummary = {
    generatedAt: new Date().toISOString(),
    totals: {
      events: eventTotal,
      findings: findingTotal,
      openFindings,
      decisions: decisionTotal,
      decidedDecisions,
      automationRuns: runTotal,
    },
    topFindings: topFindings.map((f) => ({ id: f.id, title: f.title, score: f.score })),
    recentDecisions: recentDecisions.map((d) => ({
      id: d.id,
      title: d.title,
      beliefMean: d.beliefMean,
      status: d.status,
    })),
  };

  const pack = await insertBoardPack({
    periodLabel: periodLabel ?? new Date().toISOString().slice(0, 10),
    summary,
  });

  await recordEvent({
    type: "boardpack.generated",
    version: 1,
    payload: { boardPackId: pack.id },
  });

  return pack;
}

export async function getLatestPack(): Promise<BoardPack | null> {
  return getLatestBoardPack();
}
