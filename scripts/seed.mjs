#!/usr/bin/env node
// scripts/seed.mjs
//
// Deterministic data seeder used for both everyday dev seeding and the
// "10x data day" rehearsal described in docs/PERFORMANCE.md. Talks to
// Postgres directly via `pg` (not Drizzle) and uses multi-row batched
// INSERTs so seeding 100k+ rows takes seconds, not minutes.
//
// Usage:
//   node scripts/seed.mjs                 seed baseline volume (10,000 events)
//   node scripts/seed.mjs --scale 10      seed 10x volume (100,000 events)
//   node scripts/seed.mjs --reset         truncate tables before seeding
import "dotenv/config";
import { Pool } from "pg";

const args = process.argv.slice(2);
const scale = Number(args.find((a) => a.startsWith("--scale="))?.split("=")[1] ?? (args.includes("--scale") ? args[args.indexOf("--scale") + 1] : 1)) || 1;
const reset = args.includes("--reset");

const BASE_EVENTS = 10_000;
const BASE_FINDINGS = 500;
const BASE_DECISIONS = 50;
const BASE_NOTIFICATIONS = 2_000;

const EVENT_TYPES = ["page_view", "signal.ingested", "finding.created", "decision.updated", "automation.run", "login", "export.requested"];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function batchInsert(client, table, columns, rows, batchSize = 1000) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch
      .map((row, rowIdx) => {
        const base = rowIdx * columns.length;
        values.push(...row);
        return `(${columns.map((_, colIdx) => `$${base + colIdx + 1}`).join(", ")})`;
      })
      .join(", ");
    await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`, values);
  }
}

async function main() {
  const rand = mulberry32(1337);
  const client = await pool.connect();
  const totalEvents = Math.round(BASE_EVENTS * scale);
  const totalFindings = Math.round(BASE_FINDINGS * Math.min(scale, 10));
  const totalDecisions = Math.round(BASE_DECISIONS * Math.min(scale, 10));
  const totalNotifications = Math.round(BASE_NOTIFICATIONS * Math.min(scale, 10));

  try {
    if (reset) {
      console.log("[seed] truncating events, findings, decisions, notifications, automation_runs, board_packs ...");
      await client.query("TRUNCATE TABLE events, findings, decisions, notifications, automation_runs, board_packs RESTART IDENTITY");
    }

    console.log(`[seed] scale=${scale}x -> events=${totalEvents} findings=${totalFindings} decisions=${totalDecisions} notifications=${totalNotifications}`);

    const t0 = Date.now();
    const now = Date.now();
    const spanMs = 1000 * 60 * 60 * 24 * 365; // spread across ~1 year

    const eventRows = [];
    for (let i = 0; i < totalEvents; i++) {
      const type = EVENT_TYPES[Math.floor(rand() * EVENT_TYPES.length)];
      const createdAt = new Date(now - rand() * spanMs).toISOString();
      const payload = JSON.stringify({ seedIndex: i, value: Math.round(rand() * 1000) });
      eventRows.push([type, 1, payload, createdAt]);
    }
    await batchInsert(client, "events", ["type", "version", "payload", "created_at"], eventRows);
    console.log(`[seed] events inserted in ${Date.now() - t0}ms`);

    const t1 = Date.now();
    const findingRows = [];
    for (let i = 0; i < totalFindings; i++) {
      const impact = 1 + Math.floor(rand() * 9);
      const confidence = 1 + Math.floor(rand() * 9);
      const effort = 1 + Math.floor(rand() * 9);
      const score = ((impact * confidence) / Math.max(1, effort)).toFixed(4);
      const status = rand() < 0.6 ? "open" : "closed";
      findingRows.push([`Finding #${i + 1}`, "Auto-generated seed finding.", impact, confidence, effort, score, status]);
    }
    await batchInsert(client, "findings", ["title", "summary", "impact", "confidence", "effort", "score", "status"], findingRows);
    console.log(`[seed] findings inserted in ${Date.now() - t1}ms`);

    const t2 = Date.now();
    const decisionRows = [];
    for (let i = 0; i < totalDecisions; i++) {
      const status = rand() < 0.5 ? "open" : "resolved";
      decisionRows.push([`Decision #${i + 1}`, "Auto-generated seed decision context.", status]);
    }
    await batchInsert(client, "decisions", ["title", "context", "status"], decisionRows);
    console.log(`[seed] decisions inserted in ${Date.now() - t2}ms`);

    const t3 = Date.now();
    const notificationRows = [];
    for (let i = 0; i < totalNotifications; i++) {
      const severity = ["info", "warning", "critical"][Math.floor(rand() * 3)];
      const read = rand() < 0.7;
      const createdAt = new Date(now - rand() * spanMs).toISOString();
      notificationRows.push([`Notification #${i + 1}`, "Auto-generated seed notification.", severity, read, createdAt]);
    }
    await batchInsert(client, "notifications", ["title", "body", "severity", "read", "created_at"], notificationRows);
    console.log(`[seed] notifications inserted in ${Date.now() - t3}ms`);

    console.log(`[seed] done in ${Date.now() - t0}ms total`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
