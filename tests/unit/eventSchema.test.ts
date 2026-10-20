import { describe, expect, it } from "vitest";
import { EVENT_CATALOG, findEventDefinition } from "@/lib/domain/eventCatalog";
import {
  EventPayloadValidationError,
  UnknownEventTypeError,
  validateEventPayload,
} from "@/lib/domain/eventSchema";

describe("eventCatalog + eventSchema", () => {
  it("every catalog entry has a resolvable definition", () => {
    for (const def of EVENT_CATALOG) {
      expect(findEventDefinition(def.type, def.version)).toEqual(def);
    }
  });

  it("accepts a valid payload for every registered event type", () => {
    const validPayloads: Record<string, unknown> = {
      "system.ping": { message: "hi" },
      "onboarding.completed": { orgName: "Acme" },
      "signal.captured": { title: "t", body: "b" },
      "finding.created": { findingId: 1, title: "t" },
      "decision.belief_updated": { decisionId: 1, successes: 1, failures: 0 },
      "automation.run_completed": { runId: 1, kind: "monte_carlo_forecast" },
      "boardpack.generated": { boardPackId: 1 },
    };
    for (const def of EVENT_CATALOG) {
      const payload = validPayloads[def.type];
      expect(() => validateEventPayload(def.type, def.version, payload)).not.toThrow();
    }
  });

  it("rejects an unknown event type", () => {
    expect(() => validateEventPayload("not.real", 1, {})).toThrow(UnknownEventTypeError);
  });

  it("rejects an unknown version of a known type", () => {
    expect(() => validateEventPayload("system.ping", 99, { message: "hi" })).toThrow(UnknownEventTypeError);
  });

  it("rejects a payload missing required fields", () => {
    expect(() => validateEventPayload("system.ping", 1, {})).toThrow(EventPayloadValidationError);
  });

  it("rejects a payload with the wrong field types", () => {
    expect(() => validateEventPayload("onboarding.completed", 1, { orgName: 42 })).toThrow(
      EventPayloadValidationError,
    );
  });
});
