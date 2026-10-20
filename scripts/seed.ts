/**
 * Dev/test convenience seed — creates one organization + one admin user from
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. Refuses to run against a database
 * that already has users, and refuses to run when NODE_ENV=production (seed
 * credentials are for local/dev bootstrapping only, never production
 * identity provisioning).
 */
import "dotenv/config";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { createOrgAndAdmin } from "../src/lib/authService";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run the demo seed script with NODE_ENV=production.");
    process.exit(1);
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set.");
    process.exit(1);
  }

  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) {
    console.log("Database already has users — skipping seed.");
    process.exit(0);
  }

  const { org, user } = await createOrgAndAdmin("LEADOS Demo Org", email, password);
  console.log(`Seeded organization "${org.name}" (${org.id}) with admin ${user.email}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
