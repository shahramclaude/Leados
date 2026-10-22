import { db } from "@/db";
import { sql } from "drizzle-orm";

const TABLES = [
  "quarantined_rows",
  "dedup_candidates",
  "entity_links",
  "raw_records",
  "entities",
  "import_batches",
  "sync_runs",
  "lineage_edges",
  "lineage_nodes",
  "export_manifests",
  "platform_events",
  "audit_log",
];

/** Wipes all platform tables (but keeps `connectors` so seeded rows persist). */
export async function truncateAll(): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`));
}
