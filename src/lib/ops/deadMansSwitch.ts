// Alert-rule self-test: the scheduler pings this every tick. If the
// heartbeat goes stale, the `dead_mans_switch` health check fails even
// though every other subsystem might look fine — this is what catches
// "the scheduler process died silently" instead of just "the db is down".
import { db } from "@/db";
import { systemMeta } from "@/db/schema";
import { sql } from "drizzle-orm";

const KEY = "dead_mans_switch_heartbeat";

export async function pingDeadMansSwitch(): Promise<void> {
  await db
    .insert(systemMeta)
    .values({ key: KEY, value: { pingedAt: new Date().toISOString() }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemMeta.key, set: { value: { pingedAt: new Date().toISOString() }, updatedAt: new Date() } });
}

export async function getHeartbeatAgeSeconds(): Promise<number | null> {
  const rows = await db.select().from(systemMeta).where(sql`key = ${KEY}`).limit(1);
  const row = rows[0];
  if (!row) return null;
  const pingedAt = (row.value as { pingedAt?: string }).pingedAt;
  if (!pingedAt) return null;
  return (Date.now() - new Date(pingedAt).getTime()) / 1000;
}
