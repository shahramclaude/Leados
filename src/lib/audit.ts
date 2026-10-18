import { db } from "@/db";
import { leados_audit } from "@/db/schema";

export async function logAudit(
  action: string,
  key: string = "",
  meta: Record<string, unknown> = {},
) {
  try {
    await db.insert(leados_audit).values({ action, key, meta });
  } catch {
    // audit logging must never break the caller
  }
}
