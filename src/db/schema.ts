/**
 * src/db/schema.ts
 *
 * Drizzle schema entrypoint. `npx drizzle-kit push` (aliased as
 * `npm run db:migrate`) reads this file and reconciles the database with
 * what is declared here.
 *
 * `events` is the append-only backbone every future LEADOS engine (Signal
 * Board, Thermodynamics, CAS, Risk Register, etc. — see FEATURES.md) will
 * write to. Every row is validated against the versioned schema registry
 * in `src/lib/domain/eventSchema.ts` / `eventCatalog.ts` *before* it is
 * persisted — the database layer trusts the application layer to have
 * already done that, it does not re-validate JSON shape itself.
 */
import { integer, jsonb, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 255 }).notNull(),
  version: integer("version").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
