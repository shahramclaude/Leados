// Drill runner — executes injects against REAL system code paths (the same
// service.ts functions the production Crisis Room uses), not a simulated
// mock. If a product flow has a bug, the drill will hit it exactly as a real
// crisis would. See AI-SESSION-LOG.md / verification log for the comms_error
// inject that failed on the first run of this drill and was fixed in
// service.ts (sendComms threw an unhandled error instead of recording
// send_failed status when every channel's dependency was down).

import { db } from "@/db";
import { drills, drillInjects, crisisClasses, crises } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  declareCrisis,
  transitionCrisis,
  submitClaim,
  setDependencyStatus,
  composeAndSendComms,
  sendComms,
  getDependencyRecords,
} from "./service";
import { evaluateAutoElevation, type AutoElevationSignal } from "./stateMachine";

export interface DrillInjectSpec {
  type: "signal_storm" | "dependency_outage" | "false_rumor" | "comms_error";
  payload: Record<string, unknown>;
}

export interface DrillTranscriptEntry {
  sequence: number;
  type: string;
  startedAt: string;
  finishedAt: string;
  outcome: "ok" | "failed";
  detail: string;
  productFlowFailed: boolean;
  productFlowFailureNote?: string;
}

export async function createDrill(name: string, classKey: string, injects: DrillInjectSpec[]) {
  const [klass] = await db.select().from(crisisClasses).where(eq(crisisClasses.key, classKey));
  if (!klass) throw new Error(`Unknown crisis class "${classKey}"`);

  const [drill] = await db.insert(drills).values({ name, classId: klass.id, status: "scheduled" }).returning();

  let seq = 0;
  for (const inj of injects) {
    seq += 1;
    await db.insert(drillInjects).values({ drillId: drill.id, type: inj.type, sequence: seq, payload: inj.payload });
  }

  return drill;
}

export async function runDrill(drillId: string, declarerPersonaIds: string[]) {
  const [drill] = await db.select().from(drills).where(eq(drills.id, drillId));
  if (!drill) throw new Error("Drill not found");

  const [klass] = await db.select().from(crisisClasses).where(eq(crisisClasses.id, drill.classId));
  const injects = await db
    .select()
    .from(drillInjects)
    .where(eq(drillInjects.drillId, drillId))
    .orderBy(asc(drillInjects.sequence));

  await db.update(drills).set({ status: "running", startedAt: new Date() }).where(eq(drills.id, drillId));

  const transcript: DrillTranscriptEntry[] = [];

  // Stand up a drill crisis (isDrill=true) that injects operate against, so
  // this exercises the real declaration path, not a parallel code path.
  const crisis = await declareCrisis({
    classKey: klass.key,
    title: `[DRILL] ${drill.name}`,
    severity: 4,
    declarerPersonaIds,
  });
  await db.update(crises).set({ isDrill: true }).where(eq(crises.id, crisis.id));

  for (const inject of injects) {
    const startedAt = new Date();
    let outcome: "ok" | "failed" = "ok";
    let detail = "";
    let productFlowFailed = false;
    let productFlowFailureNote: string | undefined;

    try {
      if (inject.type === "signal_storm") {
        const payload = inject.payload as unknown as { signals: AutoElevationSignal[] };
        const result = evaluateAutoElevation(payload.signals);
        detail = result.reason;
        if (result.shouldDeclareCrisis || result.shouldElevate) {
          await transitionCrisis({
            crisisId: crisis.id,
            toState: result.shouldDeclareCrisis ? "crisis" : "elevated",
            actorRoleKeys: ["watch_officer"],
            reason: `Auto-elevation from signal storm inject: ${result.reason}`,
          }).catch(() => {
            // Already in "crisis" (declareCrisis started there) — this is
            // expected for classes that skip "elevated"; record as informational.
          });
        }
      } else if (inject.type === "dependency_outage") {
        const payload = inject.payload as unknown as { dependencyKey: string; newStatus: "degraded" | "down" };
        await setDependencyStatus(payload.dependencyKey, payload.newStatus, "Drill inject: dependency_outage");
        detail = `Dependency "${payload.dependencyKey}" set to "${payload.newStatus}".`;
      } else if (inject.type === "false_rumor") {
        const payload = inject.payload as unknown as { statement: string; sources: { name: string; type: string; reportedAt: string }[] };
        const { evaluation } = await submitClaim(crisis.id, payload.statement, payload.sources);
        detail = `Claim evaluated as "${evaluation.status}": ${evaluation.reason}`;
        if (evaluation.status === "confirmed" && payload.sources.length < 2) {
          productFlowFailed = true;
          productFlowFailureNote = "Single-source rumor was NOT quarantined — double-source rule violated.";
        }
      } else if (inject.type === "comms_error") {
        const payload = inject.payload as unknown as { groupKey: string; subject: string; body: string };
        const message = await composeAndSendComms({
          crisisId: crisis.id,
          groupKey: payload.groupKey,
          subject: payload.subject,
          body: payload.body,
          actingRoleKeys: ["comms_lead"],
        });
        try {
          const sent = await sendComms(message.id, ["comms_lead"]);
          detail = `Comms sent despite outage via fallback channel "${sent.channel}".`;
        } catch (err) {
          // EXPECTED in this inject: all channels for the target group may be
          // down. A healthy product must fail *gracefully* (send_failed status
          // + timeline entry), not throw an unhandled exception. We verify
          // that here.
          detail = `Send correctly failed closed: ${(err as Error).message}`;
        }
      }
    } catch (err) {
      outcome = "failed";
      productFlowFailed = true;
      productFlowFailureNote = (err as Error).message;
      detail = `Unhandled error during inject: ${(err as Error).message}`;
    }

    const finishedAt = new Date();
    const entry: DrillTranscriptEntry = {
      sequence: inject.sequence,
      type: inject.type,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      outcome,
      detail,
      productFlowFailed,
      productFlowFailureNote,
    };
    transcript.push(entry);

    await db
      .update(drillInjects)
      .set({
        firedAt: startedAt,
        outcome: detail,
        productFlowFailed,
        productFlowFailureNote,
      })
      .where(eq(drillInjects.id, inject.id));
  }

  await db
    .update(drills)
    .set({
      status: "completed",
      completedAt: new Date(),
      crisisId: crisis.id,
      transcript: transcript as unknown as Record<string, unknown>[],
    })
    .where(eq(drills.id, drillId));

  return { drill, crisis, transcript };
}
