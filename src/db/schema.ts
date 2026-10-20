import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Structural causal models, stored as data so Part 06's digital twin and
 * Part 10's strategy views can load and compose them without re-deriving
 * the DAG from code. `definition` holds the full `StructuralCausalModel`
 * JSON (see `src/lib/causal/types.ts`).
 */
export const causalModels = pgTable("causal_models", {
  id: text("id").primaryKey(),
  version: text("version").notNull(),
  label: text("label").notNull(),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Saved causal claims (results of `runCausalQuery`, plus falsification
 * reports). Every claim carries `asOf` / `revalidateBy` so the UI can age
 * and expire it instead of treating a causal estimate as permanently true.
 */
export const causalClaims = pgTable("causal_claims", {
  id: text("id").primaryKey(),
  scmId: text("scm_id").notNull(),
  label: text("label").notNull(),
  estimate: jsonb("estimate").notNull(),
  falsification: jsonb("falsification"),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  revalidateBy: timestamp("revalidate_by", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
