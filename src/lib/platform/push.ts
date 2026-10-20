// src/lib/platform/push.ts — thin wrapper around `web-push`. Gracefully
// no-ops when VAPID keys aren't configured (documented, not a silent crash)
// so the rest of the PWA slice works in environments without push configured.

import webpush from "web-push";
import type { PushSubscriptionRow } from "@/db/schema";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const CONTACT = process.env.VAPID_CONTACT_EMAIL ?? "mailto:admin@example.com";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(CONTACT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export function pushPublicKey(): string | null {
  return PUBLIC_KEY ?? null;
}

export async function sendPushNotification(
  subscription: PushSubscriptionRow,
  payload: { title: string; body: string },
): Promise<{ sent: boolean; reason?: string }> {
  if (!ensureConfigured()) {
    return { sent: false, reason: "VAPID keys not configured in this environment" };
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: (err as Error).message };
  }
}
