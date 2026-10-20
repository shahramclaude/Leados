// Idempotent local/dev seed: inserts a handful of historical automation
// runs (so the health dashboard and /api/metrics aren't empty on a fresh
// clone) and makes sure maintenance_mode defaults to "off". Safe to run
// more than once.
import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to seed the database.");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

async function main() {
  await client.connect();

  const { rows } = await client.query("select count(*)::int as count from automation_runs");
  if (rows[0].count === 0) {
    const now = Date.now();
    const samples = [
      { name: "nightly-digest", status: "succeeded", offsetMinutes: 45, durationMs: 4200 },
      { name: "nightly-digest", status: "succeeded", offsetMinutes: 60 * 24 + 45, durationMs: 3900 },
      { name: "metrics-rollup", status: "failed", offsetMinutes: 120, durationMs: 1100 },
      { name: "metrics-rollup", status: "succeeded", offsetMinutes: 180, durationMs: 980 },
    ];

    for (const sample of samples) {
      const queuedAt = new Date(now - sample.offsetMinutes * 60_000 - sample.durationMs);
      const startedAt = new Date(queuedAt.getTime() + 200);
      const finishedAt = new Date(startedAt.getTime() + sample.durationMs);
      await client.query(
        `insert into automation_runs (name, status, queued_at, started_at, finished_at, duration_ms, error_message)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          sample.name,
          sample.status,
          queuedAt.toISOString(),
          startedAt.toISOString(),
          finishedAt.toISOString(),
          sample.durationMs,
          sample.status === "failed" ? "simulated seed failure" : null,
        ],
      );
    }
    console.log(`Seeded ${samples.length} automation_runs rows.`);
  } else {
    console.log(`automation_runs already has ${rows[0].count} rows; skipping seed.`);
  }

  await client.query(
    `insert into system_meta (key, value, updated_at)
     values ('maintenance_mode', 'false', now())
     on conflict (key) do nothing`,
  );

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
