/**
 * Seeds a minimal, deterministic dataset for local dev / contract tests / the
 * end-to-end SDK example.
 *
 * CLI usage:   npx tsx src/db/seed.ts
 * Programmatic (used by the test harness): import { seed } from "./seed"
 *
 * Prints/returns the raw (unhashed) API keys — they are only ever shown once,
 * matching the real creation endpoint's behavior.
 */
import "dotenv/config";
import { db } from "./index";
import { apiKeys, contacts, deals, leads, playbooks, webhookSubscriptions, webhookDeliveries, webhookEvents, automationRuns, auditLog, idempotencyKeys } from "./schema";
import { generateApiKey } from "@/lib/api/auth";

export async function seed() {
  await db.delete(webhookDeliveries);
  await db.delete(webhookEvents);
  await db.delete(webhookSubscriptions);
  await db.delete(automationRuns);
  await db.delete(deals);
  await db.delete(contacts);
  await db.delete(leads);
  await db.delete(playbooks);
  await db.delete(auditLog);
  await db.delete(idempotencyKeys);
  await db.delete(apiKeys);

  const admin = generateApiKey();
  const demo = generateApiKey();

  await db.insert(apiKeys).values([
    { name: "seed-admin", hashedKey: admin.hashed, prefix: admin.prefix, scopes: ["admin"], isAdmin: true },
    {
      name: "seed-demo",
      hashedKey: demo.hashed,
      prefix: demo.prefix,
      scopes: [
        "leads:read",
        "leads:write",
        "contacts:read",
        "contacts:write",
        "deals:read",
        "deals:write",
        "webhooks:read",
        "webhooks:write",
        "automation:read",
        "automation:write",
      ],
      isAdmin: false,
    },
  ]);

  const [lead1] = await db
    .insert(leads)
    .values({ name: "Acme Robotics", email: "ops@acme-robotics.example", company: "Acme Robotics", status: "qualified", score: 72 })
    .returning();
  const [lead2] = await db
    .insert(leads)
    .values({ name: "Nimbus Analytics", email: "hello@nimbus-analytics.example", company: "Nimbus Analytics", status: "new", score: 40 })
    .returning();

  await db.insert(contacts).values([
    { leadId: lead1.id, name: "Priya Shah", email: "priya@acme-robotics.example", phone: "+1-555-0101" },
    { leadId: lead2.id, name: "Diego Marin", email: "diego@nimbus-analytics.example", phone: "+1-555-0199" },
  ]);

  await db.insert(deals).values([
    { leadId: lead1.id, title: "Acme Robotics — platform rollout", value: "48000", stage: "open" },
    { leadId: lead2.id, title: "Nimbus Analytics — pilot", value: "9000", stage: "open" },
  ]);

  const [playbook] = await db
    .insert(playbooks)
    .values({
      name: "welcome-sequence",
      description: "Waits briefly, then sends a notification. Demonstrates the playbook step-type extension seam.",
      steps: [
        { type: "delay", config: { ms: 10 } },
        {
          type: "notify",
          config: {
            channelId: "generic-webhook",
            title: "New LEADOS automation run",
            body: "A welcome-sequence run just completed.",
            severity: "info",
          },
        },
      ],
    })
    .returning();

  return {
    adminKey: admin.raw,
    demoKey: demo.raw,
    lead1,
    lead2,
    playbook,
  };
}

async function main() {
  const result = await seed();
  console.log("\n[seed] done. Save these API keys now — they will not be shown again:\n");
  console.log(`  ADMIN_API_KEY=${result.adminKey}`);
  console.log(`  DEMO_API_KEY=${result.demoKey}\n`);
  const { pool } = await import("./index");
  await pool.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
