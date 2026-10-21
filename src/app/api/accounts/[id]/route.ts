import { withDeprecationHeaders } from "@/lib/api/deprecation";
import { DELETE as v1DELETE, GET as v1GET, PATCH as v1PATCH } from "@/app/api/v1/accounts/[id]/route";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: RouteParams) {
  return withDeprecationHeaders(await v1GET(req, ctx), "/api/v1/accounts/{id}");
}

export async function PATCH(req: Request, ctx: RouteParams) {
  return withDeprecationHeaders(await v1PATCH(req, ctx), "/api/v1/accounts/{id}");
}

export async function DELETE(req: Request, ctx: RouteParams) {
  return withDeprecationHeaders(await v1DELETE(req, ctx), "/api/v1/accounts/{id}");
}
