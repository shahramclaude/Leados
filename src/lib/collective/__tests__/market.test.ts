import { describe, expect, it } from "vitest";
import {
  checkPositionLimit,
  compareBeliefToPrice,
  detectWashTrades,
  lmsrCost,
  lmsrPriceYes,
  maxOperatorLoss,
  quoteTrade,
  type TradeRecord,
} from "../market";

describe("LMSR mechanics", () => {
  it("starts at 50/50 price when quantities are equal (zero at creation)", () => {
    const price = lmsrPriceYes({ b: 20, qYes: 0, qNo: 0 });
    expect(price).toBeCloseTo(0.5, 6);
  });

  it("buying YES shares increases the YES price", () => {
    const state = { b: 20, qYes: 0, qNo: 0 };
    const { priceAfter } = quoteTrade(state, "YES", 10);
    expect(priceAfter).toBeGreaterThan(0.5);
  });

  it("larger trades cost monotonically more than smaller trades in the same direction", () => {
    const state = { b: 20, qYes: 0, qNo: 0 };
    const small = quoteTrade(state, "YES", 5).costOfTrade;
    const large = quoteTrade(state, "YES", 15).costOfTrade;
    expect(large).toBeGreaterThan(small);
  });

  it("higher liquidity (b) reduces price impact of the same trade size", () => {
    const shallow = quoteTrade({ b: 5, qYes: 0, qNo: 0 }, "YES", 10);
    const deep = quoteTrade({ b: 100, qYes: 0, qNo: 0 }, "YES", 10);
    const shallowImpact = shallow.priceAfter - shallow.priceBefore;
    const deepImpact = deep.priceAfter - deep.priceBefore;
    expect(deepImpact).toBeLessThan(shallowImpact);
  });

  it("bounds the operator's maximum possible loss at b*ln(2)", () => {
    expect(maxOperatorLoss(20)).toBeCloseTo(20 * Math.log(2), 6);
  });

  it("cost function is consistent with buy-then-sell round trip netting to ~0 cost", () => {
    const state = { b: 20, qYes: 0, qNo: 0 };
    const buy = quoteTrade(state, "YES", 10);
    const sell = quoteTrade(buy.newState, "YES", -10);
    expect(buy.costOfTrade + sell.costOfTrade).toBeCloseTo(0, 6);
    expect(sell.newState.qYes).toBeCloseTo(0, 6);
  });

  it("cost sanity: C(q) is finite and price always within (0,1)", () => {
    const state = { b: 20, qYes: 37, qNo: -12 };
    expect(Number.isFinite(lmsrCost(state))).toBe(true);
    const p = lmsrPriceYes(state);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });
});

describe("manipulation guard: position limits", () => {
  it("allows trades within the limit", () => {
    const check = checkPositionLimit(0, 0, "YES", 50, 100);
    expect(check.allowed).toBe(true);
  });

  it("rejects trades that would exceed the configured position limit", () => {
    const check = checkPositionLimit(80, 0, "YES", 50, 100);
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/exceeds limit/);
  });

  it("nets opposite-side holdings when evaluating exposure", () => {
    // Holding 90 YES and adding 80 NO nets to only 10 exposure, well within a 50 cap.
    const check = checkPositionLimit(90, 0, "NO", 80, 50);
    expect(check.allowed).toBe(true);
  });

  it("blocks an authority-signal account from brute-forcing the price via size alone", () => {
    // Even a very large single order is rejected once it breaches the position limit —
    // this is the structural guard independent of who the trader is (see AI-SESSION-LOG
    // PHASE 5 attack review: authority cannot bypass a position cap by seniority).
    const check = checkPositionLimit(0, 0, "YES", 10_000, 200);
    expect(check.allowed).toBe(false);
  });
});

describe("manipulation guard: wash-trade detection", () => {
  function mkTrade(id: string, traderId: string, side: "YES" | "NO", shares: number, tMs: number): TradeRecord {
    return { id, traderId, side, shares, createdAt: tMs };
  }

  it("flags a single trader rapidly flipping sides with near-zero net exposure (self round trip)", () => {
    const base = Date.now();
    const trades: TradeRecord[] = [
      mkTrade("t1", "trader-A", "YES", 20, base),
      mkTrade("t2", "trader-A", "NO", 20, base + 10_000),
      mkTrade("t3", "trader-A", "YES", 20, base + 20_000),
      mkTrade("t4", "trader-A", "NO", 20, base + 30_000),
    ];
    const flags = detectWashTrades(trades, { windowMs: 60_000, minFlips: 3, netExposureEpsilon: 1 });
    expect(flags.some((f) => f.type === "self_round_trip" && f.traderIds.includes("trader-A"))).toBe(true);
  });

  it("does not flag a trader who makes one directional trade and holds it", () => {
    const base = Date.now();
    const trades: TradeRecord[] = [mkTrade("t1", "trader-B", "YES", 30, base)];
    const flags = detectWashTrades(trades);
    expect(flags).toHaveLength(0);
  });

  it("flags two distinct accounts trading matching opposite sides within the window (paired wash)", () => {
    const base = Date.now();
    const trades: TradeRecord[] = [
      mkTrade("t1", "trader-C", "YES", 50, base),
      mkTrade("t2", "trader-D", "NO", 49, base + 5_000),
    ];
    const flags = detectWashTrades(trades, { windowMs: 60_000, pairedShareTolerance: 0.05 });
    expect(flags.some((f) => f.type === "paired_wash")).toBe(true);
  });

  it("does not flag two accounts trading in the same direction (legitimate crowd agreement)", () => {
    const base = Date.now();
    const trades: TradeRecord[] = [
      mkTrade("t1", "trader-E", "YES", 50, base),
      mkTrade("t2", "trader-F", "YES", 50, base + 5_000),
    ];
    const flags = detectWashTrades(trades);
    expect(flags).toHaveLength(0);
  });

  it("does not flag trades far outside the detection window", () => {
    const base = Date.now();
    const trades: TradeRecord[] = [
      mkTrade("t1", "trader-G", "YES", 50, base),
      mkTrade("t2", "trader-H", "NO", 50, base + 2 * 60 * 60 * 1000), // 2 hours later
    ];
    const flags = detectWashTrades(trades, { windowMs: 60_000 });
    expect(flags).toHaveLength(0);
  });
});

describe("belief-vs-price analysis", () => {
  it("flags markets that are more bullish than pooled belief", () => {
    const result = compareBeliefToPrice(0.8, 0.6);
    expect(result.gap).toBeCloseTo(0.2, 6);
    expect(result.interpretation).toMatch(/bullish/);
  });

  it("reports alignment when market price and belief are close", () => {
    const result = compareBeliefToPrice(0.55, 0.5);
    expect(result.interpretation).toMatch(/aligned/);
  });
});
