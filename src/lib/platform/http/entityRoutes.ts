import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { orgContextFromHeaders } from "../orgContext";
import { statusForError, type Result } from "../result";
import type { EntityRepository } from "../repositories/entityRepository";
import { FilterSchema, QuerySpecSchema, type QuerySpec } from "../repositories/querySpec";

function jsonResult<T>(result: Result<T>, okStatus = 200) {
  if (result.ok) {
    return NextResponse.json({ ok: true, replayed: result.replayed ?? false, data: result.value }, { status: result.replayed ? 200 : okStatus });
  }
  return NextResponse.json({ ok: false, error: result.error }, { status: statusForError(result.error.code) });
}

function unauthorizedOrgContext() {
  return NextResponse.json(
    { ok: false, error: { code: "forbidden", message: "missing x-org-id / actor headers" } },
    { status: 403 },
  );
}

function parseQuerySpecFromSearchParams(searchParams: URLSearchParams): QuerySpec | null {
  const filtersRaw = searchParams.get("filters");
  let filters: unknown[] = [];
  if (filtersRaw) {
    try {
      filters = JSON.parse(filtersRaw);
    } catch {
      return null;
    }
  }
  const limitRaw = searchParams.get("limit");
  const sortField = searchParams.get("sortField") ?? undefined;
  const sortDirection = searchParams.get("sortDirection") ?? undefined;
  const cursor = searchParams.get("cursor");
  const includeDeleted = searchParams.get("includeDeleted") === "true";

  const parsed = QuerySpecSchema.safeParse({
    filters: filters.map((f) => FilterSchema.parse(f)),
    sort: sortField ? { field: sortField, direction: sortDirection ?? "desc" } : undefined,
    cursor: cursor ?? null,
    limit: limitRaw ? Number(limitRaw) : undefined,
    includeDeleted,
  });
  return parsed.success ? parsed.data : null;
}

export function createCollectionHandlers<T extends { id: string }>(repo: EntityRepository<T>) {
  return {
    async GET(request: Request) {
      const ctx = orgContextFromHeaders(request.headers);
      if (!ctx) return unauthorizedOrgContext();

      const url = new URL(request.url);
      const spec = parseQuerySpecFromSearchParams(url.searchParams);
      if (!spec) return NextResponse.json({ ok: false, error: { code: "invalid", message: "bad query spec" } }, { status: 400 });

      const result = await repo.query(ctx, spec);
      return jsonResult(result);
    },

    async POST(request: Request) {
      const ctx = orgContextFromHeaders(request.headers);
      if (!ctx) return unauthorizedOrgContext();

      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return NextResponse.json({ ok: false, error: { code: "invalid", message: "invalid JSON body" } }, { status: 400 });
      }
      const { entity, idempotencyKey } = body as { entity?: unknown; idempotencyKey?: string };
      if (!entity || typeof entity !== "object") {
        return NextResponse.json({ ok: false, error: { code: "invalid", message: "missing `entity`" } }, { status: 400 });
      }

      const result = await repo.create(ctx, {
        entity: entity as T,
        idempotencyKey: idempotencyKey ?? randomUUID(),
      });
      return jsonResult(result, 201);
    },
  };
}

export function createItemHandlers<T extends { id: string }>(repo: EntityRepository<T>) {
  return {
    async GET(request: Request, routeContext: { params: Promise<{ id: string }> }) {
      const ctx = orgContextFromHeaders(request.headers);
      if (!ctx) return unauthorizedOrgContext();
      const { id } = await routeContext.params;
      const result = await repo.load(ctx, id);
      return jsonResult(result);
    },

    async PATCH(request: Request, routeContext: { params: Promise<{ id: string }> }) {
      const ctx = orgContextFromHeaders(request.headers);
      if (!ctx) return unauthorizedOrgContext();
      const { id } = await routeContext.params;

      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return NextResponse.json({ ok: false, error: { code: "invalid", message: "invalid JSON body" } }, { status: 400 });
      }
      const { patch, expectedVersion, idempotencyKey } = body as {
        patch?: Record<string, unknown>;
        expectedVersion?: number;
        idempotencyKey?: string;
      };
      if (!patch || typeof expectedVersion !== "number") {
        return NextResponse.json(
          { ok: false, error: { code: "invalid", message: "missing `patch` or `expectedVersion`" } },
          { status: 400 },
        );
      }

      const result = await repo.update(ctx, {
        id,
        patch: patch as Partial<T>,
        expectedVersion,
        idempotencyKey: idempotencyKey ?? randomUUID(),
      });
      return jsonResult(result);
    },

    async DELETE(request: Request, routeContext: { params: Promise<{ id: string }> }) {
      const ctx = orgContextFromHeaders(request.headers);
      if (!ctx) return unauthorizedOrgContext();
      const { id } = await routeContext.params;

      const url = new URL(request.url);
      const expectedVersionRaw = url.searchParams.get("expectedVersion");
      const idempotencyKey = url.searchParams.get("idempotencyKey") ?? randomUUID();
      if (!expectedVersionRaw) {
        return NextResponse.json({ ok: false, error: { code: "invalid", message: "missing expectedVersion" } }, { status: 400 });
      }

      const result = await repo.softDelete(ctx, {
        id,
        expectedVersion: Number(expectedVersionRaw),
        idempotencyKey,
        reason: url.searchParams.get("reason") ?? undefined,
      });
      return jsonResult(result);
    },
  };
}
