// src/lib/events/projections/people.ts — folds person.* events into
// people_projection (see docs/DATA.md "Projections").
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { peopleProjection } from "@/db/schema";
import type { LeadosEvent } from "../eventStore";
import type { Projector } from "./types";

const HANDLED = new Set(["person.added", "person.updated", "person.checkin", "person.exit_signal"]);

export const peopleProjector: Projector = {
  name: "people",
  handles: (type) => HANDLED.has(type),
  async reset(tx: DbOrTx) {
    await tx.delete(peopleProjection);
  },
  async apply(tx: DbOrTx, event: LeadosEvent) {
    if (!event.entityId) return;
    const id = event.entityId;
    const seq = BigInt(event.seq);
    const data = event.data as Record<string, unknown>;

    switch (event.type) {
      case "person.added": {
        await tx
          .insert(peopleProjection)
          .values({
            id,
            name: String(data.name ?? "Unknown"),
            email: (data.email as string | undefined) ?? null,
            role: String(data.role ?? "Unknown"),
            team: String(data.team ?? "Unknown"),
            lastEventSeq: seq,
          })
          .onConflictDoUpdate({
            target: peopleProjection.id,
            set: {
              name: String(data.name ?? "Unknown"),
              email: (data.email as string | undefined) ?? null,
              role: String(data.role ?? "Unknown"),
              team: String(data.team ?? "Unknown"),
              updatedAt: new Date(event.ts),
              lastEventSeq: seq,
            },
          });
        return;
      }
      case "person.updated": {
        const patch: Partial<typeof peopleProjection.$inferInsert> = {
          updatedAt: new Date(event.ts),
          lastEventSeq: seq,
        };
        if (typeof data.name === "string") patch.name = data.name;
        if (typeof data.email === "string") patch.email = data.email;
        if (typeof data.role === "string") patch.role = data.role;
        if (typeof data.team === "string") patch.team = data.team;
        await tx.update(peopleProjection).set(patch).where(eq(peopleProjection.id, id));
        return;
      }
      case "person.checkin": {
        await tx
          .update(peopleProjection)
          .set({
            sentiment: Number(data.sentiment ?? 0.5),
            engagement: Number(data.engagement ?? 0.5),
            flightRisk: Number(data.flightRisk ?? 0),
            lastCheckIn: new Date(event.ts),
            updatedAt: new Date(event.ts),
            lastEventSeq: seq,
          })
          .where(eq(peopleProjection.id, id));
        return;
      }
      case "person.exit_signal": {
        const severityWeight: Record<string, number> = { low: 0.1, medium: 0.25, high: 0.45, critical: 0.7 };
        const bump = severityWeight[String(data.severity ?? "medium")] ?? 0.25;
        const [existing] = await tx.select().from(peopleProjection).where(eq(peopleProjection.id, id)).limit(1);
        const nextFlightRisk = Math.min(1, Math.max(existing?.flightRisk ?? 0, bump));
        await tx
          .update(peopleProjection)
          .set({ flightRisk: nextFlightRisk, updatedAt: new Date(event.ts), lastEventSeq: seq })
          .where(eq(peopleProjection.id, id));
        return;
      }
      default:
        return;
    }
  },
};
