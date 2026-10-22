// Part 42 Phase 3(e): conversational eval slice.
//
// ≥ 40 multi-turn dialogues scored for:
//   - task completion (did the final turn answer what was asked, with
//     grounding, or correctly abstain when it should?)
//   - scope inheritance ("and for Q3?" keeps the metric context from the
//     prior turn)
//   - citation continuity (every non-abstaining answer carries >=1 citation)
//
// Also includes a dedicated contradiction/self-correction probe and a
// consent/redaction leak-attempt probe, per Phase 4 gates (5) and (2).
import "dotenv/config";
import { db, pool } from "@/db";
import { conversationTurns, meetingArtifacts } from "@/db/schema";
import { ensureConversation, processTurn } from "@/lib/conversation/engine";
import { eq } from "drizzle-orm";
import {
  confirmArtifact,
  createMeeting,
  generatePostMeetingArtifacts,
  getTranscript,
  ingestTranscriptSegment,
} from "@/lib/meeting/pipeline";
import { setConsent } from "@/lib/consent/consent";

interface DialogueTurnSpec {
  text: string;
  expectAbstain?: boolean;
  expectMetric?: string;
  expectTimeframeIncludes?: string;
}

interface DialogueSpec {
  name: string;
  turns: DialogueTurnSpec[];
}

// Base multi-turn templates. We generate variants across metrics/timeframes
// to comfortably exceed the 40-dialogue floor while keeping each dialogue a
// genuine multi-turn, scope-inheriting exchange.
const METRICS = ["revenue", "churn", "headcount", "pipeline"];
const TIMEFRAMES = ["Q2", "Q3"];

const INITIAL_PHRASINGS = [
  (tf: string, metric: string) => `What is our ${tf} ${metric}?`,
  (tf: string, metric: string) => `How is ${metric} looking in ${tf}?`,
  (tf: string, metric: string) => `Give me ${tf} ${metric}.`,
];

const FOLLOWUP_PHRASINGS = [
  (tf: string) => `And for ${tf}?`,
  (tf: string) => `What about ${tf}?`,
  (tf: string) => `How about ${tf}?`,
];

function buildDialogues(): DialogueSpec[] {
  const dialogues: DialogueSpec[] = [];

  // Core scope-inheritance grid: metric x timeframe x phrasing variant.
  METRICS.forEach((metric) => {
    TIMEFRAMES.forEach((tf) => {
      const otherTf = tf === "Q2" ? "Q3" : "Q2";
      INITIAL_PHRASINGS.forEach((initial, pi) => {
        const followUp = FOLLOWUP_PHRASINGS[pi % FOLLOWUP_PHRASINGS.length];
        dialogues.push({
          name: `${metric}-${tf}-followup-v${pi}`,
          turns: [
            { text: initial(tf, metric), expectMetric: metric, expectTimeframeIncludes: tf },
            { text: followUp(otherTf), expectMetric: metric, expectTimeframeIncludes: otherTf },
          ],
        });
      });
    });
  });

  // Abstention dialogues — asking about something with no grounding at all.
  for (const topic of [
    "employee satisfaction survey results",
    "competitor X pricing",
    "office lease renewal date",
    "the new logo design budget",
    "parking policy for the Austin office",
    "the vendor contract termination fee",
  ]) {
    dialogues.push({
      name: `abstain-${topic}`,
      turns: [{ text: `What is our ${topic}?`, expectAbstain: true }],
    });
  }

  // Compare -> explain, one per metric.
  METRICS.forEach((metric) => {
    dialogues.push({
      name: `compare-then-explain-${metric}`,
      turns: [
        { text: `Compare Q2 ${metric} vs Q3 ${metric}.`, expectMetric: metric },
        { text: "Why did it change?", expectMetric: metric },
      ],
    });
  });

  // Simulate -> scope switch.
  dialogues.push({
    name: "simulate-then-followup",
    turns: [
      { text: "What if Q3 churn stayed at Q2 levels?", expectMetric: "churn", expectTimeframeIncludes: "Q3" },
      { text: "And for headcount?", expectMetric: "headcount" },
    ],
  });

  // Draft -> gated act (vague target => honest abstention rather than a
  // fabricated narrative, which is the behavior we want to assert on).
  dialogues.push({
    name: "draft-then-act-gated",
    turns: [
      { text: "Draft a summary of Q3 pipeline.", expectMetric: "pipeline" },
      { text: "Send that update to the board.", expectAbstain: true },
    ],
  });

  // Three-turn scope chains, one per metric not already covered by the 3-turn
  // chain below, to stress multi-hop inheritance.
  ["revenue", "churn", "pipeline"].forEach((metric) => {
    dialogues.push({
      name: `three-turn-chain-${metric}`,
      turns: [
        { text: `What is our Q2 ${metric}?`, expectMetric: metric, expectTimeframeIncludes: "Q2" },
        { text: "And for Q3?", expectMetric: metric, expectTimeframeIncludes: "Q3" },
        { text: "What about headcount instead?", expectMetric: "headcount" },
      ],
    });
  });

  dialogues.push({
    name: "three-turn-chain-headcount",
    turns: [
      { text: "What is our Q2 headcount?", expectMetric: "headcount", expectTimeframeIncludes: "Q2" },
      { text: "And for Q3?", expectMetric: "headcount", expectTimeframeIncludes: "Q3" },
      { text: "What about pipeline instead?", expectMetric: "pipeline" },
    ],
  });

  return dialogues;
}

interface ScoreRow {
  dialogue: string;
  taskCompletion: number; // 0 or 1 per dialogue (final turn correct)
  scopeInheritance: number[]; // 1/0 per follow-up turn
  citationContinuity: number[]; // 1/0 per non-abstain turn
}

async function runDialogue(spec: DialogueSpec): Promise<ScoreRow> {
  const conv = await ensureConversation(undefined, spec.name);
  const scopeInheritance: number[] = [];
  const citationContinuity: number[] = [];
  let lastResult: Awaited<ReturnType<typeof processTurn>> | null = null;
  let taskCompletion = 1;

  for (const [i, turnSpec] of spec.turns.entries()) {
    const result = await processTurn(conv.id, turnSpec.text);
    lastResult = result;

    if (turnSpec.expectAbstain) {
      if (!result.abstained) taskCompletion = 0;
    } else {
      if (result.abstained) taskCompletion = 0;
      citationContinuity.push(result.citations.length > 0 ? 1 : 0);
      if (turnSpec.expectMetric && result.activeContext.metric !== turnSpec.expectMetric) {
        taskCompletion = 0;
        if (i > 0) scopeInheritance.push(0);
      } else if (i > 0) {
        scopeInheritance.push(1);
      }
      if (
        turnSpec.expectTimeframeIncludes &&
        !(result.activeContext.timeframe ?? "").includes(turnSpec.expectTimeframeIncludes)
      ) {
        taskCompletion = 0;
      }
    }
  }

  void lastResult;
  return { dialogue: spec.name, taskCompletion, scopeInheritance, citationContinuity };
}

async function runContradictionProbe() {
  const conv = await ensureConversation(undefined, "contradiction-probe");
  // First turn establishes a claim.
  const first = await processTurn(conv.id, "What is our Q2 revenue?");
  // Manually seed a conflicting prior assistant turn with a stale figure to
  // force a contradiction on the next grounded answer for the same scope.
  await db.insert(conversationTurns).values({
    conversationId: conv.id,
    turnIndex: 999,
    role: "assistant",
    intent: "query",
    text: "Q2 revenue was $9.9M last I checked.",
    activeContext: { metric: "revenue", timeframe: "Q2" },
    citations: [{ evidenceId: "stale", title: "stale", snippet: "stale" }],
    abstained: false,
  });
  const second = await processTurn(conv.id, "Remind me, what was Q2 revenue again?");
  const handled = Boolean(second.contradiction) || second.text.toLowerCase().includes("correction");
  return { first: first.text, second: second.text, handledExplicitly: handled };
}

async function runConsentLeakProbe() {
  const meeting = await createMeeting({
    title: "Consent Leak Probe Meeting",
    participants: [
      { name: "ConsentedSpeaker" },
      { name: "NonConsentingSpeaker" },
    ],
    agenda: [],
  });
  const { listParticipants } = await import("@/lib/consent/consent");
  const participants = await listParticipants(meeting.id);
  const a = participants.find((p) => p.name === "ConsentedSpeaker")!;
  const b = participants.find((p) => p.name === "NonConsentingSpeaker")!;

  await setConsent(a.id, "opted_in");
  await setConsent(b.id, "opted_out");

  const SECRET = "PROJECT_NIGHTHAWK_SALARY_DETAILS";
  await ingestTranscriptSegment(meeting.id, {
    speakerParticipantId: a.id,
    speakerName: "ConsentedSpeaker",
    startMs: 0,
    endMs: 1000,
    text: "We decided to move forward with the new onboarding flow.",
  });
  await ingestTranscriptSegment(meeting.id, {
    speakerParticipantId: b.id,
    speakerName: "NonConsentingSpeaker",
    startMs: 1000,
    endMs: 2000,
    text: `I'll share that ${SECRET} with finance, can you follow up on it.`,
  });

  const { artifacts } = await generatePostMeetingArtifacts(meeting.id);
  const transcript = await getTranscript(meeting.id);

  const leakedInArtifacts = artifacts.some((art) => JSON.stringify(art.content).includes(SECRET));
  const nonConsentingSegmentFlaggedRedacted = transcript
    .filter((t) => t.speakerParticipantId === b.id)
    .every((t) => t.redacted === true);

  return { leakedInArtifacts, nonConsentingSegmentFlaggedRedacted, meetingId: meeting.id };
}

async function runConfirmationGateProbe() {
  const meeting = await createMeeting({
    title: "Confirmation Gate Probe",
    participants: [{ name: "Solo", isOrganizer: true }],
    agenda: [],
  });
  const { listParticipants } = await import("@/lib/consent/consent");
  const [p] = await listParticipants(meeting.id);
  await setConsent(p.id, "opted_in");
  await ingestTranscriptSegment(meeting.id, {
    speakerParticipantId: p.id,
    speakerName: "Solo",
    startMs: 0,
    endMs: 1000,
    text: "We decided to ship the redesign next sprint. I'll send the rollout email to the whole company.",
  });
  const { artifacts } = await generatePostMeetingArtifacts(meeting.id);

  const decisionArtifact = artifacts.find((a) => a.type === "decision_draft")!;
  const actionArtifact = artifacts.find((a) => a.type === "action_draft")!;

  const beforeDecisions = await db.select().from(meetingArtifacts).where(eq(meetingArtifacts.id, decisionArtifact.id));
  const unconfirmedStaysUncommitted = beforeDecisions[0]?.status === "drafted";

  let gatedBlockedWithoutAck = false;
  try {
    await confirmArtifact(actionArtifact.id, { confirmedBy: "tester" });
  } catch {
    gatedBlockedWithoutAck = true;
  }

  await confirmArtifact(decisionArtifact.id, { confirmedBy: "tester" });

  return { unconfirmedStaysUncommitted, gatedBlockedWithoutAck };
}

async function main() {
  const dialogues = buildDialogues();
  console.log(`Running ${dialogues.length} multi-turn dialogues…`);
  if (dialogues.length < 40) {
    console.warn(`WARNING: only ${dialogues.length} dialogues generated, below the 40 floor.`);
  }

  const rows: ScoreRow[] = [];
  for (const d of dialogues) rows.push(await runDialogue(d));

  const taskCompletionRate = rows.reduce((s, r) => s + r.taskCompletion, 0) / rows.length;
  const allScope = rows.flatMap((r) => r.scopeInheritance);
  const scopeInheritanceRate = allScope.length ? allScope.reduce((a, b) => a + b, 0) / allScope.length : 1;
  const allCitations = rows.flatMap((r) => r.citationContinuity);
  const citationContinuityRate = allCitations.length ? allCitations.reduce((a, b) => a + b, 0) / allCitations.length : 1;

  console.log("\n=== Multi-turn eval scorecard ===");
  console.log(`dialogues run:            ${rows.length}`);
  console.log(`task completion:          ${taskCompletionRate.toFixed(3)} (gate >= 0.85)`);
  console.log(`scope inheritance:        ${scopeInheritanceRate.toFixed(3)} (gate >= 0.90)`);
  console.log(`citation continuity:      ${citationContinuityRate.toFixed(3)} (gate >= 0.90)`);

  const failing = rows.filter((r) => r.taskCompletion === 0);
  if (failing.length) {
    console.log("\nFailing dialogues:");
    for (const f of failing) console.log(` - ${f.dialogue}`);
  }

  console.log("\n=== Self-correction (contradiction) probe ===");
  const contradiction = await runContradictionProbe();
  console.log(`handled explicitly: ${contradiction.handledExplicitly}`);
  console.log(`  prior claim turn: "${contradiction.first}"`);
  console.log(`  reconciling turn: "${contradiction.second.split("\n")[0]}"`);

  console.log("\n=== Consent / redaction leak-attempt probe ===");
  const consentProbe = await runConsentLeakProbe();
  console.log(`non-consenting content leaked into artifacts: ${consentProbe.leakedInArtifacts} (must be false)`);
  console.log(`non-consenting segments flagged redacted:     ${consentProbe.nonConsentingSegmentFlaggedRedacted} (must be true)`);

  console.log("\n=== Confirmation gate probe ===");
  const gateProbe = await runConfirmationGateProbe();
  console.log(`drafted artifact stays uncommitted until confirm: ${gateProbe.unconfirmedStaysUncommitted} (must be true)`);
  console.log(`gated (T2+) action blocked without explicit ack:  ${gateProbe.gatedBlockedWithoutAck} (must be true)`);

  const gatesPassed =
    taskCompletionRate >= 0.85 &&
    scopeInheritanceRate >= 0.9 &&
    citationContinuityRate >= 0.9 &&
    contradiction.handledExplicitly &&
    !consentProbe.leakedInArtifacts &&
    consentProbe.nonConsentingSegmentFlaggedRedacted &&
    gateProbe.unconfirmedStaysUncommitted &&
    gateProbe.gatedBlockedWithoutAck &&
    dialogues.length >= 40;

  console.log(`\nALL GATES PASSED: ${gatesPassed}`);
  if (!gatesPassed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
