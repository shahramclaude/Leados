// Seeds baseline reference data for the Crisis Ops module:
// crisis classes, command-role templates, authority grants, stakeholder
// groups, notification contacts, message templates and dependency rows.
//
// Run with: npx tsx src/db/seed.ts
// Safe to re-run — it upserts by natural key and skips if already present.

import "dotenv/config";
import { db, pool } from "./index";
import {
  crisisClasses,
  authorityGrants,
  stakeholderGroups,
  notificationContacts,
  messageTemplates,
  dependencies,
  personas,
} from "./schema";
import { DEFAULT_AUTHORITY_MATRIX } from "../lib/crisis/authority";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Seeding Crisis Ops reference data...");

  // --- Personas (demo roster used by the drill + UI pickers) -------------
  const personaSeed = [
    { name: "Avery Chen", email: "avery.chen@leados.example", roleKeys: ["commander"] },
    { name: "Priya Patel", email: "priya.patel@leados.example", roleKeys: ["deputy_commander", "board_liaison"] },
    { name: "Marcus Webb", email: "marcus.webb@leados.example", roleKeys: ["comms_lead"] },
    { name: "Sofia Reyes", email: "sofia.reyes@leados.example", roleKeys: ["ops_lead"] },
    { name: "Daniel Okafor", email: "daniel.okafor@leados.example", roleKeys: ["liaison"] },
    { name: "Grace Lin", email: "grace.lin@leados.example", roleKeys: ["scribe"] },
    { name: "Helen Brooks", email: "helen.brooks@leados.example", roleKeys: ["legal"] },
    { name: "Watch Desk", email: "watch.desk@leados.example", roleKeys: ["watch_officer"] },
  ];
  for (const p of personaSeed) {
    const existing = await db.select().from(personas).where(eq(personas.email, p.email));
    if (existing.length === 0) {
      await db.insert(personas).values(p);
    }
  }

  // --- Crisis classes ------------------------------------------------------
  const classSeed = [
    {
      key: "operational_outage",
      name: "Operational Outage",
      description: "Product or infrastructure outage impacting customers.",
      requiresDualDeclaration: false,
      dualDeclarationRoleKeys: [],
      roleTemplate: ["commander", "ops_lead", "comms_lead", "scribe"],
    },
    {
      key: "security_incident",
      name: "Security Incident",
      description: "Suspected or confirmed security breach.",
      requiresDualDeclaration: true,
      dualDeclarationRoleKeys: ["commander", "legal"],
      roleTemplate: ["commander", "ops_lead", "comms_lead", "legal", "scribe", "liaison"],
    },
    {
      key: "leadership_scandal",
      name: "Leadership Scandal",
      description: "Allegation or event implicating senior leadership, including a possible commander.",
      requiresDualDeclaration: true,
      dualDeclarationRoleKeys: ["deputy_commander", "board_liaison"],
      roleTemplate: ["deputy_commander", "board_liaison", "legal", "comms_lead", "scribe"],
    },
    {
      key: "data_breach",
      name: "Data Breach",
      description: "Confirmed or suspected unauthorized data exposure.",
      requiresDualDeclaration: true,
      dualDeclarationRoleKeys: ["commander", "legal"],
      roleTemplate: ["commander", "legal", "ops_lead", "comms_lead", "liaison", "scribe"],
    },
    {
      key: "financial_crisis",
      name: "Financial Crisis",
      description: "Liquidity, payments, or solvency emergency.",
      requiresDualDeclaration: true,
      dualDeclarationRoleKeys: ["commander", "board_liaison"],
      roleTemplate: ["commander", "board_liaison", "legal", "comms_lead", "scribe"],
    },
  ];

  const classIdByKey = new Map<string, string>();
  for (const c of classSeed) {
    const existing = await db.select().from(crisisClasses).where(eq(crisisClasses.key, c.key));
    if (existing.length === 0) {
      const [row] = await db.insert(crisisClasses).values(c).returning();
      classIdByKey.set(c.key, row.id);
    } else {
      classIdByKey.set(c.key, existing[0].id);
    }
  }

  // --- Authority grants ------------------------------------------------------
  const existingGrants = await db.select().from(authorityGrants);
  if (existingGrants.length === 0) {
    await db.insert(authorityGrants).values(
      DEFAULT_AUTHORITY_MATRIX.map((g) => ({
        roleKey: g.roleKey,
        action: g.action,
        scope: g.scope,
        maxCommitUsd: g.maxCommitUsd?.toString(),
        requiresDualControl: g.requiresDualControl ?? false,
      })),
    );
  }

  // --- Stakeholder groups ------------------------------------------------------
  const groupSeed = [
    { key: "internal", name: "Internal / All-hands", requiresLegalReview: false },
    { key: "customer", name: "Customers", requiresLegalReview: true },
    { key: "regulatory", name: "Regulators", requiresLegalReview: true },
    { key: "media", name: "Media / Press", requiresLegalReview: true },
  ];
  const groupIdByKey = new Map<string, string>();
  for (const g of groupSeed) {
    const existing = await db.select().from(stakeholderGroups).where(eq(stakeholderGroups.key, g.key));
    if (existing.length === 0) {
      const [row] = await db.insert(stakeholderGroups).values(g).returning();
      groupIdByKey.set(g.key, row.id);
    } else {
      groupIdByKey.set(g.key, existing[0].id);
    }
  }

  // --- Notification tree (contacts, in escalation order, each gated by a dependency) ---
  const existingContacts = await db.select().from(notificationContacts);
  if (existingContacts.length === 0) {
    await db.insert(notificationContacts).values([
      { groupId: groupIdByKey.get("internal")!, name: "All-hands Email Alias", channel: "email", dependencyKey: "email_provider", escalationOrder: 1 },
      { groupId: groupIdByKey.get("internal")!, name: "Internal Push/Status Board", channel: "push", dependencyKey: "push_service", escalationOrder: 2 },
      { groupId: groupIdByKey.get("internal")!, name: "Phone Tree Lead", channel: "phone", dependencyKey: "telephony", escalationOrder: 3 },

      { groupId: groupIdByKey.get("customer")!, name: "Customer Email Broadcast", channel: "email", dependencyKey: "email_provider", escalationOrder: 1 },
      { groupId: groupIdByKey.get("customer")!, name: "In-app Banner Service", channel: "push", dependencyKey: "push_service", escalationOrder: 2 },
      { groupId: groupIdByKey.get("customer")!, name: "SMS Fallback", channel: "sms", dependencyKey: "sms_gateway", escalationOrder: 3 },

      { groupId: groupIdByKey.get("regulatory")!, name: "Regulatory Liaison Email", channel: "email", dependencyKey: "email_provider", escalationOrder: 1 },
      { groupId: groupIdByKey.get("regulatory")!, name: "Regulatory Liaison Phone", channel: "phone", dependencyKey: "telephony", escalationOrder: 2 },

      { groupId: groupIdByKey.get("media")!, name: "Press Desk Email", channel: "email", dependencyKey: "email_provider", escalationOrder: 1 },
      { groupId: groupIdByKey.get("media")!, name: "Press Desk SMS", channel: "sms", dependencyKey: "sms_gateway", escalationOrder: 2 },
    ]);
  }

  // --- Message templates per class/audience ------------------------------------------------------
  const existingTemplates = await db.select().from(messageTemplates);
  if (existingTemplates.length === 0) {
    await db.insert(messageTemplates).values([
      {
        classId: classIdByKey.get("operational_outage"),
        groupId: groupIdByKey.get("internal")!,
        name: "Outage — Internal Notice",
        subject: "[Crisis] Operational outage declared",
        body: "Team — we have declared a crisis for an operational outage. Incident commander: {{commander}}. Status page: {{statusUrl}}. Updates every 30 minutes.",
      },
      {
        classId: classIdByKey.get("operational_outage"),
        groupId: groupIdByKey.get("customer")!,
        name: "Outage — Customer Notice",
        subject: "We're investigating an issue affecting your service",
        body: "We are aware of an issue affecting the service and are actively investigating. We will post updates at {{statusUrl}}. We apologize for the disruption.",
      },
      {
        classId: classIdByKey.get("security_incident"),
        groupId: groupIdByKey.get("regulatory")!,
        name: "Security — Regulatory Notice",
        subject: "Notification of a security incident under review",
        body: "This notice is provided in connection with a security incident currently under investigation. Confirmed facts only; see {{statusUrl}} for authoritative updates.",
      },
      {
        classId: classIdByKey.get("leadership_scandal"),
        groupId: groupIdByKey.get("media")!,
        name: "Leadership Matter — Media Statement",
        subject: "Statement regarding leadership matter",
        body: "We are aware of the matter raised and are conducting a thorough review with independent oversight. We will not comment on unconfirmed reports. Verified updates: {{statusUrl}}.",
      },
    ]);
  }

  // --- Dependencies (circuit-breaker gated) ------------------------------------------------------
  const depSeed = [
    { key: "email_provider", name: "Transactional Email Provider" },
    { key: "sms_gateway", name: "SMS Gateway" },
    { key: "push_service", name: "Push/In-app Notification Service" },
    { key: "telephony", name: "Telephony / Phone Tree" },
    { key: "monitoring_feed", name: "Monitoring & Sensing Feed (Part 13 seam)" },
  ];
  for (const d of depSeed) {
    const existing = await db.select().from(dependencies).where(eq(dependencies.key, d.key));
    if (existing.length === 0) {
      await db.insert(dependencies).values(d);
    }
  }

  console.log("Seed complete.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    return pool.end().finally(() => process.exit(1));
  });
