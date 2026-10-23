// LEADOS — Part 45 seed script.
// Populates a demo org so the Time Dashboard, Meeting Auditor, Deep-Work
// Architecture and Strategy-Time Mirror all have real data to render, and
// so the verification suite's integration tests have fixtures to query.
//
// Run with: npx tsx scripts/seed-time-economics.ts

import "dotenv/config";
import { db } from "../src/db";
import {
  orgs,
  users,
  teams,
  teamMembers,
  orgConfig,
  userRates,
  strategyPillars,
  topicStrategyMap,
  calendarEvents,
  eventAttendees,
  meetingOutcomes,
  interactionEvents,
  noMeetingWindows,
  timeDataConsent,
} from "../src/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Clearing te_ tables...");
  await db.execute(sql`
    TRUNCATE TABLE
      te_privacy_audit_log, te_scheduling_suggestions, te_time_data_consent,
      te_no_meeting_windows, te_interaction_events, te_meeting_classifications,
      te_meeting_outcomes, te_event_attendees, te_calendar_events,
      te_topic_strategy_map, te_strategy_pillars, te_user_rates, te_org_config,
      te_team_members, te_teams, te_users, te_orgs
    RESTART IDENTITY CASCADE
  `);

  const [org] = await db.insert(orgs).values({ name: "Northwind Labs" }).returning();

  await db.insert(orgConfig).values({
    orgId: org.id,
    currency: "USD",
    defaultLoadedHourlyRate: "85.00",
    deepWorkPremiumMultiplier: "1.50",
    recoveryMinutesPerInterruption: 23,
    workDayStartMinute: 9 * 60,
    workDayEndMinute: 17 * 60,
    zeroOutcomeWeeksThreshold: 6,
  });

  const peopleSeed = [
    { name: "Avery Kim", email: "avery@northwind.test", role: "admin", timezone: "America/New_York", chronotype: "lark", rate: 140 },
    { name: "Priya Shah", email: "priya@northwind.test", role: "manager", timezone: "America/Los_Angeles", chronotype: "owl", rate: 120 },
    { name: "Diego Alvarez", email: "diego@northwind.test", role: "manager", timezone: "Europe/London", chronotype: "intermediate", rate: 115 },
    { name: "Mina Tran", email: "mina@northwind.test", role: "member", timezone: "America/New_York", chronotype: "lark", rate: 90 },
    { name: "Jonah Weiss", email: "jonah@northwind.test", role: "member", timezone: "Asia/Singapore", chronotype: "owl", rate: 95 },
    { name: "Sam Okafor", email: "sam@northwind.test", role: "member", timezone: "Europe/London", chronotype: "intermediate", rate: 88 },
    { name: "Ravi Desai", email: "ravi@northwind.test", role: "finance", timezone: "America/New_York", chronotype: "intermediate", rate: 100 },
  ] as const;

  const userRows = [];
  for (const p of peopleSeed) {
    const [u] = await db
      .insert(users)
      .values({ orgId: org.id, name: p.name, email: p.email, role: p.role, timezone: p.timezone, chronotype: p.chronotype })
      .returning();
    userRows.push(u);
    await db.insert(userRates).values({ userId: u.id, loadedHourlyRate: p.rate.toString(), method: "banded_estimate" });
    await db.insert(timeDataConsent).values({
      userId: u.id,
      shareAggregateOnly: true,
      allowManagerView: p.email === "mina@northwind.test", // one person opts in, to exercise the consent path
    });
  }
  const byEmail = Object.fromEntries(userRows.map((u) => [u.email, u]));

  const [engTeam] = await db.insert(teams).values({ orgId: org.id, name: "Engineering" }).returning();
  const [goTeam] = await db.insert(teams).values({ orgId: org.id, name: "Go-To-Market" }).returning();
  await db.insert(teamMembers).values([
    { teamId: engTeam.id, userId: byEmail["mina@northwind.test"].id },
    { teamId: engTeam.id, userId: byEmail["jonah@northwind.test"].id },
    { teamId: engTeam.id, userId: byEmail["diego@northwind.test"].id },
    { teamId: goTeam.id, userId: byEmail["priya@northwind.test"].id },
    { teamId: goTeam.id, userId: byEmail["sam@northwind.test"].id },
  ]);

  const [pillarGrowth] = await db.insert(strategyPillars).values({ orgId: org.id, name: "Growth Expansion", targetAllocationPct: "35.00" }).returning();
  const [pillarPlatform] = await db.insert(strategyPillars).values({ orgId: org.id, name: "Platform Reliability", targetAllocationPct: "25.00" }).returning();
  const [pillarPeople] = await db.insert(strategyPillars).values({ orgId: org.id, name: "Org & Talent", targetAllocationPct: "15.00" }).returning();

  await db.insert(topicStrategyMap).values([
    { orgId: org.id, topicKeyword: "strategy", pillarId: pillarGrowth.id, category: "strategic", weight: "2.00" },
    { orgId: org.id, topicKeyword: "roadmap", pillarId: pillarGrowth.id, category: "strategic", weight: "1.80" },
    { orgId: org.id, topicKeyword: "market expansion", pillarId: pillarGrowth.id, category: "strategic", weight: "2.00" },
    { orgId: org.id, topicKeyword: "architecture review", pillarId: pillarPlatform.id, category: "strategic", weight: "1.60" },
    { orgId: org.id, topicKeyword: "reliability", pillarId: pillarPlatform.id, category: "strategic", weight: "1.60" },
    { orgId: org.id, topicKeyword: "hiring plan", pillarId: pillarPeople.id, category: "strategic", weight: "1.50" },
    { orgId: org.id, topicKeyword: "status sync", pillarId: null, category: "operational", weight: "1.00" },
    { orgId: org.id, topicKeyword: "standup", pillarId: null, category: "operational", weight: "1.00" },
    { orgId: org.id, topicKeyword: "1:1", pillarId: null, category: "operational", weight: "1.00" },
    { orgId: org.id, topicKeyword: "sprint planning", pillarId: null, category: "operational", weight: "1.00" },
    { orgId: org.id, topicKeyword: "incident", pillarId: null, category: "reactive", weight: "2.00" },
    { orgId: org.id, topicKeyword: "customer escalation", pillarId: null, category: "reactive", weight: "2.00" },
    { orgId: org.id, topicKeyword: "fire drill", pillarId: null, category: "reactive", weight: "1.80" },
  ]);

  await db.insert(noMeetingWindows).values({
    orgId: org.id,
    scope: "org",
    scopeId: null,
    dayOfWeek: 3, // Wednesday
    startMinute: 9 * 60,
    endMinute: 12 * 60,
    enforced: true,
    label: "Org-wide Wednesday deep work",
    createdBy: byEmail["avery@northwind.test"].id,
  });

  // --- Recurring "weekly status sync" with 7 weekly instances: outcomes go
  // to zero and STAY zero for the trailing 6 — this is the headline finding
  // the brief asks the Meeting Auditor to surface.
  const now = new Date();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const recurrenceStatusSync = "rec-status-sync-weekly";
  const statusAttendees = [byEmail["mina@northwind.test"], byEmail["jonah@northwind.test"], byEmail["diego@northwind.test"], byEmail["priya@northwind.test"]];
  for (let w = 7; w >= 1; w--) {
    const start = new Date(now.getTime() - w * weekMs);
    start.setUTCHours(15, 0, 0, 0); // 15:00 UTC
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const [ev] = await db
      .insert(calendarEvents)
      .values({
        orgId: org.id,
        title: "Weekly Status Sync",
        topic: "status sync",
        startTime: start,
        endTime: end,
        isRecurring: true,
        recurrenceKey: recurrenceStatusSync,
        organizerId: byEmail["diego@northwind.test"].id,
      })
      .returning();
    await db.insert(eventAttendees).values(statusAttendees.map((u) => ({ eventId: ev.id, userId: u.id, required: true })));
    // Outcomes decline to zero over the trailing 6 weeks (w=6..1); week 7 still had some.
    const decisions = w >= 7 ? 1 : 0;
    const actions = w >= 7 ? 1 : 0;
    await db.insert(meetingOutcomes).values({ eventId: ev.id, decisionsCount: decisions, actionsCount: actions, capturedAt: end });
  }

  // --- Recurring "architecture review" — healthy outcome density, kept.
  const recurrenceArch = "rec-architecture-review-biweekly";
  const archAttendees = [byEmail["diego@northwind.test"], byEmail["jonah@northwind.test"], byEmail["mina@northwind.test"]];
  for (let w = 6; w >= 1; w -= 2) {
    const start = new Date(now.getTime() - w * weekMs);
    start.setUTCHours(16, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const [ev] = await db
      .insert(calendarEvents)
      .values({
        orgId: org.id,
        title: "Architecture Review",
        topic: "architecture review reliability",
        startTime: start,
        endTime: end,
        isRecurring: true,
        recurrenceKey: recurrenceArch,
        organizerId: byEmail["diego@northwind.test"].id,
      })
      .returning();
    await db.insert(eventAttendees).values(archAttendees.map((u) => ({ eventId: ev.id, userId: u.id, required: true })));
    await db.insert(meetingOutcomes).values({ eventId: ev.id, decisionsCount: 2, actionsCount: 3, capturedAt: end });
  }

  // --- One-off strategic planning session (high cost, high outcome density).
  {
    const start = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    start.setUTCHours(14, 0, 0, 0);
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    const [ev] = await db
      .insert(calendarEvents)
      .values({
        orgId: org.id,
        title: "Q3 Market Expansion Strategy",
        topic: "strategy roadmap market expansion",
        startTime: start,
        endTime: end,
        isRecurring: false,
        organizerId: byEmail["avery@northwind.test"].id,
      })
      .returning();
    await db
      .insert(eventAttendees)
      .values([byEmail["avery@northwind.test"], byEmail["priya@northwind.test"], byEmail["diego@northwind.test"]].map((u) => ({ eventId: ev.id, userId: u.id, required: true })));
    await db.insert(meetingOutcomes).values({ eventId: ev.id, decisionsCount: 4, actionsCount: 5, capturedAt: end });
  }

  // --- Reactive incident call (ad hoc, interrupts deep work).
  {
    const start = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    start.setUTCHours(11, 0, 0, 0);
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    const [ev] = await db
      .insert(calendarEvents)
      .values({
        orgId: org.id,
        title: "Prod Incident #482 Bridge",
        topic: "incident customer escalation",
        startTime: start,
        endTime: end,
        isRecurring: false,
        organizerId: byEmail["jonah@northwind.test"].id,
      })
      .returning();
    await db
      .insert(eventAttendees)
      .values([byEmail["jonah@northwind.test"], byEmail["mina@northwind.test"], byEmail["sam@northwind.test"]].map((u) => ({ eventId: ev.id, userId: u.id, required: true })));
    await db.insert(meetingOutcomes).values({ eventId: ev.id, decisionsCount: 1, actionsCount: 2, capturedAt: end });
  }

  // --- Interaction events for Mina (fragmentation demo + the one consenting user).
  const mina = byEmail["mina@northwind.test"];
  const today = new Date();
  today.setUTCHours(13, 0, 0, 0);
  const interactionTypes: Array<{ offsetMin: number; type: string }> = [
    { offsetMin: -240, type: "focus_start" },
    { offsetMin: -210, type: "context_switch" },
    { offsetMin: -180, type: "meeting_start" },
    { offsetMin: -150, type: "meeting_end" },
    { offsetMin: -140, type: "context_switch" },
    { offsetMin: -60, type: "meeting_start" },
    { offsetMin: -15, type: "meeting_end" },
  ];
  await db.insert(interactionEvents).values(
    interactionTypes.map((e) => ({
      orgId: org.id,
      userId: mina.id,
      occurredAt: new Date(today.getTime() + e.offsetMin * 60000),
      type: e.type,
      metadata: {},
    })),
  );

  console.log("Seed complete.");
  console.log("orgId:", org.id);
  for (const u of userRows) {
    console.log(`${u.role.padEnd(8)} ${u.email.padEnd(28)} id=${u.id}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
