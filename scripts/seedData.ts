import "./_env";
import { db } from "@/db";
import {
  changeInitiatives,
  competencies,
  experiences,
  people,
  relationshipTypes,
} from "@/db/schema";
import { COMPETENCY_ANCHORS } from "@/lib/careers";
import { createGrowthGoal, recordEvidenceEvent } from "@/lib/development";
import { createFeedbackRequest, linkFeedbackThemeToGrowth, submitFeedbackResponse } from "@/lib/feedback";
import { confirmCommitment, postPersonTurn, startCoachingSession } from "@/lib/coaching";
import { generateNudgesForManager, scheduleOneOnOne } from "@/lib/managerEnablement";
import { sql } from "drizzle-orm";

export const FOCUS_PERSON_ID = "person_a1";
const weeksAgo = (n: number) => new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000);

export async function seedAll() {
  console.log("Truncating development/coaching tables...");
  await db.execute(sql`
    TRUNCATE TABLE
      access_audit_log, manager_nudges, one_on_ones, commitments, coaching_messages,
      coaching_sessions, feedback_theme_links, feedback_responses, feedback_invitations,
      feedback_requests, growth_path_recommendations, growth_goals, evidence_events,
      relationship_types, experiences, change_initiatives, competencies, people
    RESTART IDENTITY CASCADE;
  `);

  console.log("Seeding competencies...");
  for (const c of COMPETENCY_ANCHORS) {
    await db.insert(competencies).values(c);
  }

  console.log("Seeding people...");
  const admin = { id: "person_admin", name: "Avery Admin", email: "avery.admin@leados.test", role: "admin" as const, department: "people-ops", demographicGroup: "staff" };
  const mgrA = { id: "person_mgr_a", name: "Morgan Rivera", email: "morgan.rivera@leados.test", role: "manager" as const, department: "engineering", demographicGroup: "groupA" };
  const mgrB = { id: "person_mgr_b", name: "Priya Shah", email: "priya.shah@leados.test", role: "manager" as const, department: "sales", demographicGroup: "groupB" };

  await db.insert(people).values([admin, mgrA, mgrB]);

  const groupAIds = ["person_a1", "person_a2", "person_a3", "person_a4", "person_a5", "person_a6"];
  const groupBIds = ["person_b1", "person_b2", "person_b3", "person_b4", "person_b5", "person_b6"];

  for (const [i, id] of groupAIds.entries()) {
    await db.insert(people).values({
      id,
      name: `Group A Member ${i + 1}`,
      email: `${id}@leados.test`,
      role: "member",
      managerId: mgrA.id,
      department: "engineering",
      demographicGroup: "groupA",
    });
  }
  for (const [i, id] of groupBIds.entries()) {
    await db.insert(people).values({
      id,
      name: `Group B Member ${i + 1}`,
      email: `${id}@leados.test`,
      role: "member",
      managerId: mgrB.id,
      department: "sales",
      demographicGroup: "groupB",
    });
  }

  const focus = FOCUS_PERSON_ID; // the person we walk through end-to-end

  console.log("Seeding experiences & relationship catalog...");
  await db.insert(experiences).values([
    {
      id: "exp_delegation_workshop",
      title: "Lead the quarterly planning workshop end-to-end",
      description: "Own a cross-team planning workshop without a safety-net co-lead.",
      competencyIds: ["comp_delegation"],
      stretchLevel: "moderate",
    },
    {
      id: "exp_coaching_circle",
      title: "Facilitate a peer coaching circle for 6 weeks",
      description: "Run structured peer coaching sessions for a cohort of 4 peers.",
      competencyIds: ["comp_coaching_others", "comp_difficult_conversations"],
      stretchLevel: "moderate",
    },
    {
      id: "exp_change_pilot_lead",
      title: "Lead a change-initiative pilot team",
      description: "Run the pilot phase of an org change initiative end to end.",
      competencyIds: ["comp_change_leadership"],
      stretchLevel: "high",
    },
    {
      id: "exp_cross_team_project",
      title: "Lead a cross-team strategic project",
      description: "Own a project that requires influence across three teams you don't manage.",
      competencyIds: ["comp_strategic_framing", "comp_influence"],
      stretchLevel: "high",
    },
  ]);

  await db.insert(relationshipTypes).values([
    {
      id: "rel_peer_coach_people",
      kind: "peer-coach",
      description: "Paired with a peer coach focused on people-leadership habits.",
      competencyIds: ["comp_coaching_others", "comp_delegation", "comp_difficult_conversations"],
    },
    {
      id: "rel_mentor_strategic",
      kind: "mentor",
      description: "Mentored by a senior leader on strategic framing and influence.",
      competencyIds: ["comp_strategic_framing", "comp_influence"],
    },
    {
      id: "rel_sponsor_change",
      kind: "sponsor",
      description: "Sponsored by an exec for visibility during a change initiative.",
      competencyIds: ["comp_change_leadership"],
    },
  ]);

  await db.insert(changeInitiatives).values({
    id: "change_platform_migration",
    title: "Q3 platform migration",
    phase: "pilot",
  });

  console.log("Seeding evidence events for the focus person...");
  // Self-rating ALONE on resilience — must NOT be enough to trigger a
  // recommendation (property test checks this).
  await recordEvidenceEvent({
    personId: focus,
    competencyId: "comp_resilience",
    eventType: "self_rating",
    narrative: "I think I handle pressure okay most of the time.",
    evidenceWeight: 2,
  });

  // Real (non-self) evidence backing a coaching-others gap.
  await recordEvidenceEvent({
    personId: focus,
    competencyId: "comp_coaching_others",
    eventType: "self_rating",
    narrative: "I rate myself fairly high on developing others.",
    evidenceWeight: 4,
  });
  await recordEvidenceEvent({
    personId: focus,
    competencyId: "comp_coaching_others",
    eventType: "manager_observation",
    narrative: "Delegated the onboarding doc to a report, then rewrote it themself after one draft.",
    evidenceWeight: 2,
    visibility: "shared_with_manager",
  });

  await recordEvidenceEvent({
    personId: focus,
    competencyId: "comp_delegation",
    eventType: "demonstrated_outcome",
    narrative: "Took back ownership of the release checklist mid-sprint instead of coaching the owner through it.",
    evidenceWeight: 2,
  });

  console.log("Seeding growth goals (one shared+stalled, one private)...");
  const stalledGoal = await createGrowthGoal({
    personId: focus,
    competencyId: "comp_coaching_others",
    title: "Let a direct report own onboarding docs end-to-end",
    description: "Stop rewriting their drafts; coach instead of redoing the work.",
    visibility: "shared_with_manager",
  });
  await db.execute(sql`UPDATE growth_goals SET created_at = ${weeksAgo(9).toISOString()} WHERE id = ${stalledGoal.id}`);

  await createGrowthGoal({
    personId: focus,
    competencyId: "comp_delegation",
    title: "Get comfortable not having the pen on every deliverable",
    description: "Personal goal — not ready to discuss with my manager yet.",
    visibility: "private",
  });

  console.log("Seeding 360 feedback (confidentiality scenarios)...");
  // Scenario 1: anonymous_aggregate, threshold met (3 of 4 respond).
  const req1 = await createFeedbackRequest({
    subjectId: focus,
    requestedById: focus,
    themeCompetencyId: "comp_coaching_others",
    message: "Feedback on how I develop the people around me.",
    confidentialityPolicy: "anonymous_aggregate",
    aggregationThreshold: 3,
    raterIds: ["person_a2", "person_a3", "person_a4", "person_a5"],
  });
  for (const inv of req1.invitations.slice(0, 3)) {
    await submitFeedbackResponse({
      invitationId: inv.id,
      raterId: inv.raterId,
      ratingsJson: { coaching_others: 3 },
      qualitativeText: "Great intent, but often takes work back before the first attempt lands.",
    });
  }

  // Scenario 2: anonymous_aggregate, below threshold (withheld).
  const req2 = await createFeedbackRequest({
    subjectId: focus,
    requestedById: focus,
    themeCompetencyId: "comp_delegation",
    message: "Quick pulse on delegation.",
    confidentialityPolicy: "anonymous_aggregate",
    aggregationThreshold: 3,
    raterIds: ["person_a6", "person_mgr_a"],
  });
  await submitFeedbackResponse({
    invitationId: req2.invitations[0].id,
    raterId: req2.invitations[0].raterId,
    ratingsJson: { delegation: 2 },
    qualitativeText: "Would love to see more follow-through on handing things off.",
  });

  // Scenario 3: attributed_with_consent, rater DOES consent.
  const req3 = await createFeedbackRequest({
    subjectId: "person_b1",
    requestedById: "person_b1",
    message: "Named feedback for my promotion packet.",
    confidentialityPolicy: "attributed_with_consent",
    aggregationThreshold: 1,
    raterIds: ["person_mgr_b"],
  });
  await submitFeedbackResponse({
    invitationId: req3.invitations[0].id,
    raterId: req3.invitations[0].raterId,
    ratingsJson: { influence: 4 },
    qualitativeText: "Consistently brings other teams along on tough calls.",
    attributionConsent: true,
  });

  // Scenario 4: attributed_with_consent POLICY, but rater declines — must be
  // stored exactly like an anonymous response (no link persisted).
  const req4 = await createFeedbackRequest({
    subjectId: "person_b2",
    requestedById: "person_b2",
    message: "Feedback for my development plan.",
    confidentialityPolicy: "attributed_with_consent",
    aggregationThreshold: 1,
    raterIds: ["person_b3"],
  });
  await submitFeedbackResponse({
    invitationId: req4.invitations[0].id,
    raterId: req4.invitations[0].raterId,
    ratingsJson: { strategic_framing: 3 },
    qualitativeText: "Solid thinker, still building confidence presenting it upward.",
    attributionConsent: false,
  });

  console.log("Linking feedback theme into growth graph (with subject consent)...");
  await linkFeedbackThemeToGrowth({
    requestId: req1.request.id,
    subjectId: focus,
    competencyId: "comp_coaching_others",
    developmentThemeSummary: "Peers consistently note work gets taken back before a first attempt lands.",
    consent: true,
  });
  // A second theme offered but the subject declines to link it — must not
  // create an evidence event.
  await linkFeedbackThemeToGrowth({
    requestId: req2.request.id,
    subjectId: focus,
    competencyId: "comp_delegation",
    developmentThemeSummary: "Would like to see more follow-through on handoffs.",
    consent: false,
  });

  console.log("Running GROW coaching sessions...");
  const { session } = await startCoachingSession(focus, "Letting go of the onboarding doc");
  await postPersonTurn(session.id, focus, "I want my report to own onboarding docs without me rewriting them.");
  await postPersonTurn(session.id, focus, "Right now I rewrite the draft within a day, every time, without telling them why.");
  await postPersonTurn(session.id, focus, "They've only had the doc once and I corrected typos, not structure, but it still felt like a redo to them.");
  await postPersonTurn(session.id, focus, "I could leave inline comments instead of rewriting, and ask them to revise it themselves.");
  await postPersonTurn(session.id, focus, "Nothing really, honestly — I just default to doing it myself when I'm busy.");
  const willTurn = await postPersonTurn(
    session.id,
    focus,
    "I will leave comments instead of rewriting on the next onboarding doc draft, by this Friday.",
  );
  if (willTurn.commitmentDraft) {
    await confirmCommitment({
      sessionId: session.id,
      personId: focus,
      competencyId: "comp_coaching_others",
      title: willTurn.commitmentDraft.title,
      description: willTurn.commitmentDraft.description,
      dueDate: weeksAgo(1), // deliberately in the past -> overdue nudge scenario
      visibility: "shared_with_manager",
    });
  }

  // Minimal sessions so access-distribution has a realistic (uneven) spread:
  // group A: 3 of 6 people coached; group B: 1 of 6 — an intentional
  // disparity for the fairness audit to surface.
  await startCoachingSession("person_a2", "Prepping for a hard conversation");
  await startCoachingSession("person_a3", "Finding my strategic voice");
  await startCoachingSession("person_b1", "Time management");

  console.log("Scheduling 1:1s and generating manager nudges...");
  await scheduleOneOnOne({ managerId: mgrA.id, personId: focus, scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) });
  await generateNudgesForManager(mgrA.id, focus);

  console.log("Seed complete.");
}
