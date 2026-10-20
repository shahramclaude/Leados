import { z } from "zod";
import { ApiError, ok, readJsonBody, withRouteErrors } from "@/lib/server/http";
import { createFinding, listFindings, type FindingSort, type FindingStatus } from "@/lib/server/repositories/findings";
import { findIdempotentResponse, getIdempotencyKey, recordIdempotentResponse } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

const STATUSES = new Set<FindingStatus>(["open", "resolved"]);
const SORTS = new Set<FindingSort>(["newest", "oldest", "severity"]);

export const GET = withRouteErrors(async (req) => {
  const sp = req.nextUrl.searchParams;
  const statusParam = sp.get("status");
  const sortParam = sp.get("sort");
  const status = statusParam && STATUSES.has(statusParam as FindingStatus) ? (statusParam as FindingStatus) : undefined;
  const sort = sortParam && SORTS.has(sortParam as FindingSort) ? (sortParam as FindingSort) : undefined;
  const domain = sp.get("domain") ?? undefined;
  const search = sp.get("search") ?? undefined;
  const page = sp.get("page") ? Number(sp.get("page")) : undefined;

  const { rows, total, pageSize } = await listFindings({ status, sort, domain, search, page });
  return ok({ rows, total, page: page ?? 1, pageSize });
});

const createFindingSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(4000).optional(),
  domain: z.string().optional(),
  team: z.string().optional(),
  severity: z.number().int().min(1).max(5).optional(),
});

export const POST = withRouteErrors(async (req) => {
  const idempotencyKey = getIdempotencyKey(req);
  const replay = await findIdempotentResponse(idempotencyKey);
  if (replay) return replay;

  const parsed = createFindingSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid finding payload.", parsed.error.flatten());
  }
  const row = await createFinding(parsed.data);
  const response = ok(row);
  await recordIdempotentResponse(idempotencyKey, "/api/findings", 200, await response.clone().json());
  return response;
});
