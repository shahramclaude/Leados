import { withDeprecationHeaders } from "@/lib/api/deprecation";
import { GET as v1GET, POST as v1POST } from "@/app/api/v1/accounts/route";

export async function GET(req: Request) {
  return withDeprecationHeaders(await v1GET(req), "/api/v1/accounts");
}

export async function POST(req: Request) {
  return withDeprecationHeaders(await v1POST(req), "/api/v1/accounts");
}
