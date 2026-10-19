CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"actor_id" text DEFAULT 'system' NOT NULL,
	"target_id" text,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_blockers_projection" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"description" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"raised_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"last_event_seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions_projection" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"owner" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"due_date" timestamp with time zone,
	"description" text DEFAULT '' NOT NULL,
	"outcome" text,
	"logged_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"last_event_seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"type" text NOT NULL,
	"domain" text NOT NULL,
	"entity_id" text,
	"ts" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	"source" text DEFAULT 'system' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"correlation_id" text NOT NULL,
	"causation_id" text,
	"idempotency_key" text,
	"redacted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_snapshots_projection" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"cash" real NOT NULL,
	"mrr" real NOT NULL,
	"burn" real NOT NULL,
	"runway_months" real NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_receipts" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_values" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"metric_key" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"value" real NOT NULL,
	"event_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_milestones_projection" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"overdue" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"last_event_seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "okr_projection" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"owner" text NOT NULL,
	"quarter_start" timestamp with time zone NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"health" text DEFAULT 'on_track' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_event_seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_facts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"attribute" text NOT NULL,
	"value" jsonb NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"source_event_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people_projection" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"role" text NOT NULL,
	"team" text NOT NULL,
	"tenure_months" real DEFAULT 0 NOT NULL,
	"sentiment" real DEFAULT 0.5 NOT NULL,
	"engagement" real DEFAULT 0.5 NOT NULL,
	"flight_risk" real DEFAULT 0 NOT NULL,
	"last_check_in" timestamp with time zone,
	"erased_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_event_seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projection_checkpoints" (
	"projection_name" text PRIMARY KEY NOT NULL,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"event_count" bigint DEFAULT 0 NOT NULL,
	"rebuilt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_projects_projection" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"domain" text NOT NULL,
	"owner" text NOT NULL,
	"status" text DEFAULT 'backlog' NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"duration_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"last_event_seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"event_type" text PRIMARY KEY NOT NULL,
	"retention_days" integer NOT NULL,
	"purgeable" boolean DEFAULT false NOT NULL,
	"rationale" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"description" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"org_timezone" text DEFAULT 'UTC' NOT NULL,
	"backup_reminder_days" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "execution_blockers_project_idx" ON "execution_blockers_projection" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "decisions_status_idx" ON "decisions_projection" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "events_seq_idx" ON "events" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "events_domain_ts_idx" ON "events" USING btree ("domain","ts");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "events" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "events_correlation_idx" ON "events" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_idempotency_key_idx" ON "events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "finance_snapshots_ts_idx" ON "finance_snapshots_projection" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "metric_values_key_ts_idx" ON "metric_values" USING btree ("metric_key","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_values_event_idx" ON "metric_values" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "execution_milestones_project_idx" ON "execution_milestones_projection" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "org_facts_subject_idx" ON "org_facts" USING btree ("subject_type","subject_id","attribute");--> statement-breakpoint
CREATE INDEX "org_facts_valid_idx" ON "org_facts" USING btree ("valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "people_projection_team_idx" ON "people_projection" USING btree ("team");--> statement-breakpoint
CREATE INDEX "execution_projects_status_idx" ON "execution_projects_projection" USING btree ("status");--> statement-breakpoint
INSERT INTO "schema_version" ("version", "description") VALUES (1, 'init_truth_engine: events log + domain projections + bitemporal org_facts');
