// Ask-LEADOS conversational engine: the dialogue-state machine described in
// Part 42 Phase 1. Owns turn persistence, scope inheritance, grounding, and
// contradiction detection end to end.
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationTurns, conversations } from "@/db/schema";
import { classifyIntent, looksLikeFollowUp, type QuestionIntent } from "@/lib/ontology/questions";
import { resolveScope, type ActiveContext } from "./dialogueState";
import { checkContradiction, extractClaimValue, type PriorAssertion } from "./contradiction";
import { routeIntent } from "@/lib/orchestration/router";
import { scopeKey } from "./dialogueState";

export interface TurnResult {
  id: string;
  turnIndex: number;
  role: "assistant";
  intent: QuestionIntent;
  text: string;
  activeContext: ActiveContext;
  citations: { evidenceId: string; title: string; snippet: string }[];
  abstained: boolean;
  abstentionReason?: string | null;
  contradiction: { priorTurnId: string; priorClaim: string; resolution: string } | null;
  actionGate: { tier: "T1" | "T2" | "T3"; status: "drafted" | "blocked_needs_confirmation" } | null;
}

export async function ensureConversation(conversationId?: string, title?: string) {
  if (conversationId) {
    const [existing] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    if (existing) return existing;
  }
  const [created] = await db
    .insert(conversations)
    .values({ title: title ?? "New conversation" })
    .returning();
  return created;
}

async function loadHistory(conversationId: string) {
  return db
    .select()
    .from(conversationTurns)
    .where(eq(conversationTurns.conversationId, conversationId))
    .orderBy(asc(conversationTurns.turnIndex));
}

export async function processTurn(conversationId: string, userText: string): Promise<TurnResult> {
  const history = await loadHistory(conversationId);
  const lastAssistantTurn = [...history].reverse().find((t) => t.role === "assistant");
  const priorContext: ActiveContext = lastAssistantTurn?.activeContext ?? {};

  const isFollowUp = looksLikeFollowUp(userText);
  const intent = classifyIntent(userText);
  const activeContext = resolveScope(userText, priorContext, isFollowUp);

  // Persist the user's turn first so the transcript is complete even if
  // grounding abstains.
  const nextIndex = history.length;
  await db.insert(conversationTurns).values({
    conversationId,
    turnIndex: nextIndex,
    role: "user",
    intent,
    text: userText,
    activeContext,
    resolvedEntities: {},
    citations: [],
  });

  const { answer, actionGate } = await routeIntent(intent, userText, activeContext);

  // Build prior-assertion ledger for contradiction detection, scoped to
  // assistant turns that actually made a grounded (non-abstained) claim.
  const priorAssertions: PriorAssertion[] = history
    .filter((t) => t.role === "assistant" && !t.abstained)
    .map((t) => ({
      turnId: t.id,
      scopeKey: scopeKey(t.activeContext ?? {}),
      claimValue: extractClaimValue(t.text) ?? "",
      claimText: t.text,
    }))
    .filter((a) => a.claimValue);

  const { contradiction } = answer.abstained
    ? { contradiction: null }
    : checkContradiction(activeContext, answer.text, priorAssertions);

  const finalText = contradiction ? `${contradiction.resolution}\n\n${answer.text}` : answer.text;

  const [assistantRow] = await db
    .insert(conversationTurns)
    .values({
      conversationId,
      turnIndex: nextIndex + 1,
      role: "assistant",
      intent,
      text: finalText,
      activeContext,
      resolvedEntities: {},
      citations: answer.citations,
      abstained: answer.abstained,
      abstentionReason: answer.abstentionReason ?? null,
      contradiction,
      actionGate,
    })
    .returning();

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));

  return {
    id: assistantRow.id,
    turnIndex: assistantRow.turnIndex,
    role: "assistant",
    intent,
    text: assistantRow.text,
    activeContext,
    citations: answer.citations,
    abstained: answer.abstained,
    abstentionReason: answer.abstentionReason,
    contradiction,
    actionGate,
  };
}

export async function getConversationHistory(conversationId: string) {
  return loadHistory(conversationId);
}

export async function listConversations() {
  return db.select().from(conversations).orderBy(asc(conversations.createdAt));
}
