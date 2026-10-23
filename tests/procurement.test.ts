import { describe, expect, it } from "vitest";
import {
  bankChangePaymentAllowed,
  enumeratedRiskClauses,
  invoiceMatchStatus,
  renewalAlertStatus,
} from "@/lib/calc/procurement";

describe("renewalAlertStatus", () => {
  const today = new Date("2026-01-01T00:00:00Z");

  it("is on-track when the notice deadline is far away", () => {
    const result = renewalAlertStatus("2026-12-31", 30, false, today);
    expect(result.status).toBe("on-track");
  });

  it("alerts within 30 days of the notice deadline", () => {
    const result = renewalAlertStatus("2026-01-20", 10, false, today);
    expect(result.status).toBe("alert");
  });

  it("is overdue once the notice deadline has passed without a decision", () => {
    const result = renewalAlertStatus("2026-01-02", 10, false, today);
    expect(result.status).toBe("overdue");
  });

  it("is decided once a decision has been made regardless of dates", () => {
    const result = renewalAlertStatus("2026-01-02", 10, true, today);
    expect(result.status).toBe("decided");
  });
});

describe("invoiceMatchStatus", () => {
  it("is three-way matched within tolerance", () => {
    expect(invoiceMatchStatus(1000, 1000, 1001, 5)).toBe("three-way-matched");
  });

  it("is two-way matched when receipt is missing but PO matches", () => {
    expect(invoiceMatchStatus(1000, null, 1002, 5)).toBe("two-way-matched");
  });

  it("is an exception when amounts diverge beyond tolerance", () => {
    expect(invoiceMatchStatus(1000, 1000, 1200, 5)).toBe("exception");
  });

  it("is no-po when there is no purchase order on file", () => {
    expect(invoiceMatchStatus(null, null, 500, 5)).toBe("no-po");
  });
});

describe("bankChangePaymentAllowed", () => {
  it("allows payment when no bank change was requested", () => {
    expect(bankChangePaymentAllowed(false, false)).toBe(true);
  });

  it("blocks payment on a bank-change request without dual control", () => {
    expect(bankChangePaymentAllowed(true, false)).toBe(false);
  });

  it("allows payment on a bank-change request once dual control is approved", () => {
    expect(bankChangePaymentAllowed(true, true)).toBe(true);
  });
});

describe("enumeratedRiskClauses", () => {
  it("enumerates at least 15 risk clause types", () => {
    expect(enumeratedRiskClauses().length).toBeGreaterThanOrEqual(15);
  });
});
