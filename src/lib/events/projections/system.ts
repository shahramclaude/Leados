// src/lib/events/projections/system.ts — folds metric.recorded into the
// metric_values time series, and org.fact.recorded into the bitemporal
// org_facts table (closing out whatever fact it supersedes).
import { and, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { metricValues, orgFacts } from "@/db/schema";
import type { LeadosEvent } from "../eventStore";
import type { Projector } from "./types";

export const systemProjector: Projector = {
  name: "system",
  handles: (type) => type === "metric.recorded" || type === "org.fact.recorded",
  async reset(tx: DbOrTx) {
    await tx.delete(metricValues);
    await tx.delete(orgFacts);
  },
  async apply(tx: DbOrTx, event: LeadosEvent) {
    const data = event.data as Record<string, unknown>;

    if (event.type === "metric.recorded") {
      await tx
        .insert(metricValues)
        .values({
          metricKey: String(data.metricKey ?? "unknown"),
          ts: new Date(event.ts),
          value: Number(data.value ?? 0),
          eventId: event.id,
        })
        .onConflictDoNothing();
      return;
    }

    if (event.type === "org.fact.recorded") {
      const subjectType = String(data.subjectType ?? "org");
      const subjectId = String(data.subjectId ?? "");
      const attribute = String(data.attribute ?? "");
      const validFrom = new Date(String(data.validFrom ?? event.ts));
      const validTo = data.validTo ? new Date(String(data.validTo)) : null;

      // Close out the currently-open fact for this subject/attribute, if any —
      // this is what makes asOf() queries correct: at most one fact per
      // subject/attribute has validTo = NULL at a time.
      await tx
        .update(orgFacts)
        .set({ validTo: validFrom, supersededAt: event.recordedAt ? new Date(event.recordedAt) : new Date() })
        .where(
          and(
            eq(orgFacts.subjectType, subjectType),
            eq(orgFacts.subjectId, subjectId),
            eq(orgFacts.attribute, attribute),
            isNull(orgFacts.validTo),
          ),
        );

      await tx.insert(orgFacts).values({
        subjectType,
        subjectId,
        attribute,
        value: (data.value as Record<string, unknown>) ?? {},
        validFrom,
        validTo,
        recordedAt: new Date(event.recordedAt),
        sourceEventId: event.id,
      });
    }
  },
};
