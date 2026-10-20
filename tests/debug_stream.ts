import { GET as streamGET } from "@/app/api/events/stream/route";
import { publishEvent, getActiveConnectionCount } from "@/lib/eventBus";
import { createTestUser, deleteTestUser, makeRequest, openSseReader, readFromSse, waitUntil } from "./helpers";

async function main() {
  const user = await createTestUser("debug");
  const userId = user.id;
  const controller1 = new AbortController();
  const req1 = makeRequest("http://localhost/api/events/stream", { userId, signal: controller1.signal });
  const res1 = await streamGET(req1);
  console.log("status", res1.status);
  const reader1 = openSseReader(res1);
  const first = await readFromSse(reader1, 10, 1000);
  console.log("first chunk:", JSON.stringify(first));
  await waitUntil(() => getActiveConnectionCount(userId) >= 1, 2000);
  console.log("active connections:", getActiveConnectionCount(userId));
  const eventA = await publishEvent({ userId, type: "finding.created", domain: "test", payload: { n: "A" } });
  console.log("published", eventA.id);
  const chunk = await readFromSse(reader1, 1, 2000);
  console.log("chunk after publish:", JSON.stringify(chunk));
  controller1.abort();
  await deleteTestUser(userId);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
