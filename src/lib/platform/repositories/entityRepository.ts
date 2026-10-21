import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { z } from "zod";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { appendEvent, peekIdempotencyKey } from "../events/eventStore";
import { ENTITY_EVENT_TYPES, CURRENT_SCHEMA_VERSION } from "../events/eventTypes";
import { processPendingOutbox } from "../events/projector";
import type { OrgContext } from "../orgContext";
import { err, ok, type Result } from "../result";
import type { EntityDefinitionAny } from "../../domain/registry";
import { decodeCursor, encodeCursor, type Page, type QuerySpec } from "./querySpec";

type Db = NodePgDatabase<typeof schema>;

export type ProjectionRow = typeof schema.entityProjections.$inferSelect;

export type LoadedEntity<T> = {
  id: string;
  orgId: string;
  version: number;
  validFrom: string;
  validTo: string | null;
  deletedAt: string | null;
  data: T;
};

function rowToLoaded<T>(row: ProjectionRow): LoadedEntity<T> {
  return {
    id: row.entityId,
    orgId: row.orgId,
    version: row.version,
    validFrom: new Date(row.validFrom).toISOString(),
    validTo: row.validTo ? new Date(row.validTo).toISOString() : null,
    deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
    data: row.data as T,
  };
}

// A handful of columns are promoted out of `data` for indexed filtering;
// everything else is addressed as `data.<field>` via a jsonb lookup.
const GENERIC_COLUMNS = new Set(["ownerId", "parentId", "status", "deletedAt", "version", "validFrom", "validTo", "createdAt", "updatedAt"]);

function columnFor(field: string) {
  switch (field) {
    case "ownerId":
      return schema.entityProjections.ownerId;
    case "parentId":
      return schema.entityProjections.parentId;
    case "status":
      return schema.entityProjections.status;
    case "deletedAt":
      return schema.entityProjections.deletedAt;
    case "version":
      return schema.entityProjections.version;
    case "validFrom":
      return schema.entityProjections.validFrom;
    case "validTo":
      return schema.entityProjections.validTo;
    case "createdAt":
      return schema.entityProjections.createdAt;
    case "updatedAt":
      return schema.entityProjections.updatedAt;
    default:
      return null;
  }
}

function buildFilterCondition(field: string, op: string, value: unknown) {
  const col = columnFor(field);
  if (col) {
    switch (op) {
      case "eq":
        return eq(col, value as never);
      case "neq":
        return ne(col, value as never);
      case "gt":
        return gt(col, value as never);
      case "gte":
        return gte(col, value as never);
      case "lt":
        return lt(col, value as never);
      case "lte":
        return lte(col, value as never);
      case "in":
        return inArray(col, value as never[]);
      default:
        return undefined;
    }
  }
  // Fall back to a jsonb field lookup: data ->> 'field'
  const jsonPath = sql`${schema.entityProjections.data} ->> ${field}`;
  const asText = (v: unknown) => String(v);
  switch (op) {
    case "eq":
      return sql`${jsonPath} = ${asText(value)}`;
    case "neq":
      return sql`${jsonPath} <> ${asText(value)}`;
    case "gt":
      return sql`(${jsonPath})::numeric > ${Number(value)}`;
    case "gte":
      return sql`(${jsonPath})::numeric >= ${Number(value)}`;
    case "lt":
      return sql`(${jsonPath})::numeric < ${Number(value)}`;
    case "lte":
      return sql`(${jsonPath})::numeric <= ${Number(value)}`;
    case "in":
      return inArray(jsonPath, (value as unknown[]).map(asText));
    default:
      return undefined;
  }
}

export type EntityRepository<T extends { id: string }> = {
  load: (ctx: OrgContext, id: string) => Promise<Result<LoadedEntity<T>>>;
  create: (
    ctx: OrgContext,
    input: { entity: T; idempotencyKey: string; correlationId?: string; causationId?: string | null; occurredAt?: string },
  ) => Promise<Result<LoadedEntity<T>>>;
  update: (
    ctx: OrgContext,
    input: {
      id: string;
      patch: Partial<T>;
      expectedVersion: number;
      idempotencyKey: string;
      correlationId?: string;
      causationId?: string | null;
      occurredAt?: string;
    },
  ) => Promise<Result<LoadedEntity<T>>>;
  softDelete: (
    ctx: OrgContext,
    input: { id: string; expectedVersion: number; idempotencyKey: string; reason?: string; correlationId?: string; occurredAt?: string },
  ) => Promise<Result<LoadedEntity<T>>>;
  query: (ctx: OrgContext, spec: QuerySpec) => Promise<Result<Page<LoadedEntity<T>>>>;
};

export function createEntityRepository<T extends { id: string }>(
  def: EntityDefinitionAny,
  database: Db = defaultDb,
): EntityRepository<T> {
  const entityType = def.entityType;

  async function loadRow(ctx: OrgContext, id: string): Promise<ProjectionRow | null> {
    const rows = await database
      .select()
      .from(schema.entityProjections)
      .where(and(eq(schema.entityProjections.orgId, ctx.orgId), eq(schema.entityProjections.entityType, entityType), eq(schema.entityProjections.entityId, id)))
      .limit(1);
    return rows[0] ?? null;
  }

  return {
    async load(ctx, id) {
      const row = await loadRow(ctx, id);
      if (!row || row.deletedAt) return err("not_found", `${entityType} ${id} not found`);
      return ok(rowToLoaded<T>(row));
    },

    async create(ctx, input) {
      // Idempotency is checked BEFORE the conflict check: a repeated call
      // with the same (orgId, idempotencyKey) must always replay, even
      // though the entity now "already exists" because the first call
      // created it. Checking conflict first would misclassify every replay
      // as a conflict.
      const replay = await peekIdempotencyKey(database, ctx.orgId, input.idempotencyKey);
      if (replay) {
        const row = await loadRow(ctx, replay.entityId);
        if (!row) return err("not_found", "projection missing for a replayed create — projector bug");
        return ok(rowToLoaded<T>(row), true);
      }

      const parsed = def.schema.safeParse(input.entity);
      if (!parsed.success) return err("invalid", "entity failed validation", parsed.error.flatten());

      const existing = await loadRow(ctx, input.entity.id);
      if (existing && !existing.deletedAt) return err("conflict", `${entityType} ${input.entity.id} already exists`);

      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const appended = await appendEvent(database, {
        eventId: randomUUID(),
        eventType: ENTITY_EVENT_TYPES.created,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        orgId: ctx.orgId,
        entityType,
        entityId: input.entity.id,
        actor: ctx.actor,
        occurredAt,
        correlationId: input.correlationId ?? randomUUID(),
        causationId: input.causationId ?? null,
        idempotencyKey: input.idempotencyKey,
        payload: { entity: parsed.data as Record<string, unknown> },
      });
      if (!appended.ok) return appended;

      await processPendingOutbox(database, ctx.orgId);
      const row = await loadRow(ctx, input.entity.id);
      if (!row) return err("not_found", "projection missing immediately after create — projector bug");
      return ok(rowToLoaded<T>(row), appended.value.replayed);
    },

    async update(ctx, input) {
      const replay = await peekIdempotencyKey(database, ctx.orgId, input.idempotencyKey);
      if (replay) {
        const row = await loadRow(ctx, replay.entityId);
        if (!row) return err("not_found", "projection missing for a replayed update — projector bug");
        return ok(rowToLoaded<T>(row), true);
      }

      const existing = await loadRow(ctx, input.id);
      if (!existing || existing.deletedAt) return err("not_found", `${entityType} ${input.id} not found`);
      if (existing.version !== input.expectedVersion) {
        return err("conflict", `expected version ${input.expectedVersion} but current version is ${existing.version}`, {
          currentVersion: existing.version,
        });
      }

      const mergedCandidate = { ...(existing.data as object), ...(input.patch as object) };
      const parsed = def.schema.safeParse(mergedCandidate);
      if (!parsed.success) return err("invalid", "patch produces an invalid entity", parsed.error.flatten());

      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const appended = await appendEvent(database, {
        eventId: randomUUID(),
        eventType: ENTITY_EVENT_TYPES.updated,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        orgId: ctx.orgId,
        entityType,
        entityId: input.id,
        actor: ctx.actor,
        occurredAt,
        correlationId: input.correlationId ?? randomUUID(),
        causationId: input.causationId ?? null,
        idempotencyKey: input.idempotencyKey,
        payload: { patch: input.patch as Record<string, unknown> },
      });
      if (!appended.ok) return appended;

      await processPendingOutbox(database, ctx.orgId);
      const row = await loadRow(ctx, input.id);
      if (!row) return err("not_found", "projection missing immediately after update — projector bug");
      return ok(rowToLoaded<T>(row), appended.value.replayed);
    },

    async softDelete(ctx, input) {
      const replay = await peekIdempotencyKey(database, ctx.orgId, input.idempotencyKey);
      if (replay) {
        const row = await loadRow(ctx, replay.entityId);
        if (!row) return err("not_found", "projection missing for a replayed delete — projector bug");
        return ok(rowToLoaded<T>(row), true);
      }

      const existing = await loadRow(ctx, input.id);
      if (!existing || existing.deletedAt) return err("not_found", `${entityType} ${input.id} not found`);
      if (existing.version !== input.expectedVersion) {
        return err("conflict", `expected version ${input.expectedVersion} but current version is ${existing.version}`, {
          currentVersion: existing.version,
        });
      }

      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const appended = await appendEvent(database, {
        eventId: randomUUID(),
        eventType: ENTITY_EVENT_TYPES.deleted,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        orgId: ctx.orgId,
        entityType,
        entityId: input.id,
        actor: ctx.actor,
        occurredAt,
        correlationId: input.correlationId ?? randomUUID(),
        causationId: null,
        idempotencyKey: input.idempotencyKey,
        payload: { reason: input.reason },
      });
      if (!appended.ok) return appended;

      await processPendingOutbox(database, ctx.orgId);
      const row = await loadRow(ctx, input.id);
      if (!row) return err("not_found", "projection missing immediately after delete — projector bug");
      return ok(rowToLoaded<T>(row), appended.value.replayed);
    },

    async query(ctx, spec) {
      const conditions = [eq(schema.entityProjections.orgId, ctx.orgId), eq(schema.entityProjections.entityType, entityType)];
      if (!spec.includeDeleted) conditions.push(isNull(schema.entityProjections.deletedAt));

      for (const f of spec.filters) {
        const cond = buildFilterCondition(f.field, f.op, f.value);
        if (cond) conditions.push(cond as never);
      }

      const sortCol = columnFor(spec.sort.field) ?? schema.entityProjections.updatedAt;
      const orderFn = spec.sort.direction === "asc" ? asc : desc;

      if (spec.cursor) {
        const decoded = decodeCursor(spec.cursor);
        if (decoded) {
          const cmp = spec.sort.direction === "asc" ? gt : lt;
          conditions.push(
            sql`(${sortCol}, ${schema.entityProjections.entityId}) ${spec.sort.direction === "asc" ? sql`>` : sql`<`} (${decoded.sortValue}, ${decoded.id})` as never,
          );
          void cmp; // kept for readability of intent above; actual comparison done via raw tuple sql
        }
      }

      const rows = await database
        .select()
        .from(schema.entityProjections)
        .where(and(...conditions))
        .orderBy(orderFn(sortCol), orderFn(schema.entityProjections.entityId))
        .limit(spec.limit);

      const items = rows.map((r) => rowToLoaded<T>(r));
      const last = rows[rows.length - 1];
      const nextCursor =
        rows.length === spec.limit && last
          ? encodeCursor({ sortValue: String((last as unknown as Record<string, unknown>)[sortCol.name] ?? last.updatedAt), id: last.entityId })
          : null;

      return ok({ items, nextCursor });
    },
  };
}

void GENERIC_COLUMNS; // documents the promoted-column set; referenced for clarity
