// Seed script for the LEADOS "first hour" tutorial (docs/tutorials.md).
// Run with: npm run seed
//
// This inserts a handful of sample leads with deliberately varied inputs
// (different sources, with/without company, with/without notes) so the
// rule-based scores in src/lib/scoring.ts visibly differ on first run.
import "dotenv/config";
import { db, pool } from "../src/db";
import { leads, scoreEvents } from "../src/db/schema";
import { computeScore } from "../src/lib/scoring";

const SAMPLE_LEADS = [
  {
    name: "Priya Shah",
    email: "priya.shah@globex-industrial.com",
    company: "Globex Industrial",
    source: "referral",
    notes: "Referred by an existing customer, asked about enterprise pricing.",
  },
  {
    name: "Jordan Lee",
    email: "jordan.lee@brightfield.io",
    company: "Brightfield",
    source: "website",
    notes: "Filled out the contact form after reading the pricing page.",
  },
  {
    name: "Sam Carter",
    email: "sam.carter@gmail.com",
    company: null,
    source: "cold-outreach",
    notes: null,
  },
  {
    name: "Ana Kowalski",
    email: "ana@northwind-events.com",
    company: "Northwind Events",
    source: "event",
    notes: "Met at the regional conference booth, wants a trial.",
  },
] as const;

async function main() {
  console.log(`Seeding ${SAMPLE_LEADS.length} sample leads…`);

  for (const sample of SAMPLE_LEADS) {
    const { score, breakdown, version } = computeScore(sample);

    const [created] = await db
      .insert(leads)
      .values({
        name: sample.name,
        email: sample.email,
        company: sample.company,
        source: sample.source,
        notes: sample.notes,
        score,
        scoreBreakdown: breakdown,
        scoreVersion: version,
      })
      .onConflictDoNothing({ target: leads.email })
      .returning();

    if (!created) {
      console.log(`  skipped (already exists): ${sample.email}`);
      continue;
    }

    await db.insert(scoreEvents).values({
      leadId: created.id,
      score,
      breakdown,
      scoreVersion: version,
      reason: "seed",
    });

    console.log(`  created ${sample.name} <${sample.email}> — score ${score}`);
  }

  console.log("Done. Start the app and visit / to see the board, or GET /api/leads.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
