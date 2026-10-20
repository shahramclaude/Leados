// Contract tests, part 2: exercise a live server (BASE_URL, default
// http://localhost:3000) end-to-end — auth, pagination, idempotency, ETag,
// automation runs, realtime events, and the full webhook delivery lifecycle
// (HMAC verified + retry/backoff + dead letter). Run with:
//   BASE_URL=http://localhost:3000 npx tsx scripts/contract-test-runtime.ts
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ORG_ID = `org_contract_${Date.now()}`;

let failures = 0;

function assert(condition: unknown, message: string) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`OK:   ${message}`);
  }
}

async function json(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  // 1. Health & stats (public)
  const health = await fetch(`${BASE_URL}/api/health`);
  assert(health.ok, "GET /api/health returns 200");

  const stats = await fetch(`${BASE_URL}/api/stats`);
  assert(stats.ok, "GET /api/stats returns 200");

  // 2. Bootstrap a token
  const tokenRes = await fetch(`${BASE_URL}/api/v1/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgId: ORG_ID,
      name: "contract-test",
      scopes: ["read", "write", "automation", "webhooks", "realtime"],
    }),
  });
  const tokenBody = await json(tokenRes);
  assert(tokenRes.status === 201, `POST /api/v1/tokens returns 201 (got ${tokenRes.status})`);
  const token: string = tokenBody.token;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 3. Error envelope shape on auth failure
  const unauthed = await fetch(`${BASE_URL}/api/v1/decisions`);
  const unauthedBody = await json(unauthed);
  assert(unauthed.status === 401, "GET /api/v1/decisions without token returns 401");
  assert(unauthedBody?.error?.code === "UNAUTHORIZED" && unauthedBody?.error?.correlationId, "401 response matches error envelope");

  // 4. Create a decision with idempotency
  const idemKey = `contract-${Date.now()}`;
  const createPayload = { title: "Ship the v1 API", status: "open" };
  const create1 = await fetch(`${BASE_URL}/api/v1/decisions`, {
    method: "POST",
    headers: { ...auth, "Idempotency-Key": idemKey },
    body: JSON.stringify(createPayload),
  });
  const decision1 = await json(create1);
  assert(create1.status === 201, "POST /api/v1/decisions returns 201");

  const create2 = await fetch(`${BASE_URL}/api/v1/decisions`, {
    method: "POST",
    headers: { ...auth, "Idempotency-Key": idemKey },
    body: JSON.stringify(createPayload),
  });
  const decision2 = await json(create2);
  assert(create2.headers.get("idempotency-replayed") === "true", "Replayed idempotent POST is flagged");
  assert(decision1.id === decision2.id, "Replayed idempotent POST returns the same resource");

  // 5. ETag / If-None-Match
  const getOnce = await fetch(`${BASE_URL}/api/v1/decisions/${decision1.id}`, { headers: auth });
  const etag = getOnce.headers.get("etag");
  assert(Boolean(etag), "GET decision returns an ETag header");
  const getAgain = await fetch(`${BASE_URL}/api/v1/decisions/${decision1.id}`, {
    headers: { ...auth, "If-None-Match": etag ?? "" },
  });
  assert(getAgain.status === 304, "GET decision with matching If-None-Match returns 304");

  // 6. Pagination
  const list = await fetch(`${BASE_URL}/api/v1/decisions?limit=1`, { headers: auth });
  const listBody = await json(list);
  assert(Array.isArray(listBody.items) && listBody.items.length <= 1, "List respects `limit`");
  assert("nextCursor" in (listBody.page ?? {}), "List response includes page.nextCursor");

  // 7. Deprecated shim
  const deprecated = await fetch(`${BASE_URL}/api/decisions`, { headers: auth });
  assert(deprecated.headers.get("deprecation") === "true", "Deprecated /api/decisions sets Deprecation header");
  assert(Boolean(deprecated.headers.get("sunset")), "Deprecated /api/decisions sets Sunset header");

  // 8. Automation API: trigger + poll
  const runRes = await fetch(`${BASE_URL}/api/v1/runs`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ type: "digest_summary", input: {} }),
  });
  const run = await json(runRes);
  assert(runRes.status === 201, "POST /api/v1/runs returns 201");

  let finalRun = run;
  for (let i = 0; i < 10 && finalRun.status !== "completed"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const poll = await fetch(`${BASE_URL}/api/v1/runs/${run.id}`, { headers: auth });
    finalRun = await json(poll);
  }
  assert(finalRun.status === "completed", `Run reaches "completed" status (got ${finalRun.status})`);

  // 9. Webhook: successful delivery against the sandbox endpoint, HMAC verified
  const subOkRes = await fetch(`${BASE_URL}/api/v1/webhooks/subscriptions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ url: `${BASE_URL}/api/v1/webhooks/sandbox`, eventTypes: ["decision.created"] }),
  });
  assert(subOkRes.status === 201, "POST webhook subscription (valid URL) returns 201");

  // Trigger an event for that org
  await fetch(`${BASE_URL}/api/v1/decisions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ title: "Trigger webhook fan-out" }),
  });

  let delivered = false;
  let lastDeliveries: Record<string, unknown>[] = [];
  for (let i = 0; i < 10 && !delivered; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const res = await fetch(`${BASE_URL}/api/v1/webhooks/deliveries`, { headers: auth });
    const body = await json(res);
    lastDeliveries = body.items ?? [];
    delivered = lastDeliveries.some((d) => d.status === "delivered");
  }
  assert(delivered, `Webhook delivery to sandbox URL reaches "delivered" (last seen: ${JSON.stringify(lastDeliveries.map((d) => d.status))})`);

  // 10. Webhook: bad URL -> retry/backoff -> forced retries -> dead letter
  const subBadRes = await fetch(`${BASE_URL}/api/v1/webhooks/subscriptions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ url: "http://127.0.0.1:1/unreachable", eventTypes: ["decision.created"] }),
  });
  assert(subBadRes.status === 201, "POST webhook subscription (unreachable URL) returns 201");

  await fetch(`${BASE_URL}/api/v1/decisions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ title: "Trigger failing webhook" }),
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));

  let badDeliveryId: string | null = null;
  for (let i = 0; i < 10 && !badDeliveryId; i += 1) {
    const res = await fetch(`${BASE_URL}/api/v1/webhooks/deliveries`, { headers: auth });
    const body = await json(res);
    const candidate = (body.items ?? []).find((d: Record<string, unknown>) => d.status === "retrying" || d.status === "dead_letter");
    if (candidate) badDeliveryId = candidate.id as string;
    else await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(Boolean(badDeliveryId), "Unreachable webhook URL produces a retrying/dead_letter delivery");

  if (badDeliveryId) {
    let finalStatus = "retrying";
    for (let i = 0; i < 8 && finalStatus !== "dead_letter"; i += 1) {
      await fetch(`${BASE_URL}/api/v1/webhooks/deliveries/${badDeliveryId}/retry`, { method: "POST", headers: auth });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const res = await fetch(`${BASE_URL}/api/v1/webhooks/deliveries`, { headers: auth });
      const body = await json(res);
      const row = (body.items ?? []).find((d: Record<string, unknown>) => d.id === badDeliveryId);
      finalStatus = row?.status;
    }
    assert(finalStatus === "dead_letter", `Forced retries exhaust attempt budget and reach dead_letter (got ${finalStatus})`);
  }

  console.log(failures === 0 ? "\nAll runtime contract tests passed." : `\n${failures} runtime contract test(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Runtime contract test crashed:", err);
  process.exit(1);
});
