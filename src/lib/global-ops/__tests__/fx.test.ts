import { describe, expect, it } from "vitest";
import { decomposeFxVariance, FxRateMissingError, methodForStatement, translate } from "../fx";
import type { FxRateRecord } from "../types";

describe("methodForStatement", () => {
  it("maps BS -> closing, PL -> average, EQ -> historical", () => {
    expect(methodForStatement("BS")).toBe("closing");
    expect(methodForStatement("PL")).toBe("average");
    expect(methodForStatement("EQ")).toBe("historical");
  });
});

const rates: FxRateRecord[] = [
  { baseCurrency: "EUR", quoteCurrency: "USD", rateDate: "2025-03-31", rate: 1.08, method: "closing", rateSource: "ECB reference rate", fiscalYear: 2025, fiscalPeriod: 3 },
  { baseCurrency: "EUR", quoteCurrency: "USD", rateDate: "2025-03-31", rate: 1.05, method: "average", rateSource: "ECB reference rate (period average)", fiscalYear: 2025, fiscalPeriod: 3 },
];

describe("translate", () => {
  it("translates using the correct method-specific rate and carries provenance", () => {
    const bs = translate({ value: 1_000, currency: "EUR" }, "USD", rates, 2025, 3, "closing");
    expect(bs.value).toBe(1_080);
    expect(bs.rateDate).toBe("2025-03-31");
    expect(bs.rateSource).toBe("ECB reference rate");
    expect(bs.method).toBe("closing");

    const pl = translate({ value: 1_000, currency: "EUR" }, "USD", rates, 2025, 3, "average");
    expect(pl.value).toBe(1_050);
    expect(pl.method).toBe("average");
  });

  it("passes same-currency amounts through unchanged, annotated as identity", () => {
    const m = translate({ value: 500, currency: "USD" }, "USD", rates, 2025, 3, "closing");
    expect(m.value).toBe(500);
    expect(m.method).toBe("none");
    expect(m.rateSource).toMatch(/identity/i);
  });

  it("throws FxRateMissingError rather than defaulting to 1.0 when no rate exists", () => {
    expect(() => translate({ value: 100, currency: "GBP" }, "USD", rates, 2025, 3, "closing")).toThrow(FxRateMissingError);
  });

  it("does not reuse a rate from the wrong method (closing vs average are distinct)", () => {
    // Only closing + average rates exist for P3; requesting "historical" must fail, not silently
    // fall back to one of the other two.
    expect(() => translate({ value: 100, currency: "EUR" }, "USD", rates, 2025, 3, "historical")).toThrow(FxRateMissingError);
  });
});

describe("decomposeFxVariance", () => {
  it("splits a translated variance into rate effect + volume effect + residual, summing exactly to total", () => {
    // Basis: 1,000 EUR @ 1.05 = 1,050 USD. Current: 1,200 EUR @ 1.10 = 1,320 USD.
    const d = decomposeFxVariance({ localValue: 1_000, rate: 1.05 }, { localValue: 1_200, rate: 1.10 });
    expect(d.basisGroupValue).toBe(1_050);
    expect(d.currentGroupValue).toBe(1_320);
    expect(d.totalVariance).toBe(270);
    // rateEffect = 1000 * (1.10-1.05) = 50; volumeEffect = (1200-1000)*1.05 = 210; mix = 270-50-210=10
    expect(d.rateEffect).toBe(50);
    expect(d.volumeEffect).toBe(210);
    expect(d.mixEffect).toBe(10);
    expect(Math.round((d.rateEffect + d.volumeEffect + d.mixEffect) * 100) / 100).toBe(d.totalVariance);
  });

  it("produces zero effects when nothing changed", () => {
    const d = decomposeFxVariance({ localValue: 500, rate: 1.2 }, { localValue: 500, rate: 1.2 });
    expect(d.totalVariance).toBe(0);
    expect(d.rateEffect).toBe(0);
    expect(d.volumeEffect).toBe(0);
    expect(d.mixEffect).toBe(0);
  });

  it("isolates a pure FX-rate move (volume unchanged) entirely into rateEffect", () => {
    const d = decomposeFxVariance({ localValue: 800, rate: 1.0 }, { localValue: 800, rate: 1.2 });
    expect(d.rateEffect).toBe(160);
    expect(d.volumeEffect).toBe(0);
    expect(d.mixEffect).toBe(0);
    expect(d.totalVariance).toBe(160);
  });
});
