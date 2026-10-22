import { db } from "@/db";
import { agents, apiKeys, leads, organizations } from "@/db/schema";
import { hashApiKey } from "@/lib/tenant";
import { randomUUID } from "node:crypto";

export async function createTestOrg(name = `test-org-${randomUUID()}`) {
  const [org] = await db.insert(organizations).values({ name }).returning();
  return org;
}

export async function createTestAgent(orgId: number, tier: number) {
  const [agent] = await db.insert(agents).values({ orgId, name: `agent-${randomUUID()}`, tier }).returning();
  return agent;
}

export async function createTestLead(orgId: number) {
  const [lead] = await db
    .insert(leads)
    .values({ orgId, name: "Jordan Rivera", company: "Acme Robotics" })
    .returning();
  return lead;
}

export async function createTestApiKey(orgId: number) {
  const rawKey = `test-key-${randomUUID()}`;
  await db.insert(apiKeys).values({ orgId, keyHash: hashApiKey(rawKey), label: "test", scope: "public" });
  return rawKey;
}

export function internalRequest(url: string, orgId: number, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-org-id", String(orgId));
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  return new Request(url, { ...init, headers });
}

export function publicRequest(url: string, apiKey: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${apiKey}`);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  return new Request(url, { ...init, headers });
}
