import { db } from "@/db";
import { accessAuditLog } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { Viewer } from "../../domain/types";

export const accessAuditRepository = {
  async log(params: {
    viewer: Viewer;
    subjectId: number | null;
    resource: string;
    fieldsRedacted: string[];
    allowed: boolean;
    reason: string;
  }) {
    await db.insert(accessAuditLog).values({
      requesterId: params.viewer.id,
      requesterRole: params.viewer.role,
      subjectId: params.subjectId,
      resource: params.resource,
      fieldsRedacted: params.fieldsRedacted,
      allowed: params.allowed,
      reason: params.reason,
    });
  },

  async listForSubject(subjectId: number, limit = 50) {
    return db
      .select()
      .from(accessAuditLog)
      .where(eq(accessAuditLog.subjectId, subjectId))
      .orderBy(desc(accessAuditLog.createdAt))
      .limit(limit);
  },
};
