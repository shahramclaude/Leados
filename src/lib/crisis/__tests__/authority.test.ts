import { describe, it, expect } from "vitest";
import { checkAuthority } from "../authority";

describe("authority matrix enforcement", () => {
  it("allows comms_lead to send comms", () => {
    const result = checkAuthority({ action: "send_comms", actingRoleKeys: ["comms_lead"] });
    expect(result.allowed).toBe(true);
  });

  it("blocks an unauthorized role from sending comms", () => {
    const result = checkAuthority({ action: "send_comms", actingRoleKeys: ["liaison"] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not authorized|No role/i);
  });

  it("blocks approving external comms without legal", () => {
    const result = checkAuthority({ action: "approve_external_comms", actingRoleKeys: ["comms_lead"] });
    expect(result.allowed).toBe(false);
  });

  it("allows legal to approve external comms", () => {
    const result = checkAuthority({ action: "approve_external_comms", actingRoleKeys: ["legal"] });
    expect(result.allowed).toBe(true);
  });

  it("enforces commit caps per role", () => {
    const withinCap = checkAuthority({ action: "commit_budget", actingRoleKeys: ["ops_lead"], commitUsd: 5000 });
    expect(withinCap.allowed).toBe(true);

    const overCap = checkAuthority({ action: "commit_budget", actingRoleKeys: ["ops_lead"], commitUsd: 20000 });
    expect(overCap.allowed).toBe(false);
  });

  it("requires dual control above the high commitment threshold even for the commander", () => {
    const soloHighValue = checkAuthority({
      action: "commit_budget",
      actingRoleKeys: ["commander"],
      commitUsd: 200000,
    });
    expect(soloHighValue.allowed).toBe(false);
    expect(soloHighValue.reason).toMatch(/dual control/i);

    const dualSigned = checkAuthority({
      action: "commit_budget",
      actingRoleKeys: ["commander"],
      commitUsd: 200000,
      coSignerRoleKeys: ["commander", "board_liaison"],
    });
    expect(dualSigned.allowed).toBe(true);
  });

  it("blocks unauthorized crisis actions outright (e.g. scribe declaring crisis)", () => {
    const result = checkAuthority({ action: "declare_crisis", actingRoleKeys: ["scribe"] });
    expect(result.allowed).toBe(false);
  });

  it("reroutes commander-only authority away from a compromised commander", () => {
    const compromised = checkAuthority({
      action: "declare_recovery",
      actingRoleKeys: ["commander"],
      commanderCompromised: true,
    });
    expect(compromised.allowed).toBe(false);

    const viaDeputy = checkAuthority({
      action: "declare_recovery",
      actingRoleKeys: ["commander", "deputy_commander"],
      commanderCompromised: true,
    });
    expect(viaDeputy.allowed).toBe(true);
  });
});
