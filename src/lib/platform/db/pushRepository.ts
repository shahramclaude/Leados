// src/lib/platform/db/pushRepository.ts — Web Push subscription storage.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, type PushSubscriptionRow } from "@/db/schema";

export interface SubscriptionInput {
  userId: string;
  orgId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function saveSubscription(input: SubscriptionInput): Promise<PushSubscriptionRow> {
  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, input.endpoint))
    .limit(1);
  if (existing) return existing;
  const [row] = await db.insert(pushSubscriptions).values(input).returning();
  return row;
}

export async function listSubscriptionsForUser(userId: string): Promise<PushSubscriptionRow[]> {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
