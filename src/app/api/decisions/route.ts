// Deprecated pre-v1 path, kept as a thin shim for existing integrations.
// Forwards to /api/v1/decisions and advertises deprecation per RFC 8594.
// See docs/API.md "Deprecation policy" for the full old->new path mapping
// and sunset timeline.
const SUNSET_DATE = "Wed, 01 Apr 2026 00:00:00 GMT";

function deprecationHeaders(): HeadersInit {
  return {
    Deprecation: "true",
    Sunset: SUNSET_DATE,
    Link: '</api/v1/decisions>; rel="successor-version"',
    Warning: '299 - "This endpoint is deprecated. Use /api/v1/decisions. See docs/API.md#deprecation-policy."',
  };
}

async function forward(req: Request) {
  const url = new URL(req.url);
  const target = new URL(`/api/v1/decisions${url.search}`, url.origin);

  const res = await fetch(target, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
  });

  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(deprecationHeaders())) {
    headers.set(key, value as string);
  }

  return new Response(res.body, { status: res.status, headers });
}

export const dynamic = "force-dynamic";
export const GET = forward;
export const POST = forward;
