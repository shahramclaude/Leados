// scripts/seed.mjs
//
// Minimal, idempotent-ish seed script for local development. Inserts a
// couple of example events so the home page and `/api/events` have
// something to show on a fresh clone. Run with `npm run db:seed` (after
// `npm run db:migrate`).
//
// Uses `pg` directly (not Drizzle) so it can run as plain Node without a
// TypeScript build step, matching the style of `scripts/seed_financial.sql`
// referenced in the architecture docs for future, larger seed sets.
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required to seed the database. See docs/CONFIG.md.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const { rows } = await pool.query("select count(*)::int as count from events");
    if (rows[0].count > 0) {
      console.log(`events table already has ${rows[0].count} row(s); skipping seed.`);
      return;
    }

    await pool.query(
      `insert into events (type, version, payload) values
        ('system.ping', 1, $1::jsonb),
        ('system.annotation', 1, $2::jsonb)`,
      [
        JSON.stringify({ message: "LEADOS Part 0 seed: database reachable and schema applied." }),
        JSON.stringify({
          title: "Part 0 complete",
          body: "Ground-truth consolidation finished: single Next.js app, layered src/lib, versioned event schema registry.",
          tags: ["part-0", "architecture"],
        }),
      ],
    );

    console.log("Seeded 2 example events.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
