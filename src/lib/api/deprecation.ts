// Deprecation policy (see docs/API.md "Deprecation policy"): pre-v1 paths
// are kept as thin shims that delegate to the real /api/v1 handler and are
// marked with the standard `Deprecation` + `Sunset` headers (RFC 8594 /
// draft-ietf-httpapi-deprecation-header) plus a `Link` pointing at the
// successor endpoint. Sunset is always >= 6 months out at the time the shim
// is introduced.
export const LEGACY_SUNSET_DATE = "Thu, 31 Dec 2026 23:59:59 GMT";

export function withDeprecationHeaders(res: Response, successorPath: string): Response {
  const headers = new Headers(res.headers);
  headers.set("Deprecation", "true");
  headers.set("Sunset", LEGACY_SUNSET_DATE);
  headers.set("Link", `<${successorPath}>; rel="successor-version"`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
