/**
 * app/core/domain/stakeholders.js — Stakeholder Influence Register engine.
 *
 * A persistent, portfolio-wide political map. Operational Cases, Org Changes
 * and Negotiations carry lightweight embedded stakeholder stubs; this module
 * gives the leader one first-class register behind them and applies four
 * named, peer-reviewed political-science lenses explicitly rather than
 * hiding generic "best practice" language behind a score:
 *
 *  1. Mendelow (1981) Power × Interest matrix — quadrant strategy and
 *     communication cadence. Reuses the same classifier the Operational Case
 *     engine uses so a stakeholder reads identically everywhere.
 *  2. Mitchell, Agle & Wood (1997) Theory of Stakeholder Salience — dynamic
 *     salience from the possession (rating ≥ 4/5) of Power, Legitimacy and
 *     Urgency, producing the seven classical classes (dormant, discretionary,
 *     demanding, dominant, dangerous, dependent, definitive) plus a
 *     minimal-salience residual. Salience is dynamic: urgency can rise
 *     without any structural power change.
 *  3. Tsebelis (1995, 2002) Veto Player theory — players whose agreement is
 *     required shrink the win-set of possible change. A documented heuristic
 *     (not a formal spatial model) turns veto-player stance, power and
 *     cohesion into a change-difficulty band with an honest confidence label.
 *  4. Coalition network analysis — alliance/opposition/influence edges,
 *     union-find bloc detection, weighted degree centrality and
 *     "hidden-influencer" detection (informal out-influence without formal
 *     power), extending Lax & Sebenius (2006) coalition balance.
 *
 * Pure module: no DOM, storage, clock globals or network.
 */

import { dayKey, daysBetween, isOverdue } from '../time.js';
import {
  STAKEHOLDER_CADENCES,
  STAKEHOLDER_STANCES,
  STAKEHOLDER_STANCE_LABELS,
  classifyMendelowStakeholder,
  resolveLinkedEntity,
} from './cases.js';

/* ------------------------------------------------------------- constants */

export const STAKEHOLDER_CATEGORIES = [
  'internal-exec',
  'internal-peer',
  'internal-report',
  'external-client',
  'external-vendor',
  'external-regulator',
  'external-partner',
  'other',
];

export const STAKEHOLDER_CATEGORY_LABELS = {
  'internal-exec': 'Internal executive / sponsor',
  'internal-peer': 'Internal peer leader',
  'internal-report': 'Direct / skip-level report',
  'external-client': 'Client / customer',
  'external-vendor': 'Vendor / supplier',
  'external-regulator': 'Regulator / auditor',
  'external-partner': 'Partner / ecosystem',
  other: 'Other',
};

export const STAKEHOLDER_STATUSES = ['active', 'archived'];

export const ESTIMATE_CONFIDENCE = ['high', 'medium', 'low'];

export const ESTIMATE_CONFIDENCE_LABELS = {
  high: 'High — direct evidence',
  medium: 'Medium — inferred from behaviour',
  low: 'Low — assumption, verify',
};

/** Mitchell et al. treat attributes as binary; 4/5+ means "clearly possesses". */
export const SALIENCE_ATTRIBUTE_THRESHOLD = 4;

/** Confidence discount applied to the displayed expected salience score. */
export const CONFIDENCE_FACTOR = { high: 1, medium: 0.85, low: 0.7 };

export const SALIENCE_CLASSES = {
  definitive: {
    id: 'definitive',
    label: 'Definitive',
    subtitle: 'Power + legitimacy + urgency',
    guidance: 'Highest salience: engage personally and continuously. This stakeholder can and will act now, and others accept their claim as legitimate.',
  },
  dominant: {
    id: 'dominant',
    label: 'Dominant',
    subtitle: 'Power + legitimacy',
    guidance: 'Formal coalition anchor: co-shape decisions before urgency rises, because an urgent dominant stakeholder becomes definitive overnight.',
  },
  dangerous: {
    id: 'dangerous',
    label: 'Dangerous',
    subtitle: 'Power + urgency, low legitimacy',
    guidance: 'Coercive capacity without a broadly accepted claim. Do not marginalise: open a legitimate channel or the pressure moves through unofficial routes.',
  },
  dependent: {
    id: 'dependent',
    label: 'Dependent',
    subtitle: 'Legitimacy + urgency, no independent power',
    guidance: 'Depends on a powerful ally or your sponsorship. Offer a transparent channel and route their urgency through a dominant player.',
  },
  dormant: {
    id: 'dormant',
    label: 'Dormant',
    subtitle: 'Power only',
    guidance: 'Latent power, currently uninterested. Keep informed lightly; a trigger event can activate substantial discretionary power.',
  },
  discretionary: {
    id: 'discretionary',
    label: 'Discretionary',
    subtitle: 'Legitimacy only',
    guidance: 'No pressure, no power claim — but a credible voice. Worth deliberate stewardship; their endorsement builds coalition legitimacy.',
  },
  demanding: {
    id: 'demanding',
    label: 'Demanding',
    subtitle: 'Urgency only',
    guidance: 'Loud but limited leverage. Respond efficiently without over-investing scarce executive attention.',
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal salience',
    subtitle: 'No attribute clearly possessed',
    guidance: 'Monitor through normal channels. Reassess when evidence of power, legitimacy or urgency accumulates.',
  },
};

/** Stance ordinal: distance from the proposal, 0 = champion … 4 = blocker. */
export const STANCE_ORDINAL = Object.freeze({
  champion: 0,
  supportive: 1,
  neutral: 2,
  skeptical: 3,
  blocker: 4,
});

export const ADVERSE_STANCES = ['skeptical', 'blocker'];

export const ALLIANCE_KINDS = ['alliance', 'opposition', 'influences'];

export const ALLIANCE_KIND_LABELS = {
  alliance: 'Allied',
  opposition: 'Opposed',
  influences: 'Influences',
};

/** Cadence → days, used to propose the next contact after a logged contact. */
export const CADENCE_DAYS = { immediate: 2, weekly: 7, milestone: 30, digest: 14 };

export const VETO_BANDS = {
  feasible: { id: 'feasible', label: 'Wide win-set', tone: 'good', max: 33 },
  contested: { id: 'contested', label: 'Narrow win-set', tone: 'caution', max: 66 },
  blocked: { id: 'blocked', label: 'Win-set likely empty', tone: 'bad', max: 100 },
};

export const HIGH_SALIENCE_CLASSES = ['definitive', 'dominant', 'dangerous'];

/* --------------------------------------------------------------- helpers */

function clampRating(value, fallback = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function confidenceOf(value, fallback = 'medium') {
  return ESTIMATE_CONFIDENCE.includes(value) ? value : fallback;
}

function stanceOf(value, fallback = 'neutral') {
  return STAKEHOLDER_STANCES.includes(value) ? value : fallback;
}

/* ------------------------------------------------- Mitchell et al. salience */

/**
 * Classify a rating triple into the Mitchell, Agle & Wood (1997) salience
 * class. Returns the binary attribute possession, the raw 3–15 score and a
 * confidence-adjusted expected score (the raw score is never hidden).
 */
export function classifySalience(ratings = {}) {
  const power = clampRating(ratings.power, 3);
  const legitimacy = clampRating(ratings.legitimacy, 3);
  const urgency = clampRating(ratings.urgency, 3);
  const hasPower = power >= SALIENCE_ATTRIBUTE_THRESHOLD;
  const hasLegitimacy = legitimacy >= SALIENCE_ATTRIBUTE_THRESHOLD;
  const hasUrgency = urgency >= SALIENCE_ATTRIBUTE_THRESHOLD;
  const attrCount = [hasPower, hasLegitimacy, hasUrgency].filter(Boolean).length;

  let id = 'minimal';
  if (hasPower && hasLegitimacy && hasUrgency) id = 'definitive';
  else if (hasPower && hasLegitimacy) id = 'dominant';
  else if (hasPower && hasUrgency) id = 'dangerous';
  else if (hasLegitimacy && hasUrgency) id = 'dependent';
  else if (hasPower) id = 'dormant';
  else if (hasLegitimacy) id = 'discretionary';
  else if (hasUrgency) id = 'demanding';

  const rawScore = power + legitimacy + urgency;
  const confidence = confidenceOf(ratings.estimateConfidence);
  const expectedScore = Math.round(rawScore * CONFIDENCE_FACTOR[confidence] * 10) / 10;

  return {
    power,
    legitimacy,
    urgency,
    hasPower,
    hasLegitimacy,
    hasUrgency,
    attrCount,
    salienceClass: id,
    classLabel: SALIENCE_CLASSES[id].label,
    guidance: SALIENCE_CLASSES[id].guidance,
    subtitle: SALIENCE_CLASSES[id].subtitle,
    salienceScore: rawScore,
    expectedSalienceScore: expectedScore,
    confidence,
  };
}

/* ------------------------------------------------------ Tsebelis veto math */

/**
 * Tsebelis win-set heuristic for one initiative. Each veto player contributes
 * at most 25 difficulty points from stance distance × relative power.
 * Cohesive opposition (Tsebelis: agenda-setting shrinks as veto players
 * agree) adds a penalty. This is a transparent operational proxy, not a
 * spatial model — the UI labels it as such.
 *
 * @param {Array<{vetoPlayer?:boolean, stance?:string, power?:number, estimateConfidence?:string, name?:string}>} items
 */
export function analyzeInitiativeVetoRisk(items = []) {
  const vetoPlayers = (Array.isArray(items) ? items : []).filter((i) => i && i.vetoPlayer === true);
  if (!vetoPlayers.length) {
    return {
      vetoCount: 0,
      opposingVetoCount: 0,
      difficulty: 0,
      band: VETO_BANDS.feasible,
      confidence: 'high',
      rationale: 'No recorded veto player: no formal agreement gate is modelled.',
      contributors: [],
    };
  }

  const contributors = vetoPlayers.map((v) => {
    const stance = stanceOf(v.stance);
    const ordinal = STANCE_ORDINAL[stance];
    const power = clampRating(v.power, 3);
    const points = Math.round((ordinal / 4) * (power / 5) * 25);
    return {
      id: v.id || null,
      name: v.name || 'Unnamed veto player',
      stance,
      stanceLabel: STAKEHOLDER_STANCE_LABELS[stance],
      power,
      points,
      confidence: confidenceOf(v.estimateConfidence),
    };
  });

  const opposing = contributors.filter((c) => ADVERSE_STANCES.includes(c.stance));
  let difficulty = contributors.reduce((sum, c) => sum + c.points, 0);

  let cohesionPenalty = 0;
  let cohesionNote = '';
  if (opposing.length >= 2) {
    const ordinals = opposing.map((c) => STANCE_ORDINAL[c.stance]);
    const spread = Math.max(...ordinals) - Math.min(...ordinals);
    if (spread === 0 && opposing[0].stance === 'blocker') {
      cohesionPenalty = 8;
      cohesionNote = 'Unified blocker front (Tsebelis cohesion penalty, +8).';
    } else if (spread <= 1) {
      cohesionPenalty = 5;
      cohesionNote = 'Cohesive opposing veto bloc (Tsebelis cohesion penalty, +5).';
    }
  }
  difficulty = Math.min(100, difficulty + cohesionPenalty);

  const band = Object.values(VETO_BANDS).find((b) => difficulty <= b.max) || VETO_BANDS.blocked;
  const confidences = contributors.map((c) => c.confidence);
  const confidence = confidences.includes('low')
    ? 'low'
    : confidences.includes('medium')
      ? 'medium'
      : 'high';

  const rationale = opposing.length
    ? `${opposing.length} of ${contributors.length} veto player${contributors.length === 1 ? '' : 's'} adverse.${cohesionNote ? ` ${cohesionNote}` : ''} Stance-distance × power heuristic; not a formal spatial win-set.`
    : `All ${contributors.length} veto player${contributors.length === 1 ? '' : 's'} currently neutral or favourable — the modelled gate is open.`;

  return {
    vetoCount: contributors.length,
    opposingVetoCount: opposing.length,
    difficulty,
    band,
    confidence,
    rationale,
    contributors,
  };
}

/* ------------------------------------------------------- coalition network */

/**
 * Build the alliance bloc graph. Alliance edges are treated as undirected
 * for bloc membership (union-find); opposition and influence edges are
 * directional. Centrality is normalised weighted degree.
 */
export function buildCoalitionNetwork(stakeholders = []) {
  const active = (Array.isArray(stakeholders) ? stakeholders : []).filter((s) => s && s.status !== 'archived');
  const ids = new Set(active.map((s) => s.id));
  const parent = new Map(active.map((s) => [s.id, s.id]));

  const find = (x) => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a, b) => {
    if (!ids.has(a) || !ids.has(b)) return;
    parent.set(find(a), find(b));
  };

  const degree = new Map(active.map((s) => [s.id, 0]));
  const outInfluence = new Map(active.map((s) => [s.id, 0]));
  const oppositionPairs = [];
  const influenceEdges = [];
  const allianceEdges = [];

  for (const s of active) {
    for (const edge of Array.isArray(s.alliances) ? s.alliances : []) {
      if (!edge || !ids.has(edge.targetId)) continue;
      const strength = clampRating(edge.strength, 3);
      if (edge.kind === 'alliance') {
        union(s.id, edge.targetId);
        degree.set(s.id, degree.get(s.id) + strength);
        degree.set(edge.targetId, degree.get(edge.targetId) + strength);
        allianceEdges.push({ sourceId: s.id, targetId: edge.targetId, strength });
      } else if (edge.kind === 'opposition') {
        oppositionPairs.push({ sourceId: s.id, targetId: edge.targetId, strength });
      } else if (edge.kind === 'influences') {
        outInfluence.set(s.id, outInfluence.get(s.id) + strength);
        influenceEdges.push({ sourceId: s.id, targetId: edge.targetId, strength });
      }
    }
  }

  const denom = Math.max(1, active.length - 1);
  const centrality = new Map(
    active.map((s) => [s.id, Math.round((degree.get(s.id) / (denom * 5)) * 100) / 100]),
  );

  // Blocs: group by union-find root, keep only groups with ≥2 members as
  // named blocs; singletons remain independent actors.
  const blocOf = new Map();
  const groups = new Map();
  for (const s of active) {
    const root = find(s.id);
    blocOf.set(s.id, root);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(s.id);
  }
  const blobs = [];
  let blocSeq = 0;
  for (const [root, members] of groups) {
    if (members.length < 2) continue;
    blocSeq += 1;
    const blocId = `bloc-${blocSeq}`;
    let power = 0;
    let ordinalWeighted = 0;
    for (const memberId of members) {
      const member = active.find((s) => s.id === memberId);
      power += clampRating(member.power, 3);
      ordinalWeighted += STANCE_ORDINAL[stanceOf(member.stance)] * clampRating(member.power, 3);
    }
    const centroid = ordinalWeighted / Math.max(1, power);
    const leaning = centroid <= 1.4 ? 'supportive' : centroid >= 2.6 ? 'opposing' : 'neutral';
    for (const memberId of members) blocOf.set(memberId, blocId);
    blobs.push({ id: blocId, memberIds: members.slice(), power, centroid: Math.round(centroid * 100) / 100, leaning });
  }

  // Hidden influencers: low formal power but high informal out-influence.
  const hiddenInfluencers = active
    .filter((s) => clampRating(s.power, 3) <= 2 && outInfluence.get(s.id) >= 6)
    .map((s) => ({ id: s.id, name: s.name, influenceStrength: outInfluence.get(s.id) }));

  const supportivePower = active
    .filter((s) => ['champion', 'supportive'].includes(stanceOf(s.stance)))
    .reduce((sum, s) => sum + clampRating(s.power, 3), 0);
  const opposingPower = active
    .filter((s) => ADVERSE_STANCES.includes(stanceOf(s.stance)))
    .reduce((sum, s) => sum + clampRating(s.power, 3), 0);

  return {
    centrality,
    blocOf,
    blocs: blobs,
    oppositionPairs,
    influenceEdges,
    allianceEdges,
    outInfluence,
    hiddenInfluencers,
    supportivePower,
    opposingPower,
    netPowerBalance: supportivePower - opposingPower,
  };
}

/* --------------------------------------------------------- reconciliation */

/** Strict matching: exact normalized name or an internal person link. */
export function matchRegisterStakeholder(register = [], { name = '', personId = null } = {}) {
  const active = (Array.isArray(register) ? register : []).filter((r) => r && r.status !== 'archived');
  if (personId) {
    const byPerson = active.find((r) => r.personId === personId);
    if (byPerson) return byPerson;
  }
  const target = normalizeName(name);
  if (!target) return null;
  return active.find((r) => normalizeName(r.name) === target) || null;
}

/**
 * Walk the embedded stakeholder stubs that already exist across Cases
 * (stakeholders[]), Org Changes (coalition[]) and Negotiations
 * (counterparty name). One canonical shape regardless of source.
 */
export function collectEmbeddedStakeholders(state = {}) {
  const out = [];
  for (const c of state.cases || []) {
    for (const s of Array.isArray(c.stakeholders) ? c.stakeholders : []) {
      if (!s || !String(s.name || '').trim()) continue;
      out.push({
        sourceType: 'case',
        sourceId: c.id,
        sourceTitle: c.title,
        sourceStatus: c.status,
        name: String(s.name).trim(),
        personId: s.personId || null,
        stance: stanceOf(s.stance),
        power: clampRating(s.power, 3),
        interest: clampRating(s.interest, 3),
        vetoPlayer: false,
      });
    }
  }
  for (const chg of state.changes || []) {
    for (const m of Array.isArray(chg.coalition) ? chg.coalition : []) {
      if (!m || !String(m.name || '').trim()) continue;
      out.push({
        sourceType: 'change',
        sourceId: chg.id,
        sourceTitle: chg.title,
        sourceStatus: chg.status,
        name: String(m.name).trim(),
        personId: m.personId || null,
        stance: stanceOf(m.stance),
        power: clampRating(m.power, 3),
        interest: clampRating(m.interest, 3),
        vetoPlayer: m.vetoPlayer === true,
      });
    }
  }
  for (const n of state.negotiations || []) {
    if (!n || !String(n.counterparty || '').trim()) continue;
    out.push({
      sourceType: 'negotiation',
      sourceId: n.id,
      sourceTitle: n.title,
      sourceStatus: n.status,
      name: String(n.counterparty).trim(),
      personId: null,
      stance: 'neutral',
      power: 3,
      interest: 3,
      vetoPlayer: false,
    });
  }
  return out;
}

/**
 * Reconcile every embedded stub against the register. Strict matching only —
 * a near-miss is reported as unmapped, never guessed into a link.
 */
export function reconciliationReport(state = {}) {
  const stubs = collectEmbeddedStakeholders(state);
  const register = state.stakeholders || [];
  const seen = new Set();
  const mapped = [];
  const unmapped = [];
  for (const stub of stubs) {
    const key = `${stub.sourceType}:${stub.sourceId}:${normalizeName(stub.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const match = matchRegisterStakeholder(register, stub);
    if (match) mapped.push({ ...stub, stakeholderId: match.id });
    else unmapped.push(stub);
  }
  return {
    total: stubs.length,
    mappedCount: mapped.length,
    unmappedCount: unmapped.length,
    coveragePct: stubs.length ? Math.round((mapped.length / stubs.length) * 100) : null,
    mapped,
    unmapped,
  };
}

/* ---------------------------------------------------------- stance history */

/** Ordinal movement: positive = moved away from the proposal (adverse). */
export function classifyStanceShift(fromStance, toStance) {
  const delta = STANCE_ORDINAL[stanceOf(toStance)] - STANCE_ORDINAL[stanceOf(fromStance)];
  if (delta >= 2) return { delta, id: 'major-adverse', adverse: true, label: 'Major adverse shift' };
  if (delta === 1) return { delta, id: 'adverse-drift', adverse: true, label: 'Adverse drift' };
  if (delta === 0) return { delta, id: 'unchanged', adverse: false, label: 'No change' };
  if (delta <= -2) return { delta, id: 'major-warming', adverse: false, label: 'Major warming' };
  return { delta, id: 'warming', adverse: false, label: 'Warming' };
}

export function latestStanceEntry(record = {}) {
  const history = Array.isArray(record.stanceHistory) ? record.stanceHistory : [];
  if (!history.length) return null;
  return history.slice().sort((a, b) => String(b.on).localeCompare(String(a.on)))[0] || null;
}

/* ------------------------------------------------------------- per-record */

/**
 * Full derived profile for the detail screen. Involvement is read from typed
 * `involves` graph edges; initiative-specific embedded stances override the
 * register default stance for that initiative.
 */
export function summarizeStakeholder(record = {}, state = {}, now = new Date()) {
  const todayStr = dayKey(now);
  const salience = classifySalience(record);
  const mendelow = classifyMendelowStakeholder(
    {
      power: record.power,
      interest: record.interest,
      stance: record.stance,
      commsCadence: record.commsCadence,
      nextCommsOn: record.nextContactOn,
      lastCommsOn: record.lastContactOn,
    },
    todayStr,
  );

  const links = Array.isArray(state.links) ? state.links : [];
  const involvements = links
    .filter((l) => l && l.targetType === 'stakeholder' && l.targetId === record.id && l.relation === 'involves')
    .map((l) => {
      const peer = resolveLinkedEntity(state, l.sourceType, l.sourceId);
      if (!peer) return null;
      const stub = collectEmbeddedStakeholders(state).find(
        (s) => s.sourceType === l.sourceType && s.sourceId === l.sourceId && normalizeName(s.name) === normalizeName(record.name),
      );
      return {
        relation: l.relation,
        ruleId: l.ruleId || null,
        createdOn: l.createdOn || null,
        peer,
        initiativeStance: stub ? stub.stance : null,
        initiativeStanceLabel: stub ? STAKEHOLDER_STANCE_LABELS[stub.stance] : null,
        vetoOnInitiative: stub ? stub.vetoPlayer === true : false,
      };
    })
    .filter(Boolean);

  const network = buildCoalitionNetwork(state.stakeholders || []);
  const bloc = network.blocs.find((b) => b.id === network.blocOf.get(record.id)) || null;
  const allies = (Array.isArray(record.alliances) ? record.alliances : []).map((edge) => {
    const target = (state.stakeholders || []).find((s) => s.id === edge.targetId);
    return target ? { edge, target } : null;
  }).filter(Boolean);

  const history = (Array.isArray(record.stanceHistory) ? record.stanceHistory : [])
    .slice()
    .sort((a, b) => String(b.on).localeCompare(String(a.on)));
  const latest = history[0] || null;
  const recentShift = latest && classifyStanceShift(record.stance, latest.stance).adverse === false && history.length > 1
    ? (() => {
        const previous = history[1];
        return { from: previous.stance, to: latest.stance, ...classifyStanceShift(previous.stance, latest.stance), on: latest.on };
      })()
    : null;

  const contactOverdue = record.nextContactOn ? isOverdue(record.nextContactOn, now) : false;
  const daysToContact = record.nextContactOn ? daysBetween(todayStr, record.nextContactOn) : null;

  return {
    record,
    salience,
    mendelow,
    isHighSalience: HIGH_SALIENCE_CLASSES.includes(salience.salienceClass),
    isVetoPlayer: record.vetoPlayer === true,
    isAdverse: ADVERSE_STANCES.includes(record.stance),
    involvements,
    bloc,
    allies,
    centrality: network.centrality.get(record.id) || 0,
    outInfluence: network.outInfluence.get(record.id) || 0,
    stanceHistory: history,
    recentShift,
    contactOverdue,
    daysToContact,
  };
}

/* ----------------------------------------------------- portfolio veto view */

function isSourceOpen(sourceType, status) {
  // Mirrors the canonical open lists in cases.js, changes.js and
  // negotiation.js — an anchored change or impasse/agreed negotiation is not
  // an active political gate even if veto players were mapped on it.
  if (sourceType === 'case') return ['open', 'mitigating', 'monitoring'].includes(status);
  if (sourceType === 'change') return ['proposed', 'active', 'stabilising'].includes(status);
  if (sourceType === 'negotiation') return ['preparing', 'scheduled', 'active'].includes(status);
  return true;
}

/**
 * Merge register defaults with initiative-specific embedded stances for one
 * source record, then run the Tsebelis heuristic. Used by automation and
 * insights; never invents a veto flag or stance that was not recorded.
 */
export function initiativeVetoRisk(state = {}, sourceType, sourceId) {
  const edges = (state.links || []).filter(
    (l) => l && l.relation === 'involves' && l.sourceType === sourceType && l.sourceId === sourceId && l.targetType === 'stakeholder',
  );
  const stubs = collectEmbeddedStakeholders(state).filter((s) => s.sourceType === sourceType && s.sourceId === sourceId);
  const items = [];
  const seen = new Set();

  for (const edge of edges) {
    const reg = (state.stakeholders || []).find((s) => s.id === edge.targetId);
    if (!reg || seen.has(reg.id)) continue;
    seen.add(reg.id);
    const stub = stubs.find((s) => normalizeName(s.name) === normalizeName(reg.name));
    items.push({
      id: reg.id,
      name: reg.name,
      power: stub?.power ?? reg.power,
      stance: stub?.stance ?? reg.stance,
      vetoPlayer: stub ? stub.vetoPlayer || reg.vetoPlayer : reg.vetoPlayer,
      estimateConfidence: reg.estimateConfidence,
    });
  }
  // Embedded veto stubs that are not register-mapped still count as gates.
  for (const stub of stubs) {
    if (!stub.vetoPlayer) continue;
    const mapped = (state.stakeholders || []).some((r) => normalizeName(r.name) === normalizeName(stub.name));
    if (mapped) continue;
    items.push({ id: null, name: stub.name, power: stub.power, stance: stub.stance, vetoPlayer: true, estimateConfidence: 'low' });
  }
  return analyzeInitiativeVetoRisk(items);
}

/** Portfolio-wide veto risk across every open initiative. */
export function vetoRiskOverview(state = {}, now = new Date()) {
  const rows = [];
  const sources = [
    ...(state.cases || []).map((c) => ({ sourceType: 'case', sourceId: c.id, title: c.title, status: c.status })),
    ...(state.changes || []).map((c) => ({ sourceType: 'change', sourceId: c.id, title: c.title, status: c.status })),
    ...(state.negotiations || []).map((n) => ({ sourceType: 'negotiation', sourceId: n.id, title: n.title, status: n.status })),
  ];
  for (const src of sources) {
    if (!isSourceOpen(src.sourceType, src.status)) continue;
    const risk = initiativeVetoRisk(state, src.sourceType, src.sourceId);
    if (risk.vetoCount === 0) continue;
    rows.push({ ...src, risk });
  }
  const blocked = rows.filter((r) => r.risk.band.id === 'blocked');
  const contested = rows.filter((r) => r.risk.band.id === 'contested');
  return { rows, blocked, contested, now: dayKey(now) };
}

/* ----------------------------------------------------------------- rollup */

/**
 * Single attention queue for Today, nav badges and the register list.
 * Record-derived findings only; an empty workspace produces an empty queue.
 */
export function stakeholdersRollup(state = {}, now = new Date()) {
  const todayStr = dayKey(now);
  const register = (state.stakeholders || []).filter((s) => s && s.status !== 'archived');
  const attention = [];
  const stats = {
    total: register.length,
    vetoPlayers: 0,
    definitive: 0,
    highSalience: 0,
    adverse: 0,
    overdueContacts: 0,
    blocs: 0,
    hiddenInfluencers: 0,
  };

  const network = buildCoalitionNetwork(register);
  stats.blocs = network.blocs.length;
  stats.hiddenInfluencers = network.hiddenInfluencers.length;

  for (const record of register) {
    const profile = summarizeStakeholder(record, state, now);
    const sal = profile.salience;
    if (record.vetoPlayer === true) stats.vetoPlayers += 1;
    if (sal.salienceClass === 'definitive') stats.definitive += 1;
    if (profile.isHighSalience) stats.highSalience += 1;
    if (profile.isAdverse) stats.adverse += 1;

    if (profile.isVetoPlayer && profile.isAdverse) {
      attention.push({
        code: 'STK-ROLL-VETO',
        severity: 5,
        record,
        title: `Veto player “${record.name}” is ${STAKEHOLDER_STANCE_LABELS[record.stance].toLowerCase()}`,
        detail: 'An adverse veto gate can empty the win-set. Open the alignment decision before the next checkpoint.',
        route: `#/stakeholders/${record.id}`,
      });
    }
    if (profile.contactOverdue && profile.isHighSalience) {
      stats.overdueContacts += 1;
      attention.push({
        code: 'STK-ROLL-CONTACT',
        severity: sal.salienceClass === 'definitive' ? 4 : 3,
        record,
        title: `Contact overdue with ${sal.classLabel.toLowerCase()} stakeholder “${record.name}”`,
        detail: `Next contact was due ${record.nextContactOn}. High-salience stakeholders decay fastest between touchpoints.`,
        route: `#/stakeholders/${record.id}`,
      });
    }
    if (profile.isVetoPlayer && record.estimateConfidence === 'low') {
      attention.push({
        code: 'STK-ROLL-EVIDENCE',
        severity: 2,
        record,
        title: `Veto assessment of “${record.name}” rests on low-confidence evidence`,
        detail: 'A veto gate labelled on assumption can mis-direct the whole campaign. Verify power and stance before relying on it.',
        route: `#/stakeholders/${record.id}`,
      });
    }
    const last = latestStanceEntry(record);
    if (last && profile.isHighSalience) {
      const prev = (record.stanceHistory || []).slice().sort((a, b) => String(b.on).localeCompare(String(a.on)))[1];
      if (prev) {
        const shift = classifyStanceShift(prev.stance, last.stance);
        const ageDays = daysBetween(last.on, todayStr);
        if (shift.adverse && ageDays !== null && ageDays <= 14) {
          attention.push({
            code: 'STK-ROLL-SHIFT',
            severity: 4,
            record,
            title: `${shift.label} recorded for key player “${record.name}”`,
            detail: `Stance moved ${prev.stance} → ${last.stance} on ${last.on}. Coalitions are won and lost in the two weeks after a shift.`,
            route: `#/stakeholders/${record.id}`,
          });
        }
      }
    }
  }

  const vetoOverview = vetoRiskOverview(state, now);
  const reconciliation = reconciliationReport(state);

  attention.sort((a, b) => b.severity - a.severity);
  return {
    attention,
    stats,
    network,
    vetoOverview,
    reconciliation,
    register: register.map((r) => summarizeStakeholder(r, state, now)),
  };
}
