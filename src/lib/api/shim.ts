import { SHIM_SUNSET_DATE, V1_FREEZE_DATE } from "./spec";

type RouteHandler = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

/**
 * Wraps a v1 route handler so a legacy pre-v1 path can forward to it 1:1
 * (same behavior, same body) while adding the standard deprecation
 * signalling headers. See docs/API.md "Deprecation policy" for the
 * sunset timeline and docs/API.md "Legacy path mapping" for the full table.
 */
export function withDeprecation(handler: RouteHandler, newPath: string): RouteHandler {
  return async (req, ctx) => {
    const res = await handler(req, ctx);
    const headers = new Headers(res.headers);
    headers.set("Deprecation", `date="${V1_FREEZE_DATE}"`);
    headers.set("Sunset", new Date(SHIM_SUNSET_DATE).toUTCString());
    headers.set("Link", `<${newPath}>; rel="successor-version"`);
    return new Response(res.body, { status: res.status, headers });
  };
}
