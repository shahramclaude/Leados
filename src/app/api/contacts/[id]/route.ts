// Deprecated pre-v1 shim. Forwards to /api/v1/contacts/{id} with identical behavior.
import { GET as v1GET, PATCH as v1PATCH, DELETE as v1DELETE } from "@/app/api/v1/contacts/[id]/route";
import { withDeprecation } from "@/lib/api/shim";

export const dynamic = "force-dynamic";

export const GET = withDeprecation(v1GET, "/api/v1/contacts/{id}");
export const PATCH = withDeprecation(v1PATCH, "/api/v1/contacts/{id}");
export const DELETE = withDeprecation(v1DELETE, "/api/v1/contacts/{id}");
