// src/lib/app/push.ts — push subscription use-case.

import { requirePermission } from "@/lib/platform/authz";
import { saveSubscription } from "@/lib/platform/db/pushRepository";
import type { SessionContext } from "@/lib/domain/types";

export interface PushSubscribeInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function subscribeToPush(session: SessionContext, input: PushSubscribeInput) {
  requirePermission(session, "push:manage");
  return saveSubscription({
    userId: session.userId,
    orgId: session.orgId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
  });
}
