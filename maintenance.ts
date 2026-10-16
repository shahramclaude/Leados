// Auto-Maintenance Tasks — pt-D brief, §"Auto-Maintenance Tasks" (TASK 1-6).
// Entirely this module's own implementation; no equivalent runMaintenance()
// was found in the real repo (grepped for "snoozed"/"dismissed"/"_mod" and
// found neither — see AI-SESSION-LOG.md §2).

import type { AuditEntry, Finding, Store } from "./types";
import { daysBetween, fmt } from "./time";

let auditSeq = 0;
function mkAudit(_store: Store, action: string, message: string, system = true): AuditEntry {
  auditSeq += 1;
  return { id: "aud-" + Date.now().toString(36) + "-" + auditSeq, at: Date.now(), action, message, system };
}

export interface MaintenanceReport {
  entries: AuditEntry[];
  cadenceDriftFindings: Finding[];
  orphanedSuppressions: { key: string; reason: string }[];
  schemaProblems: string[];
}

export function runMaintenance(store: Store, today: number): MaintenanceReport {
  const entries: AuditEntry[] = [];
  const cadenceDriftFindings: Finding[] = [];
  const orphanedSuppressions: { key: string; reason: string }[] = [];
  const schemaProblems: string[] = [];

  // TASK 1 — STALE EVENT DETECTION
  const archivedIds = new Set(store.people.filter((p) => p.archived).map((p) => p.id));
  if (archivedIds.size > 0) {
    const count = store.events.filter((e) => typeof e.payload["personId"] === "string" && archivedIds.has(e.payload["personId"] as string)).length;
    if (count > 0) {
      const names = store.people.filter((p) => archivedIds.has(p.id)).map((p) => p.name);
      entries.push(
        mkAudit(
          store,
          "auto-maintenance",
          `${count} event(s) reference archived person(s) ${names.join(", ")} — these events are inert but remain in the log (as designed).`
        )
      );
    }
  }

  // TASK 2 — CADENCE DRIFT DETECTION (90d window)
  const WINDOW = 90;
  store.people
    .filter((p) => !p.archived)
    .forEach((p) => {
      const logs = store.events
        .filter((e) => e.type === "oneonone.logged" && e.payload["personId"] === p.id && daysBetween(e.at, today) <= WINDOW)
        .sort((a, b) => a.at - b.at);
      if (logs.length < 2) return;
      const gaps: number[] = [];
      for (let i = 1; i < logs.length; i++) gaps.push(daysBetween(logs[i - 1].at, logs[i].at));
      const actual = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
      const configured = p.cadenceDays ?? store.settings["oneOnOneCadenceDays"] ?? 14;
      if (actual > configured * 1.5) {
        entries.push(
          mkAudit(
            store,
            "auto-maintenance",
            `Your actual 1:1 cadence with ${p.name} is ~${actual}d, but the setting is ${configured}d. Adjust the setting at #/data → Settings to reduce false positives.`
          )
        );
        // TASK 5 piggybacks on the same measurement — see below.
      }
    });

  // TASK 3 — DUPLICATE DETECTION (same type+person within 60s)
  const sorted = [...store.events].sort((a, b) => a.at - b.at);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (a.type === b.type && a.payload["personId"] && a.payload["personId"] === b.payload["personId"] && b.at - a.at <= 60000) {
      const personId = String(a.payload["personId"]);
      const person = store.people.find((p) => p.id === personId);
      entries.push(
        mkAudit(
          store,
          "auto-maintenance",
          `Possible duplicate: ${a.type} for ${person ? person.name : personId} logged twice within 60 seconds (${a.id} / ${b.id}). Review at #/data → Events if unintended.`
        )
      );
    }
  }

  // TASK 4 — ORPHANED REFERENCES (suppressions for entities that no longer exist)
  store.suppressed.forEach((s) => {
    if (!s.entityAlive) orphanedSuppressions.push({ key: s.key, reason: s.reason });
  });
  if (orphanedSuppressions.length > 0) {
    entries.push(
      mkAudit(
        store,
        "auto-maintenance",
        `${orphanedSuppressions.length} suppressed finding(s) are for entities that no longer exist (archived people, closed items). They cannot re-fire.`
      )
    );
  }

  // TASK 5 — SETTINGS CALIBRATION SUGGESTION (sev-1 nudge finding, not auto-applied)
  store.people
    .filter((p) => !p.archived)
    .forEach((p) => {
      const logs = store.events
        .filter((e) => e.type === "oneonone.logged" && e.payload["personId"] === p.id && daysBetween(e.at, today) <= WINDOW)
        .sort((a, b) => a.at - b.at);
      if (logs.length < 2) return;
      const gaps: number[] = [];
      for (let i = 1; i < logs.length; i++) gaps.push(daysBetween(logs[i - 1].at, logs[i].at));
      const configured = p.cadenceDays ?? store.settings["oneOnOneCadenceDays"] ?? 14;
      const overCadenceCount = gaps.filter((g) => g > configured).length;
      if (gaps.length > 0 && overCadenceCount / gaps.length > 0.8) {
        const actual = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
        cadenceDriftFindings.push({
          key: `AUTO:R1:cadence-drift:${p.id}`,
          rule: "AUTO",
          sev: 1,
          conf: "medium",
          title: `R1 fires every time for ${p.name} because her/his actual 1:1 gap is ~${actual}d but the cadence setting is ${configured}d.`,
          basis: `${overCadenceCount}/${gaps.length} measured gaps (90d window) exceeded the ${configured}d setting.`,
          personId: p.id,
          play: null,
          system: true,
        });
      }
    });

  // TASK 6 — SCHEMA HEALTH CHECK
  const EXPECTED_SCHEMA = 1;
  const EXPECTED_LINEAGE = "pt-D-demo";
  if (store.schemaVersion !== EXPECTED_SCHEMA) schemaProblems.push(`schemaVersion is ${store.schemaVersion}, expected ${EXPECTED_SCHEMA}`);
  if (store.lineage !== EXPECTED_LINEAGE) schemaProblems.push(`lineage is "${store.lineage}", expected "${EXPECTED_LINEAGE}"`);
  if (store.people.length > 0 && store.events.length === 0) schemaProblems.push("people exist but event count is 0");
  if (typeof store.idSeq !== "number" || (store.events.length > 0 && !(store.idSeq > 0))) schemaProblems.push("idSeq is not a positive number despite events existing");
  if (schemaProblems.length > 0) {
    entries.push(mkAudit(store, "auto-maintenance", `Schema health check found ${schemaProblems.length} issue(s): ${schemaProblems.join("; ")}`));
  } else {
    entries.push(mkAudit(store, "auto-maintenance", `Schema health check passed at ${fmt(today)}: schemaVersion/lineage/idSeq/event-count all consistent.`));
  }

  return { entries, cadenceDriftFindings, orphanedSuppressions, schemaProblems };
}
