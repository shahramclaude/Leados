/**
 * app/core/domain/resilience.js — Operational Resilience, Dependency &
 * Continuity Terminal.
 *
 * Why this module exists
 * ----------------------
 * LeadOS already knew who reports to the leader, which goals are funded, which
 * budgets are encumbered, and which negotiations are open. What it could not
 * answer is the four operational-resilience questions boards, regulators (EU
 * DORA Art. 11, 26 & 29; UK PRA / BCBS Operational Resilience) and first-time
 * leaders actually face when a key person goes on unexpected leave or a shared
 * cloud/vendor service fails:
 *
 *   1. Which important capabilities sit on a Bus Factor of 1 (human SPOF) or
 *      an unverified shadow backup?
 *   2. Where does recovery time exceed survival buffer (TTR > TTS), and how
 *      far does a failure cascade across multi-tier upstream dependencies?
 *   3. Which cheap or hidden Tier-2/Tier-3 nodes sit behind multiple services
 *      as common-mode choke points, and where is supplier or stewardship
 *      concentration (HHI) or Williamson hold-up power highest?
 *   4. Have our recovery-time estimates survived real continuity drills, or
 *      are they untested paper assumptions?
 *
 * Named theoretical & quantitative foundations implemented explicitly:
 *
 *  1. Production & Supply-Chain Resilience — Simchi-Levi, Schmidt & Wei (HBR
 *     2014; Management Science 2015) and Gao, Simchi-Levi, Teo & Yan
 *     (Operations Research, 2019):
 *       - Time-to-Survive (TTS): maximum disruption duration absorbed by
 *         buffers/fallbacks before downstream service or goal loss begins
 *         (equivalent to UK PRA / EU DORA Impact Tolerance).
 *       - Time-to-Recover (TTR): time required to restore full function or
 *         activate a qualified substitute.
 *       - Survival Shortfall: max(0, effectiveTTR − TTS), propagated along
 *         directed dependency paths with warm-standby / dual-active
 *         attenuation.
 *       - Risk Exposure Index (REI ∈ [0, 1]): node blast-radius financial
 *         shortfall normalized to the highest-exposure node in the same
 *         currency cohort (never summed across currencies).
 *
 *  2. Engineering & Systems Thinking — Bus Factor / Truck Factor via minimal
 *     hitting-set cut analysis (Avelino, Passos, Hora & Valente, ICPC 2016;
 *     Jabrayilzade et al., 2022) and Perrow (1984) Normal Accidents common-mode
 *     choke-point detection across Nth-party dependency tiers.
 *
 *  3. Economics & Industrial Organization — Herfindahl-Hirschman Index
 *     (Hirschman, 1945; Herfindahl, 1950; US DOJ/FTC 2023 Merger Guidelines:
 *     <1,500 unconcentrated, 1,500–2,500 moderate, >2,500 high) applied to
 *     both vendor spend per currency and human primary stewardship, paired
 *     with Williamson (1979, 1985) asset-specificity / Klein-Crawford-Alchian
 *     (1978) hold-up risk.
 *
 *  4. Finance & Capital Allocation — Expected Annual Disruption Loss (EADL =
 *     annualFailureProb × blastRadiusExposure) and Redundancy / Mitigation ROI
 *     when mitigation cost and annual disruption likelihood are recorded.
 *
 *  5. Political Science & Bargaining — Pfeffer & Salancik (1978) Resource
 *     Dependence Theory and Tsebelis (2002) external gatekeeper veto exposure
 *     linked live to Stakeholder Register stances and Negotiation BATNA/impasse
 *     records.
 *
 *  6. Non-Parametric Statistics — Split-conformal outside-view recovery-time
 *     bands (Vovk et al., 2005; Angelopoulos & Bates, 2021) and exact
 *     two-sided binomial sign tests on realized-vs-estimated drill recovery
 *     ratios, strictly counts-only below n = 5 drills.
 *
 * Pure module: zero DOM, zero storage IO, zero network calls, zero wall-clock
 * globals. Confidential `conflicts` and anonymous `pulses` are never read,
 * written, or linked.
 */

import { addDays, dayKey, daysBetween, daysSince, round } from '../time.js';
import {
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  computePertImpact,
  isCaseOpen,
  linksForEntity,
} from './cases.js';
import { pertTriple, buildCapacityModel } from './capacity.js';
import { conformalBand, ratioSignTest } from './forecastIntegrity.js';

/* ------------------------------------------------------------------ */
/* Vocabulary & Constants                                              */
/* ------------------------------------------------------------------ */

export const RESILIENCE_ENGINE_VERSION = 'resilience-2026.10-v1';

/** Minimum scored continuity drills before conformal ratio bands unlock. */
export const RESILIENCE_MIN_DRILL_SAMPLES = 5;

/** Default drill staleness horizon (days) — DORA Art. 26 annual/semi-annual cadence. */
export const DEFAULT_RESILIENCE_DRILL_DAYS = 180;

/** Herfindahl-Hirschman Index (0–10,000) concentration thresholds (DOJ/FTC). */
export const HHI_MODERATE_THRESHOLD = 1500;
export const HHI_HIGH_THRESHOLD = 2500;

/** Materiality threshold for refreshing derived daily impact on post-commit. */
export const IMPACT_DRIFT_THRESHOLD = 0.2;

export const DEPENDENCY_KINDS = ['service', 'vendor', 'system', 'process'];

export const DEPENDENCY_KIND_LABELS = {
  service: 'Important service / capability',
  vendor: 'External vendor / supplier',
  system: 'Technical platform / infrastructure',
  process: 'Critical runbook / recurring process',
};

export const DEPENDENCY_CRITICALITIES = ['critical', 'important', 'supporting'];

export const DEPENDENCY_CRITICALITY_LABELS = {
  critical: 'Critical (Tier 0/1)',
  important: 'Important',
  supporting: 'Supporting',
};

export const CRITICALITY_RANK = {
  critical: 3,
  important: 2,
  supporting: 1,
};

export const DEPENDENCY_STATUSES = ['active', 'mitigating', 'retired'];

export const DEPENDENCY_STATUS_LABELS = {
  active: 'Active',
  mitigating: 'Mitigating',
  retired: 'Retired',
};

export const SUBSTITUTABILITY_MODES = ['none', 'untested-alt', 'warm-standby', 'dual-active'];

export const SUBSTITUTABILITY_LABELS = {
  none: 'Sole source / no substitute',
  'untested-alt': 'Paper / untested alternative',
  'warm-standby': 'Qualified warm standby',
  'dual-active': 'Dual-active / multi-homed',
};

export const SUBSTITUTABILITY_HELP = {
  none: 'Full upstream outage propagates; switching requires qualifying a replacement from scratch.',
  'untested-alt': 'An alternative is named on paper, but failover has not been proven under load; full TTR still propagates.',
  'warm-standby': 'A pre-qualified secondary source or standby can take traffic after the recorded switchover window.',
  'dual-active': 'Load is actively split across independent paths; a single-node outage causes zero service interruption.',
};

export const STEWARD_ROLES = ['primary', 'backup', 'trainee'];

export const STEWARD_ROLE_LABELS = {
  primary: 'Primary steward',
  backup: 'Backup steward',
  trainee: 'Cross-training shadow',
};

export const DRILL_KINDS = ['tabletop', 'failover-drill', 'live-incident'];

export const DRILL_KIND_LABELS = {
  tabletop: 'Tabletop walkthrough',
  'failover-drill': 'Live failover / switchover drill',
  'live-incident': 'Real incident recovery',
};

export const DRILL_OUTCOMES = ['within-tolerance', 'breached-tolerance', 'partial'];

export const DRILL_OUTCOME_LABELS = {
  'within-tolerance': 'Recovered within TTS tolerance',
  'breached-tolerance': 'Breached TTS survival tolerance',
  partial: 'Partial / degraded recovery',
};

export const RESILIENCE_RULES = Object.freeze([
  {
    id: 'RULE-RES-01',
    name: 'Dependency topology links & derived shortfall valuation',
    framework: 'Simchi-Levi et al. (2014, 2015) Risk Exposure Index & Typed Operational Graph',
    trigger: 'dependency.created / dependency.updated / case.* / budget.* / negotiation.* / portfolio.*',
    targetModule: 'dependencies / links',
    description: 'Maintains idempotent typed edges (`depends-on`, `stewards`, `impacts-goal`, `funds`, `negotiates`, `involves`) and derives per-day shortfall exposure from linked records per currency when no manual override is set, refreshing on >20% drift without overwriting human inputs.',
  },
  {
    id: 'RULE-RES-02',
    name: 'Critical Bus-Factor-1 (SPOF) → cross-training delegation & 1:1 relief',
    framework: 'Avelino et al. (2016) Bus Factor & Edmondson (1999) Blameless Load Relief',
    trigger: 'dependency.created / dependency.updated / person.archived / person.restored',
    targetModule: 'delegations / people (1:1 talking points) / links',
    description: 'When an active critical capability has Bus Factor ≤ 1 (including when its backup steward is archived on the roster), opens one idempotent, blameless cross-training delegation and queues a focus/vacation-protection 1:1 talking point — cleaning up the talking point once a second verified steward is recorded.',
  },
  {
    id: 'RULE-RES-03',
    name: 'Critical survival shortfall (TTR > TTS) → DACI continuity trade-off decision',
    framework: 'Simchi-Levi TTS/TTR Continuity Gap, EU DORA Art. 11 Impact Tolerance & Intuit DACI',
    trigger: 'dependency.created / dependency.updated / dependency.drillRecorded',
    targetModule: 'decisions / links',
    description: 'When an active critical dependency exhibits a measured direct or cascading survival shortfall (effective TTR > TTS) without dual-active substitution, opens one idempotent DACI decision comparing buffer extension (↑TTS), failover acceleration (↓TTR), synchronous decoupling, or explicit risk acceptance.',
  },
  {
    id: 'RULE-RES-04',
    name: 'Vendor hold-up & asymmetric dependency → negotiation & stakeholder linkage',
    framework: 'Williamson (1985) Asset Specificity / Hold-Up & Pfeffer-Salancik (1978) Resource Dependence',
    trigger: 'dependency.created / dependency.updated / negotiation.created / negotiation.updated',
    targetModule: 'links / negotiations / stakeholders',
    description: 'Links sole-source vendor dependencies carrying survival shortfalls to their open contract negotiations and stakeholder records so BATNA/walk-away prep reflects real switching time (TTR) without rewriting user-entered BATNA numbers.',
  },
  {
    id: 'RULE-RES-05',
    name: 'Breached continuity drill → operational case escalation & goal risk telemetry',
    framework: 'EU DORA Art. 26 Resilience Testing Remediation, AIAG-VDA FMEA & OKR Risk Telemetry',
    trigger: 'dependency.drillRecorded',
    targetModule: 'cases / goals / links',
    description: 'When a continuity drill or live incident breaches survival tolerance on a critical/important dependency, logs an explainable at-risk check-in on linked active goals and opens one linked Operational Case to drive systemic barrier remediation.',
  },
  {
    id: 'RULE-RES-06',
    name: 'Cross-training delegation completion → verification firewall & signals',
    framework: 'Closed-Loop Operational Control (Deming PDCA) & Human Verification Firewall',
    trigger: 'delegation.completed / render',
    targetModule: 'dependencies / insights / today / board pack',
    description: 'Records completion of a linked cross-training delegation in dependency history without fabricating `verifiedOn` on the backup steward until the leader explicitly verifies independent operation, and surfaces RES-01..07 signals.',
  },
]);

/* ------------------------------------------------------------------ */
/* Helpers — missing stays null, never fabricated zero                  */
/* ------------------------------------------------------------------ */

function finiteNonNeg(value, fallback = null) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function round2(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function isDependencyActive(dep) {
  return Boolean(dep && dep.status !== 'retired');
}

/* ------------------------------------------------------------------ */
/* 1. Herfindahl-Hirschman Index (HHI)                                  */
/* ------------------------------------------------------------------ */

/**
 * Compute exact Herfindahl-Hirschman Index (0–10,000), CR1, CR3, and effective
 * number of contributors `1 / sum(s_i^2)` from positive weights.
 *
 * @param {Array<{id:string, label:string, weight:number}>} entries
 */
export function computeHhi(entries = [], { highThreshold = HHI_HIGH_THRESHOLD } = {}) {
  const valid = (entries || [])
    .filter((e) => e && Number.isFinite(Number(e.weight)) && Number(e.weight) > 0)
    .map((e) => ({ id: e.id, label: e.label || e.id, weight: Number(e.weight) }))
    .sort((a, b) => b.weight - a.weight || String(a.id).localeCompare(String(b.id)));

  const total = valid.reduce((sum, e) => sum + e.weight, 0);
  if (!valid.length || total <= 0) {
    return {
      count: 0,
      total: 0,
      hhi: null,
      effectiveCount: null,
      cr1Pct: null,
      cr3Pct: null,
      band: 'insufficient',
      shares: [],
    };
  }

  const shares = valid.map((e) => {
    const share = e.weight / total;
    return {
      ...e,
      share,
      sharePct: round2(share * 100),
      hhiContribution: round2((share * 100) ** 2),
    };
  });

  const sumSq = shares.reduce((acc, s) => acc + s.share * s.share, 0);
  const hhi = Math.min(10000, Math.round(sumSq * 10000));
  const cr1Pct = shares[0]?.sharePct ?? 0;
  const cr3Pct = round2(shares.slice(0, 3).reduce((acc, s) => acc + s.share * 100, 0));
  const effectiveCount = sumSq > 0 ? round2(1 / sumSq) : null;

  let band = 'unconcentrated';
  if (valid.length === 1) band = 'monopoly';
  else if (hhi > highThreshold) band = 'high';
  else if (hhi >= HHI_MODERATE_THRESHOLD) band = 'moderate';

  return {
    count: valid.length,
    total: round2(total),
    hhi,
    effectiveCount,
    cr1Pct,
    cr3Pct,
    band,
    shares,
  };
}

/* ------------------------------------------------------------------ */
/* 2. Stewardship & Bus-Factor Evaluation                               */
/* ------------------------------------------------------------------ */

/**
 * Evaluate human stewardship of a single dependency against live roster status
 * and active 30-60-90 onboarding/transition ramps.
 *
 * Epistemic guard: a backup steward without `verifiedOn` or a `trainee` shadow
 * is reported as `inTraining` — never counted in `busFactor` until verified.
 */
export function evaluateStewardship(dep, state = {}, now = new Date()) {
  const peopleById = new Map((state?.people || []).map((p) => [p.id, p]));
  const onboardingPlans = state?.onboarding || [];
  const rawStewards = Array.isArray(dep?.stewards) ? dep.stewards : [];

  const detailed = [];
  for (const s of rawStewards) {
    if (!s || !s.personId) continue;
    const person = peopleById.get(s.personId) || null;
    if (!person) continue;
    const active = person.status !== 'archived';
    const role = STEWARD_ROLES.includes(s.role) ? s.role : 'backup';
    const verifiedOn = s.verifiedOn || null;
    const activePlan = onboardingPlans.find((plan) => plan.personId === person.id && plan.status === 'active') || null;
    const planAge = activePlan?.startDate ? daysSince(activePlan.startDate, now) : null;
    const ramping = Boolean(activePlan && planAge !== null && planAge >= 0 && planAge < 30);

    // Primary stewards are active operators by definition; backups require
    // explicit `verifiedOn` so a newly added name on paper does not hide a SPOF.
    const qualified = Boolean(
      active && (role === 'primary' || (role === 'backup' && Boolean(verifiedOn))),
    );
    const inTraining = Boolean(
      active && !qualified && (role === 'trainee' || (role === 'backup' && !verifiedOn)),
    );

    detailed.push({
      personId: person.id,
      personName: person.name,
      personRole: person.role || '',
      role,
      roleLabel: STEWARD_ROLE_LABELS[role],
      verifiedOn,
      notes: s.notes || '',
      active,
      ramping,
      qualified,
      inTraining,
    });
  }

  const qualifiedStewards = detailed.filter((s) => s.qualified);
  const primaryStewards = detailed.filter((s) => s.active && s.role === 'primary');
  const verifiedBackups = detailed.filter((s) => s.active && s.role === 'backup' && Boolean(s.verifiedOn));
  const inTrainingStewards = detailed.filter((s) => s.inTraining);
  const archivedStewards = detailed.filter((s) => !s.active);

  const busFactor = qualifiedStewards.length;
  const activeDep = isDependencyActive(dep);
  // Dual-active external vendors with documented exit plans do not rely on a
  // single internal operator in the same way a team-owned service/process does,
  // unless they have 0 internal relationship contacts.
  const isHumanSpof = Boolean(
    activeDep && (
      dep?.kind === 'vendor'
        ? busFactor === 0 || (busFactor === 1 && dep?.criticality === 'critical' && dep?.substitutability === 'none')
        : busFactor <= 1
    ),
  );

  return {
    stewards: detailed,
    qualifiedStewards,
    primaryStewards,
    verifiedBackups,
    inTrainingStewards,
    archivedStewards,
    busFactor,
    inTrainingCount: inTrainingStewards.length,
    archivedCount: archivedStewards.length,
    rampingQualifiedCount: qualifiedStewards.filter((s) => s.ramping).length,
    isHumanSpof,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Derived Financial Exposure per Shortfall Day                      */
/* ------------------------------------------------------------------ */

/**
 * Derive daily financial impact during a survival shortfall (`TTR > TTS`) from
 * explicit override or linked operational records. Currencies are never mixed
 * or converted; missing money stays `{ priced: false, dailyImpact: null }`.
 */
export function deriveDependencyImpact(dep, state = {}) {
  const defaultCurrency = String(dep?.currency || 'USD').toUpperCase();
  const override = finiteNonNeg(dep?.dailyImpactOverride);
  if (override !== null && override > 0) {
    return {
      priced: true,
      dailyImpact: round2(override),
      currency: defaultCurrency,
      source: 'override',
      termCount: 1,
      byCurrency: [{ currency: defaultCurrency, dailyImpact: round2(override), sources: ['leader override'] }],
    };
  }
  if (override === 0) {
    return {
      priced: true,
      dailyImpact: 0,
      currency: defaultCurrency,
      source: 'override',
      termCount: 1,
      byCurrency: [{ currency: defaultCurrency, dailyImpact: 0, sources: ['explicit zero override'] }],
    };
  }

  const buckets = new Map();
  const addTerm = (currencyRaw, dailyAmount, label) => {
    const amt = finiteNonNeg(dailyAmount);
    if (amt === null || amt <= 0) return;
    const cur = String(currencyRaw || defaultCurrency || 'USD').toUpperCase();
    const entry = buckets.get(cur) || { currency: cur, dailyImpact: 0, sources: [] };
    entry.dailyImpact = round2(entry.dailyImpact + amt);
    entry.sources.push(label);
    buckets.set(cur, entry);
  };

  // 1. Linked Portfolio work (costOfDelayPerWeek / 7, or PERT expected value / 90d quarter)
  const portfolioIds = new Set();
  if (dep?.linkedPortfolioId) portfolioIds.add(dep.linkedPortfolioId);
  for (const edge of linksForEntity(state, 'dependency', dep?.id)) {
    if (edge.peer.type === 'portfolio') portfolioIds.add(edge.peer.id);
  }
  for (const pid of portfolioIds) {
    const item = (state?.portfolio || []).find((p) => p.id === pid);
    if (!item || item.status === 'cancelled') continue;
    const codWeek = finiteNonNeg(item.costOfDelayPerWeek);
    if (codWeek !== null && codWeek > 0) {
      addTerm(item.valueCurrency || defaultCurrency, codWeek / 7, `portfolio CoD (${item.title})`);
    } else if (item.value) {
      const triple = pertTriple(item.value);
      if (triple && triple.expected > 0) {
        addTerm(item.valueCurrency || defaultCurrency, triple.expected / 90, `portfolio value (${item.title})`);
      }
    }
  }

  // 2. Linked Open Operational Cases (PERT expected exposure amortized over 30d window)
  const caseIds = new Set();
  for (const edge of linksForEntity(state, 'dependency', dep?.id)) {
    if (edge.peer.type === 'case') caseIds.add(edge.peer.id);
  }
  for (const cid of caseIds) {
    const c = (state?.cases || []).find((rec) => rec.id === cid);
    if (!c || !isCaseOpen(c)) continue;
    const pert = computePertImpact(c.financial, c.fmea);
    if (pert.hasFinancialEstimate && pert.cost.expected > 0) {
      addTerm(pert.currency || defaultCurrency, pert.cost.expected / 30, `case exposure (${c.title})`);
    }
  }

  // 3. Linked Negotiation stakes (annualized daily contract value at risk)
  const negIds = new Set();
  if (dep?.linkedNegotiationId) negIds.add(dep.linkedNegotiationId);
  for (const edge of linksForEntity(state, 'dependency', dep?.id)) {
    if (edge.peer.type === 'negotiation') negIds.add(edge.peer.id);
  }
  for (const nid of negIds) {
    const neg = (state?.negotiations || []).find((n) => n.id === nid);
    if (!neg || neg.status === 'withdrawn') continue;
    const stakes = finiteNonNeg(neg.stakesValue);
    if (stakes !== null && stakes > 0) {
      addTerm(neg.stakesCurrency || defaultCurrency, stakes / 365, `negotiation stakes (${neg.title})`);
    }
  }

  // 4. Linked Budget envelope (encumbered + spent lines / 365, or explicit annualSpend / 365)
  const annualSpend = finiteNonNeg(dep?.annualSpend);
  if (annualSpend !== null && annualSpend > 0) {
    addTerm(defaultCurrency, annualSpend / 365, 'recorded annual spend');
  } else if (dep?.linkedBudgetId) {
    const budget = (state?.budgets || []).find((b) => b.id === dep.linkedBudgetId);
    if (budget) {
      const committed = (budget.lines || [])
        .filter((l) => l.status === 'committed' || l.status === 'spent')
        .reduce((sum, l) => sum + (finiteNonNeg(l.status === 'spent' ? l.actualAmount : l.committedAmount, 0) || 0), 0);
      if (committed > 0) {
        addTerm(budget.currency || defaultCurrency, committed / 365, `budget commitments (${budget.name})`);
      }
    }
  }

  const byCurrency = [...buckets.values()].sort(
    (a, b) => b.dailyImpact - a.dailyImpact || a.currency.localeCompare(b.currency),
  );
  if (!byCurrency.length) {
    return {
      priced: false,
      dailyImpact: null,
      currency: defaultCurrency,
      source: 'unpriced',
      termCount: 0,
      byCurrency: [],
    };
  }

  const primary = byCurrency[0];
  const totalTerms = byCurrency.reduce((sum, b) => sum + b.sources.length, 0);
  return {
    priced: true,
    dailyImpact: primary.dailyImpact,
    currency: primary.currency,
    source: 'derived',
    termCount: totalTerms,
    multiCurrency: byCurrency.length > 1,
    byCurrency,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Multi-Tier Cascade Graph & Simchi-Levi REI                        */
/* ------------------------------------------------------------------ */

/**
 * Effective outage (in days) transmitted across edge `upstream -> target` when
 * `upstream` is unavailable for `sourceOutageDays`.
 */
export function effectivePropagatedOutage(sourceOutageDays, targetDep) {
  const d = finiteNonNeg(sourceOutageDays);
  if (d === null || d <= 0) return 0;
  const mode = targetDep?.substitutability || 'none';
  if (mode === 'dual-active') return 0;
  if (mode === 'warm-standby') {
    const switchDays = finiteNonNeg(targetDep?.warmSwitchDays, 1);
    return round2(Math.min(d, switchDays));
  }
  return round2(d);
}

/**
 * Analyze the full directed dependency graph `G = (V, E)`:
 *  - Cycle detection (DFS 3-color) so cyclic graphs never hang
 *  - Tier depth (Tier 1 = leaf business capabilities/services, Tier 2 = direct
 *    suppliers/systems, Tier 3+ = sub-tier / Nth-party dependencies)
 *  - Worst-path cascading outage propagation bounded to |V| − 1 hops
 *  - Direct and cascading Survival Shortfalls `max(0, outage − TTS)`
 *  - Per-currency Blast-Radius Exposure & Simchi-Levi REI ∈ [0, 1]
 *  - Hidden Nth-Party / Common-Mode Choke Points (DORA Art. 29)
 */
export function analyzeDependencyNetwork(state = {}, now = new Date()) {
  const allDeps = Array.isArray(state?.dependencies) ? state.dependencies : [];
  const activeDeps = allDeps.filter(isDependencyActive);
  const byId = new Map(activeDeps.map((d) => [d.id, d]));

  // Edge u -> v means "v depends on upstream u" (disruption flows u -> v).
  const downstreamOf = new Map();
  const upstreamOf = new Map();
  for (const dep of activeDeps) {
    downstreamOf.set(dep.id, []);
    upstreamOf.set(dep.id, []);
  }
  for (const dep of activeDeps) {
    const ups = Array.isArray(dep.upstreamIds) ? dep.upstreamIds : [];
    for (const upId of ups) {
      if (!upId || upId === dep.id || !byId.has(upId)) continue;
      if (!downstreamOf.get(upId).includes(dep.id)) downstreamOf.get(upId).push(dep.id);
      if (!upstreamOf.get(dep.id).includes(upId)) upstreamOf.get(dep.id).push(upId);
    }
  }

  // Cycle detection (3-color DFS)
  const color = new Map(); // 0/undef = unvisited, 1 = visiting, 2 = done
  const cycleNodeIds = new Set();
  const visit = (id, stack) => {
    color.set(id, 1);
    stack.push(id);
    for (const nextId of downstreamOf.get(id) || []) {
      const c = color.get(nextId) || 0;
      if (c === 1) {
        const idx = stack.indexOf(nextId);
        for (let i = idx >= 0 ? idx : 0; i < stack.length; i += 1) cycleNodeIds.add(stack[i]);
      } else if (c === 0) {
        visit(nextId, stack);
      }
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const dep of activeDeps) {
    if (!color.get(dep.id)) visit(dep.id, []);
  }

  // Compute tier depth: distance from the furthest downstream consumer + 1.
  // Leaf services with no downstream consumers sit at Tier 1; their direct
  // vendors/systems sit at Tier 2; sub-tier infrastructure sits at Tier 3+.
  const tierById = new Map();
  for (const dep of activeDeps) tierById.set(dep.id, 1);
  const maxPasses = Math.max(1, activeDeps.length - 1);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const dep of activeDeps) {
      const downs = downstreamOf.get(dep.id) || [];
      for (const downId of downs) {
        const candidate = Math.min(activeDeps.length, (tierById.get(downId) || 1) + 1);
        if (candidate > (tierById.get(dep.id) || 1)) {
          tierById.set(dep.id, candidate);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Precompute per-node valuation & stewardship
  const valuationById = new Map();
  const stewardshipById = new Map();
  for (const dep of activeDeps) {
    valuationById.set(dep.id, deriveDependencyImpact(dep, state));
    stewardshipById.set(dep.id, evaluateStewardship(dep, state, now));
  }

  // Active goals lookup
  const activeGoalById = new Map(
    (state?.goals || []).filter((g) => g.status === 'active').map((g) => [g.id, g]),
  );

  // For each node u, compute reachability, worst propagated outage O_{u -> v},
  // survival shortfall, and blast-radius financial loss per currency.
  const nodeMetrics = new Map();
  const maxExposureByCurrency = new Map();

  for (const source of activeDeps) {
    const sourceTtr = finiteNonNeg(source.ttrDays);
    const sourceTts = finiteNonNeg(source.ttsDays);
    // Own effective TTR accounts for own substitutability if dual-active / warm-standby
    const ownEffectiveTtr = sourceTtr === null
      ? null
      : source.substitutability === 'dual-active'
        ? 0
        : source.substitutability === 'warm-standby'
          ? round2(Math.min(sourceTtr, finiteNonNeg(source.warmSwitchDays, 1)))
          : round2(sourceTtr);

    const directShortfallDays = ownEffectiveTtr !== null && sourceTts !== null
      ? round2(Math.max(0, ownEffectiveTtr - sourceTts))
      : null;

    // Bounded relaxation from `source` to all downstream nodes
    const reachableIds = new Set();
    const minHops = new Map([[source.id, 0]]);
    // BFS for topological reachability & depth (independent of whether TTR is measured)
    const queue = [source.id];
    while (queue.length) {
      const curr = queue.shift();
      const currDepth = minHops.get(curr) || 0;
      for (const nxt of downstreamOf.get(curr) || []) {
        if (nxt === source.id) continue;
        if (!reachableIds.has(nxt)) {
          reachableIds.add(nxt);
          minHops.set(nxt, currDepth + 1);
          queue.push(nxt);
        }
      }
    }

    // Propagate outage duration if source has a measured TTR
    const outageAt = new Map();
    if (ownEffectiveTtr !== null && ownEffectiveTtr > 0) {
      outageAt.set(source.id, ownEffectiveTtr);
      for (let hop = 0; hop < maxPasses; hop += 1) {
        let updated = false;
        for (const [currId, currOutage] of [...outageAt.entries()]) {
          if (currOutage <= 0) continue;
          for (const nxtId of downstreamOf.get(currId) || []) {
            if (nxtId === source.id) continue;
            const nxtDep = byId.get(nxtId);
            const prop = effectivePropagatedOutage(currOutage, nxtDep);
            if (prop > (outageAt.get(nxtId) || 0)) {
              outageAt.set(nxtId, prop);
              updated = true;
            }
          }
        }
        if (!updated) break;
      }
    }

    // Aggregate shortfall & financial blast radius across {source} ∪ reachable
    const exposureByCurrency = new Map();
    const impactedDownstream = [];
    const impactedGoalIds = new Set();

    const addExposure = (currency, amount) => {
      if (!Number.isFinite(amount) || amount <= 0) return;
      exposureByCurrency.set(currency, round2((exposureByCurrency.get(currency) || 0) + amount));
    };

    // Self contribution
    if (directShortfallDays !== null && directShortfallDays > 0) {
      const val = valuationById.get(source.id);
      for (const term of val.byCurrency) {
        addExposure(term.currency, term.dailyImpact * directShortfallDays);
      }
      for (const gid of source.linkedGoalIds || []) {
        if (activeGoalById.has(gid)) impactedGoalIds.add(gid);
      }
    }

    // Downstream contributions
    for (const downId of reachableIds) {
      const downDep = byId.get(downId);
      const propOutage = outageAt.get(downId) ?? null;
      const downTts = finiteNonNeg(downDep.ttsDays);
      const shortfall = propOutage !== null && downTts !== null
        ? round2(Math.max(0, propOutage - downTts))
        : null;
      const val = valuationById.get(downId);
      let downLoss = null;
      if (shortfall !== null && shortfall > 0) {
        for (const term of val.byCurrency) {
          addExposure(term.currency, term.dailyImpact * shortfall);
        }
        if (val.priced && val.dailyImpact !== null) {
          downLoss = round2(val.dailyImpact * shortfall);
        }
        for (const gid of downDep.linkedGoalIds || []) {
          if (activeGoalById.has(gid)) impactedGoalIds.add(gid);
        }
      }
      impactedDownstream.push({
        id: downDep.id,
        name: downDep.name,
        kind: downDep.kind,
        criticality: downDep.criticality,
        hops: minHops.get(downId) || 1,
        propagatedOutageDays: propOutage,
        ttsDays: downTts,
        shortfallDays: shortfall,
        breachesTolerance: Boolean(shortfall !== null && shortfall > 0),
        lossAmount: downLoss,
        currency: val.currency,
      });
    }

    impactedDownstream.sort(
      (a, b) =>
        Number(b.breachesTolerance) - Number(a.breachesTolerance) ||
        (b.shortfallDays || 0) - (a.shortfallDays || 0) ||
        a.hops - b.hops,
    );

    const blastExposureList = [...exposureByCurrency.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));

    for (const { currency, amount } of blastExposureList) {
      if (amount > (maxExposureByCurrency.get(currency) || 0)) {
        maxExposureByCurrency.set(currency, amount);
      }
    }

    const maxCascadeHops = reachableIds.size
      ? Math.max(...[...reachableIds].map((id) => minHops.get(id) || 1))
      : 0;
    const criticalOrImportantDownstream = impactedDownstream.filter(
      (d) => d.criticality === 'critical' || d.criticality === 'important',
    );
    const isCommonModeChokePoint = criticalOrImportantDownstream.length >= 2;
    const isSubTierChokePoint = Boolean(isCommonModeChokePoint && (maxCascadeHops >= 2 || (tierById.get(source.id) || 1) >= 3));

    nodeMetrics.set(source.id, {
      id: source.id,
      tier: tierById.get(source.id) || 1,
      inCycle: cycleNodeIds.has(source.id),
      ttrDays: sourceTtr,
      ttsDays: sourceTts,
      effectiveTtrDays: ownEffectiveTtr,
      directShortfallDays,
      hasDirectShortfall: Boolean(directShortfallDays !== null && directShortfallDays > 0),
      // Worse incoming shortfall from any upstream failure: computed in second pass below
      worstIncomingOutageDays: 0,
      worstIncomingSourceId: null,
      worstIncomingSourceName: null,
      cascadingShortfallDays: directShortfallDays,
      hasAnyShortfall: Boolean(directShortfallDays !== null && directShortfallDays > 0),
      downstreamCount: reachableIds.size,
      criticalDownstreamCount: criticalOrImportantDownstream.length,
      breachingDownstreamCount: impactedDownstream.filter((d) => d.breachesTolerance).length,
      maxCascadeHops,
      isCommonModeChokePoint,
      isSubTierChokePoint,
      impactedDownstream,
      impactedGoalIds: [...impactedGoalIds],
      blastExposureByCurrency: blastExposureList,
      primaryBlastCurrency: blastExposureList[0]?.currency || valuationById.get(source.id)?.currency || 'USD',
      primaryBlastExposure: blastExposureList[0]?.amount ?? null,
      rei: null, // populated once maxExposureByCurrency is complete
    });
  }

  // Second pass: populate worst incoming upstream outage on each target & REI
  for (const [sourceId, metrics] of nodeMetrics.entries()) {
    const sourceDep = byId.get(sourceId);
    for (const down of metrics.impactedDownstream) {
      if (down.propagatedOutageDays !== null && down.propagatedOutageDays > 0) {
        const targetMetrics = nodeMetrics.get(down.id);
        if (targetMetrics && down.propagatedOutageDays > targetMetrics.worstIncomingOutageDays) {
          targetMetrics.worstIncomingOutageDays = down.propagatedOutageDays;
          targetMetrics.worstIncomingSourceId = sourceId;
          targetMetrics.worstIncomingSourceName = sourceDep?.name || sourceId;
        }
      }
    }
  }

  for (const [id, metrics] of nodeMetrics.entries()) {
    if (metrics.ttsDays !== null && metrics.worstIncomingOutageDays > 0) {
      const incomingShortfall = round2(Math.max(0, metrics.worstIncomingOutageDays - metrics.ttsDays));
      const best = Math.max(metrics.directShortfallDays ?? 0, incomingShortfall);
      metrics.cascadingShortfallDays = best;
      metrics.hasAnyShortfall = best > 0;
    }
    if (metrics.primaryBlastExposure !== null && metrics.primaryBlastExposure > 0) {
      const denom = maxExposureByCurrency.get(metrics.primaryBlastCurrency) || 0;
      metrics.rei = denom > 0 ? round(metrics.primaryBlastExposure / denom, 3) : 0;
    } else if (valuationById.get(id)?.priced) {
      metrics.rei = 0;
    } else {
      metrics.rei = null;
    }
  }

  return {
    activeDeps,
    byId,
    downstreamOf,
    upstreamOf,
    tierById,
    valuationById,
    stewardshipById,
    nodeMetrics,
    cycleNodeIds: [...cycleNodeIds],
    maxExposureByCurrency,
    chokePoints: [...nodeMetrics.values()].filter((m) => m.isCommonModeChokePoint),
    subTierChokePoints: [...nodeMetrics.values()].filter((m) => m.isSubTierChokePoint),
  };
}

/* ------------------------------------------------------------------ */
/* 5. Avelino Minimal Hitting-Set Bus Factor & Key-Person Blast Radius  */
/* ------------------------------------------------------------------ */

/**
 * Compute the portfolio-level Bus Factor (Avelino et al., 2016) over active
 * critical/important capabilities with at least one stewarded capability:
 * the minimum number of active people whose simultaneous unavailability leaves
 * >= 50% of critical/important capabilities with ZERO remaining qualified
 * stewards.
 */
export function computeTeamBusFactor(state = {}, now = new Date()) {
  const activePeople = (state?.people || []).filter((p) => p.status !== 'archived');
  const activeDeps = (state?.dependencies || []).filter(isDependencyActive);
  // Capabilities where internal team stewardship governs continuity
  const scopedDeps = activeDeps.filter(
    (d) =>
      (d.criticality === 'critical' || d.criticality === 'important') &&
      (d.kind !== 'vendor' || (Array.isArray(d.stewards) && d.stewards.length > 0)),
  );

  const stewardSets = scopedDeps.map((dep) => {
    const st = evaluateStewardship(dep, state, now);
    return {
      dep,
      qualifiedIds: new Set(st.qualifiedStewards.map((s) => s.personId)),
      primaryIds: new Set(st.primaryStewards.map((s) => s.personId)),
    };
  });

  // Per-person blast radius across ALL active dependencies
  const allStewardSets = activeDeps.map((dep) => ({
    dep,
    stewardship: evaluateStewardship(dep, state, now),
  }));

  const personRows = activePeople.map((person) => {
    const soleStewardFor = [];
    const fragilizedFor = [];
    let primaryCount = 0;
    let backupCount = 0;

    for (const { dep, stewardship } of allStewardSets) {
      const isQual = stewardship.qualifiedStewards.some((s) => s.personId === person.id);
      const isPrim = stewardship.primaryStewards.some((s) => s.personId === person.id);
      if (isPrim) primaryCount += 1;
      else if (isQual) backupCount += 1;
      if (!isQual) continue;
      if (stewardship.busFactor === 1) {
        soleStewardFor.push({ id: dep.id, name: dep.name, criticality: dep.criticality, kind: dep.kind });
      } else if (stewardship.busFactor === 2) {
        fragilizedFor.push({ id: dep.id, name: dep.name, criticality: dep.criticality, kind: dep.kind });
      }
    }

    return {
      personId: person.id,
      personName: person.name,
      personRole: person.role || '',
      primaryCount,
      backupCount,
      totalQualifiedCount: primaryCount + backupCount,
      soleStewardCount: soleStewardFor.length,
      criticalSoleCount: soleStewardFor.filter((d) => d.criticality === 'critical').length,
      soleStewardFor,
      fragilizedFor,
    };
  }).sort(
    (a, b) =>
      b.criticalSoleCount - a.criticalSoleCount ||
      b.soleStewardCount - a.soleStewardCount ||
      b.totalQualifiedCount - a.totalQualifiedCount ||
      a.personName.localeCompare(b.personName),
  );

  if (!scopedDeps.length) {
    return {
      measured: false,
      scopedCapabilityCount: 0,
      stallThresholdCount: 0,
      portfolioBusFactor: null,
      minimalCutSet: [],
      alreadyUnstewardedCount: 0,
      personRows,
    };
  }

  const stallThreshold = Math.ceil(scopedDeps.length * 0.5);
  const alreadyUnstewarded = stewardSets.filter((s) => s.qualifiedIds.size === 0).length;
  if (alreadyUnstewarded >= stallThreshold) {
    return {
      measured: true,
      scopedCapabilityCount: scopedDeps.length,
      stallThresholdCount: stallThreshold,
      portfolioBusFactor: 0,
      minimalCutSet: [],
      alreadyUnstewardedCount: alreadyUnstewarded,
      personRows,
    };
  }

  // Candidate stewards who actually appear in at least one qualified set, ordered by coverage
  const candidateIds = personRows
    .filter((r) => r.totalQualifiedCount > 0)
    .map((r) => r.personId);

  const stallsAtLeastHalf = (removedSet) => {
    let stalled = 0;
    for (const item of stewardSets) {
      if (item.qualifiedIds.size === 0) {
        stalled += 1;
      } else {
        let anyLeft = false;
        for (const pid of item.qualifiedIds) {
          if (!removedSet.has(pid)) {
            anyLeft = true;
            break;
          }
        }
        if (!anyLeft) stalled += 1;
      }
      if (stalled >= stallThreshold) return true;
    }
    return false;
  };

  // Exact iterative-deepening combinatorial search up to k = 5 (fast because
  // candidate list is pruned to top 18 stewards by degree), with greedy fallback.
  const searchPool = candidateIds.slice(0, 18);
  let foundCut = null;

  const search = (k, startIdx, chosen) => {
    if (chosen.length === k) {
      if (stallsAtLeastHalf(new Set(chosen))) {
        foundCut = [...chosen];
        return true;
      }
      return false;
    }
    for (let i = startIdx; i <= searchPool.length - (k - chosen.length); i += 1) {
      chosen.push(searchPool[i]);
      if (search(k, i + 1, chosen)) return true;
      chosen.pop();
    }
    return false;
  };

  const maxExactK = Math.min(5, searchPool.length);
  for (let k = 1; k <= maxExactK; k += 1) {
    if (search(k, 0, [])) break;
  }

  if (!foundCut) {
    // Greedy minimal hitting set for well-distributed teams (bus factor > 5)
    const removed = new Set();
    for (const pid of candidateIds) {
      removed.add(pid);
      if (stallsAtLeastHalf(removed)) {
        foundCut = [...removed];
        break;
      }
    }
  }

  const peopleById = new Map(activePeople.map((p) => [p.id, p]));
  const minimalCutSet = (foundCut || []).map((pid) => ({
    personId: pid,
    personName: peopleById.get(pid)?.name || pid,
  }));

  return {
    measured: true,
    scopedCapabilityCount: scopedDeps.length,
    stallThresholdCount: stallThreshold,
    portfolioBusFactor: foundCut ? foundCut.length : candidateIds.length + 1,
    minimalCutSet,
    alreadyUnstewardedCount: alreadyUnstewarded,
    personRows,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Concentration Economics & Williamson Hold-Up                      */
/* ------------------------------------------------------------------ */

function annualVendorExposure(dep, state) {
  const defaultCurrency = String(dep?.currency || 'USD').toUpperCase();
  const explicit = finiteNonNeg(dep?.annualSpend);
  if (explicit !== null && explicit > 0) {
    return { priced: true, currency: defaultCurrency, amount: round2(explicit), source: 'annualSpend' };
  }
  if (dep?.linkedNegotiationId) {
    const neg = (state?.negotiations || []).find((n) => n.id === dep.linkedNegotiationId);
    const stakes = finiteNonNeg(neg?.stakesValue);
    if (neg && neg.status !== 'withdrawn' && stakes !== null && stakes > 0) {
      return { priced: true, currency: String(neg.stakesCurrency || defaultCurrency).toUpperCase(), amount: round2(stakes), source: 'negotiation' };
    }
  }
  if (dep?.linkedBudgetId) {
    const budget = (state?.budgets || []).find((b) => b.id === dep.linkedBudgetId);
    if (budget) {
      const total = (budget.lines || [])
        .filter((l) => l.status === 'committed' || l.status === 'spent')
        .reduce((sum, l) => sum + (finiteNonNeg(l.status === 'spent' ? l.actualAmount : l.committedAmount, 0) || 0), 0);
      if (total > 0) {
        return { priced: true, currency: String(budget.currency || defaultCurrency).toUpperCase(), amount: round2(total), source: 'budget' };
      }
    }
  }
  const val = deriveDependencyImpact(dep, state);
  if (val.priced && val.dailyImpact !== null && val.dailyImpact > 0) {
    return { priced: true, currency: val.currency, amount: round2(val.dailyImpact * 365), source: 'annualized-impact' };
  }
  return { priced: false, currency: defaultCurrency, amount: null, source: 'unpriced' };
}

export function computeConcentrationMetrics(state = {}, now = new Date()) {
  const highThreshold = Number(state?.settings?.resilienceHhiWarn) || HHI_HIGH_THRESHOLD;
  const activeDeps = (state?.dependencies || []).filter(isDependencyActive);

  // 1. Vendor Spend Concentration HHI per currency (never summed across currencies)
  const vendors = activeDeps.filter((d) => d.kind === 'vendor');
  const byCurrency = new Map();
  let unpricedVendorCount = 0;
  for (const v of vendors) {
    const exp = annualVendorExposure(v, state);
    if (!exp.priced) {
      unpricedVendorCount += 1;
      continue;
    }
    const list = byCurrency.get(exp.currency) || [];
    list.push({ id: v.id, label: v.name, weight: exp.amount, criticality: v.criticality, substitutability: v.substitutability });
    byCurrency.set(exp.currency, list);
  }
  const vendorByCurrency = [...byCurrency.entries()]
    .map(([currency, entries]) => ({
      currency,
      ...computeHhi(entries, { highThreshold }),
    }))
    .sort((a, b) => (b.hhi || 0) - (a.hhi || 0) || a.currency.localeCompare(b.currency));

  // 2. Human Stewardship Concentration HHI across critical/important capabilities
  const teamBus = computeTeamBusFactor(state, now);
  const stewardEntries = teamBus.personRows
    .filter((r) => r.totalQualifiedCount > 0)
    .map((r) => ({
      id: r.personId,
      label: r.personName,
      weight: r.primaryCount * 1.0 + r.backupCount * 0.5,
    }));
  const stewardshipHhi = computeHhi(stewardEntries, { highThreshold });

  const soleSourceVendors = vendors.filter(
    (v) => v.substitutability === 'none' || v.substitutability === 'untested-alt',
  );
  const vendorsMissingExitPlan = vendors.filter(
    (v) => (v.criticality === 'critical' || v.criticality === 'important') && !String(v.exitPlanSummary || '').trim(),
  );

  return {
    highThreshold,
    vendorCount: vendors.length,
    unpricedVendorCount,
    soleSourceVendorCount: soleSourceVendors.length,
    vendorsMissingExitPlanCount: vendorsMissingExitPlan.length,
    vendorByCurrency,
    primaryVendorCohort: vendorByCurrency[0] || null,
    stewardshipHhi,
  };
}

/**
 * Evaluate Williamson (1985) asset-specificity / hold-up exposure and Tsebelis
 * external gatekeeper pressure on a vendor/external dependency.
 */
export function evaluateHoldUpRisk(dep, nodeMetrics, state = {}) {
  if (!dep || dep.kind !== 'vendor' || !isDependencyActive(dep)) {
    return { applicable: false, score: 0, level: 'none', reasons: [] };
  }
  const reasons = [];
  let score = 0;

  if (dep.substitutability === 'none') {
    score += 35;
    reasons.push('Sole-source supplier with no qualified substitute');
  } else if (dep.substitutability === 'untested-alt') {
    score += 20;
    reasons.push('Alternative supplier is untested under real switchover');
  }

  if (nodeMetrics?.hasAnyShortfall) {
    score += 30;
    reasons.push(`Switching/recovery time exceeds survival tolerance by ${nodeMetrics.cascadingShortfallDays}d`);
  } else if (dep.ttrDays === null || dep.ttsDays === null) {
    score += 10;
    reasons.push('Switching time (TTR) or survival tolerance (TTS) is unmeasured');
  }

  if (!String(dep.exitPlanSummary || '').trim()) {
    score += 15;
    reasons.push('No documented exit or fallback plan (DORA Art. 28/29)');
  }

  if (dep.linkedNegotiationId) {
    const neg = (state?.negotiations || []).find((n) => n.id === dep.linkedNegotiationId);
    if (neg && neg.status !== 'withdrawn') {
      if (neg.status === 'impasse') {
        score += 20;
        reasons.push(`Linked negotiation “${neg.title}” is at impasse`);
      } else if (!String(neg.ourBatnaDescription || '').trim()) {
        score += 15;
        reasons.push(`Linked negotiation “${neg.title}” has no recorded walk-away BATNA`);
      }
    }
  }

  if (dep.linkedStakeholderId) {
    const stk = (state?.stakeholders || []).find((s) => s.id === dep.linkedStakeholderId);
    if (stk && (stk.stance === 'skeptical' || stk.stance === 'blocker')) {
      score += 15;
      reasons.push(`Linked gatekeeper “${stk.name}” holds ${stk.stance} stance`);
    }
  }

  score = Math.min(100, score);
  const level = score >= 65 ? 'high' : score >= 35 ? 'moderate' : 'low';
  return {
    applicable: true,
    score,
    level,
    reasons,
  };
}

/* ------------------------------------------------------------------ */
/* 7. Continuity Drill Hygiene & Conformal TTR Calibration              */
/* ------------------------------------------------------------------ */

/**
 * Score recorded continuity drills & live-incident recoveries across the
 * workspace using split-conformal prediction (`conformalBand`) and the exact
 * two-sided sign test (`ratioSignTest`). Strictly counts-only below n = 5.
 */
export function evaluateDrillCalibration(state = {}, now = new Date()) {
  const drillWindowDays = Number(state?.settings?.resilienceDrillDays ?? DEFAULT_RESILIENCE_DRILL_DAYS);
  const activeDeps = (state?.dependencies || []).filter(isDependencyActive);

  const pairs = [];
  const allDrills = [];
  const untestedCritical = [];
  const staleCritical = [];

  for (const dep of activeDeps) {
    const drills = Array.isArray(dep.drills)
      ? dep.drills.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      : [];
    for (const dr of drills) {
      allDrills.push({ ...dr, dependencyId: dep.id, dependencyName: dep.name, criticality: dep.criticality, ttsDays: dep.ttsDays });
      const est = finiteNonNeg(dr.estimatedTtrDays ?? dep.ttrDays);
      const real = finiteNonNeg(dr.realizedTtrDays);
      if (est !== null && est > 0 && real !== null) {
        pairs.push({
          drillId: dr.id,
          dependencyId: dep.id,
          dependencyName: dep.name,
          date: dr.date,
          kind: dr.kind,
          estimatedTtrDays: est,
          realizedTtrDays: real,
          ratio: round(real / est, 3),
          outcome: dr.outcome,
        });
      }
    }

    if (dep.criticality === 'critical' || dep.criticality === 'important') {
      if (!drills.length) {
        untestedCritical.push(dep);
      } else if (drillWindowDays > 0 && drills[0]?.date) {
        const age = daysSince(drills[0].date, now);
        if (age !== null && age > drillWindowDays) {
          staleCritical.push({ dep, lastDrillOn: drills[0].date, ageDays: age });
        }
      }
    }
  }

  allDrills.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const ratios = pairs.map((p) => p.ratio);
  const n = ratios.length;
  const sufficient = n >= RESILIENCE_MIN_DRILL_SAMPLES;
  const band = conformalBand(pairs, { coverage: 0.8, minSamples: RESILIENCE_MIN_DRILL_SAMPLES });
  const sign = sufficient ? ratioSignTest(ratios) : null;

  let medianRatio = null;
  if (sufficient) {
    const sorted = ratios.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianRatio = round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, 2);
  }

  const breachedCount = allDrills.filter((d) => d.outcome === 'breached-tolerance').length;
  const withinCount = allDrills.filter((d) => d.outcome === 'within-tolerance').length;

  return {
    n,
    totalDrills: allDrills.length,
    withinCount,
    breachedCount,
    sufficient,
    minSamples: RESILIENCE_MIN_DRILL_SAMPLES,
    medianRatio,
    optimisticBias: Boolean(sufficient && medianRatio !== null && medianRatio >= 1.25),
    signTest: sign,
    band,
    pairs,
    allDrills,
    drillWindowDays,
    untestedCritical,
    staleCritical,
  };
}

/* ------------------------------------------------------------------ */
/* 8. Expected Annual Disruption Loss & Redundancy ROI                  */
/* ------------------------------------------------------------------ */

export function evaluateRedundancyEconomics(dep, nodeMetrics, valuation) {
  const probPct = finiteNonNeg(dep?.annualFailureProb);
  const mitCost = finiteNonNeg(dep?.mitigationCost);
  const blast = nodeMetrics?.primaryBlastExposure ?? null;
  const currency = nodeMetrics?.primaryBlastCurrency || valuation?.currency || dep?.currency || 'USD';

  if (probPct === null || probPct > 100 || blast === null) {
    return {
      available: false,
      currency,
      annualFailureProbPct: probPct !== null && probPct <= 100 ? probPct : null,
      expectedAnnualLoss: null,
      mitigationCost: mitCost,
      netAnnualBenefit: null,
      roiMultiple: null,
    };
  }

  const p = probPct / 100;
  const expectedAnnualLoss = round2(p * blast);
  const netAnnualBenefit = mitCost !== null ? round2(expectedAnnualLoss - mitCost) : null;
  const roiMultiple = mitCost !== null && mitCost > 0
    ? round2((expectedAnnualLoss - mitCost) / mitCost)
    : null;

  return {
    available: true,
    currency,
    annualFailureProbPct: probPct,
    expectedAnnualLoss,
    mitigationCost: mitCost,
    netAnnualBenefit,
    roiMultiple,
  };
}

/* ------------------------------------------------------------------ */
/* 9. Interactive Counterfactual Disruption & Departure Stress Lab      */
/* ------------------------------------------------------------------ */

/**
 * Pure, zero-write counterfactual stress test:
 * "What happens if `unavailablePersonIds` are simultaneously away AND/OR
 * `disruptedDependencyIds` fail for `durationDaysOverride` (or their TTR)?"
 *
 * Cross-checks surviving backup stewards against `buildCapacityModel` so an
 * already-overloaded backup is surfaced as a capacity contention risk rather
 * than assumed to have free time.
 */
export function simulateDisruptionScenario(
  state = {},
  {
    unavailablePersonIds = [],
    disruptedDependencyIds = [],
    durationDaysOverride = null,
  } = {},
  now = new Date(),
) {
  const unavailableSet = new Set((unavailablePersonIds || []).filter(Boolean));
  const disruptedSet = new Set((disruptedDependencyIds || []).filter(Boolean));
  const overrideDays = finiteNonNeg(durationDaysOverride);

  const network = analyzeDependencyNetwork(state, now);
  const activeDeps = network.activeDeps;
  const capModel = (state?.people || []).length ? buildCapacityModel(state, now) : null;
  const personLoadById = new Map(
    (capModel?.perPerson || []).map((row) => [row.personId || row.person?.id, row]),
  );

  // Compute propagated technical/vendor outage across graph from disruptedSet
  const shockOutageAt = new Map();
  for (const depId of disruptedSet) {
    const dep = network.byId.get(depId);
    if (!dep) continue;
    const baseTtr = overrideDays !== null ? overrideDays : finiteNonNeg(dep.ttrDays, 7);
    const eff = dep.substitutability === 'dual-active'
      ? 0
      : dep.substitutability === 'warm-standby'
        ? round2(Math.min(baseTtr, finiteNonNeg(dep.warmSwitchDays, 1)))
        : round2(baseTtr);
    shockOutageAt.set(depId, Math.max(shockOutageAt.get(depId) || 0, eff));
  }

  const maxPasses = Math.max(1, activeDeps.length - 1);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const [currId, currOut] of [...shockOutageAt.entries()]) {
      if (currOut <= 0) continue;
      for (const nxtId of network.downstreamOf.get(currId) || []) {
        const nxtDep = network.byId.get(nxtId);
        const prop = effectivePropagatedOutage(currOut, nxtDep);
        if (prop > (shockOutageAt.get(nxtId) || 0)) {
          shockOutageAt.set(nxtId, prop);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const impactedRows = [];
  const lossByCurrency = new Map();
  const stalledGoalIds = new Set();
  const stalledPortfolioIds = new Set();
  const overloadedBackupWarnings = [];

  for (const dep of activeDeps) {
    const st = network.stewardshipById.get(dep.id);
    const val = network.valuationById.get(dep.id);
    const remainingStewards = st.qualifiedStewards.filter((s) => !unavailableSet.has(s.personId));
    const lostStewards = st.qualifiedStewards.filter((s) => unavailableSet.has(s.personId));
    const humanStalled = st.qualifiedStewards.length > 0 && remainingStewards.length === 0;

    const techOutageDays = shockOutageAt.get(dep.id) ?? 0;
    const humanOutageDays = humanStalled ? (overrideDays !== null ? overrideDays : finiteNonNeg(dep.ttrDays, 14)) : 0;
    const combinedOutageDays = Math.max(techOutageDays, humanOutageDays);

    if (!humanStalled && techOutageDays <= 0 && lostStewards.length === 0) continue;

    const tts = finiteNonNeg(dep.ttsDays);
    const shortfallDays = combinedOutageDays > 0 && tts !== null
      ? round2(Math.max(0, combinedOutageDays - tts))
      : combinedOutageDays > 0 && tts === null
        ? combinedOutageDays
        : 0;
    const breachesTolerance = shortfallDays > 0 || humanStalled;

    let estimatedLoss = null;
    if (shortfallDays > 0 && val.priced) {
      for (const term of val.byCurrency) {
        const amt = round2(term.dailyImpact * shortfallDays);
        lossByCurrency.set(term.currency, round2((lossByCurrency.get(term.currency) || 0) + amt));
      }
      if (val.dailyImpact !== null) estimatedLoss = round2(val.dailyImpact * shortfallDays);
    }

    if (breachesTolerance) {
      for (const gid of dep.linkedGoalIds || []) stalledGoalIds.add(gid);
      if (dep.linkedPortfolioId) stalledPortfolioIds.add(dep.linkedPortfolioId);
    }

    // Check if surviving backup stewards are overloaded in capacity model
    const backupContention = [];
    if (lostStewards.length > 0 && remainingStewards.length > 0) {
      for (const rem of remainingStewards) {
        const load = personLoadById.get(rem.personId);
        const utilPct = Number.isFinite(load?.utilisationPct)
          ? Number(load.utilisationPct)
          : Number.isFinite(load?.utilisation)
            ? Number(load.utilisation) * 100
            : null;
        if (utilPct !== null && utilPct >= 90) {
          const msg = `${rem.personName} (${Math.round(utilPct)}% allocated in Capacity)`;
          backupContention.push(msg);
          overloadedBackupWarnings.push({
            dependencyId: dep.id,
            dependencyName: dep.name,
            personId: rem.personId,
            personName: rem.personName,
            utilisationPct: Math.round(utilPct),
          });
        }
      }
    }

    impactedRows.push({
      dependency: dep,
      humanStalled,
      lostStewards,
      remainingStewards,
      techOutageDays,
      combinedOutageDays,
      ttsDays: tts,
      shortfallDays,
      breachesTolerance,
      estimatedLoss,
      currency: val.currency,
      backupContention,
    });
  }

  impactedRows.sort(
    (a, b) =>
      Number(b.breachesTolerance) - Number(a.breachesTolerance) ||
      Number(b.humanStalled) - Number(a.humanStalled) ||
      (b.shortfallDays || 0) - (a.shortfallDays || 0) ||
      (CRITICALITY_RANK[b.dependency.criticality] || 0) - (CRITICALITY_RANK[a.dependency.criticality] || 0),
  );

  const stalledGoals = [...stalledGoalIds]
    .map((id) => (state?.goals || []).find((g) => g.id === id))
    .filter((g) => g && g.status === 'active');
  const stalledPortfolio = [...stalledPortfolioIds]
    .map((id) => (state?.portfolio || []).find((p) => p.id === id))
    .filter(Boolean);

  return {
    activeSelection: unavailableSet.size > 0 || disruptedSet.size > 0,
    unavailableCount: unavailableSet.size,
    disruptedCount: disruptedSet.size,
    impactedRows,
    breachingCount: impactedRows.filter((r) => r.breachesTolerance).length,
    humanStalledCount: impactedRows.filter((r) => r.humanStalled).length,
    lossByCurrency: [...lossByCurrency.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency)),
    stalledGoals,
    stalledPortfolio,
    overloadedBackupWarnings,
  };
}

/* ------------------------------------------------------------------ */
/* 10. Single-Dependency Summary & Full Terminal Report                 */
/* ------------------------------------------------------------------ */

export function summarizeDependency(dep, state = {}, now = new Date(), precomputed = null) {
  const network = precomputed?.network || analyzeDependencyNetwork(state, now);
  const calibration = precomputed?.calibration || evaluateDrillCalibration(state, now);
  const todayStr = dayKey(now);

  const stewardship = network.stewardshipById.get(dep.id) || evaluateStewardship(dep, state, now);
  const valuation = network.valuationById.get(dep.id) || deriveDependencyImpact(dep, state);
  const metrics = network.nodeMetrics.get(dep.id) || {
    tier: 1,
    inCycle: false,
    ttrDays: finiteNonNeg(dep.ttrDays),
    ttsDays: finiteNonNeg(dep.ttsDays),
    effectiveTtrDays: finiteNonNeg(dep.ttrDays),
    directShortfallDays: null,
    hasDirectShortfall: false,
    worstIncomingOutageDays: 0,
    worstIncomingSourceId: null,
    worstIncomingSourceName: null,
    cascadingShortfallDays: null,
    hasAnyShortfall: false,
    downstreamCount: 0,
    criticalDownstreamCount: 0,
    breachingDownstreamCount: 0,
    maxCascadeHops: 0,
    isCommonModeChokePoint: false,
    isSubTierChokePoint: false,
    impactedDownstream: [],
    impactedGoalIds: [],
    blastExposureByCurrency: [],
    primaryBlastCurrency: valuation.currency,
    primaryBlastExposure: null,
    rei: null,
  };

  const holdUp = evaluateHoldUpRisk(dep, metrics, state);
  const economics = evaluateRedundancyEconomics(dep, metrics, valuation);
  const links = linksForEntity(state, 'dependency', dep.id);

  // Outside-view calibrated TTR range when workspace has >= 5 scored drills
  let calibratedTtr = null;
  if (calibration.sufficient && calibration.band?.sufficient && metrics.ttrDays !== null && metrics.ttrDays > 0) {
    calibratedTtr = {
      medianDays: round2(metrics.ttrDays * calibration.medianRatio),
      lowDays: round2(metrics.ttrDays * calibration.band.lowFactor),
      highDays: round2(metrics.ttrDays * calibration.band.highFactor),
      coverageBound: calibration.band.coverageBound,
      n: calibration.n,
    };
  }

  const drills = Array.isArray(dep.drills)
    ? dep.drills.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    : [];
  const lastDrill = drills[0] || null;
  const drillWindowDays = Number(state?.settings?.resilienceDrillDays ?? DEFAULT_RESILIENCE_DRILL_DAYS);
  const lastDrillAgeDays = lastDrill?.date ? daysSince(lastDrill.date, now) : null;
  const drillStale = Boolean(
    isDependencyActive(dep) &&
    (dep.criticality === 'critical' || dep.criticality === 'important') &&
    drillWindowDays > 0 &&
    (!lastDrill || (lastDrillAgeDays !== null && lastDrillAgeDays > drillWindowDays)),
  );

  const reviewOverdue = Boolean(isDependencyActive(dep) && dep.reviewOn && dep.reviewOn < todayStr);
  const active = isDependencyActive(dep);
  const needsAttention = Boolean(
    active && (
      (dep.criticality === 'critical' && stewardship.isHumanSpof) ||
      metrics.hasAnyShortfall ||
      metrics.isSubTierChokePoint ||
      holdUp.level === 'high' ||
      reviewOverdue
    ),
  );

  return {
    dependency: dep,
    active,
    stewardship,
    valuation,
    metrics,
    holdUp,
    economics,
    calibratedTtr,
    drills,
    lastDrill,
    lastDrillAgeDays,
    drillStale,
    reviewOverdue,
    links,
    needsAttention,
  };
}

export function buildResilienceReport(state = {}, now = new Date()) {
  const network = analyzeDependencyNetwork(state, now);
  const calibration = evaluateDrillCalibration(state, now);
  const teamBus = computeTeamBusFactor(state, now);
  const concentration = computeConcentrationMetrics(state, now);
  const precomputed = { network, calibration };

  const allRows = (state?.dependencies || []).map((d) => summarizeDependency(d, state, now, precomputed));
  const activeRows = allRows
    .filter((r) => r.active)
    .sort((a, b) => {
      const critDiff = (CRITICALITY_RANK[b.dependency.criticality] || 0) - (CRITICALITY_RANK[a.dependency.criticality] || 0);
      if (Number(b.metrics.hasAnyShortfall) !== Number(a.metrics.hasAnyShortfall)) {
        return Number(b.metrics.hasAnyShortfall) - Number(a.metrics.hasAnyShortfall);
      }
      if ((b.metrics.rei ?? -1) !== (a.metrics.rei ?? -1)) {
        return (b.metrics.rei ?? -1) - (a.metrics.rei ?? -1);
      }
      if (critDiff !== 0) return critDiff;
      return (b.metrics.cascadingShortfallDays || 0) - (a.metrics.cascadingShortfallDays || 0) ||
        String(a.dependency.name || '').localeCompare(String(b.dependency.name || ''));
    });

  const retiredRows = allRows.filter((r) => !r.active);
  const humanSpofs = activeRows.filter((r) => r.stewardship.isHumanSpof);
  const criticalHumanSpofs = humanSpofs.filter((r) => r.dependency.criticality === 'critical');
  const shortfallRows = activeRows.filter((r) => r.metrics.hasAnyShortfall);
  const criticalShortfalls = shortfallRows.filter((r) => r.dependency.criticality === 'critical');
  const chokePoints = activeRows.filter((r) => r.metrics.isCommonModeChokePoint);
  const subTierChokePoints = activeRows.filter((r) => r.metrics.isSubTierChokePoint);
  const highHoldUpRows = activeRows.filter((r) => r.holdUp.level === 'high');
  const unmeasuredContinuityRows = activeRows.filter(
    (r) => (r.dependency.criticality === 'critical' || r.dependency.criticality === 'important') &&
      (r.metrics.ttrDays === null || r.metrics.ttsDays === null),
  );
  const attentionRows = activeRows.filter((r) => r.needsAttention);

  const report = {
    engineVersion: RESILIENCE_ENGINE_VERSION,
    generatedAt: now.toISOString(),
    allRows,
    activeRows,
    retiredRows,
    humanSpofs,
    criticalHumanSpofs,
    shortfallRows,
    criticalShortfalls,
    chokePoints,
    subTierChokePoints,
    highHoldUpRows,
    unmeasuredContinuityRows,
    attentionRows,
    network,
    teamBus,
    concentration,
    calibration,
    totals: {
      total: allRows.length,
      active: activeRows.length,
      retired: retiredRows.length,
      critical: activeRows.filter((r) => r.dependency.criticality === 'critical').length,
      humanSpofs: humanSpofs.length,
      shortfalls: shortfallRows.length,
      chokePoints: chokePoints.length,
      subTierChokePoints: subTierChokePoints.length,
      highHoldUp: highHoldUpRows.length,
      attention: attentionRows.length,
    },
  };
  report.boardBrief = buildResilienceBrief(report, state, now);
  return report;
}

/**
 * Capabilities stewarded by a specific person — used by 1:1 prep (`prep.js`)
 * and Person detail (`person.js`) to surface Bus-Factor-1 load blamelessly.
 */
export function dependenciesForPerson(state = {}, personId, now = new Date()) {
  if (!state || !personId) return [];
  const report = buildResilienceReport(state, now);
  const out = [];
  for (const row of report.activeRows) {
    const entry = row.stewardship.stewards.find((s) => s.personId === personId);
    if (!entry) continue;
    out.push({
      id: row.dependency.id,
      name: row.dependency.name,
      kind: row.dependency.kind,
      kindLabel: DEPENDENCY_KIND_LABELS[row.dependency.kind] || row.dependency.kind,
      criticality: row.dependency.criticality,
      role: entry.role,
      roleLabel: entry.roleLabel,
      verifiedOn: entry.verifiedOn,
      qualified: entry.qualified,
      busFactor: row.stewardship.busFactor,
      isSoleSteward: Boolean(entry.qualified && row.stewardship.busFactor === 1),
      shortfallDays: row.metrics.cascadingShortfallDays,
      ttsDays: row.metrics.ttsDays,
      ttrDays: row.metrics.ttrDays,
    });
  }
  return out.sort(
    (a, b) =>
      Number(b.isSoleSteward) - Number(a.isSoleSteward) ||
      (CRITICALITY_RANK[b.criticality] || 0) - (CRITICALITY_RANK[a.criticality] || 0) ||
      a.name.localeCompare(b.name),
  );
}

/* ------------------------------------------------------------------ */
/* 11. Deterministic Board-Ready Operational Continuity Brief           */
/* ------------------------------------------------------------------ */

export function buildResilienceBrief(report, state = {}, now = new Date()) {
  const r = report || buildResilienceReport(state, now);
  const team = state?.settings?.teamName || 'Team';
  const lines = [
    `OPERATIONAL RESILIENCE & CONTINUITY BRIEF — ${team} (${dayKey(now)})`,
    `Engine: ${RESILIENCE_ENGINE_VERSION} · Active dependencies: ${r.totals.active} (${r.totals.critical} critical)`,
    '',
  ];

  if (!r.totals.active) {
    lines.push('No operational dependencies or important capabilities have been registered yet.');
    lines.push('Scope note: derived strictly from self-recorded workspace topology and continuity drills; confidential conflict records and anonymous pulse responses are excluded.');
    return lines.join('\n');
  }

  // 1. Portfolio Bus Factor & Human SPOFs
  const bf = r.teamBus;
  lines.push(
    `1. Stewardship & Bus Factor (Avelino minimal hitting set): ` +
    (bf.measured
      ? `Portfolio Bus Factor = ${bf.portfolioBusFactor} across ${bf.scopedCapabilityCount} critical/important capabilities ` +
        `(stall threshold ≥ ${bf.stallThresholdCount})${bf.minimalCutSet.length ? ` — minimal cut: ${bf.minimalCutSet.map((p) => p.personName).join(', ')}` : ''}.`
      : 'No critical/important internal capabilities mapped yet.'),
  );
  lines.push(`   Human SPOFs (Bus Factor ≤ 1): ${r.totals.humanSpofs} (${r.criticalHumanSpofs.length} critical).`);

  // 2. Simchi-Levi TTS / TTR &REI
  lines.push(
    `2. Continuity Tolerances (Simchi-Levi TTS vs TTR): ` +
    `${r.totals.shortfalls} capability/vendor node(s) carry a survival shortfall (effective TTR > TTS); ` +
    `${r.unmeasuredContinuityRows.length} critical/important node(s) still lack measured TTS or TTR.`,
  );
  for (const row of r.activeRows.slice(0, 4)) {
    const m = row.metrics;
    const exposureTxt = m.primaryBlastExposure !== null
      ? `${m.primaryBlastCurrency} ${Math.round(m.primaryBlastExposure).toLocaleString('en-US')} (REI ${m.rei ?? '—'})`
      : 'unpriced';
    lines.push(
      `   - ${row.dependency.name} [${row.dependency.criticality} ${row.dependency.kind}]: ` +
      `TTS ${m.ttsDays ?? '—'}d · eff. TTR ${m.effectiveTtrDays ?? '—'}d · shortfall ${m.cascadingShortfallDays ?? '—'}d · ` +
      `Bus Factor ${row.stewardship.busFactor} · blast exposure ${exposureTxt}`,
    );
  }

  // 3. Concentration & Common-Mode Choke Points (DORA Art. 29)
  const vc = r.concentration.primaryVendorCohort;
  lines.push(
    `3. Concentration & Nth-Party Choke Points (DORA Art. 29 / HHI): ` +
    `${r.totals.chokePoints} common-mode upstream node(s) (${r.totals.subTierChokePoints} sub-tier depth ≥ 2); ` +
    `${r.totals.highHoldUp} high Williamson hold-up supplier(s); ` +
    `${r.concentration.vendorsMissingExitPlanCount} critical/important vendor(s) missing an exit plan.`,
  );
  if (vc) {
    lines.push(
      `   Vendor spend HHI (${vc.currency}, n=${vc.count}): ${vc.hhi} (${vc.band}, CR1 ${vc.cr1Pct}%, currencies never mixed).`,
    );
  }

  // 4. Continuity Drills & Conformal Calibration
  const cal = r.calibration;
  if (!cal.sufficient) {
    lines.push(
      `4. Continuity Drills & Calibration: ${cal.totalDrills} drill(s) recorded (${cal.n} with TTR estimate+actual; ` +
      `counts-only below n=${cal.minSamples}). Untested critical/important nodes: ${cal.untestedCritical.length}; stale: ${cal.staleCritical.length}.`,
    );
  } else {
    lines.push(
      `4. Continuity Drills & Conformal Calibration (n=${cal.n}): median realized÷estimated TTR = ${cal.medianRatio}×, ` +
      `80% conformal band [${cal.band.lowFactor}×, ${cal.band.highFactor}×] (finite-sample coverage ≥ ${cal.band.coverageBound}). ` +
      `Untested: ${cal.untestedCritical.length}; stale: ${cal.staleCritical.length}.`,
    );
  }

  lines.push('');
  lines.push('Scope & epistemic note: all figures derive strictly from recorded LeadOS dependencies, links and continuity drills; no external vendor telemetry is fetched, currencies are never summed, unverified shadow backups do not count toward Bus Factor, and confidential conflict / anonymous pulse data are excluded.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* 12. Read-Side Signals (RES-01 .. RES-07)                             */
/* ------------------------------------------------------------------ */

export function resilienceSignals(state = {}, now = new Date()) {
  const deps = state?.dependencies || [];
  if (!deps.length) return [];
  const report = buildResilienceReport(state, now);
  if (!report.totals.active) return [];

  const findings = [];

  // RES-01: Human Single Point of Failure (Bus Factor <= 1)
  for (const row of report.humanSpofs) {
    if (row.dependency.criticality === 'supporting') continue;
    const sole = row.stewardship.qualifiedStewards[0] || null;
    const isCritical = row.dependency.criticality === 'critical';
    findings.push({
      ruleId: 'RES-01',
      domain: 'Operational resilience',
      severity: isCritical ? 5 : 4,
      confidence: 'high',
      personId: sole?.personId || null,
      personName: sole?.personName || null,
      title: row.stewardship.busFactor === 0
        ? `“${row.dependency.name}” has zero verified active stewards (Bus Factor = 0)`
        : `“${row.dependency.name}” rests on one verified steward (${sole.personName}, Bus Factor = 1)`,
      detail: row.stewardship.inTrainingCount > 0
        ? `${row.stewardship.inTrainingCount} backup/trainee steward(s) are listed on paper, but none is shadow-verified yet. Until a second operator runs a verified handover or failover, vacation or illness stalls this capability.`
        : 'Avelino et al. (2016) Bus Factor = 1: a single person holds operational continuity for this capability. Frame cross-training as blameless load and vacation protection, never as a critique.',
      evidence: [
        `Criticality: ${DEPENDENCY_CRITICALITY_LABELS[row.dependency.criticality]}`,
        `Verified stewards: ${row.stewardship.busFactor}${row.stewardship.inTrainingCount ? ` (+${row.stewardship.inTrainingCount} unverified/trainee)` : ''}`,
        row.stewardship.archivedCount ? `${row.stewardship.archivedCount} previous steward(s) archived on roster` : 'RULE-RES-02 pairs critical SPOFs with a cross-training delegation',
      ],
      action: { label: 'Open continuity record', route: `#/resilience/${row.dependency.id}` },
    });
  }

  // RES-02: Simchi-Levi Survival Shortfall (effective TTR > TTS)
  for (const row of report.shortfallRows) {
    const m = row.metrics;
    const isCritical = row.dependency.criticality === 'critical';
    const upstreamNote = m.worstIncomingOutageDays > (m.effectiveTtrDays || 0) && m.worstIncomingSourceName
      ? `driven by upstream “${m.worstIncomingSourceName}” (${m.worstIncomingOutageDays}d propagated outage)`
      : `direct recovery ${m.effectiveTtrDays}d vs ${m.ttsDays}d survival buffer`;
    findings.push({
      ruleId: 'RES-02',
      domain: 'Operational resilience',
      severity: isCritical ? 5 : 4,
      confidence: 'high',
      title: `“${row.dependency.name}” carries a ${m.cascadingShortfallDays}-day survival shortfall (TTR > TTS)`,
      detail: `Under Simchi-Levi’s TTS/TTR model (${upstreamNote}), buffers run dry ${m.cascadingShortfallDays} day(s) before service is restored. Either extend survival tolerance (cache/manual fallback) or qualify faster failover.`,
      evidence: [
        `TTS tolerance: ${m.ttsDays}d · Worst outage: ${Math.max(m.effectiveTtrDays || 0, m.worstIncomingOutageDays || 0)}d`,
        `Substitutability: ${SUBSTITUTABILITY_LABELS[row.dependency.substitutability]}`,
        m.primaryBlastExposure !== null
          ? `Blast-radius exposure: ${m.primaryBlastCurrency} ${Math.round(m.primaryBlastExposure).toLocaleString('en-US')} (REI ${m.rei ?? '—'})`
          : 'Blast-radius exposure: unpriced (link a budget, case, portfolio item or override)',
      ],
      action: { label: 'Model continuity options', route: `#/resilience/${row.dependency.id}` },
    });
  }

  // RES-03: Hidden Sub-Tier / Common-Mode Choke Points (DORA Art. 29)
  for (const row of report.chokePoints) {
    const m = row.metrics;
    findings.push({
      ruleId: 'RES-03',
      domain: 'Operational resilience',
      severity: m.isSubTierChokePoint ? 4 : 3,
      confidence: 'high',
      title: m.isSubTierChokePoint
        ? `Hidden Nth-party choke point: “${row.dependency.name}” sits behind ${m.criticalDownstreamCount} critical/important capabilities`
        : `Shared common-mode dependency: “${row.dependency.name}” feeds ${m.criticalDownstreamCount} critical/important capabilities`,
      detail: `An outage at “${row.dependency.name}” cascades up to ${m.maxCascadeHops} tier(s) downstream (${m.breachingDownstreamCount} breaching survival tolerance). Separate Tier-1 services fail together when they share an unbuffered upstream node (EU DORA Art. 29).`,
      evidence: [
        `Tier ${m.tier} ${DEPENDENCY_KIND_LABELS[row.dependency.kind].toLowerCase()}`,
        `Downstream critical/important services: ${m.impactedDownstream.slice(0, 4).map((d) => d.name).join(', ')}`,
        `Substitutability: ${SUBSTITUTABILITY_LABELS[row.dependency.substitutability]}`,
      ],
      action: { label: 'Inspect cascade topology', route: '#/resilience?tab=topology' },
    });
  }

  // RES-04: High Vendor Spend or Stewardship Concentration (HHI > threshold)
  const vc = report.concentration.primaryVendorCohort;
  if (vc && vc.count >= 2 && vc.band === 'high') {
    findings.push({
      ruleId: 'RES-04',
      domain: 'Operational resilience',
      severity: 3,
      confidence: 'high',
      title: `Vendor concentration in ${vc.currency} exceeds guardrail (HHI ${vc.hhi} > ${report.concentration.highThreshold})`,
      detail: `Top supplier holds ${vc.cr1Pct}% of ${vc.currency} vendor exposure across ${vc.count} priced suppliers (effective supplier count ${vc.effectiveCount}). High concentration compounds bargaining asymmetry and common-mode risk.`,
      evidence: [
        `HHI ${vc.hhi} (DOJ/FTC high concentration > 2,500)`,
        `Top supplier: ${vc.shares[0]?.label} (${vc.cr1Pct}%) · CR3 ${vc.cr3Pct}%`,
      ],
      action: { label: 'Open concentration view', route: '#/resilience?tab=concentration' },
    });
  }
  const sc = report.concentration.stewardshipHhi;
  if (sc && sc.count >= 2 && sc.band === 'high' && report.teamBus.portfolioBusFactor !== null && report.teamBus.portfolioBusFactor <= 2) {
    findings.push({
      ruleId: 'RES-04',
      domain: 'Operational resilience',
      severity: 3,
      confidence: 'high',
      title: `Critical stewardship is concentrated in ${sc.shares[0]?.label || 'one person'} (Stewardship HHI ${sc.hhi})`,
      detail: `Portfolio Bus Factor is ${report.teamBus.portfolioBusFactor}: ${sc.shares[0]?.label} carries ${sc.cr1Pct}% of weighted stewardship across active capabilities. Rotate operational runbooks through GROW/delegation shadows.`,
      evidence: [
        `Stewardship HHI ${sc.hhi} · effective steward spread ${sc.effectiveCount}`,
        `Portfolio Bus Factor: ${report.teamBus.portfolioBusFactor} of ${report.teamBus.scopedCapabilityCount} capabilities`,
      ],
      action: { label: 'Open stewardship matrix', route: '#/resilience?tab=concentration' },
    });
  }

  // RES-05: Williamson Vendor Hold-Up Exposure
  for (const row of report.highHoldUpRows) {
    findings.push({
      ruleId: 'RES-05',
      domain: 'Operational resilience',
      severity: 4,
      confidence: 'high',
      title: `High supplier hold-up exposure on “${row.dependency.name}” (score ${row.holdUp.score}/100)`,
      detail: 'Williamson (1985) hold-up condition: sole-source lock-in plus a switching shortfall (TTR > TTS) gives the vendor quasi-rent bargaining power at renewal. Qualify a credible exit path before negotiating price.',
      evidence: row.holdUp.reasons.slice(0, 3),
      action: { label: 'Review exit & BATNA posture', route: `#/resilience/${row.dependency.id}` },
    });
  }

  // RES-06: Untested or Stale Continuity Assumptions (Paper Resilience)
  const untestedCount = report.calibration.untestedCritical.length;
  const staleCount = report.calibration.staleCritical.length;
  if (untestedCount + staleCount > 0) {
    findings.push({
      ruleId: 'RES-06',
      domain: 'Operational resilience',
      severity: 3,
      confidence: 'high',
      title: `${untestedCount + staleCount} critical/important capability node(s) rely on untested or stale recovery estimates`,
      detail: `${untestedCount} have zero recorded continuity drills and ${staleCount} are past the ${report.calibration.drillWindowDays}-day testing window (EU DORA Art. 26). Unexercised TTR numbers are assumptions, not capabilities.`,
      evidence: [
        ...report.calibration.untestedCritical.slice(0, 2).map((d) => `Untested: “${d.name}” (est. TTR ${d.ttrDays ?? 'unmeasured'}d)`),
        ...report.calibration.staleCritical.slice(0, 2).map((s) => `Stale (${s.ageDays}d ago): “${s.dep.name}”`),
      ],
      action: { label: 'Log a continuity drill', route: '#/resilience?tab=drills' },
    });
  }

  // RES-07: Systematic Recovery-Time Optimism (n >= 5 drills)
  if (report.calibration.optimisticBias) {
    findings.push({
      ruleId: 'RES-07',
      domain: 'Operational resilience',
      severity: 3,
      confidence: 'high',
      title: `Continuity drills take ${report.calibration.medianRatio}× longer than estimated TTR across ${report.calibration.n} tests`,
      detail: `Across ${report.calibration.n} scored drills/incidents, realized recovery exceeds estimated TTR (80% conformal band [${report.calibration.band.lowFactor}×, ${report.calibration.band.highFactor}×], coverage ≥ ${report.calibration.band.coverageBound}). Survival buffers sized to optimistic TTR may fail in a real outage.`,
      evidence: [
        `Median realized ÷ estimated TTR: ${report.calibration.medianRatio}×`,
        `Breached tolerance in ${report.calibration.breachedCount} of ${report.calibration.totalDrills} recorded drill(s)`,
      ],
      action: { label: 'Open drill calibration', route: '#/resilience?tab=drills' },
    });
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/* 13. Atomic Post-Commit Propagation Engine (RULE-RES-01 .. 06)        */
/* ------------------------------------------------------------------ */

function ensureGraphLink(draft, spec, ctx) {
  const { sourceType, sourceId, targetType, targetId, relation, ruleId = '', summary = '' } = spec;
  if (
    !LINK_ENTITY_TYPES.includes(sourceType) ||
    !LINK_ENTITY_TYPES.includes(targetType) ||
    FORBIDDEN_LINK_TYPES.includes(sourceType) ||
    FORBIDDEN_LINK_TYPES.includes(targetType) ||
    !LINK_RELATIONS.includes(relation) ||
    !sourceId ||
    !targetId
  ) {
    return { link: null, created: false };
  }
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const existing = draft.links.find(
    (l) =>
      l &&
      l.sourceType === sourceType &&
      l.sourceId === sourceId &&
      l.targetType === targetType &&
      l.targetId === targetId &&
      l.relation === relation,
  );
  if (existing) return { link: existing, created: false };
  const link = {
    id: ctx.idFactory('lnk'),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary,
    createdOn: ctx.todayStr,
    createdAt: ctx.nowIso,
  };
  draft.links.push(link);
  return { link, created: true };
}

function shouldRunResilienceRule(event) {
  if (!event) return false;
  if (Array.isArray(event.rules) && event.rules.includes('resilience')) return true;
  const type = String(event.type || '');
  return (
    type.startsWith('dependency.') ||
    type.startsWith('resilience.') ||
    type === 'person.archived' ||
    type === 'person.restored' ||
    type === 'delegation.completed' ||
    type.startsWith('case.') ||
    type.startsWith('budget.') ||
    type.startsWith('negotiation.') ||
    type.startsWith('portfolio.') ||
    type.startsWith('stakeholder.')
  );
}

function syncSpofTalkingPoint(person, dep, shouldExist) {
  if (!person) return false;
  const tag = `[Resilience SPOF ${dep.id}]`;
  const current = Array.isArray(person.talkingPoints)
    ? person.talkingPoints.slice()
    : String(person.talkingPoints || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const idx = current.findIndex((line) => line.includes(tag));
  if (shouldExist) {
    if (idx !== -1) return false;
    current.push(
      `${tag} Blameless focus & vacation protection on “${dep.name}”: you are currently the sole verified steward (Bus Factor = 1). Who should shadow the next run so you aren’t a single point of contact?`,
    );
    person.talkingPoints = current;
    return true;
  }
  if (idx === -1) return false;
  current.splice(idx, 1);
  person.talkingPoints = current;
  return true;
}

/**
 * Post-commit rule registered in `app/core/domain/postCommit.js` (ADR-0008).
 * Runs inside the store's atomic transaction, is strictly idempotent, never
 * reads/writes `conflicts` or `pulses`, and never fabricates `verifiedOn` or
 * overwrites human-entered overrides.
 */
export function resilienceRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  if (!shouldRunResilienceRule(event)) return [];
  const declared = Array.isArray(event.rules) && event.rules.includes('resilience');
  if (draft.settings?.resilienceAutoPropagate === false && event.force !== true && !declared) {
    return [];
  }

  draft.dependencies = Array.isArray(draft.dependencies) ? draft.dependencies : [];
  if (!draft.dependencies.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const context = {
    ...ctx,
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
  };

  const propagations = [];
  const pushProp = (ruleId, action, targetType, targetId, summary) => {
    propagations.push({ ruleId, action, targetType, targetId, summary });
    if (context.logEvent) {
      context.logEvent({
        type: 'automation.propagated',
        entity: targetType,
        entityId: targetId,
        summary: `[${ruleId}] ${summary}`,
      });
    }
  };

  const peopleById = new Map((draft.people || []).map((p) => [p.id, p]));
  const depsById = new Map(draft.dependencies.map((d) => [d.id, d]));

  /* RULE-RES-06 (part A) — Delegation completion records history without
     auto-fabricating `verifiedOn` on the backup steward. */
  if (event.type === 'delegation.completed' && event.entityId) {
    const completedDel = (draft.delegations || []).find((d) => d.id === event.entityId);
    if (completedDel) {
      for (const dep of draft.dependencies) {
        const marker = `[RULE-RES-02:${dep.id}]`;
        if (!String(completedDel.support || '').includes(marker)) continue;
        const alreadyLogged = (dep.history || []).some(
          (h) => h.action === 'cross-training-completed' && String(h.note || '').includes(completedDel.id),
        );
        if (alreadyLogged) continue;
        dep.history = [
          ...(Array.isArray(dep.history) ? dep.history : []),
          {
            on: context.todayStr,
            action: 'cross-training-completed',
            note: `Cross-training delegation (${completedDel.id}) marked done — verify the backup steward explicitly once they have run an independent handover or drill.`,
          },
        ].slice(-40);
        dep.updatedAt = context.nowIso;
        pushProp(
          'RULE-RES-06',
          'updated',
          'dependency',
          dep.id,
          `Logged cross-training delegation completion on “${dep.name}” (explicit human verification still required for Bus Factor)`,
        );
      }
    }
  }

  /* RULE-RES-01 — Maintain typed graph links & refresh derived daily impact. */
  for (const dep of draft.dependencies) {
    if (!dep || dep.autoPropagate === false) continue;

    // Upstream edges: dep depends-on upstream
    for (const upId of dep.upstreamIds || []) {
      if (upId && upId !== dep.id && depsById.has(upId)) {
        ensureGraphLink(draft, {
          sourceType: 'dependency',
          sourceId: dep.id,
          targetType: 'dependency',
          targetId: upId,
          relation: 'depends-on',
          ruleId: 'RULE-RES-01',
          summary: `“${dep.name}” depends on upstream “${depsById.get(upId).name}”`,
        }, context);
      }
    }

    // Steward edges
    for (const s of dep.stewards || []) {
      if (s?.personId && peopleById.has(s.personId)) {
        ensureGraphLink(draft, {
          sourceType: 'person',
          sourceId: s.personId,
          targetType: 'dependency',
          targetId: dep.id,
          relation: 'stewards',
          ruleId: 'RULE-RES-01',
          summary: `${STEWARD_ROLE_LABELS[s.role] || 'Steward'} for “${dep.name}”`,
        }, context);
      }
    }

    // Goal, Budget, Negotiation, Stakeholder, Portfolio edges
    for (const gid of dep.linkedGoalIds || []) {
      if ((draft.goals || []).some((g) => g.id === gid)) {
        ensureGraphLink(draft, {
          sourceType: 'dependency',
          sourceId: dep.id,
          targetType: 'goal',
          targetId: gid,
          relation: 'impacts-goal',
          ruleId: 'RULE-RES-01',
          summary: `Continuity of “${dep.name}” underpins goal`,
        }, context);
      }
    }
    if (dep.linkedBudgetId && (draft.budgets || []).some((b) => b.id === dep.linkedBudgetId)) {
      ensureGraphLink(draft, {
        sourceType: 'budget',
        sourceId: dep.linkedBudgetId,
        targetType: 'dependency',
        targetId: dep.id,
        relation: 'funds',
        ruleId: 'RULE-RES-01',
        summary: `Budget envelope funds “${dep.name}”`,
      }, context);
    }
    if (dep.linkedNegotiationId && (draft.negotiations || []).some((n) => n.id === dep.linkedNegotiationId)) {
      ensureGraphLink(draft, {
        sourceType: 'negotiation',
        sourceId: dep.linkedNegotiationId,
        targetType: 'dependency',
        targetId: dep.id,
        relation: 'negotiates',
        ruleId: 'RULE-RES-01',
        summary: `Commercial terms for “${dep.name}”`,
      }, context);
    }
    if (dep.linkedStakeholderId && (draft.stakeholders || []).some((s) => s.id === dep.linkedStakeholderId)) {
      ensureGraphLink(draft, {
        sourceType: 'dependency',
        sourceId: dep.id,
        targetType: 'stakeholder',
        targetId: dep.linkedStakeholderId,
        relation: 'involves',
        ruleId: 'RULE-RES-01',
        summary: `External/institutional stakeholder for “${dep.name}”`,
      }, context);
    }
    if (dep.linkedPortfolioId && (draft.portfolio || []).some((p) => p.id === dep.linkedPortfolioId)) {
      ensureGraphLink(draft, {
        sourceType: 'dependency',
        sourceId: dep.id,
        targetType: 'portfolio',
        targetId: dep.linkedPortfolioId,
        relation: 'consumes-capacity',
        ruleId: 'RULE-RES-01',
        summary: `Portfolio work tied to “${dep.name}”`,
      }, context);
    }

    // Derived daily impact sync (never overwrites `dailyImpactOverride`)
    if (isDependencyActive(dep) && finiteNonNeg(dep.dailyImpactOverride) === null) {
      const val = deriveDependencyImpact(dep, draft);
      const prev = finiteNonNeg(dep.derivedDailyImpact);
      const nextVal = val.priced ? val.dailyImpact : null;
      const nextCur = val.priced ? val.currency : '';
      const drifted =
        (prev === null && nextVal !== null) ||
        (prev !== null && nextVal === null) ||
        (prev !== null && nextVal !== null && prev > 0 && Math.abs(nextVal - prev) / prev >= IMPACT_DRIFT_THRESHOLD);
      if (drifted) {
        dep.derivedDailyImpact = nextVal;
        dep.derivedCurrency = nextCur;
        dep.updatedAt = context.nowIso;
        if (prev !== null && nextVal !== null) {
          dep.history = [
            ...(Array.isArray(dep.history) ? dep.history : []),
            { on: context.todayStr, action: 'impact-refreshed', note: `Derived daily shortfall exposure moved from ${prev} to ${nextVal} ${nextCur}` },
          ].slice(-40);
          pushProp('RULE-RES-01', 'refreshed', 'dependency', dep.id, `Refreshed derived daily shortfall impact on “${dep.name}” to ${nextCur} ${nextVal}/day`);
        }
      }
    }
  }

  // Compute network after links/valuations are synced
  const eventType = String(event.type || '');
  const isDirectResilienceEvent =
    eventType.startsWith('dependency.') ||
    eventType.startsWith('resilience.') ||
    declared ||
    event.force === true;
  const isRosterStewardEvent = eventType === 'person.archived' || eventType === 'person.restored';
  const isBargainingEvent = eventType.startsWith('negotiation.') || eventType.startsWith('stakeholder.');

  if (!isDirectResilienceEvent && !isRosterStewardEvent && !isBargainingEvent) {
    return propagations;
  }

  const network = analyzeDependencyNetwork(draft, now);

  for (const dep of draft.dependencies) {
    if (!dep || dep.autoPropagate === false) continue;
    const active = isDependencyActive(dep);
    const st = network.stewardshipById.get(dep.id) || evaluateStewardship(dep, draft, now);
    const metrics = network.nodeMetrics.get(dep.id);

    /* RULE-RES-02 — Critical Bus-Factor-1 SPOF -> Cross-Training Delegation + 1:1 Topic */
    const needsSpofRelief = Boolean(
      active &&
      dep.criticality === 'critical' &&
      dep.kind !== 'vendor' &&
      st.busFactor <= 1,
    );
    const primaryPerson = st.qualifiedStewards[0]
      ? peopleById.get(st.qualifiedStewards[0].personId)
      : st.inTrainingStewards[0]
        ? peopleById.get(st.inTrainingStewards[0].personId)
        : null;

    if ((isDirectResilienceEvent || isRosterStewardEvent) && needsSpofRelief && primaryPerson && primaryPerson.status !== 'archived') {
      if (syncSpofTalkingPoint(primaryPerson, dep, true)) {
        pushProp('RULE-RES-02', 'coached', 'person', primaryPerson.id, `Queued blameless SPOF load-protection talking point for ${primaryPerson.name} on “${dep.name}”`);
      }
      const marker = `[RULE-RES-02:${dep.id}]`;
      const openDel = (draft.delegations || []).find(
        (d) => d.status === 'active' && String(d.support || '').includes(marker),
      );
      // Do not re-open indefinitely if already completed recently unless nobody is in training AND no backup was ever verified;
      // keep strictly idempotent per dependency while an active delegation or completed-awaiting-verification delegation exists
      // UNLESS a previously verified backup was archived (dropping busFactor back to <=1).
      const completedDel = (draft.delegations || []).find(
        (d) => d.status === 'done' && String(d.support || '').includes(marker),
      );
      const backupArchivedAfterDel = st.archivedCount > 0 && st.busFactor <= 1;
      if (!openDel && (!completedDel || backupArchivedAfterDel)) {
        // Guard against loop if backupArchivedAfterDel already spawned a post-archive delegation
        const postArchiveMarker = backupArchivedAfterDel ? `${marker}[archived:${st.archivedCount}]` : marker;
        const alreadySpawnedForArchive = (draft.delegations || []).some(
          (d) => String(d.support || '').includes(postArchiveMarker),
        );
        if (!alreadySpawnedForArchive) {
          const trainee = st.inTrainingStewards[0];
          const delegation = {
            id: context.idFactory('delegation'),
            personId: primaryPerson.id,
            title: `Cross-train & shadow-verify backup steward for: ${dep.name}`.slice(0, 160),
            expectedOutcome: trainee
              ? `Runbook documented and ${trainee.personName} shadow-verified on “${dep.name}” so Bus Factor reaches 2.`
              : `Identify a backup steward, document the operational runbook, and run one supervised shadow handover for “${dep.name}”.`,
            authority: 'act-inform',
            support: `${postArchiveMarker} Blameless SPOF relief (Avelino Bus Factor ≤ 1): protecting ${primaryPerson.name}’s focus and leave coverage, not a performance remediation.`,
            delegatedOn: context.todayStr,
            dueOn: addDays(context.todayStr, 14),
            status: 'active',
            checkins: [],
            completedOn: null,
            completionNote: '',
            returnedOn: null,
            returnReason: '',
            createdAt: context.nowIso,
            updatedAt: context.nowIso,
          };
          draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
          draft.delegations.push(delegation);
          ensureGraphLink(draft, {
            sourceType: 'dependency',
            sourceId: dep.id,
            targetType: 'delegation',
            targetId: delegation.id,
            relation: 'tracks-followup',
            ruleId: 'RULE-RES-02',
            summary: `Cross-training delegation to raise Bus Factor on “${dep.name}”`,
          }, context);
          pushProp('RULE-RES-02', 'created', 'delegation', delegation.id, `Opened cross-training delegation for critical SPOF “${dep.name}”`);
        }
      }
    } else if ((isDirectResilienceEvent || isRosterStewardEvent) && !needsSpofRelief) {
      // Clean up SPOF talking points once Bus Factor >= 2 or retired
      for (const p of draft.people || []) {
        if (syncSpofTalkingPoint(p, dep, false)) {
          pushProp('RULE-RES-02', 'cleared', 'person', p.id, `Cleared resolved SPOF talking point for ${p.name} on “${dep.name}”`);
        }
      }
    }

    /* RULE-RES-03 — Critical Survival Shortfall (TTR > TTS) -> DACI Trade-off Decision */
    if (
      isDirectResilienceEvent &&
      active &&
      dep.criticality === 'critical' &&
      metrics?.hasAnyShortfall &&
      dep.substitutability !== 'dual-active'
    ) {
      const marker = `[RULE-RES-03:${dep.id}]`;
      const existingDec = (draft.decisions || []).find(
        (d) => !d.reviewedOn && String(d.context || '').includes(marker),
      );
      if (!existingDec) {
        const approverName = draft.settings?.leaderName || primaryPerson?.name || '';
        const shortfall = metrics.cascadingShortfallDays;
        const decision = {
          id: context.idFactory('decision'),
          title: `Close ${shortfall}-day continuity shortfall on “${dep.name}”`.slice(0, 180),
          date: context.todayStr,
          driver: primaryPerson?.name || approverName,
          approver: approverName,
          contributors: st.stewards.map((s) => s.personName).join(', '),
          informed: '',
          reversibility: 'irreversible',
          context: `${marker} Simchi-Levi continuity gap on critical ${dep.kind} “${dep.name}”: survival tolerance TTS = ${metrics.ttsDays}d vs worst outage TTR = ${Math.max(metrics.effectiveTtrDays || 0, metrics.worstIncomingOutageDays || 0)}d (${shortfall}d unbuffered shortfall; substitutability: ${dep.substitutability}).`,
          options: [
            {
              id: context.idFactory('dopt'),
              label: `Extend survival buffer (TTS ≥ ${Math.max(metrics.effectiveTtrDays || 0, metrics.worstIncomingOutageDays || 0)}d) via local cache, queue or manual fallback`,
              pros: 'Absorbs upstream outages without emergency vendor switching',
              cons: 'Requires engineering/process investment to maintain fallback parity',
            },
            {
              id: context.idFactory('dopt'),
              label: 'Qualify a warm-standby substitute or automate failover (cut effective TTR)',
              pros: 'Directly shrinks recovery duration and reduces supplier hold-up power',
              cons: dep.mitigationCost ? `Estimated qualification cost ${dep.currency || 'USD'} ${dep.mitigationCost}` : 'Carries dual-vendor qualification and ongoing maintenance overhead',
            },
            {
              id: context.idFactory('dopt'),
              label: 'Decouple synchronous downstream dependencies',
              pros: 'Contains blast radius so downstream capabilities degrade gracefully',
              cons: 'Architectural refactor across dependent services',
            },
            {
              id: context.idFactory('dopt'),
              label: `Explicitly accept the ${shortfall}-day continuity gap until next review`,
              pros: 'Preserves near-term delivery capacity for funded roadmap items',
              cons: 'Leaves customer/goal SLA exposed if disruption occurs',
            },
          ],
          chosen: '',
          decidedOn: null,
          rationale: '',
          reviewOn: addDays(context.todayStr, draft.settings?.decisionReviewDays ?? 14),
          reviewedOn: null,
          outcome: 'pending',
          outcomeNotes: '',
          forecastProbability: null,
          createdAt: context.nowIso,
        };
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        draft.decisions.push(decision);
        ensureGraphLink(draft, {
          sourceType: 'decision',
          sourceId: decision.id,
          targetType: 'dependency',
          targetId: dep.id,
          relation: 'decides',
          ruleId: 'RULE-RES-03',
          summary: `Governs ${shortfall}d continuity shortfall on “${dep.name}”`,
        }, context);
        // Also link to linked case/budget/negotiation if present so Session 44's
        // decisionTempoRule can derive value at stake automatically!
        if (dep.linkedBudgetId) {
          ensureGraphLink(draft, {
            sourceType: 'budget',
            sourceId: dep.linkedBudgetId,
            targetType: 'decision',
            targetId: decision.id,
            relation: 'funds',
            ruleId: 'RULE-RES-03',
            summary: `Envelope exposed by “${dep.name}” continuity call`,
          }, context);
        }
        if (dep.linkedNegotiationId) {
          ensureGraphLink(draft, {
            sourceType: 'negotiation',
            sourceId: dep.linkedNegotiationId,
            targetType: 'decision',
            targetId: decision.id,
            relation: 'negotiates',
            ruleId: 'RULE-RES-03',
            summary: `Contract stakes exposed by “${dep.name}” continuity call`,
          }, context);
        }
        pushProp('RULE-RES-03', 'created', 'decision', decision.id, `Opened DACI continuity trade-off decision for ${shortfall}d shortfall on “${dep.name}”`);
      }
    }

    /* RULE-RES-04 — Williamson Vendor Hold-Up -> Negotiation Prep Trace */
    if ((isDirectResilienceEvent || isBargainingEvent) && active && dep.kind === 'vendor' && dep.linkedNegotiationId) {
      const holdUp = evaluateHoldUpRisk(dep, metrics, draft);
      const neg = (draft.negotiations || []).find((n) => n.id === dep.linkedNegotiationId);
      if (neg && neg.status !== 'withdrawn' && holdUp.level === 'high') {
        const marker = `[RULE-RES-04:${dep.id}]`;
        if (!String(neg.notes || '').includes(marker)) {
          const addition = `${marker} Hold-up warning (${context.todayStr}): “${dep.name}” is ${SUBSTITUTABILITY_LABELS[dep.substitutability].toLowerCase()} with TTR ${dep.ttrDays ?? 'unmeasured'}d vs TTS ${dep.ttsDays ?? 'unmeasured'}d (hold-up score ${holdUp.score}/100). Qualify a parallel option before conceding renewal terms.`;
          neg.notes = [String(neg.notes || '').trim(), addition].filter(Boolean).join('\n\n').slice(0, 4000);
          neg.updatedAt = context.nowIso;
          pushProp('RULE-RES-04', 'updated', 'negotiation', neg.id, `Added Williamson hold-up leverage warning from “${dep.name}” to negotiation “${neg.title}”`);
        }
      }
    }
  }

  /* RULE-RES-05 — Breached Continuity Drill -> Goal Risk Check-In & Operational Case */
  if (event.type === 'dependency.drillRecorded' && event.entityId) {
    const dep = depsById.get(event.entityId);
    const latestDrill = dep && Array.isArray(dep.drills) ? dep.drills.at(-1) : null;
    if (
      dep &&
      latestDrill &&
      latestDrill.outcome === 'breached-tolerance' &&
      (dep.criticality === 'critical' || dep.criticality === 'important')
    ) {
      // 1. Shift linked on-track active goals to at-risk with explainable check-in
      for (const gid of dep.linkedGoalIds || []) {
        const goal = (draft.goals || []).find((g) => g.id === gid && g.status === 'active');
        if (!goal) continue;
        const marker = `[RULE-RES-05:${latestDrill.id}]`;
        const hasCheckin = (goal.checkins || []).some((c) => String(c.note || '').includes(marker));
        if (hasCheckin) continue;
        if (goal.confidence === 'on-track') goal.confidence = 'at-risk';
        goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
        goal.checkins.push({
          id: context.idFactory('gchk'),
          date: latestDrill.date || context.todayStr,
          confidence: goal.confidence,
          note: `${marker} Continuity ${DRILL_KIND_LABELS[latestDrill.kind]?.toLowerCase() || 'drill'} on “${dep.name}” breached survival tolerance (realized TTR ${latestDrill.realizedTtrDays ?? '—'}d vs TTS ${dep.ttsDays ?? '—'}d).`,
        });
        pushProp('RULE-RES-05', 'updated', 'goal', goal.id, `Flagged goal “${goal.title}” at-risk after breached continuity drill on “${dep.name}”`);
      }

      // 2. Open one linked Operational Case if none is currently open for this dependency
      const hasOpenCase = (draft.links || []).some((l) => {
        if (l.relation !== 'continuity-tests') return false;
        const cid = l.sourceType === 'case' && l.targetType === 'dependency' && l.targetId === dep.id
          ? l.sourceId
          : l.targetType === 'case' && l.sourceType === 'dependency' && l.sourceId === dep.id
            ? l.targetId
            : null;
        if (!cid) return false;
        const c = (draft.cases || []).find((rec) => rec.id === cid);
        return Boolean(c && isCaseOpen(c));
      });

      if (!hasOpenCase) {
        const st = network.stewardshipById.get(dep.id) || evaluateStewardship(dep, draft, now);
        const ownerId = st.qualifiedStewards[0]?.personId || st.inTrainingStewards[0]?.personId || null;
        const val = network.valuationById.get(dep.id) || deriveDependencyImpact(dep, draft);
        const shortfall = Math.max(1, (finiteNonNeg(latestDrill.realizedTtrDays, 0) || 1) - (finiteNonNeg(dep.ttsDays, 0) || 0));
        const baseLoss = val.priced && val.dailyImpact ? round2(val.dailyImpact * shortfall) : 0;

        const newCase = {
          id: context.idFactory('case'),
          title: `Continuity tolerance breach: ${dep.name}`.slice(0, 180),
          kind: latestDrill.kind === 'live-incident' ? 'incident' : 'risk',
          status: 'open',
          summary: `${DRILL_KIND_LABELS[latestDrill.kind] || 'Continuity test'} on ${latestDrill.date || context.todayStr} breached survival tolerance on “${dep.name}” (realized recovery ${latestDrill.realizedTtrDays ?? 'unmeasured'}d vs TTS ${dep.ttsDays ?? 'unmeasured'}d). ${latestDrill.gapNote || latestDrill.scenario || ''}`.trim().slice(0, 3000),
          ownerId,
          involvedPersonIds: st.stewards.filter((s) => s.active).map((s) => s.personId),
          linkedGoalId: (dep.linkedGoalIds || [])[0] || null,
          openedOn: latestDrill.date || context.todayStr,
          reviewOn: addDays(context.todayStr, draft.settings?.caseReviewDays ?? 14),
          resolvedOn: null,
          resolutionNotes: '',
          fmea: {
            failureMode: `${dep.name} recovery exceeded survival tolerance`,
            effect: latestDrill.scenario || 'Downstream service interruption beyond TTS tolerance',
            severity: dep.criticality === 'critical' ? 8 : 6,
            probability: latestDrill.kind === 'live-incident' ? 7 : 5,
            detectability: 5,
            controls: dep.exitPlanSummary || '',
            residualSeverity: dep.criticality === 'critical' ? 8 : 6,
            residualProbability: 4,
            residualDetectability: 4,
          },
          rca: {
            whys: [latestDrill.gapNote || 'Recovery exceeded survival tolerance during continuity test', '', '', '', ''],
            systemicBarrier: latestDrill.gapNote || '',
            preventiveAction: 'Close TTS/TTR continuity gap and re-verify failover drill',
          },
          financial: {
            currency: val.currency || dep.currency || 'USD',
            optimistic: baseLoss > 0 ? round2(baseLoss * 0.5) : 0,
            mostLikely: baseLoss,
            pessimistic: baseLoss > 0 ? round2(baseLoss * 1.8) : 0,
            mitigationCost: finiteNonNeg(dep.mitigationCost, 0) || 0,
            capacityDaysOptimistic: 1,
            capacityDaysMostLikely: 3,
            capacityDaysPessimistic: 6,
            opportunityCost: '',
          },
          stakeholders: [],
          autoPropagate: true,
          createdAt: context.nowIso,
          updatedAt: context.nowIso,
        };
        draft.cases = Array.isArray(draft.cases) ? draft.cases : [];
        draft.cases.push(newCase);
        latestDrill.linkedCaseId = newCase.id;
        ensureGraphLink(draft, {
          sourceType: 'case',
          sourceId: newCase.id,
          targetType: 'dependency',
          targetId: dep.id,
          relation: 'continuity-tests',
          ruleId: 'RULE-RES-05',
          summary: `Remediates breached ${latestDrill.kind} on “${dep.name}”`,
        }, context);
        pushProp('RULE-RES-05', 'created', 'case', newCase.id, `Opened remediation case “${newCase.title}” from breached continuity drill`);
      }
    }
  }

  return propagations;
}
