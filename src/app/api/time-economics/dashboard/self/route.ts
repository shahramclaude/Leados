// GET /api/time-economics/dashboard/self?userId=<optional target>
//
// Self-view Time Dashboard: full individual detail. Defaults to the
// requesting actor's own data. An actor MAY request another user's data
// via ?userId=, but that is privacy-gated (consent-required) and every
// attempt — allowed or denied — is written to the audit log. This is the
// only path through which "manager view" of individual detail exists,
// and it is off unless the target explicitly opted in.
import {
  getActorFromRequest,
  getDemoOrg,
  getOrgConfigOrDefault,
  getUserById,
  getConsent,
  logPrivacyDecision,
  listEventsForUser,
  listInteractionEventsForUser,
} from "@/lib/time-economics/repo";
import { evaluateTimeDataAccess } from "@/lib/time-economics/privacy";
import { analyzeFragmentation, type MeetingBlock } from "@/lib/time-economics/cognitiveLoad";
import { evaluateAttentionBudget } from "@/lib/time-economics/attentionBudget";
import { dailyFatigueIndex } from "@/lib/time-economics/fatigue";
import { localMinuteOfDay } from "@/lib/time-economics/temporal";

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
  const decision = evaluateTimeDataAccess(actor, targetUserId, "individual_interaction_detail", consent);
  if (actor.id !== targetUserId) {
    await logPrivacyDecision(actor.id, targetUserId, "individual_interaction_detail", decision.allowed, decision.reason);
  }
  if (!decision.allowed) {
    return Response.json({ error: "Access denied", reason: decision.reason }, { status: 403 });
  }

  const cfg = await getOrgConfigOrDefault(org.id);
  const eventsRows = await listEventsForUser(targetUserId, org.id);
  const todayEvents = eventsRows
    .map((r) => r.event)
    .filter((e) => e.startTime >= new Date(Date.now() - 24 * 60 * 60 * 1000));

  const meetingBlocks: MeetingBlock[] = todayEvents.map((e) => ({
    startMinute: localMinuteOfDay(targetUser.timezone, e.startTime),
    endMinute: localMinuteOfDay(targetUser.timezone, e.startTime) + (e.endTime.getTime() - e.startTime.getTime()) / 60000,
  }));

  const fragmentation = analyzeFragmentation(meetingBlocks, cfg.workDayStartMinute, cfg.workDayEndMinute);
  const attentionBudget = evaluateAttentionBudget(fragmentation.deepWorkPreservedMinutes);
  const fatigueIndex = dailyFatigueIndex(fragmentation.contextSwitches, fragmentation.totalMeetingMinutes / 60);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const interactions = await listInteractionEventsForUser(targetUserId, org.id, since);

  return Response.json({
    userId: targetUser.id,
    name: targetUser.name,
    chronotype: targetUser.chronotype,
    timezone: targetUser.timezone,
    viewedAsSelf: actor.id === targetUserId,
    fragmentation,
    attentionBudget,
    fatigueIndex: round2(fatigueIndex),
    recentInteractionEvents: interactions.map((i) => ({ occurredAt: i.occurredAt, type: i.type })),
    method: [
      "Fragmentation metrics computed only from this person's own calendar event boundaries and logged interaction events (focus/meeting start-end, context switches) — never from unrelated activity signals.",
      "Deep-work-preserved minutes = contiguous free blocks >= 90 minutes within the work day (literature-informed threshold, see MODEL-CARD.md).",
      "Fatigue index is a 0-1 heuristic combining interruption recovery cost (Mark, Gudith & Klocke 2008) and meeting-length pressure — not a biometric measurement.",
    ],
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
