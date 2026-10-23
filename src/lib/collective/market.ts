// Part 44 — Internal play-money prediction market: Logarithmic Market Scoring Rule (LMSR).
//
// LMSR (Hanson, 2003) for a binary question with outcomes {YES, NO}:
//   Cost function:  C(q) = b * ln( e^(qYes/b) + e^(qNo/b) )
//   Instantaneous price (implied probability) of YES:
//                    p_YES(q) = e^(qYes/b) / ( e^(qYes/b) + e^(qNo/b) )
//   Cost of a trade changing quantities from q to q' :  cost = C(q') - C(q)
//   `b` (liquidity parameter) bounds the maximum possible loss of the automated market
//   maker at b*ln(2) and controls how much a trade of a given size moves the price —
//   higher b = deeper/more liquid market = smaller price impact per share.
//
// MANIPULATION GUARDS (structural, not just advisory):
//   1. Position limits — `maxPositionShares` caps net exposure per trader per question so
//      no single account (including an "authority signal" account, see Part 44 attack
//      review) can move price arbitrarily far by sheer size; trades exceeding the cap are
//      rejected and flagged.
//   2. Wash-trade detection — flags (a) self round-trips: the same trader flipping sides
//      repeatedly within a short window while their net exposure stays near zero (pumping
//      displayed volume/price without taking real risk), and (b) paired wash trades:
//      two distinct accounts trading matching opposite sides within a short window,
//      which is the classic two-account wash-trading pattern.
//   Both guards are pure, testable functions (`checkPositionLimit`, `detectWashTrades`)
//   so the manipulation-guard tests in `__tests__/market.test.ts` exercise the exact
//   logic the API routes call — no divergence between "what we tested" and "what runs".

export interface LmsrState {
  b: number; // liquidity parameter
  qYes: number;
  qNo: number;
}

export function lmsrCost(state: Pick<LmsrState, "b" | "qYes" | "qNo">): number {
  const { b, qYes, qNo } = state;
  // log-sum-exp for numerical stability
  const m = Math.max(qYes / b, qNo / b);
  return b * (m + Math.log(Math.exp(qYes / b - m) + Math.exp(qNo / b - m)));
}

export function lmsrPriceYes(state: Pick<LmsrState, "b" | "qYes" | "qNo">): number {
  const { b, qYes, qNo } = state;
  const m = Math.max(qYes / b, qNo / b);
  const eYes = Math.exp(qYes / b - m);
  const eNo = Math.exp(qNo / b - m);
  return eYes / (eYes + eNo);
}

export interface TradeResult {
  costOfTrade: number; // amount debited (positive) or credited (negative, for sells)
  newState: LmsrState;
  priceBefore: number;
  priceAfter: number;
}

/**
 * Execute (quote) a trade of `shares` (positive = buy, negative = sell) of `side` against
 * the current LMSR state. Does not mutate `state`.
 */
export function quoteTrade(state: LmsrState, side: "YES" | "NO", shares: number): TradeResult {
  const priceBefore = lmsrPriceYes(state);
  const before = lmsrCost(state);
  const newState: LmsrState = {
    b: state.b,
    qYes: state.qYes + (side === "YES" ? shares : 0),
    qNo: state.qNo + (side === "NO" ? shares : 0),
  };
  const after = lmsrCost(newState);
  const priceAfter = lmsrPriceYes(newState);
  return { costOfTrade: after - before, newState, priceBefore, priceAfter };
}

/** Maximum possible subsidy loss the market operator can incur (worst case), per LMSR theory. */
export function maxOperatorLoss(b: number): number {
  return b * Math.log(2);
}

// ---------------------------------------------------------------------------
// Manipulation guard: position limits
// ---------------------------------------------------------------------------

export interface PositionLimitCheck {
  allowed: boolean;
  reason: string;
  projectedNet: number;
}

/**
 * Net exposure is measured as |yesShares - noShares| after the trade (shares on opposite
 * sides partially net out economically). Rejects trades that would push net exposure
 * beyond `maxPositionShares`.
 */
export function checkPositionLimit(
  currentYesShares: number,
  currentNoShares: number,
  side: "YES" | "NO",
  shares: number,
  maxPositionShares: number,
): PositionLimitCheck {
  const nextYes = currentYesShares + (side === "YES" ? shares : 0);
  const nextNo = currentNoShares + (side === "NO" ? shares : 0);
  const projectedNet = Math.abs(nextYes - nextNo);
  if (projectedNet > maxPositionShares) {
    return {
      allowed: false,
      reason: `projected net position ${projectedNet.toFixed(2)} exceeds limit ${maxPositionShares}`,
      projectedNet,
    };
  }
  return { allowed: true, reason: "within position limit", projectedNet };
}

// ---------------------------------------------------------------------------
// Manipulation guard: wash-trade detection
// ---------------------------------------------------------------------------

export interface TradeRecord {
  id: string;
  traderId: string;
  side: "YES" | "NO";
  shares: number;
  createdAt: number; // epoch ms
}

export interface WashTradeFlag {
  tradeIds: string[];
  traderIds: string[];
  type: "self_round_trip" | "paired_wash";
  detail: string;
}

export interface WashTradeDetectionOptions {
  windowMs?: number;
  /** Net exposure change (in shares) below which a flip-flopping self-trade sequence counts as a round trip. */
  netExposureEpsilon?: number;
  /** Minimum number of alternating trades within the window to call it a round trip. */
  minFlips?: number;
  /** Share-size match tolerance (fraction) for paired wash detection. */
  pairedShareTolerance?: number;
}

const DEFAULT_WASH_OPTIONS: Required<WashTradeDetectionOptions> = {
  windowMs: 10 * 60 * 1000, // 10 minutes
  netExposureEpsilon: 0.5,
  minFlips: 3,
  pairedShareTolerance: 0.05,
};

/**
 * Scans a chronologically sorted trade tape and returns wash-trade flags.
 *  - self_round_trip: one trader alternates YES/NO sides >= minFlips times inside the
 *    window while ending with near-zero net exposure change (no real directional bet),
 *    which is the signature of churning volume/price to mislead observers.
 *  - paired_wash: two different traders submit near-equal-size opposite-side trades
 *    within the window — a classic two-account wash pattern.
 */
export function detectWashTrades(
  trades: TradeRecord[],
  options: WashTradeDetectionOptions = {},
): WashTradeFlag[] {
  const opts = { ...DEFAULT_WASH_OPTIONS, ...options };
  const sorted = [...trades].sort((a, b) => a.createdAt - b.createdAt);
  const flags: WashTradeFlag[] = [];

  // 1) Self round-trips per trader.
  const byTrader = new Map<string, TradeRecord[]>();
  for (const t of sorted) {
    if (!byTrader.has(t.traderId)) byTrader.set(t.traderId, []);
    byTrader.get(t.traderId)!.push(t);
  }
  for (const [traderId, ts] of byTrader) {
    for (let i = 0; i < ts.length; i++) {
      const windowTrades: TradeRecord[] = [ts[i]];
      for (let j = i + 1; j < ts.length; j++) {
        if (ts[j].createdAt - ts[i].createdAt > opts.windowMs) break;
        windowTrades.push(ts[j]);
      }
      if (windowTrades.length < opts.minFlips) continue;
      let flips = 0;
      for (let k = 1; k < windowTrades.length; k++) {
        if (windowTrades[k].side !== windowTrades[k - 1].side) flips++;
      }
      const net = windowTrades.reduce(
        (acc, t) => acc + (t.side === "YES" ? t.shares : -t.shares),
        0,
      );
      if (flips >= opts.minFlips - 1 && Math.abs(net) <= opts.netExposureEpsilon) {
        flags.push({
          tradeIds: windowTrades.map((t) => t.id),
          traderIds: [traderId],
          type: "self_round_trip",
          detail: `trader ${traderId} made ${windowTrades.length} alternating trades (${flips} flips) within ${
            opts.windowMs / 1000
          }s with net exposure change ${net.toFixed(3)} shares`,
        });
      }
    }
  }

  // 2) Paired wash trades between two distinct traders.
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (b.createdAt - a.createdAt > opts.windowMs) break;
      if (a.traderId === b.traderId) continue;
      if (a.side === b.side) continue;
      const sizeDiff = Math.abs(a.shares - b.shares) / Math.max(a.shares, b.shares, 1e-9);
      if (sizeDiff <= opts.pairedShareTolerance) {
        flags.push({
          tradeIds: [a.id, b.id],
          traderIds: [a.traderId, b.traderId],
          type: "paired_wash",
          detail: `traders ${a.traderId} and ${b.traderId} traded matching opposite sides (${a.shares.toFixed(
            2,
          )} vs ${b.shares.toFixed(2)} shares) within ${(b.createdAt - a.createdAt) / 1000}s`,
        });
      }
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Belief-vs-price analysis
// ---------------------------------------------------------------------------

export interface BeliefVsPrice {
  marketPrice: number;
  aggregateBelief: number;
  gap: number; // marketPrice - aggregateBelief
  interpretation: string;
}

export function compareBeliefToPrice(marketPrice: number, aggregateBelief: number): BeliefVsPrice {
  const gap = marketPrice - aggregateBelief;
  let interpretation = "market price and pooled belief are closely aligned";
  if (gap > 0.1) interpretation = "market is more bullish (higher YES price) than the pooled forecaster belief";
  else if (gap < -0.1) interpretation = "market is more bearish (lower YES price) than the pooled forecaster belief";
  return { marketPrice, aggregateBelief, gap, interpretation };
}
