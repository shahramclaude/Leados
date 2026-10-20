// Runs once before the whole Playwright suite: gives every e2e run a clean,
// deterministic slate against the same local Postgres instance the app
// uses (see docs/TESTING.md "Database fixture"). In CI this instance is a
// freshly-migrated dockerized postgres:16 service.
import "dotenv/config";
import { resetDatabase } from "../setup/db";

export default async function globalSetup() {
  await resetDatabase();
}
