// GET /api/time-economics/strategy-mirror/self?userId=<optional target>
//
// "The calendar says you're X% strategic — here's the evidence." Builds a
// per-meeting classification (strategic/operational/reactive) against
// Part 07's strategy map, with explicit confidence/uncertainty on every
// line (enforced by lint — see scripts/verify.ts). Defaults to the
// requesting actor; another user's mirror is privacy-gated exactly like
// the self dashboard.
import {
  getActorFromRequest,
  getDemoOrg,
  getOrgConfigOrDefault,
  getUserById,
  getConsent,
  logPrivacyDecision,
  listEventsForUser,
  getTopicStrategyMap,
  getStrategyPillars,
  getClassification,
  upsertClassification,
} from "@/lib/time-economics/repo";
import { evaluateTimeDataAccess } from "@/lib/time-economics/privacy";
import { classifyMeetingTopic, buildStrategyMirror } from "@/lib/time-economics/strategyClassifier";
import type { StrategyMirrorEvidence } from "@/lib/time-economics/strategyClassifier";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return Response.json({ error: "Missing or invalid x-user-id" }, { status: 401 });

  const org = await getDemoOrg();
  if (!org) return Response.json({ error: "No demo org seeded" }, { status: 404 });

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("userId") ?? actor.id;
  const targetUser = await getUserById(targetUserId);
  if (!targetUser) return Response.json({ error: "Target user not found" }, { status: 404 });

  const consent = await getConsent(targetUserId);
  const decision = evaluateTimeDataAccess(actor, targetUserId, "individual_strategy_mirror", consent);
  if (actor.id !== targetUserId) {
    await logPrivacyDecision(actor.id, targetUserId, "individual_strategy_mirror", decision.allowed, decision.reason);
  }
  if (!decision.allowed) {
    return Response.json({ error: "Access denied", reason: decision.reason }, { status: 403 });
  }

  const cfg = await getOrgConfigOrDefault(org.id);
  void cfg;
  const topicMap = await getTopicStrategyMap(org.id);
  const pillars = await getStrategyPillars(org.id);
  const targetStrategicPct = pillars.reduce((acc, p) => acc + Number(p.targetAllocationPct), 0);

  const eventRows = await listEventsForUser(targetUserId, org.id);
  const evidence: StrategyMirrorEvidence[] = [];
  for (const { event } of eventRows) {
    let classification = await getClassification(event.id);
    if (!classification) {
      const result = classifyMeetingTopic(
        event.id,
        event.title,
        event.topic,
        event.isRecurring,
        topicMap.map((t) => ({ topicKeyword: t.topicKeyword, pillarId: t.pillarId, category: t.category as "strategic" | "operational" | "reactive", weight: Number(t.weight) })),
      );
      await upsertClassification(event.id, result.category, result.confidence, result.pillarId, result.method);
      classification = await getClassification(event.id);
    }
    if (!classification) continue;
    const hours = (event.endTime.getTime() - event.startTime.getTime()) / 3600000;
    evidence.push({
      eventId: event.id,
      title: event.title,
      category: classification.category as "strategic" | "operational" | "reactive",
      confidence: Number(classification.confidence),
      hours,
    });
  }

  const mirror = buildStrategyMirror(evidence, pillars.length > 0 ? targetStrategicPct : null);

  return Response.json({
    userId: targetUser.id,
    name: targetUser.name,
    viewedAsSelf: actor.id === targetUserId,
    mirror,
    method: [
      "Classification = weighted keyword match against the org's strategy map (Part 07), category = strategic | operational | reactive.",
      "Every classification line carries a confidence score (0..1); low-confidence lines (<0.5) are included but flagged via `lowConfidenceShare`.",
      "Headline % is a modeled estimate from calendar metadata, not a judgment of the person's actual priorities.",
    ],
  });
}
