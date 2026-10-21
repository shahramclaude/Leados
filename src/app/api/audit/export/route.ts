// Investigation export: a verified slice of the hash-chained audit log, for
// handing to an auditor/investigator without exposing the whole table.
import { z } from "zod";
import { exportSlice } from "@/lib/ops/auditChain";
import { withApiHandler } from "@/lib/obs/apiHandler";
import { AppError } from "@/lib/obs/errors";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
});

export const GET = withApiHandler({ routeFamily: "audit_export" }, async (req) => {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  if (!parsed.success) throw new AppError("invalid_range", "Provide ?from=<seq>&to=<seq>", 400);
  if (parsed.data.from > parsed.data.to) throw new AppError("invalid_range", "`from` must be <= `to`", 400);
  const result = await exportSlice(parsed.data.from, parsed.data.to);
  return Response.json(result);
});
