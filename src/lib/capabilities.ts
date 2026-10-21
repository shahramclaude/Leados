// Part 07 seam, reused: capability registry gating which notification
// channels are actually allowed to fire. In-app is always available; email
// and webhook are gated behind this registry so the attention engine never
// has to know *how* a channel is implemented, only whether it's capable.

import { db } from "@/db";
import { channelCapabilities } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Channel = "in_app" | "email" | "webhook";

export async function isChannelEnabled(channel: Channel): Promise<boolean> {
  if (channel === "in_app") return true; // always available, no external dependency
  const [row] = await db
    .select()
    .from(channelCapabilities)
    .where(eq(channelCapabilities.channel, channel))
    .limit(1);
  return row?.enabled ?? false;
}

export async function seedDefaultCapabilitiesIfEmpty(): Promise<void> {
  const rows = await db.select().from(channelCapabilities).limit(1);
  if (rows.length > 0) return;
  await db
    .insert(channelCapabilities)
    .values([
      { channel: "in_app", enabled: true, config: {} },
      // Disabled by default: no outbound email/webhook provider is wired in
      // this sandbox. Flip `enabled` once a provider capability exists.
      { channel: "email", enabled: false, config: { reason: "no provider configured" } },
      { channel: "webhook", enabled: false, config: { reason: "no provider configured" } },
    ])
    .onConflictDoNothing();
}

// Dispatch is a seam: in-app delivery is "write a notification row" (already
// realtime via the stream). Email/webhook would call out here once enabled.
export async function dispatchToChannel(
  channel: Channel,
  payload: { userId: string; title: string; body: string },
): Promise<{ sent: boolean; reason: string }> {
  const enabled = await isChannelEnabled(channel);
  if (!enabled) return { sent: false, reason: `channel ${channel} not enabled in capability registry` };
  if (channel === "in_app") return { sent: true, reason: "delivered via realtime stream + notification list" };
  // Real email/webhook providers would be invoked here, server-side only,
  // reading provider secrets from process.env. Left as a seam intentionally.
  return { sent: false, reason: `channel ${channel} enabled but no provider implementation wired yet` };
}
