# LEADOS Platform API

LEADOS is an open platform: a stable, versioned, documented API surface that other tools plug
into, and that plugs into a leader's existing stack (Slack, webhooks, automation).

- **Spec is the source of truth.** [`api-spec.yaml`](../api-spec.yaml) (OpenAPI 3.1) is generated
  from the zod schemas in [`src/lib/openapi/schemas.ts`](../src/lib/openapi/schemas.ts) and the
  route registry in [`src/lib/openapi/registry.ts`](../src/lib/openapi/registry.ts). Never hand-edit
  `api-spec.yaml`, `api-spec.json`, `src/generated/api-types.ts`, or `postman-collection.json`.
- **SDK.** [`sdk.ts`](../sdk.ts) is a thin, hand-written wrapper (auth header injection, cursor
  pagination helper, webhook signature verification, SSE resume client) around a fully-typed
  [`openapi-fetch`](https://www.npmjs.com/package/openapi-fetch) client whose types are generated
  from the spec — see "Regenerating the spec, types, SDK & Postman collection" below.
- **Postman/Bruno.** [`postman-collection.json`](../postman-collection.json) is generated from
  `api-spec.json` by `scripts/generate-postman.ts`.

## Quickstart

```bash
# 1. Mint an API token (dev/bootstrap route — see "Auth" below)
curl -s -X POST http://localhost:3000/api/v1/tokens \
  -H 'Content-Type: application/json' \
  -d '{"orgId":"org_123","name":"my-integration","scopes":["read","write","automation","webhooks","realtime"]}'
# => { "id": "...", "token": "lead_sk_...", "prefix": "lead_sk_abc1", "scopes": [...], "rateLimitPerMinute": 120 }

# 2. Call the API
curl -s http://localhost:3000/api/v1/decisions \
  -H "Authorization: Bearer lead_sk_..."
```

With the SDK:

```ts
import { createLeadosClient } from "./sdk";

const leados = createLeadosClient({ baseUrl: "http://localhost:3000", token: process.env.LEADOS_TOKEN! });

const { data, error } = await leados.GET("/api/v1/decisions", { params: { query: { limit: "25" } } });
```

## Auth

Every `/api/v1/*` route (except the webhook sandbox receiver) requires:

```
Authorization: Bearer <token>
```

Tokens are minted via `POST /api/v1/tokens` and are scoped:

| Scope        | Grants                                             |
|--------------|-----------------------------------------------------|
| `read`       | GET on decisions/findings                           |
| `write`      | POST/PATCH/DELETE on decisions/findings, Slack notify |
| `automation` | trigger/poll runs                                    |
| `webhooks`   | manage subscriptions, read delivery log, force retry |
| `realtime`   | open the SSE event stream                            |

Tokens are stored hashed (SHA-256); the raw token is only ever returned once, at creation time.

> `POST /api/v1/tokens` is a **dev/bootstrap helper**. In a deployment with a real admin UI/session
> system, mint tokens from an authenticated settings page instead of this open route. Set
> `TOKEN_BOOTSTRAP_SECRET` in the environment to require `X-Bootstrap-Secret: <value>` on every
> token-mint request and lock the route down in production.

## Pagination

List endpoints use **cursor pagination**:

```
GET /api/v1/decisions?limit=25&cursor=eyJjcmVhdGVkQXQiOi4uLn0
```

- `limit` — page size, 1–100, default 25.
- `cursor` — opaque, from the previous page's `page.nextCursor`. Omit for the first page.

Response shape:

```json
{ "items": [ /* ... */ ], "page": { "nextCursor": "eyJ...", "limit": 25 } }
```

`cursor` is `base64url(JSON.stringify({ createdAt, id }))` — keyset pagination on
`(created_at desc, id desc)`, stable under concurrent inserts.

## Filtering & sorting

`sort=field` (ascending) or `sort=-field` (descending) is supported wherever documented in
`api-spec.yaml`; unsupported fields return `400 BAD_REQUEST`. Resource-specific filters are
documented per-route in the spec.

## Error envelope

Every error response has the same shape:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Decision 123 not found",
    "details": null,
    "correlationId": "req_8f1c2e..."
  }
}
```

`correlationId` is also echoed as the `X-Correlation-Id` response header on every request
(success or failure) — include it when filing a support ticket. Codes: `BAD_REQUEST`,
`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `IDEMPOTENCY_MISMATCH`,
`VALIDATION_ERROR`, `INTERNAL_ERROR`.

## Idempotency

Any unsafe write (`POST`, `PATCH`) accepts an `Idempotency-Key` header:

```bash
curl -X POST .../api/v1/decisions \
  -H "Idempotency-Key: 8f28b9b0-c6d2-4a0e-9b0a-2f6b7a1e9c11" \
  -d '{"title":"Adopt the new pricing tier"}'
```

Replaying the same key + org + request body returns the original response (with
`Idempotency-Replayed: true`) instead of creating a duplicate. Replaying the same key with a
*different* body returns `409 IDEMPOTENCY_MISMATCH`.

## Caching (ETag)

Heavy single-resource reads return a weak `ETag`. Send `If-None-Match` to get a cheap `304`:

```bash
ETAG=$(curl -sI .../api/v1/decisions/$ID -H "Authorization: Bearer $TOKEN" | grep -i etag | cut -d' ' -f2)
curl -s .../api/v1/decisions/$ID -H "Authorization: Bearer $TOKEN" -H "If-None-Match: $ETAG"
# => 304 Not Modified
```

## Rate limiting

Per-token, fixed 60s window, limit from `rateLimitPerMinute` (default 120/min, set at token
creation). Every response includes:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
X-RateLimit-Reset: 1731093600   (unix seconds)
```

Exceeding the limit returns `429 RATE_LIMITED` with `details.retryAfterSeconds`.

## Realtime API (Server-Sent Events)

```
GET /api/v1/events/stream           (requires `realtime` scope)
```

Streams every platform event (`decision.created`, `decision.updated`, `finding.created`,
`run.queued`, `run.completed`, `run.failed`, ...) for the token's org as SSE frames:

```
id: 42
event: message
data: {"id":"...","type":"decision.created","orgId":"org_123","createdAt":"...","data":{...}}
```

**Resume semantics:** every event has a monotonically increasing `id` (its log sequence number).
Reconnect with `Last-Event-ID: 42` (standard `EventSource` behavior) or `?after=42` to resume
immediately after the last event you saw — no gaps, no duplicates. A `: heartbeat` comment is sent
every 15s to keep idle connections alive through proxies.

Sample client (curl):

```bash
curl -N -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/v1/events/stream?after=42"
```

Sample client (SDK, Node or browser):

```ts
import { streamEvents } from "./sdk";

await streamEvents({ baseUrl, token, lastEventId: "42" }, (event) => {
  console.log(event.type, event.data);
});
```

Browser `EventSource` also works directly (it sends `Last-Event-ID` automatically on reconnect),
though it can't set the `Authorization` header — proxy through your backend or pass a short-lived
token in the query string if you need browser-native `EventSource`.

## Automation API

A single idempotent "runs" job kernel backs every automation trigger — external orchestrators
don't need a second interface:

```bash
# Trigger (idempotent on Idempotency-Key)
curl -X POST .../api/v1/runs -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: nightly-2026-10-20' \
  -d '{"type":"digest_summary","input":{}}'
# => { "id": "...", "status": "queued", ... }

# Poll
curl .../api/v1/runs/$RUN_ID -H "Authorization: Bearer $TOKEN"
# => { "status": "completed", "output": {...} }

# Or subscribe instead of polling: listen for `run.completed` / `run.failed` on the
# realtime stream, or register a webhook subscription for those event types.
```

Run types: `sync_crm`, `digest_summary`, `recalculate_scores`. Statuses:
`queued -> running -> completed | failed`.

## Webhooks

### Subscribing

```bash
curl -X POST .../api/v1/webhooks/subscriptions -H "Authorization: Bearer $TOKEN" \
  -d '{"url":"https://example.com/webhooks/leados","eventTypes":["decision.created","run.completed"]}'
# => { "id": "...", "secret": "whsec_...", ... }   <-- secret shown once, store it
```

Event classes mirror the realtime API's event types (`decision.created`, `decision.updated`,
`finding.created`, `run.queued`, `run.completed`, `run.failed`). Use `"*"` to subscribe to
everything.

### Verifying signatures

Every delivery includes:

```
X-Leados-Event: decision.created
X-Leados-Delivery: <delivery id>
X-Leados-Timestamp: 1731093600
X-Leados-Signature: sha256=<hmac>
```

`signature = HMAC_SHA256(secret, "{timestamp}.{raw_request_body}")`. Verify with the SDK:

```ts
import { verifyWebhookSignature } from "./sdk";

const ok = verifyWebhookSignature({
  secret: process.env.LEADOS_WEBHOOK_SECRET!,
  timestamp: req.headers["x-leados-timestamp"],
  rawBody, // the exact raw request body string, not re-serialized JSON
  signatureHeader: req.headers["x-leados-signature"],
});
```

### Retries, backoff & dead letter

Failed deliveries (non-2xx or network error) retry on this schedule (seconds):
`30, 120, 600, 1800, 3600, 21600` — 6 attempts total, then the delivery is marked `dead_letter`
and stops retrying automatically. You can force an immediate retry at any time:

```bash
curl -X POST .../api/v1/webhooks/deliveries/$DELIVERY_ID/retry -H "Authorization: Bearer $TOKEN"
```

A background loop (`src/instrumentation.ts`) checks for due retries every 5s in the running
server process.

### Delivery log

- UI: `/platform/webhooks` (paste a token with the `webhooks` scope).
- API: `GET /api/v1/webhooks/deliveries?limit=25&cursor=...`.

### Sandbox endpoint

`POST /api/v1/webhooks/sandbox` is a no-auth receiver for testing deliveries end-to-end: point a
subscription's `url` at it, trigger an event, and it verifies the HMAC signature and logs the
result (`{ "verified": true/false, "deliveryId": "...", "receivedAt": "..." }`). This is also what
`scripts/contract-test-runtime.ts` uses to prove HMAC-verified delivery.

## Integrations

### Slack notification bridge (reference integration)

```bash
curl -X POST .../api/v1/integrations/slack/notify -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"New critical finding raised"}'
```

Set `SLACK_WEBHOOK_URL` (Slack incoming webhook URL) in the environment — **never commit
credentials**. Without it configured, the call still succeeds and is logged with
`status: "skipped_no_credential"` so the integration is observable/testable without secrets.
See [`src/lib/platform/integrations/slack.ts`](../src/lib/platform/integrations/slack.ts).

### Generic import

`POST /api/v1/decisions` / `POST /api/v1/findings` double as a generic JSON import surface;
combine with `Idempotency-Key` per row for safe re-runs of a CSV-to-JSON import script.

## Deprecated routes & migration map

| Old path          | New path             | Status                                   |
|--------------------|-----------------------|-------------------------------------------|
| `GET /api/decisions` | `GET /api/v1/decisions` | Deprecated shim, forwards + adds headers |
| `POST /api/decisions`| `POST /api/v1/decisions`| Deprecated shim, forwards + adds headers |

Deprecated routes respond with:

```
Deprecation: true
Sunset: Wed, 01 Apr 2026 00:00:00 GMT
Link: </api/v1/decisions>; rel="successor-version"
```

per [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594). After the `Sunset` date the shim is
removed — migrate before then.

## Versioning & deprecation policy

- The path prefix (`/api/v1/...`) is the version. Breaking changes ship as `/api/v2/...`;
  non-breaking additive changes (new optional fields, new endpoints) land in `v1` without a bump.
- A route is never deleted outright: it is first marked deprecated (`Deprecation`/`Sunset`
  headers + an entry in the table above and the changelog below), kept for **at least 90 days**,
  then removed.
- Pre-v1 organic routes are migrated one at a time behind thin shims (see table above) so existing
  integrations keep working while new ones should move straight to `/api/v1`.

### Changelog

- **2026-10 — v1.0.0.** Initial consolidated `/api/v1` surface: decisions, findings, automation
  runs, realtime SSE events, webhooks (subscriptions + delivery log + sandbox), Slack reference
  integration, token management. `GET/POST /api/decisions` deprecated in favor of
  `/api/v1/decisions` (sunset 2026-04-01).

## Regenerating the spec, types, SDK & Postman collection

```bash
# 1. Edit zod schemas / path registrations:
#    src/lib/openapi/schemas.ts, src/lib/openapi/registry.ts
# 2. Regenerate everything:
npx tsx scripts/generate-openapi.ts                               # -> api-spec.yaml, api-spec.json
npx openapi-typescript api-spec.yaml -o src/generated/api-types.ts # -> SDK types
npx tsx scripts/generate-postman.ts                                # -> postman-collection.json
# 3. Verify the route layer still matches the spec:
npx tsx scripts/contract-test.ts
```

## Contract tests

- **Static** (`scripts/contract-test.ts`): every path+method in `api-spec.json` must resolve to a
  real `src/app/api/**/route.ts` file that exports that HTTP method. Fails the build the moment a
  route and the spec drift apart.
- **Runtime** (`scripts/contract-test-runtime.ts`): exercises a live server — auth, the error
  envelope, idempotency replay, ETag/304, pagination, the deprecated shim's headers, the
  automation run lifecycle, and the full webhook lifecycle (HMAC-verified delivery to the sandbox
  endpoint, plus an unreachable-URL subscription proving retry → forced-retry → dead letter).

```bash
npx tsx scripts/contract-test.ts
BASE_URL=http://localhost:3000 npx tsx scripts/contract-test-runtime.ts
```

## `/api/health` & `/api/stats`

- `GET /api/health` — liveness/readiness probe, no auth, checks the database connection.
- `GET /api/stats` — public aggregate counts (decisions/findings/runs/webhook subscriptions) and
  webhook delivery health (delivered/retrying/dead_letter). Powers the public status page at
  `/status`. No per-org/customer data is exposed.
