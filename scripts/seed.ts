// Seeds the grounding corpus and a demo meeting so the conversational layer
// and meeting copilot have real data to answer from / draft against. Safe to
// re-run (clears and reinserts the demo rows it owns).
import "dotenv/config";
import { db, pool } from "@/db";
import {
  conversationTurns,
  conversations,
  decisions,
  evidenceDocuments,
  meetingAgendaItems,
  meetingParticipants,
  meetings,
  tasks,
} from "@/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Seeding evidence corpus…");
  await db.execute(sql`delete from ${conversationTurns}`);
  await db.execute(sql`delete from ${conversations}`);
  await db.execute(sql`delete from ${decisions}`);
  await db.execute(sql`delete from ${tasks}`);
  await db.execute(sql`delete from ${meetingAgendaItems}`);
  await db.execute(sql`delete from ${meetingParticipants}`);
  await db.execute(sql`delete from ${meetings}`);
  await db.execute(sql`delete from ${evidenceDocuments}`);

  const docs = await db
    .insert(evidenceDocuments)
    .values([
      {
        title: "Q2 Board Deck — Revenue",
        body: "Q2 revenue closed at $12.4M, up 9% quarter-over-quarter, driven by expansion in the enterprise segment.",
        source: "Board Deck FY25",
        tags: ["Q2"],
        metricTags: ["revenue"],
      },
      {
        title: "Q3 Finance Flash",
        body: "Q3 revenue is tracking at $13.1M as of the mid-quarter close, ahead of the $12.8M plan.",
        source: "Finance Flash Report",
        tags: ["Q3"],
        metricTags: ["revenue"],
      },
      {
        title: "Q2 Churn Report",
        body: "Q2 churn held at 2.1%, flat versus Q1, with most losses concentrated in the SMB tier.",
        source: "Customer Success Dashboard",
        tags: ["Q2"],
        metricTags: ["churn"],
      },
      {
        title: "Q3 Churn Report",
        body: "Q3 churn improved to 1.7% after the SMB onboarding changes shipped in August.",
        source: "Customer Success Dashboard",
        tags: ["Q3"],
        metricTags: ["churn"],
      },
      {
        title: "Headcount Plan FY25",
        body: "Headcount stands at 184 as of Q2, with 12 approved reqs open for Q3 across engineering and sales.",
        source: "People Ops Tracker",
        tags: ["Q2", "Q3"],
        metricTags: ["headcount"],
      },
      {
        title: "Pipeline Review — Q3",
        body: "Q3 pipeline coverage is 3.4x against the quarter's bookings target, concentrated in mid-market renewals.",
        source: "RevOps Pipeline Report",
        tags: ["Q3"],
        metricTags: ["pipeline"],
      },
    ])
    .returning();

  console.log(`Inserted ${docs.length} evidence documents.`);

  const revenueDoc = docs.find((d) => d.title.startsWith("Q2 Board"))!;
  const churnDoc = docs.find((d) => d.title.startsWith("Q2 Churn"))!;

  console.log("Seeding demo meeting…");
  const [meeting] = await db
    .insert(meetings)
    .values({ title: "Quarterly Planning Sync", status: "pre" })
    .returning();

  const [amara, dev, priya] = await db
    .insert(meetingParticipants)
    .values([
      { meetingId: meeting.id, name: "Amara", role: "lead", isOrganizer: true, consentStatus: "opted_in" },
      { meetingId: meeting.id, name: "Dev", role: "contributor", consentStatus: "pending" },
      { meetingId: meeting.id, name: "Priya", role: "contributor", consentStatus: "opted_out" },
    ])
    .returning();

  await db.insert(meetingAgendaItems).values([
    { meetingId: meeting.id, title: "Review Q2 revenue performance", evidenceIds: [revenueDoc.id], orderIndex: 0 },
    { meetingId: meeting.id, title: "Address Q2 SMB churn", evidenceIds: [churnDoc.id], orderIndex: 1 },
  ]);

  console.log(`Seeded meeting ${meeting.id} with participants: ${[amara, dev, priya].map((p) => p.name).join(", ")}`);
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
