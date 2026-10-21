// Global kill switch. Engaging it halts all runs within one scheduler tick:
// the orchestrator checks `isKillSwitchEngaged()` before every single step
// (not just at run start), and `scheduler.tick()` checks it before doing
// anything else. Both are exercised by the kill-switch integration test.
import { db } from "@/db";
import { kernelKillSwitch } from "@/db/schema";
import { eq } from "drizzle-orm";
import { appendEvent } from "./events";
import type { Actor } from "./types";

const GLOBAL_ID = "global";

export async function isKillSwitchEngaged(): Promise<boolean> {
  const [row] = await db.select().from(kernelKillSwitch).where(eq(kernelKillSwitch.id, GLOBAL_ID)).limit(1);
  return Boolean(row?.engaged);
}

export async function engageKillSwitch(reason: string, actor: Actor): Promise<void> {
  await db
    .insert(kernelKillSwitch)
    .values({ id: GLOBAL_ID, engaged: true, engagedAt: new Date(), engagedBy: actor.id, reason })
    .onConflictDoUpdate({
      target: kernelKillSwitch.id,
      set: { engaged: true, engagedAt: new Date(), engagedBy: actor.id, reason },
    });
  await appendEvent({
    type: "kill_switch.engaged",
    actor,
    correlationId: "system",
    payload: { reason },
  });
}

export async function disengageKillSwitch(actor: Actor): Promise<void> {
  await db
    .insert(kernelKillSwitch)
    .values({ id: GLOBAL_ID, engaged: false, engagedAt: null, engagedBy: null, reason: null })
    .onConflictDoUpdate({
      target: kernelKillSwitch.id,
      set: { engaged: false, engagedAt: null, engagedBy: null, reason: null },
    });
  await appendEvent({
    type: "kill_switch.disengaged",
    actor,
    correlationId: "system",
    payload: {},
  });
}

export async function getKillSwitchStatus() {
  const [row] = await db.select().from(kernelKillSwitch).where(eq(kernelKillSwitch.id, GLOBAL_ID)).limit(1);
  return row ?? { id: GLOBAL_ID, engaged: false, engagedAt: null, engagedBy: null, reason: null };
}
