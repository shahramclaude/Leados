// src/app/api/strategic/route.ts
//
// NOTE: this project is a Vite single-page app (no Next.js server runtime),
// so these handlers are implemented as plain async functions using the
// standard Fetch API `Request`/`Response` objects available in the browser.
// `StrategicWarRoomView` calls them in-process the same way it would call
// `fetch('/api/strategic')` against a real route handler, which keeps this
// module drop-in compatible with a future Next.js route file of the same
// shape.

import { computeBeliefFabric } from '../../../lib/beliefFabric';
import { runStrategicIntelligence, type StrategicIntelligenceInput } from '../../../lib/strategicIntelligence';
import type { StrategicIntelligenceReport, BoardIntelligencePack, WargameAutoResult } from '../../../lib/types';
import {
  generateMetricHistory,
  generateEvents,
  generateDecisions,
  generateCompetitors,
  generateSavedScenarios,
  generateMetricDefs,
} from '../../../lib/mockData';
import { generateCompetitorProfile, pickLikelyCounterMove, scoreWargameRound, describeMoveOutcome, MOVE_CATALOG } from '../../../lib/wargameEngine';

function buildInput(now: Date = new Date()): StrategicIntelligenceInput {
  const metrics = generateMetricHistory(now);
  const events = generateEvents(now);
  const decisions = generateDecisions(now);
  const competitors = generateCompetitors();
  const beliefResult = computeBeliefFabric(metrics, events, decisions);

  return {
    beliefResult,
    decisions,
    metrics,
    metricDefs: generateMetricDefs(),
    events,
    existingScenarios: generateSavedScenarios(now),
    competitors,
    now,
  };
}

export interface StrategicApiPayload {
  report: StrategicIntelligenceReport;
  boardPack: BoardIntelligencePack;
}

/** GET /api/strategic — full StrategicIntelligenceReport (+ BoardIntelligencePack convenience field) */
export async function GET(): Promise<Response> {
  const input = buildInput();
  const report = runStrategicIntelligence(input);
  const payload: StrategicApiPayload = { report, boardPack: report.boardPack };
  return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
}

/** GET /api/strategic/board-pack — BoardIntelligencePack only, for export/PDF generation */
export async function GET_boardPack(): Promise<Response> {
  const input = buildInput();
  const report = runStrategicIntelligence(input);
  return new Response(JSON.stringify(report.boardPack), { headers: { 'Content-Type': 'application/json' } });
}

export interface TriggerWargameBody {
  action: 'trigger_wargame';
  competitorName?: string;
  context?: string;
}

/** POST /api/strategic — body: { action: 'trigger_wargame', competitorName?, context? } */
export async function POST(body: TriggerWargameBody): Promise<Response> {
  if (body.action !== 'trigger_wargame') {
    return new Response(JSON.stringify({ error: 'unsupported action' }), { status: 400 });
  }

  const now = new Date();
  const input = buildInput(now);
  const decisions = input.decisions.filter((d) => d.status === 'proposed').sort((a, b) => b.impact - a.impact);
  const ourBestMove = decisions.length
    ? {
        id: `decision_${decisions[0].id}`,
        name: decisions[0].title,
        axis: 'market' as const,
        impact: 10 + decisions[0].impact * 3,
        description: decisions[0].recommendation ?? decisions[0].title,
      }
    : MOVE_CATALOG[2];

  const targetCompetitors = body.competitorName
    ? input.competitors.filter((c) => c.name.toLowerCase() === body.competitorName!.toLowerCase())
    : input.competitors;
  const pool = targetCompetitors.length ? targetCompetitors : input.competitors;

  const competitorCounters: WargameAutoResult['competitorCounters'] = {};
  const roundScores: WargameAutoResult['roundScores'] = {};
  let topName = pool[0]?.name ?? 'the competitor';
  let topCounter = null as ReturnType<typeof pickLikelyCounterMove> | null;

  for (const comp of pool) {
    const profile = generateCompetitorProfile(comp.name, body.context ?? `${comp.name} manual war game trigger`);
    const counter = pickLikelyCounterMove(profile, ourBestMove);
    competitorCounters[comp.name] = counter;
    roundScores[comp.name] = scoreWargameRound(ourBestMove, counter, profile);
    if (!topCounter || profile.aggressiveness > 0.6) {
      topCounter = counter;
      topName = comp.name;
    }
  }

  const result: WargameAutoResult = {
    trigger: ['manual.trigger'],
    ourBestMove,
    competitorCounters,
    roundScores,
    blindspots: input.beliefResult.uncertaintyFlags
      .slice(0, 3)
      .map((f) => `Limited visibility into ${f.node} (${Math.round(f.confidence * 100)}% confidence) — ${f.signalDescription} would sharpen this read.`),
    recommendation: `Our highest-leverage move is ${ourBestMove.name}, which ${describeMoveOutcome(ourBestMove)}. Watch for ${topName}'s likely counter: ${topCounter ? topCounter.name : 'an uncommitted response'}.`,
  };

  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
}

/** Convenience in-process callers used by the view (avoids needing a real fetch transport). */
export async function fetchStrategicReport(): Promise<StrategicApiPayload> {
  const res = await GET();
  return res.json();
}

export async function fetchBoardPack(): Promise<BoardIntelligencePack> {
  const res = await GET_boardPack();
  return res.json();
}

export async function triggerWargame(body: Omit<TriggerWargameBody, 'action'> = {}): Promise<WargameAutoResult> {
  const res = await POST({ action: 'trigger_wargame', ...body });
  return res.json();
}
