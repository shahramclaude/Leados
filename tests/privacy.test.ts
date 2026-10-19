// Privacy scoping tests: the exact functions every people API route calls
// (`canView`, `redact`, `effectiveRole`) exercised with two different
// viewers against the same subject, proving server-side enforcement is
// viewer-dependent and defaults to deny.

import { describe, expect, it } from "vitest";
import { canView, effectiveRole, redact } from "../src/lib/domain/people/privacy";
import type { Viewer } from "../src/lib/domain/types";

const SUBJECT_ID = 100;

const self: Viewer = { id: SUBJECT_ID, role: "peer" }; // role is irrelevant when id === subject
const manager: Viewer = { id: 200, role: "manager" };
const hr: Viewer = { id: 201, role: "hr" };
const exec: Viewer = { id: 202, role: "exec" };
const peer: Viewer = { id: 300, role: "peer" };

describe("role resolution", () => {
  it("resolves to 'self' whenever the viewer id matches the subject, regardless of asserted role", () => {
    const spoofedPeer: Viewer = { id: SUBJECT_ID, role: "peer" };
    expect(effectiveRole(spoofedPeer, SUBJECT_ID)).toBe("self");
  });

  it("resolves non-matching viewers to their asserted role", () => {
    expect(effectiveRole(manager, SUBJECT_ID)).toBe("manager");
    expect(effectiveRole(peer, SUBJECT_ID)).toBe("peer");
  });
});

describe("two-user field visibility — compaRatio", () => {
  it("is visible to self, manager, hr, exec but not an arbitrary peer", () => {
    expect(canView(self, SUBJECT_ID, "compaRatio")).toBe(true);
    expect(canView(manager, SUBJECT_ID, "compaRatio")).toBe(true);
    expect(canView(hr, SUBJECT_ID, "compaRatio")).toBe(true);
    expect(canView(exec, SUBJECT_ID, "compaRatio")).toBe(true);
    expect(canView(peer, SUBJECT_ID, "compaRatio")).toBe(false);
  });
});

describe("two-user field visibility — flight-risk score", () => {
  it("is visible to manager/hr/exec but NOT to the subject themself or a peer", () => {
    expect(canView(manager, SUBJECT_ID, "flightRiskScore")).toBe(true);
    expect(canView(hr, SUBJECT_ID, "flightRiskScore")).toBe(true);
    expect(canView(self, SUBJECT_ID, "flightRiskScore")).toBe(false);
    expect(canView(peer, SUBJECT_ID, "flightRiskScore")).toBe(false);
  });
});

describe("two-user field visibility — private manager notes", () => {
  it("is visible only to manager/hr, never self or peer", () => {
    expect(canView(manager, SUBJECT_ID, "privateManagerNotes")).toBe(true);
    expect(canView(hr, SUBJECT_ID, "privateManagerNotes")).toBe(true);
    expect(canView(self, SUBJECT_ID, "privateManagerNotes")).toBe(false);
    expect(canView(peer, SUBJECT_ID, "privateManagerNotes")).toBe(false);
    expect(canView(exec, SUBJECT_ID, "privateManagerNotes")).toBe(false);
  });
});

describe("redact() end-to-end field redaction for two users", () => {
  const record = {
    displayName: "Jordan Rivera",
    compaRatio: 1.05,
    skills: [{ skill: "Go", level: 4 }],
    goals: [{ title: "Ship v2", status: "on_track" as const }],
  };

  it("hr viewer sees every field", () => {
    const { value, redactedFields } = redact(hr, SUBJECT_ID, record, {
      compaRatio: "compaRatio",
      skills: "skillsAndGoals",
      goals: "skillsAndGoals",
    });
    expect(redactedFields).toHaveLength(0);
    expect(value.compaRatio).toBe(1.05);
    expect(value.skills).toBeDefined();
  });

  it("peer viewer has compaRatio and skills/goals redacted", () => {
    const { value, redactedFields } = redact(peer, SUBJECT_ID, record, {
      compaRatio: "compaRatio",
      skills: "skillsAndGoals",
      goals: "skillsAndGoals",
    });
    expect(redactedFields.sort()).toEqual(["compaRatio", "goals", "skills"].sort());
    expect(value.compaRatio).toBeUndefined();
    expect(value.skills).toBeUndefined();
    expect(value.displayName).toBe("Jordan Rivera"); // basic profile still visible
  });

  it("the same record redacted for two different viewers yields different results (proving scoping is viewer-dependent, not subject-dependent)", () => {
    const hrView = redact(hr, SUBJECT_ID, record, { compaRatio: "compaRatio" });
    const peerView = redact(peer, SUBJECT_ID, record, { compaRatio: "compaRatio" });
    expect(hrView.value.compaRatio).toBe(1.05);
    expect(peerView.value.compaRatio).toBeUndefined();
  });
});
