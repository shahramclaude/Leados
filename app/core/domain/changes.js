/**
 * app/core/domain/changes.js — Cross-Domain Organizational Design, Team
 * Topologies & Change Execution.
 *
 * Synthesizes seven peer-reviewed / canonical frameworks around structural and
 * operating-model changes without touching DOM or storage:
 *
 *  1. Leadership & Change Management — John P. Kotter (1995, 1996) 8-Step
 *     Change Model with explicit anti-skip gate diagnosis (skipping upstream
 *     foundations creates only the illusion of speed), paired with William
 *     Bridges (1991) & Michael Watkins (2003) role-transition scaffolding.
 *  2. Social Psychology & Economic Incentives — Kurt Lewin (1947, 1951)
 *     Force-Field Analysis (equilibrium shifts sustainably by weakening or
 *     mitigating restraining forces rather than merely increasing driving
 *     pressure, which raises system tension), plus Holmström & Milgrom (1991)
 *     multi-task incentive-alignment checks.
 *  3. MBA / Strategy & Org Design — Jay R. Galbraith (1973, 2014) 5-Point Star
 *     Model (Strategy, Structure, Processes, Rewards, People) and Michael E.
 *     Porter (1996) explicit strategic trade-offs (non-goals / what stops).
 *  4. Systems Engineering & Lean Flow — Melvin E. Conway (1968) Inverse
 *     Conway Maneuver, Matthew Skelton & Manuel Pais (2019) Team Topologies
 *     (stream-aligned, platform, enabling, complicated-subsystem; interaction
 *     modes), John Sweller (1988) Cognitive Load Theory, and Frederick P.
 *     Brooks (1975) coordination-channel & blocking-handoff reduction.
 *  5. Political Science & Governance — George Tsebelis (2002) Veto-Player
 *     Theory combined with Aubrey Mendelow (1981) Power × Interest coalition
 *     mapping and briefing cadences.
 *  6. Finance & Capital Allocation — Three-point Beta-PERT (Malcolm et al.,
 *     1959) transition capacity demand, J-curve implementation cost vs
 *     steady-state value unlocked, payback months, and execution-feasibility-
 *     adjusted net benefit.
 *  7. Statistics & Production Quality — Shewhart (1931) / Wheeler (1993) XmR
 *     before-vs-after process shift verification via `spc.js` so anchoring a
 *     change tests real data against natural process limits.
 *
 * Pure module: no DOM, no storage, no wall-clock globals. Unmeasured fields
 * remain explicitly unmeasured (`measured: false`), never fabricated as zero.
 */

import { dayKey } from '../time.js';
import { compareBaselineShift, computeXmR } from './spc.js';
import { linksForEntity, MENDELOW_QUADRANTS, classifyMendelowStakeholder } from './cases.js';

export const CHANGE_KINDS = [
  'topology',
  'process',
  'charter',
  'reporting-line',
  'operating-model',
];

export const CHANGE_KIND_LABELS = {
  topology: 'Team topology & boundary split',
  process: 'Operating process & ritual redesign',
  charter: 'Charter & ownership transfer',
  'reporting-line': 'Reporting line & leadership structure',
  'operating-model': 'Platform / tooling operating model',
};

export const CHANGE_STATUSES = [
  'proposed',
  'active',
  'stabilising',
  'anchored',
  'paused',
  'abandoned',
];

export const CHANGE_STATUS_LABELS = {
  proposed: 'Proposed',
  active: 'Active transition',
  stabilising: 'Stabilising',
  anchored: 'Anchored in practice',
  paused: 'Paused',
  abandoned: 'Abandoned',
};

export const OPEN_CHANGE_STATUSES = ['proposed', 'active', 'stabilising'];
export const COMMITTED_CHANGE_STATUSES = ['active', 'stabilising'];
export const CLOSED_CHANGE_STATUSES = ['anchored', 'paused', 'abandoned'];

export const TEAM_TOPOLOGY_TYPES = [
  'stream-aligned',
  'platform',
  'enabling',
  'complicated-subsystem',
];

export const TEAM_TOPOLOGY_LABELS = {
  'stream-aligned': 'Stream-aligned (end-to-end user/domain flow)',
  platform: 'Platform (self-service internal capability)',
  enabling: 'Enabling (time-boxed capability coaching)',
  'complicated-subsystem': 'Complicated-subsystem (deep specialist module)',
};

export const TOPOLOGY_INTERACTION_MODES = [
  'x-as-a-service',
  'collaboration',
  'facilitating',
];

export const TOPOLOGY_INTERACTION_LABELS = {
  'x-as-a-service': 'X-as-a-Service (clear API / minimal coordination)',
  collaboration: 'Collaboration (high-bandwidth joint discovery)',
  facilitating: 'Facilitating (coaching / upskilling another team)',
};

export const KOTTER_STEPS = [
  'urgency',
  'coalition',
  'vision',
  'communicate',
  'obstacles',
  'short-wins',
  'consolidate',
  'anchor',
];

export const KOTTER_STEP_META = {
  urgency: {
    step: 1,
    label: '1. Urgency',
    title: 'Establish a concrete sense of urgency',
    question: 'What measurable pain or cost of inaction makes staying still worse than changing?',
  },
  coalition: {
    step: 2,
    label: '2. Coalition',
    title: 'Form a guiding coalition',
    question: 'Do champions hold enough power — with veto players aligned — to protect the transition?',
  },
  vision: {
    step: 3,
    label: '3. Charter & trade-offs',
    title: 'Create strategic vision & explicit non-goals',
    question: 'Is the target boundary clear, including what this team will explicitly stop doing?',
  },
  communicate: {
    step: 4,
    label: '4. Communicate',
    title: 'Communicate the charter & listen in 1:1s',
    question: 'Are stakeholder briefs current and impacted people supported in 1:1s?',
  },
  obstacles: {
    step: 5,
    label: '5. Remove obstacles',
    title: 'Empower action by removing restraining forces',
    question: 'Do severe restraining forces have real mitigations, and do changed roles have 30-60-90 plans?',
  },
  'short-wins': {
    step: 6,
    label: '6. Short-term wins',
    title: 'Generate visible, dated short-term wins',
    question: 'Has at least one concrete early win been verified on the record?',
  },
  consolidate: {
    step: 7,
    label: '7. Consolidate',
    title: 'Consolidate gains & verify flow improvement',
    question: 'Are blocking handoffs / cognitive load dropping and tracked metrics moving?',
  },
  anchor: {
    step: 8,
    label: '8. Anchor',
    title: 'Anchor in Star Model rewards, rituals & norms',
    question: 'Are strategy, structure, processes, rewards, and people all aligned so old habits do not snap back?',
  },
};

export const FORCE_SIDES = ['driving', 'restraining'];

export const FORCE_CATEGORIES = [
  'incentive',
  'capability',
  'tooling',
  'governance',
  'workload',
  'coalition',
  'customer',
];

export const FORCE_CATEGORY_LABELS = {
  incentive: 'Incentives & evaluation',
  capability: 'Skills & domain knowledge',
  tooling: 'Tooling & platform boundaries',
  governance: 'Governance & compliance',
  workload: 'Capacity & delivery pressure',
  coalition: 'Stakeholder politics & trust',
  customer: 'Customer / user demand',
};

export const STAR_PILLARS = ['strategy', 'structure', 'processes', 'rewards', 'people'];

export const STAR_PILLAR_META = {
  strategy: {
    label: 'Strategy & non-goals',
    prompt: 'Direction, winning logic, and what stops (Porter trade-off).',
  },
  structure: {
    label: 'Structure & charter',
    prompt: 'Team boundaries, ownership seams, and decision rights.',
  },
  processes: {
    label: 'Processes & rituals',
    prompt: 'Handoff protocols, intake queues, and planning cadence.',
  },
  rewards: {
    label: 'Rewards & goals',
    prompt: 'How goals and reviews reward the new behaviour instead of the old silo (Holmström-Milgrom).',
  },
  people: {
    label: 'People & transitions',
    prompt: 'Skills, staffing, buddies, and 30-60-90 role transitions.',
  },
};

export const CHANGE_IMPACT_KINDS = [
  'scope-shift',
  'reporting-line',
  'topology-interface',
  'platform-consumer',
];

export const CHANGE_IMPACT_LABELS = {
  'scope-shift': 'Role or domain scope shift',
  'reporting-line': 'Reporting line change',
  'topology-interface': 'Team interaction mode shift',
  'platform-consumer': 'Adopting new platform / workflow',
};

const Z_80_INTERVAL = 1.2815515655446004;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function nonNegative(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function calendarDiffDays(fromDay, toDay) {
  if (!fromDay || !toDay) return null;
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function isChangeOpen(change) {
  return Boolean(change && OPEN_CHANGE_STATUSES.includes(change.status));
}

export function isChangeCommitted(change) {
  return Boolean(change && COMMITTED_CHANGE_STATUSES.includes(change.status));
}

/**
 * Beta-PERT three-point distribution (Malcolm et al., 1959).
 */
export function pertStats(optimistic, mostLikely, pessimistic) {
  const raw = [
    nonNegative(optimistic, 0),
    nonNegative(mostLikely, 0),
    nonNegative(pessimistic, 0),
  ].sort((a, b) => a - b);
  const [o, m, p] = raw;
  const measured = p > 0;
  const expected = (o + 4 * m + p) / 6;
  const stdDev = (p - o) / 6;
  const variance = stdDev * stdDev;
  const p10 = Math.max(o, expected - Z_80_INTERVAL * stdDev);
  const p90 = Math.min(p, expected + Z_80_INTERVAL * stdDev);
  return {
    measured,
    optimistic: round2(o),
    mostLikely: round2(m),
    pessimistic: round2(p),
    expected: round2(expected),
    stdDev: round2(stdDev),
    variance: round2(variance),
    p10: round2(p10),
    p90: round2(p90),
  };
}

/**
 * Lewin (1947, 1951) Force-Field Analysis.
 *
 * Evaluates both raw and effective force equilibrium:
 *  - Driving sum D = sum(d_i.weight)
 *  - Restraining sum R = sum(r_j.weight)
 *  - Residual restraining load R_effective: mitigated restraining forces have
 *    their effective drag halved (0.5x) rather than zeroed, because a counter-
 *    measure reduces friction without making change effortless.
 *  - High-tension stalemate: D >= 8 and unmitigated R >= 8 — Lewin's classic
 *    warning where leadership applies heavy pressure against unremoved blockers,
 *    producing fatigue and covert resistance instead of movement.
 */
export function evaluateForceField(change) {
  const forces = Array.isArray(change?.forces) ? change.forces : [];
  const driving = forces
    .filter((f) => f && f.side === 'driving' && String(f.label || '').trim())
    .map((f) => ({
      ...f,
      weight: clampInt(f.weight, 1, 5, 3),
      categoryLabel: FORCE_CATEGORY_LABELS[f.category] || f.category || 'General',
    }));
  const restraining = forces
    .filter((f) => f && f.side === 'restraining' && String(f.label || '').trim())
    .map((f) => {
      const weight = clampInt(f.weight, 1, 5, 3);
      const hasPlan = Boolean(String(f.mitigation || '').trim());
      const mitigated = Boolean(f.mitigated);
      const effectiveWeight = mitigated ? round2(weight * 0.5) : weight;
      return {
        ...f,
        weight,
        hasPlan,
        mitigated,
        effectiveWeight,
        categoryLabel: FORCE_CATEGORY_LABELS[f.category] || f.category || 'General',
      };
    });

  const drivingSum = driving.reduce((s, f) => s + f.weight, 0);
  const restrainingSum = restraining.reduce((s, f) => s + f.weight, 0);
  const effectiveRestrainingSum = round2(restraining.reduce((s, f) => s + f.effectiveWeight, 0));
  const unmitigatedRestraining = restraining.filter((f) => !f.mitigated);
  const unmitigatedSevere = unmitigatedRestraining.filter((f) => f.weight >= 4);
  const unplannedRestraining = restraining.filter((f) => !f.hasPlan);
  const unmitigatedRestrainingSum = unmitigatedRestraining.reduce((s, f) => s + f.weight, 0);

  const totalEffective = drivingSum + effectiveRestrainingSum;
  const netBalance = round2(drivingSum - effectiveRestrainingSum);
  const netForceRatio = totalEffective > 0 ? round2(drivingSum / totalEffective) : null;

  const highTensionStalemate = drivingSum >= 8 && unmitigatedRestrainingSum >= 8;

  let equilibrium = 'unmapped';
  if (driving.length === 0 && restraining.length === 0) {
    equilibrium = 'unmapped';
  } else if (driving.length > 0 && restraining.length === 0) {
    equilibrium = 'one-sided';
  } else if (highTensionStalemate && netBalance <= 2) {
    equilibrium = 'high-tension-stalemate';
  } else if (netBalance >= 2 && unmitigatedSevere.length === 0) {
    equilibrium = 'favorable';
  } else if (netBalance > 0) {
    equilibrium = 'fragile-forward';
  } else {
    equilibrium = 'blocked';
  }

  const warnings = [];
  if (driving.length > 0 && restraining.length === 0) {
    warnings.push('Only driving forces are listed. Every real change encounters restraining forces — naming none hides where adoption will stall.');
  }
  if (highTensionStalemate) {
    warnings.push('High-tension stalemate (Lewin, 1951): both driving pressure and unmitigated restraining forces are high. Weaken or remove blockers instead of pushing harder.');
  }
  if (unmitigatedSevere.length > 0) {
    warnings.push(`${unmitigatedSevere.length} high-weight restraining force(s) (≥4/5) remain unmitigated.`);
  }

  return {
    measured: driving.length > 0 || restraining.length > 0,
    driving,
    restraining,
    drivingSum,
    restrainingSum,
    effectiveRestrainingSum,
    unmitigatedRestrainingSum,
    unmitigatedRestraining,
    unmitigatedSevere,
    unplannedRestraining,
    netBalance,
    netForceRatio,
    highTensionStalemate,
    equilibrium,
    warnings,
  };
}

/**
 * Conway (1968), Skelton & Pais (2019) Team Topologies, Sweller (1988)
 * Cognitive Load & Brooks (1975) coordination channel analysis.
 */
export function evaluateTopologyAndLoad(change) {
  const raw = change?.topology || {};
  const currentType = TEAM_TOPOLOGY_TYPES.includes(raw.currentType) ? raw.currentType : 'stream-aligned';
  const targetType = TEAM_TOPOLOGY_TYPES.includes(raw.targetType) ? raw.targetType : 'stream-aligned';
  const interactionMode = TOPOLOGY_INTERACTION_MODES.includes(raw.interactionMode)
    ? raw.interactionMode
    : 'x-as-a-service';

  const loadBefore = typeof raw.cognitiveLoadBefore === 'number' && raw.cognitiveLoadBefore >= 1 && raw.cognitiveLoadBefore <= 5
    ? Math.round(raw.cognitiveLoadBefore)
    : null;
  const loadTarget = typeof raw.cognitiveLoadTarget === 'number' && raw.cognitiveLoadTarget >= 1 && raw.cognitiveLoadTarget <= 5
    ? Math.round(raw.cognitiveLoadTarget)
    : null;
  const handoffsBefore = typeof raw.blockingHandoffsBefore === 'number' && raw.blockingHandoffsBefore >= 0
    ? Math.round(raw.blockingHandoffsBefore)
    : null;
  const handoffsTarget = typeof raw.blockingHandoffsTarget === 'number' && raw.blockingHandoffsTarget >= 0
    ? Math.round(raw.blockingHandoffsTarget)
    : null;
  const collaboratingTeamsCount = clampInt(raw.collaboratingTeamsCount, 0, 20, 0);

  const loadMeasured = loadBefore !== null && loadTarget !== null;
  const loadDelta = loadMeasured ? loadTarget - loadBefore : null;
  const handoffsMeasured = handoffsBefore !== null && handoffsTarget !== null;
  const handoffsDelta = handoffsMeasured ? handoffsTarget - handoffsBefore : null;

  // Brooks (1975) inter-team bilateral interface pairs among (1 + N) collaborating teams: n*(n-1)/2
  const teamNodes = 1 + collaboratingTeamsCount;
  const coordinationChannels = (teamNodes * (teamNodes - 1)) / 2;

  const antiPatterns = [];
  if (targetType === 'stream-aligned' && interactionMode === 'collaboration' && collaboratingTeamsCount >= 2) {
    antiPatterns.push({
      id: 'TT-COLLAB-OVERLOAD',
      title: 'Permanent multi-team collaboration on a stream-aligned team',
      detail: `Collaborating simultaneously with ${collaboratingTeamsCount} external teams creates ${coordinationChannels} bilateral coordination paths (Brooks, 1975). Time-box collaboration to discovery, then shift to X-as-a-Service.`,
    });
  }
  if (targetType === 'platform' && interactionMode === 'collaboration' && collaboratingTeamsCount > 1) {
    antiPatterns.push({
      id: 'TT-PLATFORM-COUPLED',
      title: 'Platform team coupled in multi-team collaboration',
      detail: 'A platform reduces stream cognitive load only when consumed as self-service (X-as-a-Service). Co-building with multiple streams simultaneously turns the platform into a shared bottleneck.',
    });
  }
  if (targetType === 'enabling' && interactionMode !== 'facilitating') {
    antiPatterns.push({
      id: 'TT-ENABLING-MODE',
      title: 'Enabling team not operating in facilitating mode',
      detail: 'Enabling teams exist to grow capability in stream teams and step back. Owning permanent delivery paths turns an enabling team into a hidden dependency.',
    });
  }
  if (loadTarget !== null && loadTarget >= 4) {
    antiPatterns.push({
      id: 'TT-HIGH-TARGET-LOAD',
      title: 'Target cognitive load remains high (≥4/5)',
      detail: 'The redesigned boundary still leaves extraneous/domain cognitive load above sustainable capacity (Sweller, 1988). Narrow domain breadth or extract a self-service platform seam.',
    });
  }
  if (handoffsMeasured && handoffsDelta > 0) {
    antiPatterns.push({
      id: 'TT-HANDOFF-INCREASE',
      title: 'Change increases external blocking handoffs',
      detail: `Blocking handoffs rise from ${handoffsBefore} to ${handoffsTarget} (+${handoffsDelta}). By Conway’s Law and queueing theory, each added cross-team wait multiplies lead time.`,
    });
  }

  return {
    teamName: String(raw.teamName || '').trim(),
    currentType,
    currentTypeLabel: TEAM_TOPOLOGY_LABELS[currentType],
    targetType,
    targetTypeLabel: TEAM_TOPOLOGY_LABELS[targetType],
    interactionMode,
    interactionModeLabel: TOPOLOGY_INTERACTION_LABELS[interactionMode],
    cognitiveLoadBefore: loadBefore,
    cognitiveLoadTarget: loadTarget,
    loadMeasured,
    loadDelta,
    blockingHandoffsBefore: handoffsBefore,
    blockingHandoffsTarget: handoffsTarget,
    handoffsMeasured,
    handoffsDelta,
    collaboratingTeamsCount,
    coordinationChannels,
    antiPatterns,
  };
}

/**
 * Galbraith (1973, 2014) 5-Point Star Model + Porter (1996) non-goals +
 * Holmström & Milgrom (1991) incentive-alignment check.
 */
export function evaluateStarAlignment(change) {
  const star = change?.star || {};
  const nonGoals = String(change?.nonGoals || '').trim();
  const pillars = STAR_PILLARS.map((key) => {
    const text = String(star[key] || '').trim();
    const meta = STAR_PILLAR_META[key];
    return {
      key,
      label: meta.label,
      prompt: meta.prompt,
      text,
      aligned: text.length >= 8,
    };
  });

  const alignedCount = pillars.filter((p) => p.aligned).length;
  const missingPillars = pillars.filter((p) => !p.aligned).map((p) => p.key);
  const completenessPct = Math.round((alignedCount / STAR_PILLARS.length) * 100);

  const byKey = Object.fromEntries(pillars.map((p) => [p.key, p]));
  const structuralKind = ['topology', 'charter', 'reporting-line'].includes(change?.kind);
  const incentiveMismatchWarning = (byKey.structure.aligned || structuralKind) && !byKey.rewards.aligned
    ? 'Structure is changing without updating Rewards & Goals (Galbraith Star / Holmström & Milgrom, 1991). People evaluated on old local metrics will rationally resist the new boundary.'
    : null;
  const processGapWarning = (byKey.structure.aligned || structuralKind) && !byKey.processes.aligned
    ? 'Structure is changing without defining Processes & Rituals. New team lines with old intake/handoff habits recreate the old bottleneck.'
    : null;
  const missingNonGoalsWarning = !nonGoals
    ? 'No explicit non-goals recorded (Porter, 1996). Naming what stops prevents the team from carrying both the old charter and the new one.'
    : null;

  return {
    pillars,
    alignedCount,
    totalPillars: STAR_PILLARS.length,
    missingPillars,
    completenessPct,
    hasNonGoals: Boolean(nonGoals),
    nonGoals,
    incentiveMismatchWarning,
    processGapWarning,
    missingNonGoalsWarning,
  };
}

/**
 * Kotter Guiding Coalition + Mendelow (1981) 2x2 Power × Interest +
 * Tsebelis (2002) Veto-Player sufficiency.
 */
export function evaluateGuidingCoalition(change, now = new Date()) {
  const today = dayKey(now);
  const rawList = Array.isArray(change?.coalition) ? change.coalition : [];
  const byQuadrant = {
    'manage-closely': [],
    'keep-satisfied': [],
    'keep-informed': [],
    monitor: [],
  };

  let supportivePower = 0;
  let opposingPower = 0;
  let neutralPower = 0;
  const vetoPlayers = [];
  const unalignedVetoPlayers = [];
  const overdueBriefs = [];
  const champions = [];

  const members = rawList
    .filter((m) => m && String(m.name || '').trim())
    .map((m) => {
      const power = clampInt(m.power, 1, 5, 3);
      const interest = clampInt(m.interest, 1, 5, 3);
      const stance = ['champion', 'supportive', 'neutral', 'skeptical', 'blocker'].includes(m.stance)
        ? m.stance
        : 'neutral';
      const quadrant = classifyMendelowStakeholder({ power, interest }).quadrant;
      const vetoPlayer = Boolean(m.vetoPlayer);

      if (stance === 'champion' || stance === 'supportive') supportivePower += power;
      else if (stance === 'skeptical' || stance === 'blocker') opposingPower += power;
      else neutralPower += power;

      const briefOverdue = Boolean(m.nextBriefOn && m.nextBriefOn < today);
      const daysUntilBrief = m.nextBriefOn ? calendarDiffDays(today, m.nextBriefOn) : null;

      const enriched = {
        ...m,
        power,
        interest,
        stance,
        vetoPlayer,
        quadrant,
        quadrantLabel: MENDELOW_QUADRANTS[quadrant].label,
        briefOverdue,
        daysUntilBrief,
      };
      byQuadrant[quadrant].push(enriched);
      if (stance === 'champion' && power >= 3) champions.push(enriched);
      if (vetoPlayer) {
        vetoPlayers.push(enriched);
        if (stance === 'skeptical' || stance === 'blocker' || stance === 'neutral') {
          unalignedVetoPlayers.push(enriched);
        }
      }
      if (briefOverdue) overdueBriefs.push(enriched);
      return enriched;
    });

  const netPowerBalance = supportivePower - opposingPower;
  const sufficientGuidingCoalition =
    members.length > 0 &&
    champions.length >= 1 &&
    netPowerBalance > 0 &&
    unalignedVetoPlayers.filter((v) => v.stance === 'blocker' || v.stance === 'skeptical').length === 0;

  return {
    total: members.length,
    members,
    byQuadrant,
    champions,
    supportivePower,
    opposingPower,
    neutralPower,
    netPowerBalance,
    vetoPlayers,
    unalignedVetoPlayers,
    overdueBriefs,
    sufficientGuidingCoalition,
  };
}

/**
 * 3-point Beta-PERT transition effort + J-curve payback & feasibility-adjusted
 * benefit analysis. Never invents dollar estimates when left blank.
 */
export function evaluateChangeEconomics(change, { forceField, star, coalition } = {}) {
  const effort = pertStats(
    change?.effortDays?.optimistic,
    change?.effortDays?.mostLikely,
    change?.effortDays?.pessimistic,
  );
  const rawEcon = change?.economics || {};
  const currency = String(rawEcon.currency || 'USD').trim().toUpperCase().slice(0, 6) || 'USD';
  const transitionCost = round2(nonNegative(rawEcon.transitionCost, 0));
  const horizonMonths = clampInt(rawEcon.horizonMonths, 1, 60, 12);
  const monthlyBenefit = pertStats(
    rawEcon.monthlyBenefit?.optimistic,
    rawEcon.monthlyBenefit?.mostLikely,
    rawEcon.monthlyBenefit?.pessimistic,
  );

  const financialMeasured = transitionCost > 0 || monthlyBenefit.measured;
  const grossHorizonBenefit = monthlyBenefit.measured
    ? round2(monthlyBenefit.expected * horizonMonths)
    : null;
  const p10HorizonBenefit = monthlyBenefit.measured
    ? round2(monthlyBenefit.p10 * horizonMonths)
    : null;
  const p90HorizonBenefit = monthlyBenefit.measured
    ? round2(monthlyBenefit.p90 * horizonMonths)
    : null;
  const netBenefit = grossHorizonBenefit !== null
    ? round2(grossHorizonBenefit - transitionCost)
    : null;
  const expectedPaybackMonths = transitionCost > 0 && monthlyBenefit.expected > 0
    ? round1(transitionCost / monthlyBenefit.expected)
    : null;

  // Transparent planning heuristic (never presented as an empirical probability):
  // discounts projected benefit when structural pre-conditions (Force-Field,
  // Star alignment, veto-player alignment) are incomplete.
  let feasibilityFactor = 1;
  const discountDrivers = [];
  if (forceField && forceField.measured && forceField.netForceRatio !== null && forceField.netForceRatio < 0.5) {
    feasibilityFactor *= 0.65;
    discountDrivers.push('restraining forces outweigh driving forces (×0.65)');
  } else if (forceField && forceField.unmitigatedSevere.length > 0) {
    feasibilityFactor *= 0.8;
    discountDrivers.push('unmitigated high-weight restraining force (×0.80)');
  }
  if (star && star.incentiveMismatchWarning) {
    feasibilityFactor *= 0.8;
    discountDrivers.push('unaligned Star rewards/goals (×0.80)');
  }
  if (coalition && coalition.unalignedVetoPlayers.some((v) => v.stance === 'blocker' || v.stance === 'skeptical')) {
    feasibilityFactor *= 0.6;
    discountDrivers.push('opposing/skeptical veto player (×0.60)');
  }
  feasibilityFactor = round2(feasibilityFactor);

  const riskAdjustedNetBenefit = grossHorizonBenefit !== null
    ? round2(grossHorizonBenefit * feasibilityFactor - transitionCost)
    : null;

  return {
    currency,
    effort,
    financialMeasured,
    transitionCost,
    horizonMonths,
    monthlyBenefit,
    grossHorizonBenefit,
    p10HorizonBenefit,
    p90HorizonBenefit,
    netBenefit,
    expectedPaybackMonths,
    feasibilityFactor,
    discountDrivers,
    riskAdjustedNetBenefit,
  };
}

/**
 * Evaluate tracked operational metrics using Shewhart XmR baseline-vs-post shift
 * verification (`spc.js`).
 */
export function evaluateChangeMetrics(change) {
  const metrics = Array.isArray(change?.metrics) ? change.metrics : [];
  const rows = metrics
    .filter((m) => m && String(m.name || '').trim())
    .map((m) => {
      const dir = m.desirableDirection === 'higher' ? 'higher' : 'lower';
      const unitStr = m.unit ? ` ${m.unit}` : '';
      const obs = (Array.isArray(m.observations) ? m.observations : [])
        .slice()
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      const shift = compareBaselineShift(obs, {
        desirableDirection: dir,
        minBound: 0,
        unit: unitStr,
      });
      const spc = computeXmR(
        obs.map((o, idx) => ({
          label: o.date || `P${idx + 1}`,
          date: o.date || null,
          value: o.value,
          note: o.note || '',
          phase: o.phase || 'baseline',
        })),
        { minBound: 0, desirableDirection: dir, unit: unitStr },
      );
      return {
        id: m.id,
        name: m.name,
        unit: m.unit || '',
        desirableDirection: dir,
        observations: obs,
        shift,
        spc,
      };
    });

  return {
    total: rows.length,
    measuredCount: rows.filter((r) => r.shift.measured).length,
    verifiedShiftCount: rows.filter((r) => r.shift.statisticallyVerified).length,
    adverseShiftCount: rows.filter((r) => r.shift.verdict === 'adverse-shift' || r.shift.verdict === 'directional-regression').length,
    rows,
  };
}

/**
 * Kotter (1995, 1996) 8-Step progression with live evidence checks and
 * stage-skip detection.
 */
export function evaluateKotterProgression(change, context = {}) {
  const forceField = context.forceField || evaluateForceField(change);
  const topology = context.topology || evaluateTopologyAndLoad(change);
  const star = context.star || evaluateStarAlignment(change);
  const coalition = context.coalition || evaluateGuidingCoalition(change);
  const metrics = context.metrics || evaluateChangeMetrics(change);
  const { state } = context;
  const stage = KOTTER_STEPS.includes(change?.kotterStage) ? change.kotterStage : 'urgency';
  const currentIndex = KOTTER_STEPS.indexOf(stage);
  const completedSet = new Set(
    (Array.isArray(change?.completedSteps) ? change.completedSteps : []).filter((s) => KOTTER_STEPS.includes(s)),
  );
  if (change?.status === 'anchored') {
    for (const step of KOTTER_STEPS) completedSet.add(step);
  }

  const wins = Array.isArray(change?.shortTermWins) ? change.shortTermWins : [];
  const verifiedWins = wins.filter((w) => w && String(w.text || '').trim() && w.verified !== false);

  const impacts = Array.isArray(change?.impacts) ? change.impacts : [];
  const scopeImpacts = impacts.filter((imp) => imp && ['scope-shift', 'reporting-line'].includes(imp.impactKind));
  const onboardingPlans = state?.onboarding || [];
  const coveredTransitions = scopeImpacts.filter((imp) =>
    onboardingPlans.some((p) => p.personId === imp.personId && p.status === 'active'),
  );

  const evidenceByStep = {
    urgency: {
      backed: String(change?.summary || '').trim().length >= 15,
      note: String(change?.summary || '').trim().length >= 15
        ? 'Problem & cost of inaction documented'
        : 'Add concrete urgency / cost-of-inaction evidence',
    },
    coalition: {
      backed: Boolean(coalition?.sufficientGuidingCoalition),
      note: coalition?.total
        ? coalition.sufficientGuidingCoalition
          ? `Guiding coalition aligned (+${coalition.netPowerBalance} net power, veto players clear)`
          : coalition.unalignedVetoPlayers.length
            ? `${coalition.unalignedVetoPlayers.length} veto player(s) not yet supportive`
            : 'Needs at least one high-power champion and positive net power'
        : 'No guiding coalition stakeholders mapped yet',
    },
    vision: {
      backed: String(change?.vision || '').trim().length >= 15 && Boolean(star?.hasNonGoals),
      note: String(change?.vision || '').trim().length >= 15 && star?.hasNonGoals
        ? 'Target charter and explicit non-goals defined'
        : 'Requires both target vision/charter and explicit non-goals (what stops)',
    },
    communicate: {
      backed: Boolean(coalition && coalition.total > 0 && coalition.overdueBriefs.length === 0),
      note: !coalition?.total
        ? 'Map stakeholders to track briefing cadence'
        : coalition.overdueBriefs.length
          ? `${coalition.overdueBriefs.length} stakeholder brief(s) overdue`
          : 'Stakeholder briefings inside cadence',
    },
    obstacles: {
      backed:
        Boolean(forceField?.restraining.length) &&
        forceField.unmitigatedSevere.length === 0 &&
        (scopeImpacts.length === 0 || coveredTransitions.length === scopeImpacts.length),
      note: !forceField?.restraining.length
        ? 'Map restraining forces to identify real obstacles'
        : forceField.unmitigatedSevere.length > 0
          ? `${forceField.unmitigatedSevere.length} severe restraining force(s) still unmitigated`
          : scopeImpacts.length > coveredTransitions.length
            ? `${scopeImpacts.length - coveredTransitions.length} role-scope shift(s) lack an active 30-60-90 plan`
            : 'Severe blockers mitigated and role transitions scaffolded',
    },
    'short-wins': {
      backed: verifiedWins.length >= 1,
      note: verifiedWins.length
        ? `${verifiedWins.length} dated short-term win(s) recorded`
        : 'No dated short-term win recorded yet',
    },
    consolidate: {
      backed:
        (topology?.handoffsDelta !== null && topology.handoffsDelta < 0) ||
        (topology?.loadDelta !== null && topology.loadDelta < 0) ||
        Boolean(metrics?.measuredCount > 0 && metrics.adverseShiftCount === 0),
      note: metrics?.verifiedShiftCount > 0
        ? `${metrics.verifiedShiftCount} metric(s) show verified post-change improvement`
        : (topology?.handoffsDelta !== null && topology.handoffsDelta < 0) || (topology?.loadDelta !== null && topology.loadDelta < 0)
          ? 'Target topology reduces handoffs / cognitive load; add post-change metric observations to verify'
          : 'Record before/after flow metrics or handoff reductions',
    },
    anchor: {
      backed: Boolean(star && star.alignedCount >= 4 && !star.incentiveMismatchWarning && change?.reviewOn),
      note: star?.incentiveMismatchWarning
        ? 'Rewards/goals pillar not yet aligned with new structure'
        : (star?.alignedCount || 0) < 4
          ? `${star?.alignedCount || 0}/5 Star Model pillars aligned`
          : !change?.reviewOn
            ? 'Set a post-change review date to verify anchoring'
            : 'Star Model pillars aligned and post-change review scheduled',
    },
  };

  const stepChecks = KOTTER_STEPS.map((key, idx) => {
    const meta = KOTTER_STEP_META[key];
    const ev = evidenceByStep[key];
    const completed = completedSet.has(key);
    const current = idx === currentIndex && change?.status !== 'anchored';
    const skipped = idx < currentIndex && (!completed || !ev.backed);
    return {
      key,
      step: meta.step,
      label: meta.label,
      title: meta.title,
      question: meta.question,
      completed,
      current,
      backed: ev.backed,
      note: ev.note,
      skipped,
    };
  });

  const skippedSteps = stepChecks.filter((s) => s.skipped);

  return {
    currentStage: stage,
    currentIndex,
    currentMeta: KOTTER_STEP_META[stage],
    completedCount: completedSet.size,
    backedCount: stepChecks.filter((s) => s.backed).length,
    verifiedWinsCount: verifiedWins.length,
    stepChecks,
    skippedSteps,
    hasSkippedFoundations: skippedSteps.length > 0,
  };
}

/**
 * Full analytical summary for a single Organizational Change record.
 */
export function summarizeChange(change, state, now = new Date()) {
  const today = dayKey(now);
  const open = isChangeOpen(change);
  const committed = isChangeCommitted(change);
  const forceField = evaluateForceField(change);
  const topology = evaluateTopologyAndLoad(change);
  const star = evaluateStarAlignment(change);
  const coalition = evaluateGuidingCoalition(change, now);
  const metrics = evaluateChangeMetrics(change);
  const kotter = evaluateKotterProgression(change, { forceField, topology, star, coalition, metrics, state });
  const economics = evaluateChangeEconomics(change, { forceField, star, coalition });

  const owner = change.ownerId ? (state?.people || []).find((p) => p.id === change.ownerId) || null : null;
  const linkedGoal = change.linkedGoalId ? (state?.goals || []).find((g) => g.id === change.linkedGoalId) || null : null;
  const links = state ? linksForEntity(state, 'change', change.id) : [];

  const impacts = (Array.isArray(change.impacts) ? change.impacts : []).map((imp) => {
    const person = (state?.people || []).find((p) => p.id === imp.personId) || null;
    const activeTransition = (state?.onboarding || []).find(
      (o) => o.personId === imp.personId && o.status === 'active',
    ) || null;
    return {
      ...imp,
      impactLabel: CHANGE_IMPACT_LABELS[imp.impactKind] || imp.impactKind,
      person,
      activeTransition,
      missingTransitionPlan:
        committed &&
        ['scope-shift', 'reporting-line'].includes(imp.impactKind) &&
        !activeTransition,
    };
  });

  const reviewOverdue = Boolean(open && change.reviewOn && change.reviewOn < today);
  const daysUntilReview = change.reviewOn ? calendarDiffDays(today, change.reviewOn) : null;
  const targetOverdue = Boolean(open && change.targetOn && change.targetOn < today);

  const needsAttention =
    open &&
    (forceField.highTensionStalemate ||
      forceField.unmitigatedSevere.length > 0 ||
      coalition.unalignedVetoPlayers.some((v) => v.stance === 'blocker' || v.stance === 'skeptical') ||
      coalition.overdueBriefs.length > 0 ||
      kotter.hasSkippedFoundations ||
      Boolean(star.incentiveMismatchWarning) ||
      impacts.some((i) => i.missingTransitionPlan) ||
      reviewOverdue);

  return {
    change,
    open,
    committed,
    owner,
    linkedGoal,
    forceField,
    topology,
    star,
    coalition,
    metrics,
    kotter,
    economics,
    impacts,
    links,
    reviewOverdue,
    daysUntilReview,
    targetOverdue,
    needsAttention,
  };
}

/**
 * Portfolio-level rollup across all Organizational Changes in `state.changes`.
 */
export function changesRollup(state, now = new Date()) {
  const list = Array.isArray(state?.changes) ? state.changes : [];
  const all = list.map((ch) => summarizeChange(ch, state, now));
  const open = all.filter((s) => s.open);
  const committed = all.filter((s) => s.committed);
  const anchored = all.filter((s) => s.change.status === 'anchored');
  const attention = open.filter((s) => s.needsAttention);
  const reviewDue = open.filter((s) => s.reviewOverdue || (s.daysUntilReview !== null && s.daysUntilReview <= 7));

  const committedEffortDays = round2(
    committed.reduce((sum, s) => sum + (s.economics.effort.measured ? s.economics.effort.expected : 0), 0),
  );
  const unalignedVetoCount = open.reduce(
    (sum, s) => sum + s.coalition.unalignedVetoPlayers.filter((v) => v.stance === 'blocker' || v.stance === 'skeptical').length,
    0,
  );
  const overdueBriefsCount = open.reduce((sum, s) => sum + s.coalition.overdueBriefs.length, 0);
  const unmitigatedBlockerCount = open.reduce((sum, s) => sum + s.forceField.unmitigatedSevere.length, 0);

  return {
    total: all.length,
    all,
    open,
    committed,
    anchored,
    attention,
    reviewDue,
    committedEffortDays,
    unalignedVetoCount,
    overdueBriefsCount,
    unmitigatedBlockerCount,
  };
}

/**
 * Active changes affecting a given team member (for 1:1 prep & person profile,
 * strictly excluded from performance review scoring).
 */
export function openChangesForPerson(state, personId, now = new Date()) {
  if (!state || !personId) return [];
  return (state.changes || [])
    .filter((ch) => isChangeOpen(ch) && (
      ch.ownerId === personId ||
      (Array.isArray(ch.impacts) && ch.impacts.some((imp) => imp.personId === personId))
    ))
    .map((ch) => summarizeChange(ch, state, now));
}
