// Meeting copilot pipeline (Part 42 Phase 1/3).
//
// pre-meeting brief -> live transcript ingestion (consent-gated) ->
// post-meeting drafted artifacts -> human confirmation -> commits as
// decisions/tasks entities. Nothing commits without an explicit confirm call
// (T1-draft semantics) and non-consenting speaker content is structurally
// unreachable by the generation step (see lib/redaction/redact.ts).
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  decisions,
  evidenceDocuments,
  meetingAgendaItems,
  meetingArtifacts,
  meetingParticipants,
  meetings,
  tasks,
  transcriptSegments,
} from "@/db/schema";
import { getConsentMap, type ConsentStatus } from "@/lib/consent/consent";
import { filterConsentedSegments, shouldRedactAtCapture } from "@/lib/redaction/redact";
import { classifyActionTier, isGated, type PolicyTier } from "@/lib/policy/actionPolicy";

// ---------------------------------------------------------------------------
// Pre-meeting brief
// ---------------------------------------------------------------------------
export async function buildPreMeetingBrief(meetingId: string) {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting) throw new Error("meeting_not_found");

  const agendaItems = await db
    .select()
    .from(meetingAgendaItems)
    .where(eq(meetingAgendaItems.meetingId, meetingId));

  const allEvidenceIds = Array.from(new Set(agendaItems.flatMap((a) => a.evidenceIds)));
  const evidenceRows = allEvidenceIds.length
    ? await db.select().from(evidenceDocuments).where(inArray(evidenceDocuments.id, allEvidenceIds))
    : [];
  const evidenceById = new Map(evidenceRows.map((e) => [e.id, e]));

  return {
    meeting,
    agenda: agendaItems
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => ({
        id: item.id,
        title: item.title,
        evidence: item.evidenceIds
          .map((eid) => evidenceById.get(eid))
          .filter((e): e is NonNullable<typeof e> => Boolean(e))
          .map((e) => ({ id: e.id, title: e.title, source: e.source, snippet: e.body.slice(0, 180) })),
      })),
  };
}

// ---------------------------------------------------------------------------
// Live transcript ingestion (consent-gated at capture time)
// ---------------------------------------------------------------------------
export interface IngestSegmentInput {
  speakerParticipantId?: string | null;
  speakerName: string;
  startMs: number;
  endMs: number;
  text: string;
}

export async function ingestTranscriptSegment(meetingId: string, input: IngestSegmentInput) {
  const consentMap = await getConsentMap(meetingId);
  const consentAtCapture: ConsentStatus = input.speakerParticipantId
    ? consentMap.get(input.speakerParticipantId) ?? "pending"
    : "pending";

  const [row] = await db
    .insert(transcriptSegments)
    .values({
      meetingId,
      speakerParticipantId: input.speakerParticipantId ?? null,
      speakerName: input.speakerName,
      startMs: input.startMs,
      endMs: input.endMs,
      text: input.text,
      consentAtCapture,
      redacted: shouldRedactAtCapture(consentAtCapture),
    })
    .returning();

  await db.update(meetings).set({ status: "live" }).where(eq(meetings.id, meetingId));
  return row;
}

export async function getTranscript(meetingId: string) {
  return db.select().from(transcriptSegments).where(eq(transcriptSegments.meetingId, meetingId));
}

// ---------------------------------------------------------------------------
// Post-meeting artifact generation (summary / decisions / actions / open Qs)
// ---------------------------------------------------------------------------
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const DECISION_PATTERN = /\b(we(?:'ll| will)?\s+(?:decided|agree|go(?:ing)? with|chose)|decision:|let'?s go with)\b/i;
const ACTION_PATTERN = /\b(I'?ll|I will|can you|could you|action item|will follow up|to send|to schedule)\b/i;
const OPEN_QUESTION_PATTERN = /\?\s*$/;
const UNRESOLVED_MARKERS = /\b(not sure|tbd|need to check|unclear|open question|unresolved)\b/i;

type SentenceKind = "decision" | "action" | "question" | null;

function classifySentence(sentence: string): SentenceKind {
  if (DECISION_PATTERN.test(sentence)) return "decision";
  if (ACTION_PATTERN.test(sentence)) return "action";
  if (OPEN_QUESTION_PATTERN.test(sentence) || UNRESOLVED_MARKERS.test(sentence)) return "question";
  return null;
}

export async function generatePostMeetingArtifacts(meetingId: string) {
  const allSegments = await getTranscript(meetingId);
  const consentMap = await getConsentMap(meetingId);
  const { usable, redactedCount } = filterConsentedSegments(allSegments, consentMap);

  // Clear any previously drafted (unconfirmed) artifacts so re-running the
  // pipeline doesn't duplicate drafts; confirmed/edited artifacts are kept.
  await db
    .delete(meetingArtifacts)
    .where(eq(meetingArtifacts.meetingId, meetingId));

  const created: (typeof meetingArtifacts.$inferSelect)[] = [];

  const summaryPoints: { text: string; citation: string }[] = [];
  const decisionCandidates: { text: string; citation: string }[] = [];
  const actionCandidates: { text: string; citation: string; speaker: string }[] = [];
  const questionCandidates: { text: string; citation: string }[] = [];

  for (const seg of usable) {
    for (const sentence of splitSentences(seg.text)) {
      const kind = classifySentence(sentence);
      if (kind === "decision") decisionCandidates.push({ text: sentence, citation: seg.id });
      else if (kind === "action") actionCandidates.push({ text: sentence, citation: seg.id, speaker: seg.speakerName });
      else if (kind === "question") questionCandidates.push({ text: sentence, citation: seg.id });
      else summaryPoints.push({ text: sentence, citation: seg.id });
    }
  }

  // Summary artifact — generated, cited to the transcript spans it draws on.
  if (summaryPoints.length > 0 || usable.length > 0) {
    const topPoints = summaryPoints.slice(0, 6);
    const [row] = await db
      .insert(meetingArtifacts)
      .values({
        meetingId,
        type: "summary",
        content: {
          generated: true,
          bullets: topPoints.map((p) => p.text),
          speakerCount: new Set(usable.map((s) => s.speakerName)).size,
          redactedSegmentCount: redactedCount,
        },
        citations: topPoints.map((p) => p.citation),
      })
      .returning();
    created.push(row);
  }

  for (const d of decisionCandidates) {
    const [row] = await db
      .insert(meetingArtifacts)
      .values({
        meetingId,
        type: "decision_draft",
        content: { title: d.text.slice(0, 120), description: d.text },
        citations: [d.citation],
      })
      .returning();
    created.push(row);
  }

  for (const a of actionCandidates) {
    const tier: PolicyTier = classifyActionTier(a.text);
    const [row] = await db
      .insert(meetingArtifacts)
      .values({
        meetingId,
        type: "action_draft",
        content: {
          title: a.text.slice(0, 120),
          description: a.text,
          suggestedOwner: a.speaker,
          policyTier: tier,
          gated: isGated(tier),
        },
        citations: [a.citation],
      })
      .returning();
    created.push(row);
  }

  for (const q of questionCandidates) {
    const [row] = await db
      .insert(meetingArtifacts)
      .values({
        meetingId,
        type: "open_question",
        content: { text: q.text },
        citations: [q.citation],
      })
      .returning();
    created.push(row);
  }

  await db.update(meetings).set({ status: "post" }).where(eq(meetings.id, meetingId));

  return { artifacts: created, redactedCount };
}

export async function listArtifacts(meetingId: string) {
  return db.select().from(meetingArtifacts).where(eq(meetingArtifacts.meetingId, meetingId));
}

// ---------------------------------------------------------------------------
// Confirmation workflow — the ONLY path by which a drafted artifact becomes a
// committed Decision or Task entity. Nothing commits automatically.
// ---------------------------------------------------------------------------
export interface ConfirmArtifactInput {
  confirmedBy: string;
  edits?: Partial<{ title: string; description: string; owner: string }>;
  acknowledgeGated?: boolean;
}

export class GatedConfirmationRequiredError extends Error {
  tier: PolicyTier;
  constructor(tier: PolicyTier) {
    super(`This action is ${tier} and needs explicit gated acknowledgement before it can commit.`);
    this.tier = tier;
  }
}

export async function confirmArtifact(artifactId: string, input: ConfirmArtifactInput) {
  const [artifact] = await db.select().from(meetingArtifacts).where(eq(meetingArtifacts.id, artifactId));
  if (!artifact) throw new Error("artifact_not_found");
  if (artifact.status === "confirmed") return artifact;

  const content: Record<string, unknown> = { ...artifact.content, ...input.edits };

  if (artifact.type === "decision_draft") {
    await db.insert(decisions).values({
      meetingId: artifact.meetingId,
      sourceArtifactId: artifact.id,
      title: String(content.title ?? "Decision"),
      description: String(content.description ?? ""),
      confirmedBy: input.confirmedBy,
    });
  } else if (artifact.type === "action_draft") {
    const tier = (content.policyTier as PolicyTier) ?? "T1";
    if (isGated(tier) && !input.acknowledgeGated) {
      throw new GatedConfirmationRequiredError(tier);
    }
    await db.insert(tasks).values({
      meetingId: artifact.meetingId,
      sourceArtifactId: artifact.id,
      title: String(content.title ?? "Task"),
      description: String(content.description ?? ""),
      owner: String(input.edits?.owner ?? content.suggestedOwner ?? "unassigned"),
      policyTier: tier,
      confirmedBy: input.confirmedBy,
    });
  }
  // summary / open_question artifacts have no committed entity — confirming
  // them just locks the generated text as reviewed.

  const [updated] = await db
    .update(meetingArtifacts)
    .set({
      status: input.edits ? "edited" : "confirmed",
      content,
      confirmedBy: input.confirmedBy,
      confirmedAt: new Date(),
    })
    .where(eq(meetingArtifacts.id, artifactId))
    .returning();

  return updated;
}

export async function rejectArtifact(artifactId: string, by: string) {
  const [updated] = await db
    .update(meetingArtifacts)
    .set({ status: "rejected", confirmedBy: by, confirmedAt: new Date() })
    .where(eq(meetingArtifacts.id, artifactId))
    .returning();
  return updated;
}

export async function listMeetings() {
  return db.select().from(meetings);
}

export async function createMeeting(input: {
  title: string;
  scheduledAt?: string;
  participants: { name: string; email?: string; role?: string; isOrganizer?: boolean }[];
  agenda: { title: string; evidenceIds?: string[] }[];
}) {
  const [meeting] = await db
    .insert(meetings)
    .values({
      title: input.title,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : new Date(),
    })
    .returning();

  if (input.participants.length) {
    await db.insert(meetingParticipants).values(
      input.participants.map((p) => ({
        meetingId: meeting.id,
        name: p.name,
        email: p.email,
        role: p.role ?? "participant",
        isOrganizer: p.isOrganizer ?? false,
      })),
    );
  }

  if (input.agenda.length) {
    await db.insert(meetingAgendaItems).values(
      input.agenda.map((a, i) => ({
        meetingId: meeting.id,
        title: a.title,
        evidenceIds: a.evidenceIds ?? [],
        orderIndex: i,
      })),
    );
  }

  return meeting;
}

export async function getMeetingDetail(meetingId: string) {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting) return null;
  const participants = await db
    .select()
    .from(meetingParticipants)
    .where(eq(meetingParticipants.meetingId, meetingId));
  const agenda = await db
    .select()
    .from(meetingAgendaItems)
    .where(eq(meetingAgendaItems.meetingId, meetingId));
  return { meeting, participants, agenda };
}
