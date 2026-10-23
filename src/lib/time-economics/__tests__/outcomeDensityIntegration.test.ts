// Integration test: outcome-density / Meeting Auditor findings correlate
// with the (Part 25 stand-in) capture data seeded into the demo org.
// Requires `npx tsx scripts/seed-time-economics.ts` to have been run
// against the DATABASE_URL in .env (scripts/verify.ts does this for you).
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/db";
import { orgs } from "@/db/schema";
import {
  listRecurrenceKeysForOrg,
  listInstancesForRecurrence,
  listOutcomesForEventIds,
  getConsent,
} from "../repo";
import { auditRecurringMeeting } from "../outcomeDensity";
import { evaluateTimeDataAccess } from "../privacy";

test("integration: zero-outcome recurring meeting is flagged against seeded capture data", async () => {
  const [org] = await db.select().from(orgs).limit(1);
  assert.ok(org, "expected a seeded demo org — run scripts/seed-time-economics.ts first");

  const recurrenceKeys = await listRecurrenceKeysForOrg(org.id);
  assert.ok(recurrenceKeys.includes("rec-status-sync-weekly"), "expected seeded recurring meeting 'rec-status-sync-weekly'");

  const instances = await listInstancesForRecurrence(org.id, "rec-status-sync-weekly");
  const outcomes = await listOutcomesForEventIds(instances.map((i) => i.id));
  const outcomeByEvent = new Map(outcomes.map((o) => [o.eventId, o]));

  const history = instances.map((i) => {
    const o = outcomeByEvent.get(i.id);
    return {
      eventId: i.id,
      occurredAt: i.startTime,
      decisionsCount: o?.decisionsCount ?? 0,
      actionsCount: o?.actionsCount ?? 0,
      cost: 0,
      durationMinutes: (i.endTime.getTime() - i.startTime.getTime()) / 60000,
    };
  });

  const audit = auditRecurringMeeting("rec-status-sync-weekly", history, 6);
  assert.ok(audit.zeroOutcomeStreakWeeks >= 6, `expected zero-outcome streak >= 6, got ${audit.zeroOutcomeStreakWeeks}`);
  assert.ok(audit.headlineFinding, "expected a headline finding to be generated for the zero-outcome streak");
  assert.equal(audit.cadenceSuggestion.action, "kill", "a 6+ week zero-outcome streak should suggest killing the meeting");
});

test("integration: healthy recurring meeting is NOT flagged", async () => {
  const [org] = await db.select().from(orgs).limit(1);
  assert.ok(org);
  const instances = await listInstancesForRecurrence(org.id, "rec-architecture-review-biweekly");
  assert.ok(instances.length > 0, "expected seeded 'rec-architecture-review-biweekly' instances");
  const outcomes = await listOutcomesForEventIds(instances.map((i) => i.id));
  const outcomeByEvent = new Map(outcomes.map((o) => [o.eventId, o]));
  const history = instances.map((i) => {
    const o = outcomeByEvent.get(i.id);
    return {
      eventId: i.id,
      occurredAt: i.startTime,
      decisionsCount: o?.decisionsCount ?? 0,
      actionsCount: o?.actionsCount ?? 0,
      cost: 0,
      durationMinutes: (i.endTime.getTime() - i.startTime.getTime()) / 60000,
    };
  });
  const audit = auditRecurringMeeting("rec-architecture-review-biweekly", history, 6);
  assert.equal(audit.headlineFinding, null);
  assert.ok(audit.avgOutcomeDensityPerHour > 1, "expected healthy outcome density for architecture review");
});

test("integration: privacy matrix against real seeded consent rows", async () => {
  const [org] = await db.select().from(orgs).limit(1);
  assert.ok(org);
  const { listOrgUsers } = await import("../repo");
  const seededUsers = await listOrgUsers(org.id);
  const mina = seededUsers.find((u) => u.email === "mina@northwind.test");
  const jonah = seededUsers.find((u) => u.email === "jonah@northwind.test");
  assert.ok(mina && jonah);

  const minaConsent = await getConsent(mina.id);
  const jonahConsent = await getConsent(jonah.id);

  // Mina opted in to manager visibility in the seed; Jonah did not.
  const managerViewingMina = evaluateTimeDataAccess({ id: "some-manager", role: "manager" }, mina.id, "individual_interaction_detail", minaConsent);
  const managerViewingJonah = evaluateTimeDataAccess({ id: "some-manager", role: "manager" }, jonah.id, "individual_interaction_detail", jonahConsent);

  assert.equal(managerViewingMina.allowed, true, "Mina consented — manager view should be allowed");
  assert.equal(managerViewingJonah.allowed, false, "Jonah did not consent — manager view must be denied");
});
