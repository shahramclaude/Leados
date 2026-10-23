// Part 43 — Phase 1/3(c): micro-coaching engine using the GROW structure
// (Goal → Reality → Options → Will). Deterministic, template-driven dialogue
// — the coach only ever asks and reflects, never advises. A directive-phrase
// guardrail runs on every generated coach line as a last line of defence,
// and the same detector powers the coaching eval slice.
//
// Builds on Part 23's person-owned record shape (decisionJournal.ts) for the
// resulting commitment, and is designed to sit on whatever dialogue runtime
// Part 42 provides — this module only needs "store a turn, generate the next
// turn," so it is runtime-agnostic.

import { db } from "@/db";
import { coachingMessages, coachingSessions, commitments } from "@/db/schema";
import { writeJournalEntry } from "@/lib/decisionJournal";
import { newId } from "@/lib/ids";
import { and, asc, eq } from "drizzle-orm";

export type GrowStage = "goal" | "reality" | "options" | "will" | "complete";
export type CoachingSession = typeof coachingSessions.$inferSelect;
export type CoachingMessage = typeof coachingMessages.$inferSelect;
export type Commitment = typeof commitments.$inferSelect;

export const GROW_STAGE_ORDER: GrowStage[] = ["goal", "reality", "options", "will", "complete"];

// How many PERSON turns a stage takes before the engine advances.
const STAGE_TURNS: Record<Exclude<GrowStage, "complete">, number> = {
  goal: 1,
  reality: 2,
  options: 2,
  will: 1,
};

const QUESTION_BANKS: Record<Exclude<GrowStage, "complete">, string[]> = {
  goal: [
    "What would you like to focus on in this session?",
    "If this session goes really well, what will be different afterward?",
    "What outcome matters most to you here?",
  ],
  reality: [
    "What's actually happening right now, in your own words?",
    "What have you already tried?",
    "Who else is affected by this, and how do you think they'd describe it?",
    "What's the gap between where you are and where you want to be?",
  ],
  options: [
    "What options can you see here, even ones you haven't taken seriously yet?",
    "What would you try if you knew you couldn't fail?",
    "What's stopping you from doing that already?",
    "Whose help could change what's possible here?",
  ],
  will: [
    "Which option will you actually commit to?",
    "What's the very first step, and by when?",
  ],
};

// Guardrail: any coach-generated line matching these patterns is rejected
// and replaced with a safe, purely-reflective fallback. This also backs the
// non-directiveness score in the eval slice.
export const DIRECTIVE_PATTERNS: RegExp[] = [
  /you should/i,
  /you need to/i,
  /you must/i,
  /i recommend/i,
  /i suggest/i,
  /my advice/i,
  /the best way (is|would be)/i,
  /if i were you/i,
  /i'd (say|do|go)/i,
];

export function isDirective(text: string): boolean {
  return DIRECTIVE_PATTERNS.some((re) => re.test(text));
}

function reflect(personMessage: string): string {
  const trimmed = personMessage.trim();
  const excerpt = trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
  return `What I'm hearing is: "${excerpt}."`;
}

function pickQuestion(stage: Exclude<GrowStage, "complete">, alreadyAsked: string[]): string {
  const bank = QUESTION_BANKS[stage];
  const unused = bank.filter((q) => !alreadyAsked.includes(q));
  const pool = unused.length > 0 ? unused : bank;
  return pool[0];
}

async function askedQuestionsForStage(
  sessionId: string,
  stage: Exclude<GrowStage, "complete">,
): Promise<string[]> {
  const rows = await db
    .select()
    .from(coachingMessages)
    .where(and(eq(coachingMessages.sessionId, sessionId), eq(coachingMessages.speaker, "coach"), eq(coachingMessages.stage, stage)));
  const bank = QUESTION_BANKS[stage];
  const asked = new Set<string>();
  for (const row of rows) {
    for (const q of bank) {
      if (row.content.includes(q)) asked.add(q);
    }
  }
  return Array.from(asked);
}

async function insertCoachMessage(sessionId: string, stage: GrowStage, content: string) {
  const flagged = isDirective(content);
  const safeContent = flagged
    ? "That's useful to hear. What feels most important to explore next?"
    : content;
  const [row] = await db
    .insert(coachingMessages)
    .values({
      id: newId("coachmsg"),
      sessionId,
      speaker: "coach",
      content: safeContent,
      stage,
      flaggedDirective: flagged,
    })
    .returning();
  return row;
}

export async function startCoachingSession(
  personId: string,
  topic: string,
): Promise<{ session: CoachingSession; firstMessage: CoachingMessage }> {
  const [session] = await db
    .insert(coachingSessions)
    .values({ id: newId("coachsess"), personId, topic, stage: "goal", status: "active" })
    .returning();

  const firstMessage = await insertCoachMessage(
    session.id,
    "goal",
    `Thanks for bringing "${topic}." ${pickQuestion("goal", [])}`,
  );

  return { session, firstMessage };
}

export async function getSession(sessionId: string): Promise<CoachingSession | undefined> {
  const rows = await db.select().from(coachingSessions).where(eq(coachingSessions.id, sessionId)).limit(1);
  return rows[0];
}

export async function listMessages(sessionId: string): Promise<CoachingMessage[]> {
  return db
    .select()
    .from(coachingMessages)
    .where(eq(coachingMessages.sessionId, sessionId))
    .orderBy(asc(coachingMessages.createdAt));
}

export async function listSessionsForPerson(personId: string): Promise<CoachingSession[]> {
  return db.select().from(coachingSessions).where(eq(coachingSessions.personId, personId));
}

function nextStage(stage: GrowStage): GrowStage {
  const idx = GROW_STAGE_ORDER.indexOf(stage);
  return GROW_STAGE_ORDER[Math.min(idx + 1, GROW_STAGE_ORDER.length - 1)];
}

export type TurnResult = {
  session: CoachingSession;
  personMessage: CoachingMessage;
  coachMessage: CoachingMessage;
  commitmentDraft?: { title: string; description: string };
};

/**
 * Record a person's turn and generate the coach's next (non-directive) turn.
 * When the Will stage completes, drafts a commitment from the person's Will
 * answers for the person to confirm and choose visibility on — the coach
 * never writes the commitment unilaterally.
 */
export async function postPersonTurn(sessionId: string, personId: string, content: string): Promise<TurnResult> {
  const session = await getSession(sessionId);
  if (!session) throw new Error("session not found");
  if (session.personId !== personId) throw new Error("not your session");
  if (session.status !== "active") throw new Error("session not active");
  if (session.stage === "complete") throw new Error("session already complete");

  const [personMessage] = await db
    .insert(coachingMessages)
    .values({ id: newId("coachmsg"), sessionId, speaker: "person", content, stage: session.stage })
    .returning();

  const stage = session.stage as Exclude<GrowStage, "complete">;
  const personTurnsThisStage = (
    await db
      .select()
      .from(coachingMessages)
      .where(
        and(
          eq(coachingMessages.sessionId, sessionId),
          eq(coachingMessages.speaker, "person"),
          eq(coachingMessages.stage, stage),
        ),
      )
  ).length;

  const stageDone = personTurnsThisStage >= STAGE_TURNS[stage];
  const upcomingStage = stageDone ? nextStage(stage) : stage;

  let commitmentDraft: { title: string; description: string } | undefined;
  let coachContent: string;

  if (stage === "will" && stageDone) {
    const willMessages = await db
      .select()
      .from(coachingMessages)
      .where(
        and(
          eq(coachingMessages.sessionId, sessionId),
          eq(coachingMessages.speaker, "person"),
          eq(coachingMessages.stage, "will"),
        ),
      );
    const description = willMessages.map((m) => m.content).join(" ");
    commitmentDraft = { title: description.slice(0, 80), description };
    coachContent =
      `${reflect(content)} That sounds like a real commitment: "${commitmentDraft.title}". ` +
      `Want to keep this private to you, or share it with your manager in your 1:1 space?`;
  } else if (upcomingStage === "complete") {
    coachContent = `${reflect(content)} That's a wrap for this session — thank you for the honesty.`;
  } else {
    coachContent = `${reflect(content)} ${pickQuestion(
      upcomingStage as Exclude<GrowStage, "complete">,
      await askedQuestionsForStage(sessionId, upcomingStage),
    )}`;
  }

  const coachMessage = await insertCoachMessage(sessionId, upcomingStage, coachContent);

  const [updatedSession] = await db
    .update(coachingSessions)
    .set({ stage: upcomingStage, updatedAt: new Date() })
    .where(eq(coachingSessions.id, sessionId))
    .returning();

  return { session: updatedSession, personMessage, coachMessage, commitmentDraft };
}

/**
 * Person confirms their own commitment and chooses its visibility. This is
 * the ONLY way a coaching artefact can ever become visible outside the
 * session — nothing is auto-shared.
 */
export async function confirmCommitment(params: {
  sessionId: string;
  personId: string;
  title: string;
  description: string;
  competencyId?: string;
  dueDate?: Date;
  visibility: "private" | "shared_with_manager";
}): Promise<Commitment> {
  const session = await getSession(params.sessionId);
  if (!session || session.personId !== params.personId) throw new Error("not your session");

  const [commitment] = await db
    .insert(commitments)
    .values({
      id: newId("commitment"),
      personId: params.personId,
      sessionId: params.sessionId,
      competencyId: params.competencyId,
      title: params.title,
      description: params.description,
      dueDate: params.dueDate,
      visibility: params.visibility,
    })
    .returning();

  await writeJournalEntry({
    personId: params.personId,
    kind: "coaching_commitment",
    content: { commitmentId: commitment.id, title: commitment.title, description: commitment.description },
    visibility: params.visibility,
    relatedSessionId: params.sessionId,
  });

  await db
    .update(coachingSessions)
    .set({ status: "completed", stage: "complete", updatedAt: new Date() })
    .where(eq(coachingSessions.id, params.sessionId));

  return commitment;
}

/** Reconstructs the commitment draft from a session's Will-stage person
 * messages — used so the "confirm your commitment" UI survives a page
 * reload instead of relying on the ephemeral return value of the turn that
 * produced it. */
export async function draftCommitmentFromSession(
  sessionId: string,
): Promise<{ title: string; description: string } | undefined> {
  const willMessages = await db
    .select()
    .from(coachingMessages)
    .where(
      and(
        eq(coachingMessages.sessionId, sessionId),
        eq(coachingMessages.speaker, "person"),
        eq(coachingMessages.stage, "will"),
      ),
    );
  if (willMessages.length === 0) return undefined;
  const description = willMessages.map((m) => m.content).join(" ");
  return { title: description.slice(0, 80), description };
}

export async function listCommitments(personId: string): Promise<Commitment[]> {
  return db.select().from(commitments).where(eq(commitments.personId, personId));
}

export async function sharedCommitmentsForManagerView(personId: string): Promise<Commitment[]> {
  return db
    .select()
    .from(commitments)
    .where(and(eq(commitments.personId, personId), eq(commitments.visibility, "shared_with_manager")));
}

export async function recordCommitmentProgress(commitmentId: string, personId: string, status: Commitment["status"]) {
  await db
    .update(commitments)
    .set({ status, lastProgressAt: new Date() })
    .where(and(eq(commitments.id, commitmentId), eq(commitments.personId, personId)));
}

// --- Coaching quality eval slice (Phase 3c / Phase 4 gate) ---------------

export type CoachingRubricScore = {
  nonDirectiveness: number; // 1 - directive coach lines / total coach lines
  questionQuality: number; // fraction of coach lines that are genuine open questions
  actionOrientation: number; // 1 if a concrete, owned, dated-or-stepwise commitment resulted
  overall: number;
};

const OPEN_QUESTION_STARTERS = /\b(what|how|when|who|which|where)\b/i;

export function scoreTranscript(
  messages: Pick<CoachingMessage, "speaker" | "content" | "flaggedDirective">[],
  hadCommitment: boolean,
): CoachingRubricScore {
  const coachLines = messages.filter((m) => m.speaker === "coach");
  const directiveCount = coachLines.filter((m) => m.flaggedDirective || isDirective(m.content)).length;
  const nonDirectiveness = coachLines.length === 0 ? 1 : 1 - directiveCount / coachLines.length;

  const goodQuestionCount = coachLines.filter(
    (m) => m.content.trim().endsWith("?") && OPEN_QUESTION_STARTERS.test(m.content),
  ).length;
  const questionQuality = coachLines.length === 0 ? 0 : goodQuestionCount / coachLines.length;

  const actionOrientation = hadCommitment ? 1 : 0;

  const overall = Number(((nonDirectiveness + questionQuality + actionOrientation) / 3).toFixed(3));

  return {
    nonDirectiveness: Number(nonDirectiveness.toFixed(3)),
    questionQuality: Number(questionQuality.toFixed(3)),
    actionOrientation,
    overall,
  };
}
