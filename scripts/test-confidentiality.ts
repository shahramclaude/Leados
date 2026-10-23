// Phase 3(b)/4(1): confidentiality attempt tests. These simulate an attacker
// (including one with raw SQL access) trying to re-identify an anonymous
// feedback response, and verify the aggregation threshold withholds
// below-threshold feedback regardless of caller.
import "./_env";
import { db } from "@/db";
import { feedbackRequests, feedbackResponses } from "@/db/schema";
import { getFeedbackForSubject } from "@/lib/feedback";
import { and, eq, isNotNull } from "drizzle-orm";

export async function run(): Promise<boolean> {
  console.log("=== test:confidentiality — feedback attribution attempt tests ===");
  let ok = true;

  const [req1] = await db
    .select()
    .from(feedbackRequests)
    .where(and(eq(feedbackRequests.subjectId, "person_a1"), eq(feedbackRequests.themeCompetencyId, "comp_coaching_others")));
  const [req2] = await db
    .select()
    .from(feedbackRequests)
    .where(and(eq(feedbackRequests.subjectId, "person_a1"), eq(feedbackRequests.themeCompetencyId, "comp_delegation")));
  const [req3] = await db.select().from(feedbackRequests).where(eq(feedbackRequests.subjectId, "person_b1"));
  const [req4] = await db.select().from(feedbackRequests).where(eq(feedbackRequests.subjectId, "person_b2"));

  if (!req1 || !req2 || !req3 || !req4) {
    console.error("FAIL: seed data missing — run `npm run db:seed` first.");
    return false;
  }

  // ATTEMPT 1: raw SQL attribution attempt on the anonymous_aggregate, at-threshold
  // request. Anyone — including a privileged DB user — joining responses to
  // invitations/raters must find NOTHING for these rows, because the link was
  // never persisted.
  const attempt1 = await db
    .select()
    .from(feedbackResponses)
    .where(and(eq(feedbackResponses.requestId, req1.id), isNotNull(feedbackResponses.attributedRaterId)));
  if (attempt1.length !== 0) {
    console.error(`FAIL: attribution attempt 1 recovered ${attempt1.length} rater id(s) for an anonymous request.`);
    ok = false;
  } else {
    console.log("PASS: anonymous_aggregate (at threshold) — no attributedRaterId recoverable for any response.");
  }
  const attemptJoin1 = await db
    .select()
    .from(feedbackResponses)
    .where(and(eq(feedbackResponses.requestId, req1.id), isNotNull(feedbackResponses.invitationId)));
  if (attemptJoin1.length !== 0) {
    console.error("FAIL: a response row for an anonymous request still carries an invitation_id (joinable to a rater).");
    ok = false;
  } else {
    console.log("PASS: anonymous_aggregate responses carry no invitation_id — no join path to a rater exists.");
  }

  // ATTEMPT 2: below-threshold request must be withheld from the subject's
  // own read path, even though responses physically exist in storage.
  const view2 = await getFeedbackForSubject(req2.id);
  const rawCount2 = await db.select().from(feedbackResponses).where(eq(feedbackResponses.requestId, req2.id));
  if (view2.status !== "withheld") {
    console.error(`FAIL: below-threshold feedback (n=${rawCount2.length}) was NOT withheld — status was "${view2.status}".`);
    ok = false;
  } else {
    console.log(`PASS: below-threshold feedback withheld (n=${rawCount2.length} < threshold ${view2.threshold}).`);
  }

  // ATTEMPT 3: attributed_with_consent + explicit rater consent — attribution
  // SHOULD be recoverable here. This proves the mechanism isn't "nothing is
  // ever attributable," only that attribution requires a real, stored,
  // explicit consent event.
  const attempt3 = await db
    .select()
    .from(feedbackResponses)
    .where(and(eq(feedbackResponses.requestId, req3.id), isNotNull(feedbackResponses.attributedRaterId)));
  if (attempt3.length !== 1) {
    console.error("FAIL: consented attribution was not stored for the attributed_with_consent + consent=true case.");
    ok = false;
  } else {
    console.log("PASS: consented attribution correctly recoverable (rater explicitly opted in).");
  }

  // ATTEMPT 4: attributed_with_consent POLICY, but rater DECLINED — must be
  // indistinguishable from an anonymous response at the storage layer.
  const attempt4 = await db
    .select()
    .from(feedbackResponses)
    .where(and(eq(feedbackResponses.requestId, req4.id), isNotNull(feedbackResponses.attributedRaterId)));
  const attempt4Invitation = await db
    .select()
    .from(feedbackResponses)
    .where(and(eq(feedbackResponses.requestId, req4.id), isNotNull(feedbackResponses.invitationId)));
  if (attempt4.length !== 0 || attempt4Invitation.length !== 0) {
    console.error("FAIL: a rater who declined attribution is still attributable/joinable.");
    ok = false;
  } else {
    console.log("PASS: declined attribution honoured even though the request's policy allowed it.");
  }

  // Sanity: aggregate view for the at-threshold request is actually usable,
  // so we know withholding isn't just "always withhold."
  const view1 = await getFeedbackForSubject(req1.id);
  if (view1.status !== "available") {
    console.error("FAIL: at-threshold feedback should be available to the subject.");
    ok = false;
  } else {
    console.log(`PASS: at-threshold feedback available to subject (n=${view1.respondedCount}), aggregated only.`);
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
