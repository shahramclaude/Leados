import { randomBytes } from "node:crypto";
import type { Database } from "@/db";
import { tenants } from "@/db/schema";

export async function seedTenant(db: Database, name = "Acme Co") {
  const apiKey = randomBytes(16).toString("hex");
  const [row] = await db.insert(tenants).values({ name, apiKey }).returning();
  return row;
}

export function jsonRequest(url: string, options: { method?: string; body?: unknown; apiKey?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.apiKey) headers.set("authorization", `Bearer ${options.apiKey}`);
  return new Request(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}
