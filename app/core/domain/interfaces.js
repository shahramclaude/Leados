/**
 * app/core/domain/interfaces.js — Pure Cross-Boundary Interface, Queue-Network
 * & Operating Pact Engine (Schema v68, ADR-0058).
 *
 * Synthesizes:
 *   1. Jackson (1957) & Whitt (1983, Bell System Technical Journal) Queueing
 *      Network Analyzer (QNA): open network traffic equations (I - R^T)λ = λ_0
 *      via partial-pivoting Gaussian elimination, geometric rework bounce
 *      amplification 1/(1 - r), shared-gate superposition, and departure
 *      variability propagation C_d^2 = (1 - ρ^2) C_a^2 + ρ^2 C_s^2 (the
 *      operational bullwhip; Lee, Padmanabhan & Whang 1997).
 *   2. Pigou (1920) & Naor (1969, Econometrica) Queue Congestion Externalities:
 *      separates private GI/G/1 wait W_q from marginal external delay imposed
 *      on other teams λ ∂W_q/∂λ = W_q / (1 - ρ), plus the +20% Upstream
 *      Local-Acceleration Surge Paradox.
 *   3. Coase (1937), Williamson (1985), Conway (1968), Galbraith (1973) &
 *      Skelton & Pais (2019, Team Topologies): audits declared interaction
 *      modes against empirical rework, utilization and coordination overhead,
 *      and computes a 4-lever Pareto counterfactual redesign frontier.
 *   4. Ostrom (1990) & Gibbons & Henderson (2012, Relational Contracts):
 *      symmetric give-get compliance with Wilson (1927) 95% score intervals
 *      and a Clean-Hands Escalation Gate that blocks one-sided blame when our
 *      own intake hygiene is below floor.
 *   5. Brier (1950) quadratic scoring and base-rate skill over frozen,
 *      content-free prospective Pact Audits.
 *
 * Pure module: zero DOM, zero storage, zero network, zero ambient clock.
 */

import { addDays, dayKey, daysBetween } from '../time.js';

export const INTERFACE_ENGINE_VERSION = '68.0.0';

export const INTERFACE_SIGNAL_IDS = Object.freeze({
  UNSTABLE_GATE: 'INT-01',
  HIGH_EXTERNALITY: 'INT-02',
  DIRTY_HANDS: 'INT-03',
  CREDIBLE_BREACH: 'INT-04',
  BULLWHIP_CONTAGION: 'INT-05',
  CONWAY_MISMATCH: 'INT-06',
  UNDECLARED_HOTSPOT: 'INT-07',
});

export const INTERFACE_MODE_LABELS = Object.freeze({
  'x-as-a-service': 'X-as-a-Service (self-service / bounded SLA)',
  collaboration: 'Collaboration (high-bandwidth joint discovery)',
  facilitating: 'Facilitating (temporary capability enablement)',
  gatekeeper: 'Gatekeeper / Control Review (compliance / risk gate)',
  'ad-hoc': 'Ad-hoc / Unstructured Handoff',
});

const Z_95 = 1.959963984540054;

function round(n, digits = 2) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function normUnit(name) {
  return String(name || '').trim().toLowerCase();
}

export function interfaceConventions(settings = {}) {
  const minExchanges = Number.isFinite(Number(settings.interfaceMinExchanges))
    ? clamp(Math.round(Number(settings.interfaceMinExchanges)), 3, 30)
    : 5;
  const cleanHandsFloorPct = Number.isFinite(Number(settings.interfaceCleanHandsFloorPct))
    ? clamp(Math.round(Number(settings.interfaceCleanHandsFloorPct)), 50, 95)
    : 70;
  const highUtilPct = Number.isFinite(Number(settings.interfaceHighUtilPct))
    ? clamp(Math.round(Number(settings.interfaceHighUtilPct)), 65, 98)
    : 80;
  const bounceWarnPct = Number.isFinite(Number(settings.interfaceBounceWarnPct))
    ? clamp(Math.round(Number(settings.interfaceBounceWarnPct)), 10, 60)
    : 25;
  const externalityThreshold = Number.isFinite(Number(settings.interfaceExternalityThreshold))
    ? clamp(Number(settings.interfaceExternalityThreshold), 0, 1e9)
    : 2500;
  const reviewHorizonDays = Number.isFinite(Number(settings.interfaceReviewHorizonDays))
    ? clamp(Math.round(Number(settings.interfaceReviewHorizonDays)), 7, 180)
    : 28;
  const auditCap = Number.isFinite(Number(settings.interfaceAuditCap))
    ? clamp(Math.round(Number(settings.interfaceAuditCap)), 10, 200)
    : 60;
  return {
    autoPropagate: settings.interfaceAutoPropagate !== false,
    minExchanges,
    cleanHandsFloorPct,
    cleanHandsFloor: cleanHandsFloorPct / 100,
    counterpartySlaFloor: 0.7,
    highUtilPct,
    highUtil: highUtilPct / 100,
    bounceWarnPct,
    bounceWarn: bounceWarnPct / 100,
    externalityThreshold,
    reviewHorizonDays,
    auditCap,
    minSkillAudits: 5,
  };
}

/**
 * Wilson (1927) binomial score interval. Returns proportions in [0, 1].
 */
export function wilsonInterval(successes, total, z = Z_95) {
  if (!Number.isInteger(total) || total <= 0 || !Number.isFinite(successes)) return null;
  const k = clamp(successes, 0, total);
  const n = total;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return {
    rate: round(p, 4),
    lo: round(clamp(centre - half, 0, 1), 4),
    hi: round(clamp(centre + half, 0, 1), 4),
  };
}

/**
 * Solve A x = b by Gaussian elimination with partial pivoting.
 * Returns { ok: true, x } or { ok: false, reason: 'singular' }.
 */
export function solveLinearSystem(matrix, rhs) {
  const n = matrix.length;
  if (n === 0) return { ok: true, x: [] };
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    let maxAbs = Math.abs(a[col][col]);
    for (let row = col + 1; row < n; row += 1) {
      const cand = Math.abs(a[row][col]);
      if (cand > maxAbs) {
        maxAbs = cand;
        pivot = row;
      }
    }
    if (maxAbs < 1e-10) return { ok: false, reason: 'singular' };
    if (pivot !== col) {
      const tmp = a[col];
      a[col] = a[pivot];
      a[pivot] = tmp;
    }
    const diag = a[col][col];
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / diag;
      if (factor === 0) continue;
      for (let j = col; j <= n; j += 1) {
        a[row][j] -= factor * a[col][j];
      }
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = a[i][n];
    for (let j = i + 1; j < n; j += 1) sum -= a[i][j] * x[j];
    const val = sum / a[i][i];
    if (!Number.isFinite(val)) return { ok: false, reason: 'singular' };
    x[i] = val;
  }
  return { ok: true, x };
}

/**
 * Evaluate symmetric relational-contract compliance on a single pact.
 * Below `conventions.minExchanges`, verdicts are withheld (`insufficient-evidence`)
 * and only raw counts are reported.
 */
export function evaluatePactCompliance(pact, conventions = interfaceConventions()) {
  const exchanges = Array.isArray(pact?.exchanges) ? pact.exchanges : [];
  const total = exchanges.length;
  const cleanCount = exchanges.filter((e) => e.intakeClean === true).length;
  const dirtyCount = total - cleanCount;
  const bouncedCount = exchanges.filter((e) => e.bounced === true).length;
  const settled = exchanges.filter((e) => typeof e.metSla === 'boolean');
  const settledCount = settled.length;
  const slaMetCount = settled.filter((e) => e.metSla === true).length;
  const slaMissedCount = settledCount - slaMetCount;
  const jointCleanCount = settled.filter((e) => e.intakeClean === true && e.metSla === true && !e.bounced).length;

  const turnaroundSamples = exchanges
    .map((e) => e.turnaroundDays)
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  const medianTurnaroundDays = turnaroundSamples.length
    ? round(
        turnaroundSamples.length % 2 === 1
          ? turnaroundSamples[(turnaroundSamples.length - 1) / 2]
          : (turnaroundSamples[turnaroundSamples.length / 2 - 1] + turnaroundSamples[turnaroundSamples.length / 2]) / 2,
        2,
      )
    : null;

  const enoughIntake = total >= conventions.minExchanges;
  const enoughSettled = settledCount >= conventions.minExchanges;

  const ourInterval = enoughIntake ? wilsonInterval(cleanCount, total) : null;
  const theirInterval = enoughSettled ? wilsonInterval(slaMetCount, settledCount) : null;
  const bounceInterval = enoughIntake ? wilsonInterval(bouncedCount, total) : null;
  const jointInterval = enoughSettled ? wilsonInterval(jointCleanCount, settledCount) : null;

  const ourRate = ourInterval ? ourInterval.rate : null;
  const theirRate = theirInterval ? theirInterval.rate : null;
  const reciprocityGapPp = ourRate !== null && theirRate !== null
    ? round((ourRate - theirRate) * 100, 1)
    : null;

  let verdict = 'insufficient-evidence';
  let cleanHandsHolds = null;
  if (enoughIntake && enoughSettled) {
    cleanHandsHolds = ourRate >= conventions.cleanHandsFloor;
    const theirOk = theirRate >= conventions.counterpartySlaFloor;
    if (cleanHandsHolds && theirOk) {
      verdict = ourRate >= 0.8 && theirRate >= 0.8 ? 'mutual-fidelity' : 'within-guardrails';
    } else if (cleanHandsHolds && !theirOk) {
      verdict = 'clean-hands-counterparty-breach';
    } else if (!cleanHandsHolds && !theirOk) {
      verdict = 'dirty-hands-asymmetry';
    } else {
      verdict = 'our-intake-breach';
    }
  } else if (enoughIntake && ourRate < conventions.cleanHandsFloor) {
    cleanHandsHolds = false;
    verdict = 'our-intake-breach';
  }

  return {
    totalExchanges: total,
    settledExchanges: settledCount,
    cleanCount,
    dirtyCount,
    slaMetCount,
    slaMissedCount,
    bouncedCount,
    jointCleanCount,
    medianTurnaroundDays,
    reportable: enoughIntake && enoughSettled,
    ourIntake: ourInterval,
    theirSla: theirInterval,
    bounce: bounceInterval,
    jointClean: jointInterval,
    reciprocityGapPp,
    cleanHandsHolds,
    verdict,
  };
}

/**
 * Solve the open queueing network across active pacts (Jackson 1957; Whitt 1983)
 * and compute Pigou (1920) / Naor (1969) congestion externalities per pact and
 * per shared target gate.
 */
export function solveQueueNetwork(pacts = [], { now = new Date(), conventions = interfaceConventions() } = {}) {
  const active = (Array.isArray(pacts) ? pacts : []).filter((p) => p && p.status !== 'retired');
  const today = dayKey(now);
  const windowStart = dayKey(addDays(now, -28));

  // Discover nodes and map pacts.
  const unitNames = new Map();
  for (const p of active) {
    const sKey = normUnit(p.sourceUnit);
    const tKey = normUnit(p.targetUnit);
    if (sKey && !unitNames.has(sKey)) unitNames.set(sKey, p.sourceUnit);
    if (tKey && !unitNames.has(tKey)) unitNames.set(tKey, p.targetUnit);
  }
  const unitKeys = [...unitNames.keys()];
  const unitIdx = new Map(unitKeys.map((k, idx) => [k, idx]));

  // Pre-compute each edge's base arrival and effective rework rate.
  const edgeInputs = active.map((pact) => {
    const compliance = evaluatePactCompliance(pact, conventions);
    const recentCount = (pact.exchanges || []).filter(
      (e) => e.recordedOn >= windowStart && e.recordedOn <= today,
    ).length;
    let baseArrival = pact.externalArrivalPerWeek;
    let arrivalSource = 'declared';
    if (baseArrival === null) {
      if (recentCount >= 3) {
        baseArrival = round(recentCount / 4, 3);
        arrivalSource = 'observed-28d';
      } else {
        arrivalSource = 'unparameterized';
      }
    }
    const effectiveRework = compliance.bounce ? compliance.bounce.rate : pact.reworkRate;
    const reworkSource = compliance.bounce ? 'empirical-exchanges' : 'declared';
    const reworkMultiplier = effectiveRework < 0.99 ? 1 / (1 - effectiveRework) : null;
    return {
      pact,
      compliance,
      baseArrival,
      arrivalSource,
      declaredReworkRate: pact.reworkRate,
      empiricalBounceRate: compliance.bounce ? compliance.bounce.rate : null,
      effectiveReworkRate: round(effectiveRework, 4),
      reworkSource,
      reworkMultiplier: reworkMultiplier !== null ? round(reworkMultiplier, 4) : null,
    };
  });

  // Build node-level Jackson/Whitt routing matrix for chained units:
  // If unit U receives upstream flow AND routes outbound flow along downstream
  // pacts, downstream continuation adds to downstream gate arrivals. We solve
  // (I - R^T) Λ_relay = Λ_in for multi-hop cascade visibility while keeping
  // declared edge exogenous rates exact.
  const m = unitKeys.length;
  const exogNodeIn = new Array(m).fill(0);
  const outEdgesByUnit = new Map(unitKeys.map((k) => [k, []]));
  const inEdgesByUnit = new Map(unitKeys.map((k) => [k, []]));
  for (const e of edgeInputs) {
    const sKey = normUnit(e.pact.sourceUnit);
    const tKey = normUnit(e.pact.targetUnit);
    outEdgesByUnit.get(sKey)?.push(e);
    inEdgesByUnit.get(tKey)?.push(e);
    if (e.baseArrival !== null && e.reworkMultiplier !== null) {
      exogNodeIn[unitIdx.get(tKey)] += e.baseArrival * e.reworkMultiplier;
    }
  }

  // Construct gentle coupling routing matrix R for cycle / spectral check:
  // when a pact has rework r_e across (s -> t), items cycle s <-> t with gain r_e.
  const identityMinusRt = Array.from({ length: m }, (_, i) =>
    Array.from({ length: m }, (__, j) => (i === j ? 1 : 0)),
  );
  for (const e of edgeInputs) {
    const i = unitIdx.get(normUnit(e.pact.sourceUnit));
    const j = unitIdx.get(normUnit(e.pact.targetUnit));
    if (i === undefined || j === undefined || i === j) continue;
    // Outbound rework bounce fraction returning from target j to source i:
    const r = clamp(e.effectiveReworkRate || 0, 0, 0.95);
    const outCount = Math.max(1, (outEdgesByUnit.get(normUnit(e.pact.targetUnit)) || []).length + 1);
    identityMinusRt[i][j] -= (r * 0.5) / outCount;
  }
  const linearSolve = solveLinearSystem(identityMinusRt, exogNodeIn);
  const networkSpectralStable = linearSolve.ok && linearSolve.x.every((v) => v >= -1e-6);

  // Two-pass Whitt QNA:
  // Pass 1 computes shared-gate arrival superposition & utilization at every targetUnit.
  // Pass 2 propagates upstream departure variability C_d^2 into downstream edges
  // whose sourceUnit is itself a solved upstream gate!
  const gateStats = new Map();

  const computeGates = (upstreamDepartureCv2 = new Map()) => {
    const nextGates = new Map();
    for (const tKey of unitKeys) {
      const inbound = inEdgesByUnit.get(tKey) || [];
      if (!inbound.length) continue;
      const parameterized = inbound.filter((e) => e.baseArrival !== null && e.pact.serviceCapacityPerWeek !== null);
      if (!parameterized.length) {
        nextGates.set(tKey, {
          unitKey: tKey,
          unitName: unitNames.get(tKey),
          inboundCount: inbound.length,
          parameterized: false,
          totalEffectiveArrival: null,
          serviceCapacity: null,
          rho: null,
          unstable: false,
          arrivalCv2: null,
          serviceCv2: null,
          departureCv2: null,
          bullwhipRatio: null,
          privateQueueWaitDays: null,
          marginalExternalWaitDays: null,
          marginalSocialWaitDays: null,
          socialToPrivateRatio: null,
        });
        continue;
      }

      let totalLambdaEff = 0;
      let weightedCa2 = 0;
      let weightedCs2 = 0;
      // Shared gate service capacity: when multiple pacts hit the same target gate,
      // use the maximum declared gate capacity across pacts (or sole pact's capacity)
      // because pacts declare the gate's service capacity μ_gate.
      let gateCapacity = 0;
      for (const e of parameterized) {
        const sKey = normUnit(e.pact.sourceUnit);
        const lambdaEff = e.baseArrival * (e.reworkMultiplier || 1);
        totalLambdaEff += lambdaEff;
        const declaredCa2 = (e.pact.arrivalCv ?? 1) ** 2;
        const upstreamCd2 = upstreamDepartureCv2.get(sKey);
        // Whitt QNA: if sourceUnit is an upstream gate with solved C_d^2, blend
        // upstream departure variability with declared arrival variability.
        const edgeCa2 = upstreamCd2 !== undefined ? 0.5 * declaredCa2 + 0.5 * upstreamCd2 : declaredCa2;
        const edgeCs2 = (e.pact.serviceCv ?? 1) ** 2;
        weightedCa2 += lambdaEff * edgeCa2;
        weightedCs2 += lambdaEff * edgeCs2;
        gateCapacity = Math.max(gateCapacity, e.pact.serviceCapacityPerWeek);
      }

      const ca2 = totalLambdaEff > 0 ? weightedCa2 / totalLambdaEff : 1;
      const cs2 = totalLambdaEff > 0 ? weightedCs2 / totalLambdaEff : 1;
      const rho = gateCapacity > 0 ? totalLambdaEff / gateCapacity : null;
      const unstable = rho !== null && (rho >= 1 || !networkSpectralStable);
      const serviceDays = gateCapacity > 0 ? 7 / gateCapacity : null;

      let departureCv2 = null;
      let bullwhipRatio = null;
      let privateQueueWaitDays = null;
      let marginalExternalWaitDays = null;
      let marginalSocialWaitDays = null;
      let socialToPrivateRatio = null;

      if (rho !== null && !unstable) {
        const rho2 = rho * rho;
        departureCv2 = (1 - rho2) * ca2 + rho2 * cs2;
        bullwhipRatio = ca2 > 0.01 ? departureCv2 / ca2 : null;
        const wqWeeks = rho === 0 ? 0 : (rho / (1 - rho)) * ((ca2 + cs2) / 2) * (1 / gateCapacity);
        const wqDays = wqWeeks * 7;
        const extDays = rho > 0 ? wqDays / (1 - rho) : 0;
        privateQueueWaitDays = round(wqDays, 2);
        marginalExternalWaitDays = round(extDays, 2);
        marginalSocialWaitDays = round(wqDays + extDays, 2);
        socialToPrivateRatio = round((2 - rho) / (1 - rho), 2);
      } else if (unstable) {
        // At saturation (ρ → 1), departure variability approaches service variability C_s^2.
        departureCv2 = cs2;
        bullwhipRatio = ca2 > 0.01 ? cs2 / ca2 : null;
      }

      nextGates.set(tKey, {
        unitKey: tKey,
        unitName: unitNames.get(tKey),
        inboundCount: inbound.length,
        parameterized: true,
        totalEffectiveArrival: round(totalLambdaEff, 3),
        serviceCapacity: round(gateCapacity, 3),
        serviceDays: serviceDays !== null ? round(serviceDays, 2) : null,
        rho: rho !== null ? round(rho, 4) : null,
        unstable,
        arrivalCv2: round(ca2, 3),
        serviceCv2: round(cs2, 3),
        departureCv2: departureCv2 !== null ? round(departureCv2, 3) : null,
        bullwhipRatio: bullwhipRatio !== null ? round(bullwhipRatio, 3) : null,
        privateQueueWaitDays,
        marginalExternalWaitDays,
        marginalSocialWaitDays,
        socialToPrivateRatio,
      });
    }
    return nextGates;
  };

  const pass1 = computeGates(new Map());
  const depMap = new Map();
  for (const [k, g] of pass1) {
    if (g.departureCv2 !== null) depMap.set(k, g.departureCv2);
  }
  const pass2 = computeGates(depMap);
  for (const [k, g] of pass2) gateStats.set(k, g);

  // Build per-pact queue & externality analysis.
  const pactRows = edgeInputs.map((e) => {
    const { pact, compliance } = e;
    const tKey = normUnit(pact.targetUnit);
    const gate = gateStats.get(tKey) || null;
    const parameterized = e.baseArrival !== null && pact.serviceCapacityPerWeek !== null && gate?.parameterized;
    const effectiveArrival = e.baseArrival !== null && e.reworkMultiplier !== null
      ? round(e.baseArrival * e.reworkMultiplier, 3)
      : null;
    const reworkAddedLoad = e.baseArrival !== null && effectiveArrival !== null
      ? round(effectiveArrival - e.baseArrival, 3)
      : null;

    let privateWaitDays = null;
    let leadTimeDays = null;
    let flowEfficiencyPct = null;
    let expectedWip = null;
    let marginalExternalityDaysPerItem = null;
    let weeklyExternalityItemDays = null;
    let weeklyPrivateCost = null;
    let weeklyExternalityCost = null;
    let surgeParadox = null;

    if (parameterized && gate) {
      if (!gate.unstable && gate.privateQueueWaitDays !== null) {
        privateWaitDays = gate.privateQueueWaitDays;
        leadTimeDays = round(privateWaitDays + (gate.serviceDays || 0), 2);
        flowEfficiencyPct = leadTimeDays > 0 ? round(((gate.serviceDays || 0) / leadTimeDays) * 100, 1) : 100;
        expectedWip = round((effectiveArrival * leadTimeDays) / 7, 2);
        marginalExternalityDaysPerItem = gate.marginalExternalWaitDays;
        weeklyExternalityItemDays = round(effectiveArrival * marginalExternalityDaysPerItem, 2);

        if (pact.weeklyDelayPrice !== null && pact.currency) {
          weeklyPrivateCost = round(effectiveArrival * (privateWaitDays / 7) * pact.weeklyDelayPrice, 2);
          weeklyExternalityCost = round(effectiveArrival * (marginalExternalityDaysPerItem / 7) * pact.weeklyDelayPrice, 2);
        }

        // +20% Upstream Local-Acceleration Surge Paradox (LinearB/Faros 2026):
        // Upstream unit speeds up local output by +20% (saving ~16.7% of one
        // upstream touch cycle ≈ 0.5 day typical), pushing +20% arrival volume
        // into the unscaled boundary gate.
        const deltaLambda = 0.2 * effectiveArrival;
        const newGateArrival = gate.totalEffectiveArrival + deltaLambda;
        const newRho = newGateArrival / gate.serviceCapacity;
        const assumedUpstreamSavedDays = round(Math.min(1.5, Math.max(0.25, (gate.serviceDays || 1) * 0.2)), 2);
        if (newRho >= 1) {
          surgeParadox = {
            surgePct: 20,
            newRho: round(newRho, 4),
            blowup: true,
            newWaitDays: null,
            addedDownstreamWaitDays: null,
            upstreamSavedDays: assumedUpstreamSavedDays,
            netLeadTimeDeltaDays: null,
            paradoxTriggered: true,
          };
        } else {
          const newWqDays = (newRho / (1 - newRho)) * ((gate.arrivalCv2 + gate.serviceCv2) / 2) * (7 / gate.serviceCapacity);
          const addedWait = newWqDays - privateWaitDays;
          const netDelta = addedWait - assumedUpstreamSavedDays;
          surgeParadox = {
            surgePct: 20,
            newRho: round(newRho, 4),
            blowup: false,
            newWaitDays: round(newWqDays, 2),
            addedDownstreamWaitDays: round(addedWait, 2),
            upstreamSavedDays: assumedUpstreamSavedDays,
            netLeadTimeDeltaDays: round(netDelta, 2),
            paradoxTriggered: netDelta > 0,
          };
        }
      } else if (gate.unstable) {
        surgeParadox = {
          surgePct: 20,
          newRho: gate.rho !== null ? round(gate.rho * 1.2, 4) : null,
          blowup: true,
          newWaitDays: null,
          addedDownstreamWaitDays: null,
          upstreamSavedDays: null,
          netLeadTimeDeltaDays: null,
          paradoxTriggered: true,
        };
      }
    }

    const modeAudit = auditInterfaceMode(pact, {
      gate,
      effectiveArrival,
      effectiveReworkRate: e.effectiveReworkRate,
      compliance,
      conventions,
    });
    const redesigns = parameterized && gate
      ? simulateBoundaryRedesigns(pact, {
          baseArrival: e.baseArrival,
          effectiveReworkRate: e.effectiveReworkRate,
          gate,
        })
      : [];

    return {
      pact,
      parameterized,
      arrivalSource: e.arrivalSource,
      reworkSource: e.reworkSource,
      baseArrival: e.baseArrival,
      effectiveReworkRate: e.effectiveReworkRate,
      reworkMultiplier: e.reworkMultiplier,
      effectiveArrival,
      reworkAddedLoad,
      gate,
      queue: {
        rho: gate?.rho ?? null,
        unstable: Boolean(gate?.unstable),
        arrivalCv2: gate?.arrivalCv2 ?? null,
        serviceCv2: gate?.serviceCv2 ?? null,
        departureCv2: gate?.departureCv2 ?? null,
        bullwhipRatio: gate?.bullwhipRatio ?? null,
        privateWaitDays,
        leadTimeDays,
        flowEfficiencyPct,
        expectedWip,
        marginalExternalityDaysPerItem,
        socialToPrivateRatio: gate?.socialToPrivateRatio ?? null,
        weeklyExternalityItemDays,
        currency: pact.weeklyDelayPrice !== null ? pact.currency : null,
        weeklyPrivateCost,
        weeklyExternalityCost,
      },
      surgeParadox,
      compliance,
      modeAudit,
      redesigns,
    };
  });

  return {
    networkSpectralStable,
    units: unitKeys.map((k) => ({
      key: k,
      name: unitNames.get(k),
      gate: gateStats.get(k) || null,
      outboundCount: (outEdgesByUnit.get(k) || []).length,
      inboundCount: (inEdgesByUnit.get(k) || []).length,
    })),
    gates: [...gateStats.values()],
    rows: pactRows,
  };
}

/**
 * Conway (1968) / Skelton & Pais (2019, Team Topologies) / Coase (1937)
 * interaction-mode mismatch audit.
 */
export function auditInterfaceMode(pact, { gate, effectiveArrival, effectiveReworkRate, compliance, conventions }) {
  const mode = pact.mode || 'ad-hoc';
  const rho = gate?.rho ?? null;
  const bounce = effectiveReworkRate ?? pact.reworkRate ?? 0;
  const syncHours = pact.coordinationHoursPerWeek ?? 0;
  const slaBreached = compliance?.theirSla ? compliance.theirSla.rate < conventions.counterpartySlaFloor : false;

  if (
    mode === 'x-as-a-service' &&
    (bounce >= conventions.bounceWarn || (rho !== null && rho >= conventions.highUtil) || syncHours >= 4 || slaBreached)
  ) {
    return {
      code: 'fake-xaas',
      aligned: false,
      recommendedMode: bounce >= 0.3 ? 'facilitating' : 'x-as-a-service',
      headline: 'Blocking ticket queue masquerading as X-as-a-Service',
      detail: `Declared self-service, yet bounce is ${Math.round(bounce * 100)}%, sync load is ${syncHours}h/wk${rho !== null ? `, and gate utilization is ${Math.round(rho * 100)}%` : ''}. Either harden the intake contract & automate self-service or run a time-boxed Facilitating sprint to remove ambiguity.`,
    };
  }
  if (mode === 'collaboration' && bounce < 0.12 && syncHours >= 4 && (effectiveArrival ?? 0) >= 2) {
    return {
      code: 'chronic-collaboration-tax',
      aligned: false,
      recommendedMode: 'x-as-a-service',
      headline: 'Coasean over-coordination on routine flow',
      detail: `Low rework (${Math.round(bounce * 100)}%) across ${effectiveArrival}/wk requests does not justify ${syncHours}h/wk of synchronous Collaboration meetings. Codify the interface into X-as-a-Service with an intake checklist and reclaim sync hours.`,
    };
  }
  if (mode === 'gatekeeper' && bounce >= 0.3) {
    return {
      code: 'premature-standardization',
      aligned: false,
      recommendedMode: 'facilitating',
      headline: 'High-bounce control gate needs upstream capability transfer',
      detail: `${Math.round(bounce * 100)}% of submissions bounce at the review gate, multiplying arrival load by ${round(1 / (1 - bounce), 2)}×. Shift temporarily to Facilitating mode to embed the checklist/guardrails upstream.`,
    };
  }
  if (mode === 'ad-hoc' && ((effectiveArrival ?? 0) >= 2 || (pact.exchanges || []).length >= 3)) {
    return {
      code: 'unowned-adhoc-drift',
      aligned: false,
      recommendedMode: bounce >= 0.25 ? 'collaboration' : 'x-as-a-service',
      headline: 'Recurring cross-team flow running without an explicit Team API',
      detail: `Recurring boundary traffic is running on ad-hoc interruptions. Declare an explicit ${bounce >= 0.25 ? 'Collaboration' : 'X-as-a-Service'} mode with symmetric intake and turnaround clauses.`,
    };
  }
  return {
    code: 'aligned',
    aligned: true,
    recommendedMode: mode,
    headline: 'Declared interaction mode matches current flow profile',
    detail: `${INTERFACE_MODE_LABELS[mode] || mode} aligns with recorded bounce (${Math.round(bounce * 100)}%) and ${syncHours}h/wk coordination overhead.`,
  };
}

/**
 * Evaluate 4 concrete structural boundary interventions and mark the exact
 * Pareto-undominated frontier across (expectedWaitDays, externalityItemDays,
 * coordinationHoursPerWeek) — never collapsing into an arbitrary weighted sum.
 */
export function simulateBoundaryRedesigns(pact, { baseArrival, effectiveReworkRate, gate }) {
  if (baseArrival === null || !pact.serviceCapacityPerWeek || !gate) return [];
  const otherArrival = Math.max(0, (gate.totalEffectiveArrival || 0) - baseArrival / (1 - effectiveReworkRate));
  const mu0 = gate.serviceCapacity;
  const ca20 = gate.arrivalCv2 ?? 1;
  const cs20 = gate.serviceCv2 ?? 1;
  const sync0 = pact.coordinationHoursPerWeek ?? 0;

  const evalLever = ({ id, label, summary, lambdaBase, rework, mu, ca2, cs2, syncHours }) => {
    const edgeEff = lambdaBase / (1 - clamp(rework, 0, 0.95));
    const totalEff = otherArrival + edgeEff;
    const rho = totalEff / mu;
    if (rho >= 1) {
      return {
        id,
        label,
        summary,
        stabilizes: false,
        rho: round(rho, 4),
        waitDays: null,
        externalityItemDays: null,
        syncHours: round(syncHours, 2),
        weeklyExternalitySaved: null,
        currency: pact.weeklyDelayPrice !== null ? pact.currency : null,
        paretoOptimal: false,
      };
    }
    const wqDays = (rho / (1 - rho)) * ((ca2 + cs2) / 2) * (7 / mu);
    const extPerItem = rho > 0 ? wqDays / (1 - rho) : 0;
    const extItemDays = edgeEff * extPerItem;
    let weeklyExternalitySaved = null;
    if (pact.weeklyDelayPrice !== null && pact.currency && !gate.unstable && gate.marginalExternalWaitDays !== null) {
      const baseExtCost = (baseArrival / (1 - effectiveReworkRate)) * (gate.marginalExternalWaitDays / 7) * pact.weeklyDelayPrice;
      const newExtCost = edgeEff * (extPerItem / 7) * pact.weeklyDelayPrice;
      weeklyExternalitySaved = round(baseExtCost - newExtCost, 2);
    }
    return {
      id,
      label,
      summary,
      stabilizes: true,
      rho: round(rho, 4),
      waitDays: round(wqDays, 2),
      externalityItemDays: round(extItemDays, 2),
      syncHours: round(syncHours, 2),
      weeklyExternalitySaved,
      currency: pact.weeklyDelayPrice !== null ? pact.currency : null,
      paretoOptimal: false,
    };
  };

  const candidates = [
    evalLever({
      id: 'intake-dor',
      label: 'Intake Definition-of-Ready (halve rework bounce)',
      summary: 'Enforce pre-flight spec checklist on our side to cut bounce-back rework by 50% without adding headcount.',
      lambdaBase: baseArrival,
      rework: effectiveReworkRate * 0.5,
      mu: mu0,
      ca2: ca20,
      cs2: cs20 * 0.85,
      syncHours: sync0,
    }),
    evalLever({
      id: 'batch-smoothing',
      label: 'Cadence Batch Smoothing (cut arrival burstiness)',
      summary: 'Replace ad-hoc rush drops with scheduled intake windows (C_a ≤ 0.5) while holding capacity fixed.',
      lambdaBase: baseArrival,
      rework: effectiveReworkRate,
      mu: mu0,
      ca2: Math.min(ca20, 0.25),
      cs2: cs20,
      syncHours: Math.max(0.5, sync0 * 0.9),
    }),
    evalLever({
      id: 'xaas-decouple',
      label: 'Self-Service XaaS Decoupling (-35% gate volume, -50% sync)',
      summary: 'Automate or pre-approve standard low-risk requests via self-service guardrails, leaving only exceptions on the gate.',
      lambdaBase: baseArrival * 0.65,
      rework: effectiveReworkRate * 0.7,
      mu: mu0,
      ca2: ca20,
      cs2: cs20,
      syncHours: sync0 * 0.5,
    }),
    evalLever({
      id: 'capacity-buffer',
      label: 'Dedicated Review Capacity (+25% gate throughput)',
      summary: 'Add rotating embedded reviewer or protected triage block (+25% μ) at the cost of +1.5h/wk coordination.',
      lambdaBase: baseArrival,
      rework: effectiveReworkRate,
      mu: mu0 * 1.25,
      ca2: ca20,
      cs2: cs20,
      syncHours: sync0 + 1.5,
    }),
  ];

  // Mark exact Pareto frontier among stabilizing levers (minimize waitDays, externalityItemDays, syncHours).
  const feasible = candidates.filter((c) => c.stabilizes);
  for (const a of feasible) {
    const dominated = feasible.some(
      (b) =>
        b.id !== a.id &&
        b.waitDays <= a.waitDays &&
        b.externalityItemDays <= a.externalityItemDays &&
        b.syncHours <= a.syncHours &&
        (b.waitDays < a.waitDays || b.externalityItemDays < a.externalityItemDays || b.syncHours < a.syncHours),
    );
    a.paretoOptimal = !dominated;
  }
  return candidates;
}

/**
 * Harvest empirical cross-boundary friction directly from existing workspace
 * collections (`cases`, `decisions`, `delegations`, `dependencies`, `negotiations`,
 * `people`), surfacing undeclared boundary hotspots and linking evidence to
 * declared pacts. Zero duplicate data entry required.
 */
export function harvestBoundaryTelemetry(state = {}) {
  const peopleById = new Map((state.people || []).filter(Boolean).map((p) => [p.id, p]));
  const pacts = (state.interfacePacts || []).filter((p) => p && p.status !== 'retired');
  const declaredPairs = new Set();
  const targetUnits = new Set();
  for (const p of pacts) {
    declaredPairs.add(`${normUnit(p.sourceUnit)}->${normUnit(p.targetUnit)}`);
    targetUnits.add(normUnit(p.targetUnit));
  }

  const hotspots = new Map();
  const recordHotspot = (fromUnit, toUnit, kind, refId, title) => {
    const u = String(fromUnit || '').trim();
    const v = String(toUnit || '').trim();
    if (!u || !v || normUnit(u) === normUnit(v)) return;
    const key = `${normUnit(u)}->${normUnit(v)}`;
    if (!hotspots.has(key)) {
      hotspots.set(key, {
        key,
        sourceUnit: u,
        targetUnit: v,
        coveredByPact: declaredPairs.has(key) || targetUnits.has(normUnit(v)),
        cases: 0,
        decisions: 0,
        delegations: 0,
        dependencies: 0,
        negotiations: 0,
        totalSignals: 0,
        examples: [],
      });
    }
    const row = hotspots.get(key);
    row[kind] += 1;
    row.totalSignals += 1;
    if (row.examples.length < 4 && title) {
      row.examples.push({ kind, id: refId, title: String(title).slice(0, 120) });
    }
  };

  const leaderUnit = String(state.settings?.teamName || 'Core Team').trim();

  for (const c of state.cases || []) {
    if (!c || ['resolved', 'closed'].includes(c.status)) continue;
    const owner = c.ownerId ? peopleById.get(c.ownerId) : null;
    const fromUnit = owner?.team || leaderUnit;
    if (c.type === 'escalation' || Array.isArray(c.stakeholders) && c.stakeholders.length > 0) {
      for (const sh of c.stakeholders || []) {
        const shUnit = sh?.org || sh?.role || sh?.name;
        if (shUnit) recordHotspot(fromUnit, shUnit, 'cases', c.id, c.title);
      }
    }
  }

  for (const dep of state.dependencies || []) {
    if (!dep || dep.status === 'retired') continue;
    const steward = dep.stewardId ? peopleById.get(dep.stewardId) : null;
    const fromUnit = steward?.team || leaderUnit;
    const toUnit = dep.vendor || dep.name;
    if (toUnit && (dep.criticality === 'critical' || dep.criticality === 'high' || (dep.ttrDays ?? 0) > (dep.ttsDays ?? Infinity))) {
      recordHotspot(fromUnit, toUnit, 'dependencies', dep.id, dep.name);
    }
  }

  for (const neg of state.negotiations || []) {
    if (!neg || ['closed', 'archived', 'agreed'].includes(neg.status)) continue;
    const owner = neg.ownerId ? peopleById.get(neg.ownerId) : null;
    const fromUnit = owner?.team || leaderUnit;
    const cp = neg.counterpartyOrg || neg.counterparty;
    if (cp) recordHotspot(fromUnit, cp, 'negotiations', neg.id, neg.title);
  }

  for (const d of state.decisions || []) {
    if (!d || d.chosen) continue;
    if (d.driver && d.approver && normUnit(d.driver) !== normUnit(d.approver)) {
      const driverPerson = (state.people || []).find((p) => normUnit(p?.name) === normUnit(d.driver));
      const approverPerson = (state.people || []).find((p) => normUnit(p?.name) === normUnit(d.approver));
      const u = driverPerson?.team || d.driver;
      const v = approverPerson?.team || d.approver;
      if (normUnit(u) !== normUnit(v)) {
        recordHotspot(u, v, 'decisions', d.id, d.title);
      }
    }
  }

  for (const del of state.delegations || []) {
    if (!del || del.status === 'completed') continue;
    const delegate = del.personId ? peopleById.get(del.personId) : null;
    if (delegate?.team && normUnit(delegate.team) !== normUnit(leaderUnit)) {
      recordHotspot(leaderUnit, delegate.team, 'delegations', del.id, del.title);
    }
  }

  const all = [...hotspots.values()].sort((a, b) => b.totalSignals - a.totalSignals);
  return {
    all,
    undeclared: all.filter((h) => !h.coveredByPact && h.totalSignals >= 2),
  };
}

/**
 * Deterministic, principled, blame-free boundary reset script (Fisher & Ury 1981;
 * Gibbons & Henderson 2012 relational clarity). Never auto-sent; always opens
 * with our own factual intake record when our clean-hands rate is imperfect.
 */
export function buildBoundaryResetScript(row) {
  if (!row?.pact) return '';
  const { pact, compliance, queue, modeAudit, redesigns } = row;
  const ourPct = compliance.ourIntake ? `${Math.round(compliance.ourIntake.rate * 100)}%` : `${compliance.cleanCount}/${compliance.totalExchanges}`;
  const theirPct = compliance.theirSla ? `${Math.round(compliance.theirSla.rate * 100)}%` : `${compliance.slaMetCount}/${compliance.settledExchanges}`;
  const bestLever = (redesigns || []).find((r) => r.paretoOptimal) || redesigns?.[0] || null;

  const lines = [
    `Boundary Operating Pact Reset — ${pact.sourceUnit} ↔ ${pact.targetUnit} (“${pact.title}”)`,
    '',
    '1. Shared factual baseline (system dynamics, not personal blame):',
    `   • Recorded exchanges: ${compliance.totalExchanges} (${compliance.settledExchanges} settled against ${pact.turnaroundDays}-day turnaround window).`,
    `   • Our intake-spec fidelity (${pact.sourceUnit}): ${ourPct} (${compliance.cleanCount}/${compliance.totalExchanges} met agreed intake spec).`,
    `   • Counterparty turnaround within ${pact.turnaroundDays}d (${pact.targetUnit}): ${theirPct} (${compliance.slaMetCount}/${compliance.settledExchanges}); bounce/rework count: ${compliance.bouncedCount}.`,
  ];

  if (queue.rho !== null) {
    lines.push(
      queue.unstable
        ? `   • Queue physics: effective load (${row.effectiveArrival}/wk incl. ${Math.round(row.effectiveReworkRate * 100)}% rework) exceeds capacity (${pact.serviceCapacityPerWeek}/wk, ρ = ${Math.round(queue.rho * 100)}%). No amount of heroic effort clears an unstable queue without changing intake or capacity.`
        : `   • Queue physics: utilization ρ = ${Math.round(queue.rho * 100)}%, private wait = ${queue.privateWaitDays}d, marginal congestion externality imposed on other queued work = ${queue.marginalExternalityDaysPerItem}d/item (${queue.socialToPrivateRatio}× social-to-private ratio).`,
    );
  }

  lines.push('');
  if (compliance.verdict === 'dirty-hands-asymmetry' || compliance.verdict === 'our-intake-breach') {
    lines.push(
      '2. Clean-hands ownership first (what we are fixing on our side immediately):',
      `   • We did NOT consistently meet our own intake commitment (“${pact.ourGive || '[confirm intake spec]'}”) on ${compliance.dirtyCount} of ${compliance.totalExchanges} exchanges.`,
      '   • Before asking for faster turnaround, we are enforcing a pre-flight Definition-of-Ready gate on our outbound asks this week.',
    );
  } else {
    lines.push(
      '2. Symmetric give-get check:',
      `   • Our side maintained ${ourPct} intake fidelity (“${pact.ourGive || '[confirm intake spec]'}”), giving us a clean factual basis to recalibrate capacity, WIP caps, or SLA windows together.`,
    );
  }

  lines.push(
    '',
    '3. Proposed structural adjustment (to confirm together):',
    `   • Interaction mode: ${modeAudit.aligned ? INTERFACE_MODE_LABELS[pact.mode] : `shift from ${pact.mode} → ${modeAudit.recommendedMode} (${modeAudit.headline})`}.`,
  );
  if (bestLever) {
    lines.push(
      `   • Highest-leverage Pareto move: ${bestLever.label}${bestLever.waitDays !== null ? ` → projected queue wait ${bestLever.waitDays}d (ρ = ${Math.round(bestLever.rho * 100)}%)` : ''}.`,
    );
  }
  lines.push(
    `   • Next review checkpoint: [to confirm date] — score joint clean-exchange rate against ≥80% target.`,
  );
  return lines.join('\n');
}

/**
 * Freeze a content-free prospective compliance forecast on a pact.
 */
export function buildInterfaceAudit(row, { horizonDays = 28, predictedComplianceProb = 0.75, targetJointComplianceRate = 0.8, now = new Date(), id }) {
  if (!row?.pact || !id) return null;
  const hDays = clamp(Math.round(Number(horizonDays) || 28), 7, 180);
  const prob = clamp(Number(predictedComplianceProb), 0.05, 0.95);
  const target = clamp(Number(targetJointComplianceRate) || 0.8, 0.5, 0.99);
  if (!Number.isFinite(prob)) return null;
  const frozenOn = dayKey(now);
  const reviewOn = dayKey(addDays(now, hDays));
  return {
    id,
    pactId: row.pact.id,
    status: 'frozen',
    frozenOn,
    reviewOn,
    horizonDays: hDays,
    targetJointComplianceRate: round(target, 4),
    predictedComplianceProb: round(prob, 4),
    baseline: {
      rho: row.queue.rho,
      effectiveArrival: row.effectiveArrival,
      expectedWaitDays: row.queue.privateWaitDays,
      externalityDays: row.queue.marginalExternalityDaysPerItem,
      socialToPrivateRatio: row.queue.socialToPrivateRatio,
      departureCv2: row.queue.departureCv2,
      ourComplianceRate: row.compliance.ourIntake?.rate ?? null,
      theirComplianceRate: row.compliance.theirSla?.rate ?? null,
      bounceRate: row.compliance.bounce?.rate ?? row.effectiveReworkRate ?? null,
      exchangeCount: row.compliance.totalExchanges,
    },
    grade: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/**
 * Grade a frozen audit once after `reviewOn` from settled exchanges inside
 * `(frozenOn, reviewOn]`. Refuses if reviewOn has not arrived, if already
 * graded, if source pact is gone, or if fewer than 3 settled exchanges were
 * recorded in the window.
 */
export function gradeInterfaceAudit(audit, state, now = new Date()) {
  if (!audit) return { ok: false, reason: 'That pact audit does not exist.' };
  if (audit.status === 'graded' || audit.grade) {
    return { ok: false, reason: 'This pact audit has already been graded once and is immutable.' };
  }
  const today = dayKey(now);
  if (today < audit.reviewOn) {
    return { ok: false, reason: `Review window closes on ${audit.reviewOn} (${daysBetween(today, audit.reviewOn)} day(s) remaining).` };
  }
  const pact = (state?.interfacePacts || []).find((p) => p && p.id === audit.pactId);
  if (!pact) {
    return { ok: false, reason: 'Source operating pact was deleted; refusing to invent a post-window outcome.' };
  }
  const windowSettled = (pact.exchanges || []).filter(
    (e) => e.recordedOn > audit.frozenOn && e.recordedOn <= audit.reviewOn && typeof e.metSla === 'boolean',
  );
  if (windowSettled.length < 3) {
    return {
      ok: false,
      reason: `Only ${windowSettled.length} settled exchange(s) recorded inside (${audit.frozenOn}, ${audit.reviewOn}]; at least 3 are required to score compliance honestly.`,
    };
  }
  const jointCleanCount = windowSettled.filter((e) => e.intakeClean === true && e.metSla === true && !e.bounced).length;
  const realizedRate = jointCleanCount / windowSettled.length;
  const target = audit.targetJointComplianceRate ?? 0.8;
  const metTarget = realizedRate >= target;
  const outcomeBinary = metTarget ? 1 : 0;
  const brier = (audit.predictedComplianceProb - outcomeBinary) ** 2;
  return {
    ok: true,
    grade: {
      gradedOn: today,
      windowExchanges: windowSettled.length,
      jointCleanCount,
      realizedRate: round(realizedRate, 4),
      outcomeBinary,
      metTarget,
      brier: round(brier, 4),
    },
  };
}

export function interfaceCalibration(audits = [], pacts = [], conventions = interfaceConventions()) {
  const pactIds = new Set((pacts || []).map((p) => p?.id).filter(Boolean));
  const validGraded = (audits || []).filter(
    (a) => a && a.status === 'graded' && a.grade && pactIds.has(a.pactId),
  );
  const n = validGraded.length;
  if (n === 0) {
    return { gradedCount: 0, meanBrier: null, baseRate: null, referenceBrier: null, brierSkill: null, skillReportable: false };
  }
  const meanBrier = validGraded.reduce((s, a) => s + a.grade.brier, 0) / n;
  const baseRate = validGraded.reduce((s, a) => s + a.grade.outcomeBinary, 0) / n;
  const refBrier = baseRate * (1 - baseRate);
  const skillReportable = n >= conventions.minSkillAudits && refBrier > 0.001;
  const brierSkill = skillReportable ? 1 - meanBrier / refBrier : null;
  return {
    gradedCount: n,
    meanBrier: round(meanBrier, 4),
    baseRate: round(baseRate, 4),
    referenceBrier: round(refBrier, 4),
    brierSkill: brierSkill !== null ? round(brierSkill, 4) : null,
    skillReportable,
  };
}

/**
 * Full read model for `#/interfaces`, CSV scope #58, rules, and `#/insights`.
 */
export function interfaceReport(state = {}, now = new Date(), settingsOverride = null) {
  const at = now instanceof Date ? now : new Date(now);
  const conventions = interfaceConventions(settingsOverride || state?.settings || {});
  const pacts = Array.isArray(state?.interfacePacts) ? state.interfacePacts : [];
  const audits = Array.isArray(state?.interfaceAudits) ? state.interfaceAudits : [];
  const network = solveQueueNetwork(pacts, { now: at, conventions });
  const harvested = harvestBoundaryTelemetry(state);
  const calibration = interfaceCalibration(audits, pacts, conventions);
  const today = dayKey(at);

  // Aggregate per-currency queue & externality exposure (currencies NEVER mixed).
  const byCurrency = new Map();
  let unstableCount = 0;
  let highUtilCount = 0;
  let dirtyHandsCount = 0;
  let credibleBreachCount = 0;
  let bullwhipCount = 0;
  let conwayMismatchCount = 0;
  let paradoxCount = 0;
  let totalSyncHours = 0;

  for (const row of network.rows) {
    totalSyncHours += row.pact.coordinationHoursPerWeek || 0;
    if (row.queue.unstable) unstableCount += 1;
    else if (row.queue.rho !== null && row.queue.rho >= conventions.highUtil) highUtilCount += 1;
    if (row.compliance.verdict === 'dirty-hands-asymmetry' || row.compliance.verdict === 'our-intake-breach') {
      dirtyHandsCount += 1;
    }
    if (row.compliance.verdict === 'clean-hands-counterparty-breach') credibleBreachCount += 1;
    if ((row.queue.bullwhipRatio ?? 0) > 1.15) bullwhipCount += 1;
    if (!row.modeAudit.aligned) conwayMismatchCount += 1;
    if (row.surgeParadox?.paradoxTriggered) paradoxCount += 1;

    if (row.queue.currency && row.queue.weeklyExternalityCost !== null) {
      const cur = byCurrency.get(row.queue.currency) || { currency: row.queue.currency, weeklyPrivateCost: 0, weeklyExternalityCost: 0, pacts: 0 };
      cur.weeklyPrivateCost = round(cur.weeklyPrivateCost + (row.queue.weeklyPrivateCost || 0), 2);
      cur.weeklyExternalityCost = round(cur.weeklyExternalityCost + row.queue.weeklyExternalityCost, 2);
      cur.pacts += 1;
      byCurrency.set(row.queue.currency, cur);
    }
  }

  const overdueAudits = audits.filter((a) => a && a.status === 'frozen' && a.reviewOn <= today);
  const findings = buildInterfaceSignalsFromRows(network.rows, harvested, overdueAudits, conventions);

  return {
    engineVersion: INTERFACE_ENGINE_VERSION,
    asOf: at.toISOString(),
    conventions,
    summary: {
      totalPacts: pacts.length,
      activePacts: network.rows.length,
      unstableCount,
      highUtilCount,
      dirtyHandsCount,
      credibleBreachCount,
      bullwhipCount,
      conwayMismatchCount,
      paradoxCount,
      undeclaredHotspots: harvested.undeclared.length,
      overdueAudits: overdueAudits.length,
      totalSyncHours: round(totalSyncHours, 1),
      exposureByCurrency: [...byCurrency.values()],
    },
    network,
    rows: network.rows,
    harvested,
    audits,
    overdueAudits,
    calibration,
    signals: findings,
  };
}

function buildInterfaceSignalsFromRows(rows, harvested, overdueAudits, conventions) {
  const out = [];

  for (const row of rows) {
    const { pact, queue, compliance, modeAudit } = row;
    if (queue.unstable) {
      out.push({
        id: `int-unstable-${pact.id}`,
        code: INTERFACE_SIGNAL_IDS.UNSTABLE_GATE,
        domain: 'Boundary interfaces',
        severity: 4,
        confidence: row.arrivalSource === 'declared' ? 'high' : 'medium',
        title: `Unstable boundary gate: ${pact.sourceUnit} → ${pact.targetUnit} (ρ = ${Math.round((queue.rho || 1) * 100)}%)`,
        summary: `Effective arrival (${row.effectiveArrival}/wk incl. ${Math.round(row.effectiveReworkRate * 100)}% rework bounce) meets or exceeds gate capacity (${pact.serviceCapacityPerWeek}/wk). Queue wait grows without bound until rework, demand or capacity changes.`,
        evidence: [
          `Base demand ${row.baseArrival}/wk × ${row.reworkMultiplier}× rework = ${row.effectiveArrival}/wk`,
          `Capacity ${pact.serviceCapacityPerWeek}/wk · mode ${pact.mode}`,
        ],
        pactId: pact.id,
        action: { label: 'Redesign boundary', route: `#/interfaces?panel=redesign&pact=${encodeURIComponent(pact.id)}` },
      });
    } else if (
      queue.rho !== null &&
      (queue.rho >= conventions.highUtil ||
        (queue.weeklyExternalityCost !== null && queue.weeklyExternalityCost >= conventions.externalityThreshold))
    ) {
      out.push({
        id: `int-ext-${pact.id}`,
        code: INTERFACE_SIGNAL_IDS.HIGH_EXTERNALITY,
        domain: 'Boundary interfaces',
        severity: queue.rho >= 0.9 ? 4 : 3,
        confidence: 'high',
        title: `Congestion externality on ${pact.targetUnit}: ${queue.socialToPrivateRatio}× social-to-private delay`,
        summary: `At ρ = ${Math.round(queue.rho * 100)}%, each item waits ${queue.privateWaitDays}d privately while imposing ${queue.marginalExternalityDaysPerItem}d of extra queue delay on other work${queue.weeklyExternalityCost !== null ? ` (${queue.currency} ${queue.weeklyExternalityCost.toLocaleString('en-US')}/wk externality)` : ''}.`,
        evidence: [
          `Private wait ${queue.privateWaitDays}d vs external delay ${queue.marginalExternalityDaysPerItem}d/item`,
          ...(row.surgeParadox?.paradoxTriggered ? ['+20% upstream local acceleration triggers net end-to-end slowdown'] : []),
        ],
        pactId: pact.id,
        action: { label: 'Inspect queue network', route: `#/interfaces?panel=network&pact=${encodeURIComponent(pact.id)}` },
      });
    }

    if (compliance.verdict === 'dirty-hands-asymmetry' || compliance.verdict === 'our-intake-breach') {
      out.push({
        id: `int-dirty-${pact.id}`,
        code: INTERFACE_SIGNAL_IDS.DIRTY_HANDS,
        domain: 'Boundary interfaces',
        severity: compliance.verdict === 'dirty-hands-asymmetry' ? 4 : 3,
        confidence: 'high',
        title: `Clean-Hands Gate blocked escalation on ${pact.sourceUnit} → ${pact.targetUnit}`,
        summary: `Our own intake hygiene met spec on ${Math.round((compliance.ourIntake?.rate || 0) * 100)}% of exchanges (${compliance.cleanCount}/${compliance.totalExchanges}, below ${conventions.cleanHandsFloorPct}% floor). Repair our outbound Definition-of-Ready before escalating counterparty SLA misses.`,
        evidence: [
          `Our intake clean: ${compliance.cleanCount}/${compliance.totalExchanges} · Counterparty SLA met: ${compliance.slaMetCount}/${compliance.settledExchanges}`,
          `Bounces recorded: ${compliance.bouncedCount}`,
        ],
        pactId: pact.id,
        action: { label: 'Open Clean-Hands ledger', route: `#/interfaces?panel=pacts&pact=${encodeURIComponent(pact.id)}` },
      });
    } else if (compliance.verdict === 'clean-hands-counterparty-breach') {
      out.push({
        id: `int-breach-${pact.id}`,
        code: INTERFACE_SIGNAL_IDS.CREDIBLE_BREACH,
        domain: 'Boundary interfaces',
        severity: 3,
        confidence: 'high',
        title: `Credible SLA breach on ${pact.sourceUnit} → ${pact.targetUnit} (clean hands verified)`,
        summary: `Our team met intake spec on ${Math.round(compliance.ourIntake.rate * 100)}% of exchanges (${compliance.cleanCount}/${compliance.totalExchanges}), while ${pact.targetUnit} met the ${pact.turnaroundDays}d SLA on ${Math.round(compliance.theirSla.rate * 100)}% (${compliance.slaMetCount}/${compliance.settledExchanges}). Ready for principled bilateral reset.`,
        evidence: [
          `Reciprocity gap +${compliance.reciprocityGapPp}pp in our favour`,
          `Median turnaround ${compliance.medianTurnaroundDays ?? '—'}d vs ${pact.turnaroundDays}d pact`,
        ],
        pactId: pact.id,
        action: { label: 'Draft principled reset', route: `#/interfaces?panel=pacts&pact=${encodeURIComponent(pact.id)}` },
      });
    }

    if ((queue.bullwhipRatio ?? 0) > 1.2) {
      out.push({
        id: `int-bullwhip-${pact.id}`,
        code: INTERFACE_SIGNAL_IDS.BULLWHIP_CONTAGION,
        domain: 'Boundary interfaces',
        severity: 2,
        confidence: 'medium',
        title: `Variability contagion (bullwhip ${queue.bullwhipRatio}×) through ${pact.targetUnit}`,
        summary: `Service variability (C_s² = ${queue.serviceCv2}) under utilization ρ = ${Math.round((queue.rho || 0) * 100)}% amplifies departure burstiness from C_a² = ${queue.arrivalCv2} to C_d² = ${queue.departureCv2}.`,
        evidence: [`Whitt QNA departure C_d² = ${queue.departureCv2}`],
        pactId: pact.id,
        action: { label: 'Smooth cadence', route: `#/interfaces?panel=redesign&pact=${encodeURIComponent(pact.id)}` },
      });
    }

    if (!modeAudit.aligned) {
      out.push({
        id: `int-mode-${pact.id}`,
        code: INTERFACE_SIGNAL_IDS.CONWAY_MISMATCH,
        domain: 'Boundary interfaces',
        severity: modeAudit.code === 'fake-xaas' ? 3 : 2,
        confidence: 'medium',
        title: `${pact.sourceUnit} ↔ ${pact.targetUnit}: ${modeAudit.headline}`,
        summary: modeAudit.detail,
        evidence: [`Declared ${pact.mode} · recommended ${modeAudit.recommendedMode}`],
        pactId: pact.id,
        action: { label: 'Compare redesigns', route: `#/interfaces?panel=redesign&pact=${encodeURIComponent(pact.id)}` },
      });
    }
  }

  for (const h of harvested.undeclared.slice(0, 3)) {
    out.push({
      id: `int-hotspot-${h.key}`,
      code: INTERFACE_SIGNAL_IDS.UNDECLARED_HOTSPOT,
      domain: 'Boundary interfaces',
      severity: h.totalSignals >= 3 ? 3 : 2,
      confidence: 'medium',
      title: `Ungoverned cross-boundary hotspot: ${h.sourceUnit} → ${h.targetUnit}`,
      summary: `${h.totalSignals} active cross-unit records (cases, dependencies, decisions or negotiations) cross ${h.sourceUnit} → ${h.targetUnit} with no Operating Pact or SLA/intake guardrail.`,
      evidence: h.examples.map((ex) => `${ex.kind}: ${ex.title}`),
      pactId: null,
      action: { label: 'Codify Operating Pact', route: '#/interfaces?panel=pacts' },
    });
  }

  if (overdueAudits.length > 0) {
    out.push({
      id: 'int-overdue-audits',
      code: 'INT-AUDIT',
      domain: 'Boundary interfaces',
      severity: 2,
      confidence: 'high',
      title: `${overdueAudits.length} frozen Operating Pact forecast(s) due for Brier grading`,
      summary: 'Review window has closed; score the frozen joint-compliance prediction against realized exchanges.',
      evidence: overdueAudits.slice(0, 3).map((a) => `Review due ${a.reviewOn} (predicted ${Math.round(a.predictedComplianceProb * 100)}%)`),
      pactId: overdueAudits[0].pactId,
      action: { label: 'Grade frozen audits', route: '#/interfaces?panel=audits' },
    });
  }

  return out
    .map((sig) => ({
      ...sig,
      ruleId: sig.code,
      detail: sig.summary,
    }))
    .sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id));
}

export function interfaceSignals(state, now = new Date()) {
  return interfaceReport(state, now).signals;
}

export function interfaceAttentionCount(state, now = new Date()) {
  const report = interfaceReport(state, now);
  return report.signals.filter((s) => s.severity >= 3).length;
}

export function interfaceBrief(report) {
  if (!report) return 'Boundary & Interface Physics Terminal — no workspace loaded.';
  const { summary, calibration } = report;
  const lines = [
    `Boundary & Interface Physics Brief (as of ${String(report.asOf || '').slice(0, 10)})`,
    `Active operating pacts: ${summary.activePacts} · Unstable gates (ρ ≥ 100%): ${summary.unstableCount} · High-externality gates: ${summary.highUtilCount}`,
    `Relational symmetry: ${summary.dirtyHandsCount} pact(s) blocked by Clean-Hands Gate (our intake < ${report.conventions.cleanHandsFloorPct}%) · ${summary.credibleBreachCount} credible counterparty SLA breach(es)`,
    `Conway / Team-Topologies mismatches: ${summary.conwayMismatchCount} · +20% Upstream Surge Paradoxes: ${summary.paradoxCount} · Undeclared hotspots: ${summary.undeclaredHotspots}`,
  ];
  for (const exp of summary.exposureByCurrency) {
    lines.push(
      `Priced queue burden (${exp.currency}, ${exp.pacts} pact(s)): private wait ${exp.currency} ${exp.weeklyPrivateCost.toLocaleString('en-US')}/wk · imposed congestion externality ${exp.currency} ${exp.weeklyExternalityCost.toLocaleString('en-US')}/wk`,
    );
  }
  if (calibration.gradedCount > 0) {
    lines.push(
      `Prospective Pact Audits: ${calibration.gradedCount} graded · mean Brier ${calibration.meanBrier}${calibration.skillReportable ? ` · Brier skill ${calibration.brierSkill}` : ' (Brier skill withheld below 5 graded audits)'}`,
    );
  }
  return lines.join('\n');
}
