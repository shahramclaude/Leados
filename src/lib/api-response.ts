import { TenantError } from "@/lib/tenant";
import { RegistryError } from "@/lib/registry";
import { DemoDisabledError } from "@/lib/demo";

export function jsonError(message: string, status: number) {
  return Response.json({ ok: false, error: message }, { status });
}

/** Central error → HTTP mapping so every route handles failures the same way. */
export function handleRouteError(err: unknown) {
  if (err instanceof TenantError) return jsonError(err.message, err.status);
  if (err instanceof RegistryError) return jsonError(err.message, 404);
  if (err instanceof DemoDisabledError) return jsonError(err.message, 403);
  if (err instanceof Error) {
    console.error(err);
    return jsonError(err.message, 400);
  }
  console.error(err);
  return jsonError("unexpected error", 500);
}
