import { describe, it, expect } from "vitest";
import { routeNotification } from "../dependencies";

describe("degraded-dependency circuit breaker routing", () => {
  const contacts = [
    { id: "c1", name: "Primary Email Alias", channel: "email", dependencyKey: "email_provider", escalationOrder: 1 },
    { id: "c2", name: "Backup SMS Alias", channel: "sms", dependencyKey: "sms_gateway", escalationOrder: 2 },
    { id: "c3", name: "Manual Phone Tree Lead", channel: "phone", dependencyKey: "telephony", escalationOrder: 3 },
  ];

  it("routes to the primary channel when all dependencies are healthy", () => {
    const result = routeNotification(contacts, [
      { key: "email_provider", status: "up" },
      { key: "sms_gateway", status: "up" },
      { key: "telephony", status: "up" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.contact?.id).toBe("c1");
  });

  it("falls back to the next healthy channel when the primary dependency is down", () => {
    const result = routeNotification(contacts, [
      { key: "email_provider", status: "down" },
      { key: "sms_gateway", status: "up" },
      { key: "telephony", status: "up" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.contact?.id).toBe("c2");
    expect(result.skipped.length).toBe(1);
  });

  it("still routes through a degraded (not down) dependency", () => {
    const result = routeNotification(contacts, [
      { key: "email_provider", status: "degraded" },
      { key: "sms_gateway", status: "up" },
      { key: "telephony", status: "up" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.contact?.id).toBe("c1");
  });

  it("reports total failure when every gating dependency is down", () => {
    const result = routeNotification(contacts, [
      { key: "email_provider", status: "down" },
      { key: "sms_gateway", status: "down" },
      { key: "telephony", status: "down" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.skipped.length).toBe(3);
  });
});
