// Phase 3(c)/4(2): coaching quality eval slice. Scores the seeded GROW
// transcript against the rubric (question quality, non-directiveness, action
// orientation) and also proves the rubric actually discriminates by scoring
// a synthetic directive transcript, which must fail the threshold.
import "./_env";
import { db } from "@/db";
import { coachingSessions, commitments } from "@/db/schema";
import { listMessages, scoreTranscript, isDirective } from "@/lib/coaching";
import { eq } from "drizzle-orm";

const NON_DIRECTIVENESS_THRESHOLD = 0.8;

export async function run(): Promise<boolean> {
  console.log("=== test:coaching-eval — GROW dialogue quality rubric ===");
  let ok = true;

  const [session] = await db
    .select()
    .from(coachingSessions)
    .where(eq(coachingSessions.personId, "person_a1"));
  if (!session) {
    console.error("FAIL: no seeded coaching session found — run `npm run db:seed` first.");
    return false;
  }

  const messages = await listMessages(session.id);
  const sessionCommitments = await db.select().from(commitments).where(eq(commitments.sessionId, session.id));
  const score = scoreTranscript(messages, sessionCommitments.length > 0);

  console.log("Transcript:");
  for (const m of messages) {
    console.log(`  [${m.stage}] ${m.speaker}: ${m.content}`);
  }
  console.log("Rubric scores:", score);

  if (score.nonDirectiveness < NON_DIRECTIVENESS_THRESHOLD) {
    console.error(`FAIL: non-directiveness ${score.nonDirectiveness} < threshold ${NON_DIRECTIVENESS_THRESHOLD}.`);
    ok = false;
  } else {
    console.log(`PASS: non-directiveness ${score.nonDirectiveness} >= ${NON_DIRECTIVENESS_THRESHOLD}.`);
  }
  if (score.actionOrientation !== 1) {
    console.error("FAIL: session did not produce an owner-chosen commitment.");
    ok = false;
  } else {
    console.log("PASS: session produced an owner-chosen commitment (action orientation = 1).");
  }
  if (score.questionQuality < 0.5) {
    console.error(`FAIL: question quality ${score.questionQuality} looks too low for a GROW session.`);
    ok = false;
  } else {
    console.log(`PASS: question quality ${score.questionQuality} is healthy.`);
  }

  // Negative control: the rubric must penalise a transcript with directive
  // (advice-giving) coach lines, proving it isn't a rubber stamp.
  const badTranscript = [
    { speaker: "coach" as const, content: "What's on your mind today?", flaggedDirective: false },
    { speaker: "person" as const, content: "I'm stuck on delegation.", flaggedDirective: false },
    { speaker: "coach" as const, content: "You should just assign it to your most senior report.", flaggedDirective: false },
    { speaker: "person" as const, content: "Okay I guess.", flaggedDirective: false },
    { speaker: "coach" as const, content: "I recommend you stop checking their work so closely.", flaggedDirective: false },
  ];
  const badScore = scoreTranscript(badTranscript, false);
  console.log("Negative-control (directive) transcript score:", badScore);
  if (badScore.nonDirectiveness >= NON_DIRECTIVENESS_THRESHOLD) {
    console.error("FAIL: rubric failed to penalise an obviously directive transcript.");
    ok = false;
  } else {
    console.log(`PASS: rubric correctly scores directive transcript below threshold (${badScore.nonDirectiveness}).`);
  }
  if (!isDirective("You should just assign it to your most senior report.")) {
    console.error("FAIL: directive-phrase detector missed an obvious 'you should' statement.");
    ok = false;
  }

  console.log(ok ? "RESULT: PASS" : "RESULT: FAIL");
  return ok;
}

if (require.main === module) {
  run()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
