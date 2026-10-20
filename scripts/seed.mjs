#!/usr/bin/env node
// Seeds the LEADOS schema. Usage:
//   node scripts/seed.mjs            -> baseline volume (~50k events)
//   node scripts/seed.mjs --scale 10 -> 10x volume (~500k events), for the
//                                       "10x data day" performance rehearsal
//
// Uses batched multi-row INSERTs (1000 rows/statement) instead of one INSERT
// per row — this script itself is a performance-sensitive tool and a naive
// per-row insert loop would take an order of magnitude longer.
import "dotenv/config";
import pg from "pg";

const SCALE = Number(process.argv.find((a, i) => process.argv[i - 1] === "--scale")) || 1;
const BASE_EVENTS = 50_000;
const BASE_ENTITIES = 400;
const BASE_NOTIFICATIONS = 3_000;

const TYPES = ["lead.created", "lead.converted", "risk.flag", "deal.won", "deal.lost", "churn.signal", "meeting.booked"];
const SEVERITIES = ["info", "warning", "critical"];
const SEVERITY_WEIGHTS = [0.7, 0.22, 0.08];
const SOURCES = ["crm.sync", "web.tracker", "support.ticket", "billing.webhook", "api.manual"];
const ENTITY_KINDS = ["account", "rep", "deal"];

function weightedPick(items, weights) {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (r <= acc) return items[i];
  }
  return items[items.length - 1];
}

function randomPastDate(daysBack) {
  const now = Date.now();
  const offsetMs = Math.random() * daysBack * 24 * 60 * 60 * 1000;
  return new Date(now - offsetMs);
}

async function batchInsert(client, table, columns, rows, batchSize = 1000) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch
      .map((row, rowIdx) => {
        const base = rowIdx * columns.length;
        row.forEach((v) => values.push(v));
        return `(${columns.map((_, colIdx) => `$${base + colIdx + 1}`).join(",")})`;
      })
      .join(",");
    await client.query(
      `insert into ${table} (${columns.join(",")}) values ${placeholders} on conflict do nothing`,
      values,
    );
    if ((i / batchSize) % 20 === 0) {
      process.stdout.write(`\r  ${table}: ${Math.min(i + batchSize, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
    }
  }
  console.log(`\r  ${table}: ${rows.length.toLocaleString()} / ${rows.length.toLocaleString()} done`);
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const started = Date.now();
  console.log(`Seeding LEADOS at scale x${SCALE}...`);

  // --- entities -------------------------------------------------------
  const entityCount = BASE_ENTITIES * Math.max(1, Math.sqrt(SCALE));
  const entityIds = [];
  const entityRows = [];
  for (let i = 0; i < entityCount; i++) {
    const kind = ENTITY_KINDS[i % ENTITY_KINDS.length];
    const id = `${kind}_${i}`;
    entityIds.push(id);
    entityRows.push([id, `${kind} ${i}`, kind, (Math.random() * 10).toFixed(3)]);
  }
  await client.query("truncate table edges, entities, events, notifications, forecast_cache restart identity cascade");
  await batchInsert(client, "entities", ["id", "name", "kind", "risk_score"], entityRows);

  // --- edges ------------------------------------------------------------
  const edgeRows = [];
  const edgeCount = Math.round(entityIds.length * 4);
  for (let i = 0; i < edgeCount; i++) {
    const source = entityIds[Math.floor(Math.random() * entityIds.length)];
    const target = entityIds[Math.floor(Math.random() * entityIds.length)];
    if (source === target) continue;
    edgeRows.push(["relates_to", source, target, (Math.random() * 5).toFixed(3)]);
  }
  await batchInsert(client, "edges", ["kind", "source_id", "target_id", "weight"], edgeRows);

  // --- events (the big one) ---------------------------------------------
  const eventCount = Math.round(BASE_EVENTS * SCALE);
  const eventRows = [];
  for (let i = 0; i < eventCount; i++) {
    const occurredAt = randomPastDate(120);
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    const severity = weightedPick(SEVERITIES, SEVERITY_WEIGHTS);
    const source = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    const entityId = Math.random() < 0.85 ? entityIds[Math.floor(Math.random() * entityIds.length)] : null;
    const value = (Math.random() * 1000).toFixed(4);
    eventRows.push([occurredAt.toISOString(), type, severity, source, entityId, value, JSON.stringify({})]);
  }
  await batchInsert(
    client,
    "events",
    ["occurred_at", "type", "severity", "source", "entity_id", "value", "metadata"],
    eventRows,
    2000,
  );

  // --- notifications ------------------------------------------------------
  const notificationCount = Math.round(BASE_NOTIFICATIONS * SCALE);
  const notificationRows = [];
  for (let i = 0; i < notificationCount; i++) {
    const createdAt = randomPastDate(60);
    const severity = weightedPick(SEVERITIES, SEVERITY_WEIGHTS);
    notificationRows.push([
      createdAt.toISOString(),
      `${severity.toUpperCase()}: automated signal #${i}`,
      `Detected on ${SOURCES[Math.floor(Math.random() * SOURCES.length)]}`,
      severity,
      Math.random() < 0.4,
    ]);
  }
  await batchInsert(client, "notifications", ["created_at", "title", "body", "severity", "read"], notificationRows, 2000);

  await client.query("analyze events, entities, edges, notifications");

  const tookSec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nDone in ${tookSec}s. entities=${entityIds.length} edges=${edgeRows.length} events=${eventCount} notifications=${notificationCount}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
