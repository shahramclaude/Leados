import {
  pgTable, uuid, text, jsonb, timestamp,
  boolean, integer, date, index
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const leados_events = pgTable('leados_events', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  type:       text('type').notNull(),
  domain:     text('domain').notNull(),
  ts:         timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  data:       jsonb('data').notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  locked_at:  timestamp('locked_at', { withTimezone: true }),  // set 60s after insert; immutable after
}, (t) => [
  index('events_type_idx').on(t.type),
  index('events_domain_idx').on(t.domain),
  index('events_ts_idx').on(t.ts),
  index('events_person_idx').on(sql`(${t.data}->>'personId')`),
])

export const leados_people = pgTable('leados_people', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:         text('name').notNull(),
  role:         text('role'),
  reports_to:   uuid('reports_to'),   // self-reference — do not use FK constraint
  cadence_days: integer('cadence_days').notNull().default(14),
  start_date:   date('start_date'),
  archived:     boolean('archived').notNull().default(false),
  created_at:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const leados_settings = pgTable('leados_settings', {
  key:        text('key').primaryKey(),
  value:      jsonb('value').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const leados_meta = pgTable('leados_meta', {
  key:        text('key').primaryKey(),
  value:      jsonb('value').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
