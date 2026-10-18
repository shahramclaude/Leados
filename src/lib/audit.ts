import { db } from "@/db";
import { leados_audit } from "@/db/schema";

export async function logAudit(action: string, detail?: string) {
  try {
    await db.insert(leados_audit).values({ action, detail: detail ?? "" });
  } catch (err) {
    console.error("logAudit failed", err);
  }
}
