/**
 * app/core/domain/intake.js — Natural-Language Intake Triage Engine.
 *
 * A deterministic, fully on-device text triage layer that turns a free-form
 * situation note (a pasted Slack message, email, meeting line or voice-to-text
 * dump) into a confidence-scored, fully-explained routing plan for the rest of
 * LeadOS. No DOM, no storage, no clock, no network and no npm dependency: the
 * engine is pure so the same analysis is reproducible in tests and in the
 * browser, and confidential employee text never leaves the device.
 *
 * Named techniques implemented explicitly (Section 0.2 of the product doctrine):
 *  - Weighted-evidence intent classification in the spirit of the logistic /
 *    lexicon classifiers that the 2026 ITSM evidence still finds most reliable
 *    for well-defined operational classes (MDPI Systems 14(2):223, 2026), with
 *    multi-label secondary signals instead of a forced single label.
 *  - NegEx-style negation windowing (Chapman et al., 2001): a negation cue
 *    flips evidence in the following token window inside the same sentence, so
 *    "this is not a delay" cannot create a delivery case.
 *  - Softmax temperature scaling with uniform-prior shrinkage (Laplace-style
 *    regularization) to map raw evidence weights onto honest probability-like
 *    scores, plus completeness, ambiguity (top-1/top-2 margin) and stakes
 *    checks — the four uncertainty controls recommended in 2026 human-in-the-
 *    loop triage practice (rule, completeness, agreement, stakes checks).
 *  - Confidence bands are labelled as heuristic until enough confirmed drafts
 *    exist to measure empirical agreement per band (counts only below n=5,
 *    matching every other calibration ledger in this codebase).
 *  - A hard privacy wall: interpersonal-conflict signals are never turned into
 *    records automatically; the leader is routed to the confidential conflict
 *    workspace and must open the record themselves.
 *
 * Every suggestion carries its evidence spans (sentence index, character
 * offsets and the exact matched terms) so the UI can show *why* it was made.
 */

import { addDays, dayKey } from '../time.js';

export const INTAKE_ENGINE_VERSION = 'intake-2026.10-v1';

/** Rule ids surfaced in the UI, the audit trail and the calibration ledger. */
export const INTAKE_RULES = {
  CLASSIFY: 'RULE-INTAKE-01',
  ENTITIES: 'RULE-INTAKE-02',
  ROUTING: 'RULE-INTAKE-03',
  PRIVACY: 'RULE-INTAKE-04',
  STAKES: 'RULE-INTAKE-05',
  STALE: 'RULE-INTAKE-06',
  CALIBRATION: 'RULE-INTAKE-07',
};

/** Minimum evidence before the engine will offer any routing at all. */
export const MIN_EVIDENCE_WEIGHT = 2.5;
export const MIN_MEANINGFUL_TOKENS = 4;
const HIGH_PROBABILITY = 0.55;
const HIGH_MARGIN = 0.12;
const MEDIUM_PROBABILITY = 0.38;
const SECONDARY_PROBABILITY = 0.22;
const AMBIGUITY_MARGIN = 0.08;
const SHRINKAGE = 0.08; // uniform-prior blend; keeps thin evidence honest
const TEMPERATURE = 2.2; // softmax temperature over raw weighted scores
const STALE_DRAFT_DAYS = 3;
export const CALIBRATION_MIN_SAMPLES = 5;

/* ------------------------------------------------------------------ taxonomy */

/**
 * Each category maps to the LeadOS module that owns the follow-up and to
 * Operational Case kind affinities. Only `caseRoute` entities can ever be
 * created automatically, and only after explicit human confirmation.
 */
export const INTAKE_CATEGORIES = [
  {
    id: 'delivery',
    label: 'Delivery & schedule slippage',
    module: 'Operational cases',
    route: '#/cases',
    caseKinds: ['risk', 'incident'],
    terms: {
      delay: 3, delayed: 3, late: 2, deadline: 3, slip: 3, slippage: 3,
      behind: 2, overdue: 3, schedule: 2, bottleneck: 2, backlog: 2,
      missed: 2, overrun: 3, overtime: 1, postpon: 2, reschedul: 2,
      lagging: 2, slowdown: 2, 'fall behind': 3, 'on hold': 2, hold: 1,
      blocker: 2, blocked: 2, wait: 1, waiting: 1, dependency: 2,
      'critical path': 3, milestone: 1, eta: 1,
    },
  },
  {
    id: 'quality',
    label: 'Quality, defects & incidents',
    module: 'Operational cases',
    route: '#/cases',
    caseKinds: ['incident'],
    terms: {
      defect: 3, bug: 3, error: 3, outage: 3, incident: 3, fail: 2,
      failure: 3, rework: 3, quality: 2, regression: 3, rollback: 3,
      downtime: 3, broken: 2, crash: 3, fault: 3, flaw: 2, malfunction: 3,
      'data loss': 3, corruption: 3, leak: 2, 'root cause': 2,
      'customer complaint': 3, ticket: 1, escalation: 1,
    },
  },
  {
    id: 'safety',
    label: 'Safety, legal & compliance',
    module: 'Operational cases',
    route: '#/cases',
    caseKinds: ['incident', 'escalation'],
    stakes: true,
    terms: {
      safety: 3, hazard: 3, hazardous: 3, compliance: 3, regulatory: 3,
      legal: 3, gdpr: 3, breach: 3, injury: 3, accident: 3, dangerous: 3,
      vulnerability: 3, whistleblow: 3, 'data protection': 3, unlawful: 3,
      illegal: 3, lawsuit: 3, litigation: 3, sanction: 3, audit: 2,
      'policy violation': 3, misconduct: 3, harassment: 3, discrimination: 3,
      'health and safety': 3, 'near-miss': 3, safeguarding: 3, fine: 2,
      penalty: 2,
    },
  },
  {
    id: 'finance',
    label: 'Cost, budget & financial exposure',
    module: 'Budget & finance',
    route: '#/finance',
    caseKinds: ['risk'],
    terms: {
      cost: 2, costly: 2, budget: 3, 'over budget': 3, expensive: 2,
      spend: 2, spending: 2, financial: 2, penalty: 2, invoice: 3,
      refund: 2, revenue: 2, profit: 2, cashflow: 2, 'cash flow': 2,
      expense: 2, expenses: 2, price: 1, pricing: 2, charge: 1,
      'cost overrun': 3, overspend: 3, underspend: 2, funding: 2,
      savings: 1, roi: 2, 'write-off': 3,
    },
  },
  {
    id: 'capacity',
    label: 'Capacity, workload & flow',
    module: 'Capacity & flow',
    route: '#/capacity',
    caseKinds: ['risk'],
    terms: {
      overload: 3, overloaded: 3, capacity: 2, burnout: 3, 'burnt out': 3,
      overwork: 3, swamped: 3, stretched: 2, workload: 3, understaffed: 3,
      'under-resourced': 3, underresourced: 3, overtime: 2, 'too much work': 3,
      'work-life balance': 3, wlb: 3, bottleneck: 2, utilisation: 2,
      utilization: 2, 'person-days': 2, resourcing: 2, bandwidth: 2,
      'spread thin': 3, fatigue: 3, tired: 1, exhausted: 2,
    },
  },
  {
    id: 'wellbeing',
    label: 'Wellbeing, morale & engagement',
    module: '1:1 prep & coaching',
    route: '#/oneonones',
    caseKinds: [],
    terms: {
      stress: 3, stressed: 3, burnout: 3, 'burnt out': 3, exhaust: 3,
      exhausted: 3, anxiety: 3, anxious: 3, wellbeing: 2, 'well-being': 2,
      'mental health': 3, demotivat: 3, disengag: 3, morale: 3, overwhelm: 3,
      unhappy: 2, frustrated: 2, frustration: 2, isolation: 2, isolated: 2,
      engagement: 2, disengaged: 3, worry: 1, worried: 2, upset: 2,
    },
  },
  {
    id: 'attrition',
    label: 'Retention & attrition risk',
    module: 'Succession & readiness',
    route: '#/readiness',
    caseKinds: ['risk'],
    terms: {
      resign: 3, quit: 3, leaving: 2, leave: 1, turnover: 3, attrition: 3,
      departure: 3, 'notice period': 3, retention: 2, 'exit interview': 3,
      'handed in': 3, 'hand in': 3, 'job offer': 2, recruiter: 2,
      'lost someone': 3, 'losing someone': 3, 'key person': 3,
      'single point of failure': 3, 'spof': 3, successor: 2, 'skill gap': 2,
    },
  },
  {
    id: 'conflict',
    label: 'Interpersonal conflict (confidential)',
    module: 'Conflict resolution',
    route: '#/conflicts',
    caseKinds: [],
    privacyWall: true,
    terms: {
      conflict: 3, argue: 3, argument: 3, disagreement: 3, tension: 3,
      clash: 3, confront: 3, bullying: 3, harassment: 3, hostile: 3,
      feud: 3, 'personality clash': 3, 'raised voices': 3, shouting: 3,
      accuse: 2, accusation: 2, blame: 2, blaming: 2, grievance: 3,
      'falling out': 3, friction: 2, disrespect: 3, rude: 2,
    },
  },
  {
    id: 'vendor',
    label: 'Vendor, supplier & procurement',
    module: 'Operational cases',
    route: '#/cases',
    caseKinds: ['risk'],
    terms: {
      vendor: 3, supplier: 3, contractor: 3, sla: 3, 'third-party': 3,
      'third party': 3, outsourcing: 3, outsourced: 3, procurement: 2,
      subcontractor: 3, consultancy: 2, consultant: 2, 'service provider': 3,
      'delivery partner': 3, licence: 2, license: 2, 'purchase order': 2,
    },
  },
  {
    id: 'stakeholder',
    label: 'Stakeholders & political escalation',
    module: 'Stakeholder register',
    route: '#/stakeholders',
    caseKinds: ['escalation'],
    terms: {
      stakeholder: 3, sponsor: 3, escalat: 3, escalation: 3, executive: 2,
      'steering group': 3, 'steering committee': 3, board: 2, 'buy-in': 3,
      buyin: 3, alignment: 2, 'sign-off': 2, signoff: 2, coalition: 2,
      veto: 3, influence: 1, 'senior leadership': 2, 'senior leader': 2,
      vp: 2, director: 1, 'head of': 2, opposition: 2, resistant: 2,
    },
  },
  {
    id: 'hiring',
    label: 'Hiring & backfill',
    module: 'Hiring',
    route: '#/hiring',
    caseKinds: [],
    terms: {
      hire: 3, hiring: 3, recruit: 3, recruitment: 3, vacancy: 3,
      requisition: 3, backfill: 3, headcount: 3, 'job opening': 3,
      'job description': 2, interview: 2, staffing: 2, onboard: 1,
      candidate: 2, offer: 1, 'new role': 2, 'open role': 3,
    },
  },
  {
    id: 'onboarding',
    label: 'Onboarding & ramp-up',
    module: 'Onboarding & transitions',
    route: '#/onboarding',
    caseKinds: [],
    terms: {
      onboarding: 3, 'new joiner': 3, 'new hire': 3, probation: 3,
      ramp: 2, 'ramp-up': 2, induction: 3, onboarding: 3, mentee: 2,
      'first week': 2, 'first month': 2, '30-60-90': 3, 'new starter': 3,
      starter: 2, joining: 1, 'started this week': 3, buddy: 2,
    },
  },
  {
    id: 'negotiation',
    label: 'Negotiation & contracts',
    module: 'Negotiation workbench',
    route: '#/negotiations',
    caseKinds: [],
    terms: {
      negotiat: 3, negotiation: 3, terms: 2, renewal: 2, batna: 3,
      zopa: 3, 'price increase': 3, renegotiat: 3, settlement: 2,
      counteroffer: 3, 'counter-offer': 3, bargaining: 3, concession: 3,
      'contract renewal': 3, 'terms and conditions': 2, proposal: 1,
      'walk away': 3, compromise: 2, leverage: 2,
    },
  },
  {
    id: 'change',
    label: 'Reorg, restructuring & change',
    module: 'Org design & change',
    route: '#/changes',
    caseKinds: ['initiative', 'escalation'],
    terms: {
      reorg: 3, restructuring: 3, reorganis: 3, reorganiza: 3,
      transformation: 3, rollout: 3, 'roll out': 2, 'change management': 3,
      merger: 3, acquisition: 3, relocation: 3, layoff: 3, redundancy: 3,
      downsizing: 3, 'new process': 2, migration: 2, restructure: 3,
      'team topology': 3, redesign: 2, 'operating model': 3, 'org change': 3,
    },
  },
];

const CATEGORY_BY_ID = new Map(INTAKE_CATEGORIES.map((c) => [c.id, c]));

/** NegEx-style cue words; a cue negates evidence inside its token window. */
const NEGATION_CUES = new Set([
  'not', 'no', 'never', 'without', 'isn\'t', 'aren\'t', 'wasn\'t',
  'weren\'t', 'don\'t', 'doesn\'t', 'didn\'t', 'won\'t', 'wouldn\'t',
  'can\'t', 'cannot', 'shouldn\'t', 'haven\'t', 'hasn\'t', 'hadn\'t',
  'couldn\'t', 'neither', 'nobody', 'nothing',
]);
const NEGATION_WINDOW = 3;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that',
  'this', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about',
  'against', 'between', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'from', 'up', 'down', 'out', 'off', 'over', 'under',
  'again', 'further', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'should', 'now', 'it', 'its', 'as', 'we', 'they', 'he', 'she',
  'i', 'you', 'our', 'their', 'his', 'her', 'them', 'us', 'me', 'my',
  'your', 'will', 'would', 'could', 'have', 'has', 'had', 'do', 'does',
  'did', 'am', 'im', 'ive', 'id', 'ill',
]);

const ORDINALS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10,
};

/* ------------------------------------------------------------- text parsing */

/** Conservative suffix stemmer; keeps short words untouched. */
export function stem(word) {
  let w = String(word || '').toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('sses') || w.endsWith('shes') || w.endsWith('ches')) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith('ly') && w.length > 4) w = w.slice(0, -2);
  return w;
}

const DOT_PROTECT = '\uE000';
const ABBREVIATION_DOTS = /\b(e\.g|i\.e|etc|vs|approx|kr|no|inc|ltd|co|mr|mrs|dr|jr|sr|st)\.(?=\s)/gi;
const DECIMAL_DOT = /(\d)\.(?=\d)/g;

/**
 * Split into sentences while retaining character offsets against the source.
 * Deliberately conservative: only sentence punctuation followed by
 * whitespace or end-of-input breaks a sentence. Dots inside numbers
 * ("250.000,50", "1.2m") and common abbreviation dots ("kr.", "e.g.") are
 * protected with equal-length placeholders so offsets stay byte-accurate.
 */
export function splitSentences(text) {
  const source = String(text || '');
  const protectedText = source
    .replace(ABBREVIATION_DOTS, (m) => m.replace(/\.$/, DOT_PROTECT))
    .replace(DECIMAL_DOT, `$1${DOT_PROTECT}`)
  const sentences = [];
  const re = /[^.!?\n]+[.!?]?|[.!?]+/g;
  let match;
  while ((match = re.exec(protectedText)) !== null) {
    const raw = match[0];
    if (!raw.trim()) continue;
    sentences.push({
      index: sentences.length,
      text: raw.trim().replaceAll(DOT_PROTECT, '.'),
      start: match.index + (raw.length - raw.trimStart().length),
      end: match.index + raw.length,
    });
  }
  return sentences;
}

const TOKEN_RE = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)?|[0-9][0-9.,]*[0-9]|[€£$]|%/g;

/** Tokenize one sentence with offsets, stems and negation flags. */
function tokenizeSentence(sentence) {
  const tokens = [];
  const text = sentence.text;
  let match;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    const literal = match[0];
    const lower = literal.toLowerCase().replace(/[’]/g, "'");
    const negCue = NEGATION_CUES.has(lower) || NEGATION_CUES.has(stem(lower));
    tokens.push({
      literal,
      lower,
      stem: stem(lower),
      start: sentence.start + match.index,
      end: sentence.start + match.index + literal.length,
      sentenceIndex: sentence.index,
      negated: false,
      negCue,
      stopword: STOPWORDS.has(lower),
    });
  }
  let cueAt = -99;
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].negCue) cueAt = i;
    tokens[i].negated = i - cueAt <= NEGATION_WINDOW && i !== cueAt;
  }
  return tokens;
}

/* --------------------------------------------------------- entity extraction */

const CURRENCY_BY_SYMBOL = {
  '$': { code: 'USD', label: 'US dollar', assumed: true },
  '€': { code: 'EUR', label: 'euro', assumed: false },
  '£': { code: 'GBP', label: 'pound sterling', assumed: false },
};
const CURRENCY_BY_CODE = {
  usd: { code: 'USD', label: 'US dollar', assumed: false },
  'us$': { code: 'USD', label: 'US dollar', assumed: false },
  eur: { code: 'EUR', label: 'euro', assumed: false },
  gbp: { code: 'GBP', label: 'pound sterling', assumed: false },
  dkk: { code: 'DKK', label: 'Danish krone', assumed: false },
  nok: { code: 'NOK', label: 'Norwegian krone', assumed: false },
  sek: { code: 'SEK', label: 'Swedish krone', assumed: false },
};
const MULTIPLIERS = { k: 1e3, m: 1e6, bn: 1e9, thousand: 1e3, million: 1e6, billion: 1e9 };

/** Parse "1,234.50" (US) vs "1.234,50" (DK/EU) vs "250,50" unambiguously. */
export function parseNumericAmount(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  const multiplierMatch = s.match(/(k|m|bn|thousand|million|billion)\.?$/i);
  let multiplier = 1;
  if (multiplierMatch) {
    multiplier = MULTIPLIERS[multiplierMatch[1].toLowerCase()] || 1;
    s = s.slice(0, multiplierMatch.index).trim();
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // European: dots are thousands, comma is decimal.
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    const tail = s.length - 1 - lastComma;
    if (tail === 3 && /^[0-9,]+$/.test(s) && (s.match(/,/g) || []).length === 1) {
      s = s.replace(/,/g, ''); // "1,234" thousands
    } else if (tail === 1 || tail === 2) {
      s = s.replace(',', '.'); // "250,50" decimal comma
    } else {
      s = s.replace(/,/g, '');
    }
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * multiplier * 100) / 100;
}

const MONEY_PREFIX_RE = /(US\$|USD|EUR|GBP|DKK|NOK|SEK|€|£|\$|kr\.)\s?([0-9][0-9.,]*(?:k|m|bn|thousand|million|billion)?)\b/gi;
const MONEY_SUFFIX_RE = /([0-9][0-9.,]*(?:k|m|bn|thousand|million|billion)?)\s?(kroner|kr\.?|dollars?|USD|EUR|GBP|DKK|euros?|pounds?)\b/gi;

function extractMoney(sentences) {
  const found = [];
  const seen = new Set();
  const push = (raw, amount, currency, assumed, sentenceIndex, start, end) => {
    const key = `${start}-${end}`;
    if (seen.has(key) || amount === null || amount <= 0) return;
    seen.add(key);
    found.push({
      type: 'money',
      raw: raw.trim(),
      amount,
      currency,
      currencyAssumed: assumed,
      sentenceIndex,
      start,
      end,
    });
  };
  for (const sentence of sentences) {
    let m;
    MONEY_PREFIX_RE.lastIndex = 0;
    while ((m = MONEY_PREFIX_RE.exec(sentence.text)) !== null) {
      const cue = m[1].toLowerCase();
      const meta = CURRENCY_BY_SYMBOL[cue] || CURRENCY_BY_CODE[cue]
        || (cue.startsWith('kr') ? { code: 'DKK', label: 'krone', assumed: true } : null);
      if (!meta) continue;
      push(m[0], parseNumericAmount(m[2]), meta.code, meta.assumed, sentence.index,
        sentence.start + m.index, sentence.start + m.index + m[0].length);
    }
    MONEY_SUFFIX_RE.lastIndex = 0;
    while ((m = MONEY_SUFFIX_RE.exec(sentence.text)) !== null) {
      const cue = m[2].toLowerCase();
      let meta;
      if (cue.startsWith('kr') || cue === 'kroner') meta = { code: 'DKK', label: 'krone', assumed: true };
      else if (cue.startsWith('dollar') || cue === 'usd') meta = CURRENCY_BY_CODE.usd;
      else if (cue.startsWith('euro') || cue === 'eur') meta = CURRENCY_BY_CODE.eur;
      else if (cue.startsWith('pound') || cue === 'gbp') meta = CURRENCY_BY_CODE.gbp;
      else if (CURRENCY_BY_CODE[cue]) meta = CURRENCY_BY_CODE[cue];
      if (!meta) continue;
      push(m[0], parseNumericAmount(m[1]), meta.code, meta.assumed, sentence.index,
        sentence.start + m.index, sentence.start + m.index + m[0].length);
    }
  }
  return found;
}

const DURATION_RE = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(business[ -])?(day|days|week|weeks|month|months)\b/gi;
const PERSON_DAY_RE = /(\d+)\s*person[ -]?days?\b/gi;
const PERCENT_RE = /(\d{1,3}(?:\.\d+)?)\s?%/g;
const RECURRENCE_RE = /\b(again|recurring|recurrent|once more|yet another|in a row|for the (first|second|third|fourth|fifth|sixth) time|another)\b|(\b(first|second|third|fourth|fifth|sixth)\b)/gi;

function wordNumber(token) {
  const n = NUMBER_WORDS[String(token || '').toLowerCase()];
  return n === undefined ? Number(token) : n;
}

function extractDurations(sentences) {
  const out = [];
  for (const sentence of sentences) {
    let m;
    PERSON_DAY_RE.lastIndex = 0;
    while ((m = PERSON_DAY_RE.exec(sentence.text)) !== null) {
      const days = Number(m[1]);
      if (Number.isFinite(days)) {
        out.push({
          type: 'person-days', raw: m[0], days, sentenceIndex: sentence.index,
          start: sentence.start + m.index, end: sentence.start + m.index + m[0].length,
        });
      }
    }
    DURATION_RE.lastIndex = 0;
    while ((m = DURATION_RE.exec(sentence.text)) !== null) {
      const n = wordNumber(m[1]);
      if (!Number.isFinite(n)) continue;
      const unit = m[3].toLowerCase();
      const business = /business/.test(m[2] || '');
      const days = unit.startsWith('day') ? n : unit.startsWith('week') ? n * (business ? 5 : 7) : n * 22;
      out.push({
        type: 'duration', raw: m[0], amount: n, unit: unit.replace(/s$/, ''),
        business, approxDays: days, sentenceIndex: sentence.index,
        start: sentence.start + m.index, end: sentence.start + m.index + m[0].length,
      });
    }
  }
  return out;
}

function extractPercents(sentences) {
  const out = [];
  for (const sentence of sentences) {
    let m;
    PERCENT_RE.lastIndex = 0;
    while ((m = PERCENT_RE.exec(sentence.text)) !== null) {
      const value = Number(m[1]);
      if (!Number.isFinite(value)) continue;
      out.push({
        type: 'percent', raw: m[0], value, sentenceIndex: sentence.index,
        start: sentence.start + m.index, end: sentence.start + m.index + m[0].length,
      });
    }
  }
  return out;
}

function extractRecurrence(sentences) {
  const out = [];
  for (const sentence of sentences) {
    let m;
    RECURRENCE_RE.lastIndex = 0;
    while ((m = RECURRENCE_RE.exec(sentence.text)) !== null) {
      const explicitOrdinal = m[2] ? ORDINALS[m[2].toLowerCase()] || null : null;
      const bareOrdinal = m[4] ? ORDINALS[m[4].toLowerCase()] || null : null;
      const cue = (m[1] || '').toLowerCase();
      out.push({
        type: 'recurrence',
        raw: m[0],
        count: explicitOrdinal || bareOrdinal || (cue === 'another' ? 2 : 2),
        ordinal: Boolean(explicitOrdinal || bareOrdinal),
        weak: Boolean(bareOrdinal && !explicitOrdinal),
        sentenceIndex: sentence.index,
        start: sentence.start + m.index,
        end: sentence.start + m.index + m[0].length,
      });
    }
  }
  return out;
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAY_RE = /\b(next |this )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi;

function extractWeekdayHints(sentences) {
  const out = [];
  for (const sentence of sentences) {
    let m;
    WEEKDAY_RE.lastIndex = 0;
    while ((m = WEEKDAY_RE.exec(sentence.text)) !== null) {
      out.push({
        type: 'weekday',
        raw: m[0],
        weekday: m[2].toLowerCase(),
        qualifier: (m[1] || '').trim() || null,
        sentenceIndex: sentence.index,
        start: sentence.start + m.index,
        end: sentence.start + m.index + m[0].length,
      });
    }
  }
  return out;
}

/**
 * Match roster people by full name or unique first name. A first name shared by
 * two active people is returned as an *ambiguity*, never auto-selected.
 */
export function matchPeople(tokens, state = {}) {
  const people = (state.people || []).filter((p) => p && p.name && p.status !== 'archived');
  if (!people.length || !tokens.length) return { matches: [], ambiguities: [] };

  const normalized = (name) => String(name).toLowerCase().replace(/\s+/g, ' ').trim();
  const fullNames = people.map((p) => ({ person: p, parts: normalized(p.name).split(' '), full: normalized(p.name) }));
  const firstNames = new Map();
  for (const entry of fullNames) {
    const first = entry.parts[0];
    if (!first || first.length <= 1) continue;
    if (!firstNames.has(first)) firstNames.set(first, []);
    firstNames.get(first).push(entry);
  }

  const matches = [];
  const ambiguities = [];
  const claimedRanges = new Set();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.stopword) continue;
    // Full-name scan (up to 4 tokens) wins over first-name matches.
    let matchedHere = false;
    for (const entry of fullNames) {
      const n = entry.parts.length;
      const window = tokens.slice(i, i + n).map((t) => t.lower).join(' ');
      if (window === entry.full) {
        const rangeKey = `${token.start}-${tokens[i + n - 1].end}`;
        if (!claimedRanges.has(rangeKey)) {
          claimedRanges.add(rangeKey);
          matches.push({
            type: 'person', personId: entry.person.id, name: entry.person.name,
            matchKind: 'full-name', sentenceIndex: token.sentenceIndex,
            start: token.start, end: tokens[i + n - 1].end, raw: window,
          });
        }
        i += n - 1;
        matchedHere = true;
        break;
      }
    }
    if (matchedHere) continue;

    const candidates = firstNames.get(token.lower);
    if (!candidates) continue;
    if (candidates.length === 1) {
      const rangeKey = `${token.start}-${token.end}`;
      if (!claimedRanges.has(rangeKey)) {
        claimedRanges.add(rangeKey);
        matches.push({
          type: 'person', personId: candidates[0].person.id, name: candidates[0].person.name,
          matchKind: 'first-name', sentenceIndex: token.sentenceIndex,
          start: token.start, end: token.end, raw: token.literal,
        });
      }
    } else {
      ambiguities.push({
        type: 'person-ambiguity', raw: token.literal,
        candidates: candidates.map((c) => ({ personId: c.person.id, name: c.person.name })),
        sentenceIndex: token.sentenceIndex, start: token.start, end: token.end,
      });
    }
  }
  return { matches, ambiguities };
}

/* ------------------------------------------------------------- classification */

function buildLexiconIndex() {
  const index = new Map(); // stem-or-phrase -> [{category, weight}]
  for (const category of INTAKE_CATEGORIES) {
    for (const [term, weight] of Object.entries(category.terms)) {
      const key = term.includes(' ')
        ? term.split(' ').map((t) => stem(t)).join(' ')
        : stem(term);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ category: category.id, weight });
    }
  }
  return index;
}

const LEXICON_INDEX = buildLexiconIndex();

/** Evidence for one category, collected with full provenance. */
function scoreCategories(sentences, tokenized) {
  const scores = new Map();
  for (const category of INTAKE_CATEGORIES) {
    scores.set(category.id, { categoryId: category.id, rawScore: 0, hits: 0, negatedHits: 0, evidence: [] });
  }

  const recordHit = (categoryId, weight, tokensHit, phrase, negated, sentenceIndex) => {
    const bucket = scores.get(categoryId);
    const first = tokensHit[0];
    const last = tokensHit[tokensHit.length - 1];
    // Discourse-position factor: situation notes front-load the primary topic.
    // A gentle 1.25× → 1.0× decay across sentences never overrides term weights.
    const positionFactor = 1 + 0.25 / (sentenceIndex + 1);
    const weighted = Math.round(weight * positionFactor * 100) / 100;
    const evidence = {
      term: phrase,
      weight,
      weighted,
      negated,
      sentenceIndex,
      start: first.start,
      end: last.end,
      sentence: sentences[sentenceIndex]?.text || '',
    };
    bucket.evidence.push(evidence);
    if (negated) {
      bucket.negatedHits += 1;
      return;
    }
    bucket.rawScore += weighted;
    bucket.hits += 1;
  };

  for (let s = 0; s < tokenized.length; s += 1) {
    const tokens = tokenized[s];
    for (let i = 0; i < tokens.length; i += 1) {
      let matchedPhrase = false;
      // Multi-word phrases first (longest match wins).
      for (let span = 4; span >= 2; span -= 1) {
        const phraseKey = tokens.slice(i, i + span).map((t) => t.stem).join(' ');
        const entries = LEXICON_INDEX.get(phraseKey);
        if (entries) {
          const windowTokens = tokens.slice(i, i + span);
          const negated = windowTokens.some((t) => t.negated);
          for (const entry of entries) {
            recordHit(entry.category, entry.weight, windowTokens, phraseKey, negated, s);
          }
          i += span - 1;
          matchedPhrase = true;
          break;
        }
      }
      if (matchedPhrase) continue;
      const entries = LEXICON_INDEX.get(tokens[i].stem);
      if (entries) {
        for (const entry of entries) {
          recordHit(entry.category, entry.weight, [tokens[i]], tokens[i].stem, tokens[i].negated, s);
        }
      }
    }
  }
  return [...scores.values()];
}

function softmaxWithShrinkage(rawScores) {
  const max = Math.max(...rawScores);
  const exps = rawScores.map((s) => Math.exp((s - max) / TEMPERATURE));
  const total = exps.reduce((a, b) => a + b, 0);
  const k = rawScores.length;
  return exps.map((e) => (1 - SHRINKAGE) * (e / total) + SHRINKAGE / k);
}

const CRITICAL_MARKERS = [
  'safety', 'injury', 'accident', 'legal', 'regulatory', 'compliance', 'gdpr',
  'breach', 'harassment', 'discrimination', 'lawsuit', 'litigation', 'whistleblow',
  'misconduct', 'safeguarding', 'hazard', 'dangerous', 'unlawful', 'illegal',
  'data protection', 'near-miss', 'health and safety',
];
const HIGH_MARKERS = [
  'customer', 'customer-facing', 'outage', 'downtime', 'escalated', 'escalation',
  'critical', 'severe', 'blocker', 'blocked', 'executive', 'vp', 'board',
  'data loss', 'rollback',
];

function detectSeveritySignals(sentences, tokenized) {
  const signals = [];
  const flat = tokenized.flat();
  const hasStem = (word) => flat.some((t) => !t.negated && t.stem === stem(word));
  for (const marker of CRITICAL_MARKERS) {
    const key = marker.includes(' ') ? marker.split(' ').map((w) => stem(w)).join(' ') : stem(marker);
    const hit = marker.includes(' ')
      ? tokenized.some((tokens) => tokens.some((_, i) => tokens.slice(i, i + key.split(' ').length).map((t) => t.stem).join(' ') === key
        && !tokens.slice(i, i + key.split(' ').length).some((t) => t.negated)))
      : hasStem(marker);
    if (hit) {
      signals.push({ marker, level: 'critical', source: marker });
    }
  }
  for (const marker of HIGH_MARKERS) {
    if (hasStem(marker)) signals.push({ marker, level: 'high', source: marker });
  }
  return signals;
}

/** FMEA priors are *suggestions shown in the UI*, never silent data writes. */
function suggestFmeaPriors(primary, severitySignals, recurrence) {
  const repeat = recurrence.some((r) => r.count >= 2);
  let severity = 5;
  if (severitySignals.some((s) => s.level === 'critical')) severity = 9;
  else if (severitySignals.some((s) => s.level === 'high')) severity = 7;
  else if (primary === 'delivery' || primary === 'vendor' || primary === 'finance') severity = 6;
  else if (primary === 'wellbeing' || primary === 'attrition') severity = 5;
  const probability = repeat ? 8 : severitySignals.some((s) => s.level === 'critical') ? 6 : 4;
  return {
    severity,
    probability,
    detectability: 5,
    basis: [
      severitySignals.some((s) => s.level === 'critical')
        ? `Critical-stakes marker(s): ${[...new Set(severitySignals.filter((s) => s.level === 'critical').map((s) => s.marker))].join(', ')}`
        : null,
      severitySignals.some((s) => s.level === 'high')
        ? `High-impact marker(s): ${[...new Set(severitySignals.filter((s) => s.level === 'high').map((s) => s.marker))].join(', ')}`
        : null,
      repeat ? 'Recurrence language suggests repeated occurrence' : null,
      'Detectability left at neutral 5 — the text gives no evidence about existing controls',
    ].filter(Boolean),
  };
}

function suggestTitle(sentences, scored) {
  if (!sentences.length) return '';
  const weightBySentence = new Map();
  for (const bucket of scored) {
    for (const ev of bucket.evidence) {
      if (ev.negated) continue;
      weightBySentence.set(ev.sentenceIndex, (weightBySentence.get(ev.sentenceIndex) || 0) + ev.weight);
    }
  }
  let bestIndex = 0;
  let bestWeight = -1;
  for (const [idx, w] of weightBySentence) {
    if (w > bestWeight) { bestWeight = w; bestIndex = idx; }
  }
  const raw = sentences[bestIndex].text.replace(/\s+/g, ' ').trim();
  if (raw.length <= 90) return raw;
  const cut = raw.slice(0, 90);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : 90).trim()}…`;
}

/* ------------------------------------------------------------------- analysis */

/**
 * Full triage analysis. Always returns a structured object; never throws on
 * empty, garbage or partial input (the storage/UI layer relies on this).
 *
 * @returns {object} analysis with verdict, categories, entities, routingPlan,
 *   caseSuggestion, confidenceBand, evidence and provenance metadata.
 */
export function analyzeIntakeText(text, state = {}, { now = new Date() } = {}) {
  const sourceText = String(text ?? '').slice(0, 8000);
  const sentences = splitSentences(sourceText);
  const tokenized = sentences.map(tokenizeSentence);
  const flatTokens = tokenized.flat();
  const meaningfulTokens = flatTokens.filter((t) => !t.stopword && /[a-z0-9]/i.test(t.literal));

  const scored = scoreCategories(sentences, tokenized);
  const probabilities = softmaxWithShrinkage(scored.map((b) => b.rawScore));
  const categories = scored
    .map((bucket, i) => ({
      id: bucket.categoryId,
      label: CATEGORY_BY_ID.get(bucket.categoryId).label,
      module: CATEGORY_BY_ID.get(bucket.categoryId).module,
      route: CATEGORY_BY_ID.get(bucket.categoryId).route,
      probability: Math.round(probabilities[i] * 1000) / 1000,
      rawScore: bucket.rawScore,
      hits: bucket.hits,
      negatedHits: bucket.negatedHits,
      evidence: bucket.evidence,
      privacyWall: Boolean(CATEGORY_BY_ID.get(bucket.categoryId).privacyWall),
      stakes: Boolean(CATEGORY_BY_ID.get(bucket.categoryId).stakes),
    }))
    .sort((a, b) => b.probability - a.probability);

  const totalEvidence = categories.reduce((sum, c) => sum + c.rawScore, 0);
  const primary = categories[0] || null;
  const runnerUp = categories[1] || null;
  const margin = primary && runnerUp ? Math.round((primary.probability - runnerUp.probability) * 1000) / 1000 : 1;
  const secondaries = categories.filter((c) => c.probability >= SECONDARY_PROBABILITY && c.id !== primary?.id);

  const money = extractMoney(sentences);
  const durations = extractDurations(sentences);
  const percents = extractPercents(sentences);
  const recurrence = extractRecurrence(sentences);
  const weekdays = extractWeekdayHints(sentences);
  const { matches: people, ambiguities: peopleAmbiguities } = matchPeople(flatTokens, state);
  const severitySignals = detectSeveritySignals(sentences, tokenized);
  const stakesReviewRequired = severitySignals.some((s) => s.level === 'critical')
    || categories.some((c) => c.stakes && c.hits > 0 && c.probability >= SECONDARY_PROBABILITY);
  const conflictWall = categories.some((c) => c.privacyWall && c.hits > 0 && c.probability >= SECONDARY_PROBABILITY);

  const insufficient = totalEvidence < MIN_EVIDENCE_WEIGHT
    || meaningfulTokens.length < MIN_MEANINGFUL_TOKENS
    || (primary && primary.hits === 0)
    || (primary && primary.hits === 1 && primary.rawScore < 3);

  let confidenceBand = 'low';
  if (!insufficient) {
    if (primary.probability >= HIGH_PROBABILITY && margin >= HIGH_MARGIN) confidenceBand = 'high';
    else if (primary.probability >= MEDIUM_PROBABILITY) confidenceBand = 'medium';
  }
  const ambiguous = !insufficient && margin < AMBIGUITY_MARGIN;
  const verdict = insufficient ? 'insufficient' : confidenceBand;

  const fmeaPrior = insufficient ? null
    : suggestFmeaPriors(primary.id, severitySignals, recurrence);

  const suggestedTitle = insufficient ? '' : suggestTitle(sentences, scored);
  const primaryMeta = primary ? CATEGORY_BY_ID.get(primary.id) : null;
  // RULE-INTAKE-04: a confidential-conflict primary reading never produces an
  // operational case suggestion. The leader must open that record themselves.
  const privacyBlocked = Boolean(primaryMeta?.privacyWall);
  const caseSuggestion = insufficient || privacyBlocked ? null
    : buildCaseSuggestion({
      sourceText, primary, secondaries, money, durations, people, fmeaPrior, now, state,
    });
  if (caseSuggestion) caseSuggestion.title = suggestedTitle;

  const routingPlan = insufficient ? []
    : buildRoutingPlan({ categories: [primary, ...secondaries], conflictWall, people, caseSuggestion, state });

  return {
    engineVersion: INTAKE_ENGINE_VERSION,
    analyzedAt: now.toISOString(),
    charCount: sourceText.length,
    sentenceCount: sentences.length,
    tokenCount: flatTokens.length,
    meaningfulTokenCount: meaningfulTokens.length,
    verdict,
    confidenceBand: insufficient ? 'none' : confidenceBand,
    insufficient,
    insufficientReasons: [
      totalEvidence < MIN_EVIDENCE_WEIGHT ? `Total evidence weight ${Math.round(totalEvidence * 10) / 10} below the ${MIN_EVIDENCE_WEIGHT} floor` : null,
      meaningfulTokens.length < MIN_MEANINGFUL_TOKENS ? `Only ${meaningfulTokens.length} meaningful tokens (floor ${MIN_MEANINGFUL_TOKENS})` : null,
      primary && primary.hits === 0 ? 'No lexicon term matched; the engine will not invent a category' : null,
      primary && primary.hits === 1 && primary.rawScore < 3 ? 'Only one weak generic term matched; a single low-weight word is not enough to route on' : null,
    ].filter(Boolean),
    ambiguous,
    margin,
    totalEvidenceWeight: Math.round(totalEvidence * 10) / 10,
    categories,
    primaryCategoryId: primary?.id || null,
    secondaryCategoryIds: secondaries.map((c) => c.id),
    entities: {
      money,
      durations,
      percents,
      recurrence,
      weekdays,
      people,
      peopleAmbiguities,
      severitySignals,
    },
    stakesReviewRequired,
    conflictPrivacyWall: conflictWall,
    privacyBlocked,
    fmeaPrior,
    suggestedTitle,
    caseSuggestion,
    routingPlan,
  };
}

/* -------------------------------------------------------- case input mapping */

function pertFromMoney(money) {
  if (!money.length) return null;
  // Largest exposure anchors the most-likely leg; currencies are never mixed.
  const byCurrency = new Map();
  for (const m of money) {
    if (!byCurrency.has(m.currency)) byCurrency.set(m.currency, []);
    byCurrency.get(m.currency).push(m);
  }
  const [currency, entries] = [...byCurrency.entries()]
    .sort((a, b) => Math.max(...b[1].map((m) => m.amount)) - Math.max(...a[1].map((m) => m.amount)))[0];
  const anchor = Math.max(...entries.map((m) => m.amount));
  return {
    currency,
    currencyAssumed: entries.some((m) => m.currencyAssumed),
    optimistic: Math.round(anchor * 0.7 * 100) / 100,
    mostLikely: Math.round(anchor * 100) / 100,
    pessimistic: Math.round(anchor * 1.4 * 100) / 100,
    basis: `PERT legs derived from the largest mentioned exposure (${currency} ${anchor.toLocaleString('en-US')}); 0.7×/1.4× spread is a documented heuristic — edit before saving`,
    evidence: entries.map((m) => ({ raw: m.raw, amount: m.amount, sentenceIndex: m.sentenceIndex, start: m.start, end: m.end })),
  };
}

function capacityFromDurations(durations) {
  const personDays = durations.filter((d) => d.type === 'person-days');
  const source = personDays.length ? personDays : durations.filter((d) => d.type === 'duration');
  if (!source.length) return null;
  const anchor = Math.max(...source.map((d) => d.days || d.approxDays));
  if (!Number.isFinite(anchor) || anchor <= 0) return null;
  return {
    optimistic: Math.round(anchor * 0.6 * 10) / 10,
    mostLikely: Math.round(anchor * 10) / 10,
    pessimistic: Math.round(anchor * 1.5 * 10) / 10,
    basis: personDays.length
      ? 'Person-day mention mapped to a PERT capacity triple'
      : 'Calendar duration mapped to person-days as a starting estimate — verify the real diverted effort',
    evidence: source.map((d) => ({ raw: d.raw, sentenceIndex: d.sentenceIndex, start: d.start, end: d.end })),
  };
}

function suggestGoalLink(primary, state) {
  const goals = (state.goals || []).filter((g) => g.status === 'active' && g.title);
  if (!goals.length || !primary) return null;
  const categoryTerms = new Set();
  for (const ev of primary.evidence) categoryTerms.add(ev.term);
  let best = null;
  for (const goal of goals) {
    const goalTokens = new Set(String(goal.title).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem));
    if (!goalTokens.size) continue;
    let overlap = 0;
    for (const term of categoryTerms) {
      for (const part of term.split(' ')) {
        if (goalTokens.has(part)) overlap += 1;
      }
    }
    const jaccard = overlap / new Set([...categoryTerms, ...goalTokens]).size;
    if (jaccard >= 0.18 && (!best || jaccard > best.jaccard)) {
      best = { goalId: goal.id, title: goal.title, jaccard: Math.round(jaccard * 100) / 100 };
    }
  }
  return best;
}

function buildCaseSuggestion({ sourceText, primary, secondaries, money, durations, people, fmeaPrior, now, state }) {
  const category = CATEGORY_BY_ID.get(primary.id);
  const kind = category.caseKinds[0]
    || (secondaries.some((c) => c.id === 'quality' || c.id === 'safety') ? 'incident' : 'risk');
  const financial = pertFromMoney(money);
  const capacity = capacityFromDurations(durations);
  const goalLink = suggestGoalLink(primary, state);
  const involvedPersonIds = [...new Set(people.map((p) => p.personId))];
  const reviewOn = addDays(dayKey(now), 14);

  return {
    kind,
    kindBasis: `Mapped from primary category “${category.label}” (case kinds: ${category.caseKinds.join(', ') || 'none — defaulted to risk'})`,
    title: '', // filled by caller via suggestTitle
    summary: sourceText.slice(0, 4000),
    ownerId: null,
    involvedPersonIds,
    linkedGoalId: goalLink?.goalId || null,
    goalLinkBasis: goalLink ? `Fuzzy token overlap ${goalLink.jaccard} with active goal “${goalLink.title}”` : '',
    reviewOn,
    fmea: fmeaPrior ? {
      severity: fmeaPrior.severity,
      probability: fmeaPrior.probability,
      detectability: fmeaPrior.detectability,
      failureMode: '',
      effect: '',
      controls: '',
    } : null,
    financial: financial
      ? {
          currency: financial.currency,
          optimistic: financial.optimistic,
          mostLikely: financial.mostLikely,
          pessimistic: financial.pessimistic,
          mitigationCost: 0,
          capacityDaysOptimistic: capacity?.optimistic || 0,
          capacityDaysMostLikely: capacity?.mostLikely || 0,
          capacityDaysPessimistic: capacity?.pessimistic || 0,
          opportunityCost: '',
        }
      : null,
    financialBasis: financial?.basis || '',
    capacityBasis: capacity?.basis || '',
    peopleEvidence: people.map((p) => ({ personId: p.personId, name: p.name, matchKind: p.matchKind, raw: p.raw })),
  };
}

function buildRoutingPlan({ categories, conflictWall, people, caseSuggestion, state }) {
  const plan = [];
  for (const category of categories) {
    const meta = CATEGORY_BY_ID.get(category.id);
    const isCaseModule = meta.route === '#/cases';
    plan.push({
      ruleId: INTAKE_RULES.ROUTING,
      categoryId: category.id,
      label: meta.label,
      module: meta.module,
      route: meta.route,
      autoCreatable: isCaseModule && Boolean(caseSuggestion),
      probability: category.probability,
      confidence: category.probability >= HIGH_PROBABILITY ? 'high' : category.probability >= MEDIUM_PROBABILITY ? 'medium' : 'low',
      evidence: category.evidence.filter((e) => !e.negated).slice(0, 4).map((e) => ({
        term: e.term, sentenceIndex: e.sentenceIndex, start: e.start, end: e.end, sentence: e.sentence,
      })),
    });
  }
  if (conflictWall) {
    plan.unshift({
      ruleId: INTAKE_RULES.PRIVACY,
      categoryId: 'conflict',
      label: 'Confidential conflict language detected',
      module: 'Conflict resolution',
      route: '#/conflicts',
      autoCreatable: false,
      probability: 1,
      confidence: 'high',
      evidence: [],
      privacyNotice: 'LeadOS never auto-creates conflict records or links them to operational cases. Open the confidential conflict workspace yourself if a private record is appropriate.',
    });
  }
  if (people.length && caseSuggestion) {
    plan.push({
      ruleId: INTAKE_RULES.ENTITIES,
      categoryId: 'people',
      label: `Blameless 1:1 coaching prep for ${people.map((p) => p.name).join(', ')}`,
      module: '1:1 prep & coaching',
      route: '#/oneonones',
      autoCreatable: true,
      probability: 1,
      confidence: 'high',
      evidence: people.map((p) => ({ term: p.raw, sentenceIndex: p.sentenceIndex, start: p.start, end: p.end, sentence: '' })),
      note: 'Created through RULE-COACH-01 when the case is confirmed; coaching notes never enter performance ratings.',
    });
  }
  return plan;
}

/* --------------------------------------------------------- drafts & feedback */

export const INTAKE_DRAFT_STATUSES = ['analyzed', 'confirmed', 'dismissed'];

export function pendingIntakeDrafts(state, now = new Date()) {
  const todayStr = dayKey(now);
  return (state.intakeDrafts || [])
    .filter((d) => d.status === 'analyzed')
    .map((d) => ({
      ...d,
      ageDays: d.createdAt ? Math.max(0, Math.round((new Date(todayStr) - new Date(d.createdAt.slice(0, 10))) / 86400000)) : 0,
      stale: Boolean(d.createdAt) && Math.round((new Date(todayStr) - new Date(d.createdAt.slice(0, 10))) / 86400000) >= STALE_DRAFT_DAYS,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Calibration ledger. Below n=5 per band we report counts only — never a rate
 * fabricated from too few samples (the discipline used by every other
 * calibration ledger in LeadOS). The measured quantity is *agreement* between
 * the engine's top-1 suggestion and the human's confirmed choice, honestly
 * labelled — it is not claimed to be ground-truth accuracy.
 */
export function intakeCalibration(state) {
  const drafts = (state.intakeDrafts || []).filter((d) => d.status === 'confirmed' && d.outcomes);
  const bands = ['high', 'medium', 'low'].map((band) => {
    const rows = drafts.filter((d) => d.outcomes.confidenceBand === band);
    const accepted = rows.filter((d) => d.outcomes.primaryAccepted).length;
    const edited = rows.filter((d) => !d.outcomes.primaryAccepted).length;
    return {
      band,
      n: rows.length,
      accepted,
      edited,
      agreementRate: rows.length >= CALIBRATION_MIN_SAMPLES
        ? Math.round((accepted / rows.length) * 1000) / 1000
        : null,
      countsOnly: rows.length < CALIBRATION_MIN_SAMPLES,
    };
  });
  const dismissed = (state.intakeDrafts || []).filter((d) => d.status === 'dismissed').length;
  const pending = (state.intakeDrafts || []).filter((d) => d.status === 'analyzed').length;
  const entitySuggestions = drafts.reduce(
    (acc, d) => {
      acc.offered += d.outcomes.entityOffered || 0;
      acc.accepted += d.outcomes.entityAccepted || 0;
      return acc;
    },
    { offered: 0, accepted: 0 },
  );
  return {
    totalConfirmed: drafts.length,
    pending,
    dismissed,
    bands,
    entityAgreementRate: entitySuggestions.offered >= CALIBRATION_MIN_SAMPLES
      ? Math.round((entitySuggestions.accepted / entitySuggestions.offered) * 1000) / 1000
      : null,
    entityCountsOnly: entitySuggestions.offered < CALIBRATION_MIN_SAMPLES,
    entitySuggestions,
    engineVersions: [...new Set(drafts.map((d) => d.engineVersion).filter(Boolean))],
    measuredConstruct: 'human agreement with the engine suggestion, not ground-truth accuracy',
  };
}

/** Shape the analysis into the payload expected by `api.addCase`. */
export function toCaseInput(analysis, overrides = {}) {
  const suggestion = analysis.caseSuggestion;
  if (!suggestion) return null;
  const financial = suggestion.financial || {};
  return {
    kind: overrides.kind || suggestion.kind,
    title: overrides.title || analysis.suggestedTitle || 'New triaged case',
    summary: overrides.summary !== undefined ? overrides.summary : suggestion.summary,
    ownerId: overrides.ownerId !== undefined ? overrides.ownerId : suggestion.ownerId,
    involvedPersonIds: overrides.involvedPersonIds !== undefined
      ? overrides.involvedPersonIds
      : suggestion.involvedPersonIds,
    linkedGoalId: overrides.linkedGoalId !== undefined ? overrides.linkedGoalId : suggestion.linkedGoalId,
    openedOn: overrides.openedOn || dayKey(new Date(analysis.analyzedAt)),
    reviewOn: overrides.reviewOn || suggestion.reviewOn,
    fmea: {
      severity: overrides.fmeaSeverity || suggestion.fmea?.severity || 5,
      probability: overrides.fmeaProbability || suggestion.fmea?.probability || 5,
      detectability: overrides.fmeaDetectability || suggestion.fmea?.detectability || 5,
      failureMode: overrides.failureMode || suggestion.fmea?.failureMode || '',
      effect: overrides.effect || suggestion.fmea?.effect || '',
      controls: overrides.controls || suggestion.fmea?.controls || '',
    },
    financial: {
      currency: overrides.currency || financial.currency || 'USD',
      optimistic: Number(overrides.optimistic ?? financial.optimistic ?? 0),
      mostLikely: Number(overrides.mostLikely ?? financial.mostLikely ?? 0),
      pessimistic: Number(overrides.pessimistic ?? financial.pessimistic ?? 0),
      mitigationCost: Number(overrides.mitigationCost ?? financial.mitigationCost ?? 0),
      capacityDaysOptimistic: Number(overrides.capO ?? financial.capacityDaysOptimistic ?? 0),
      capacityDaysMostLikely: Number(overrides.capM ?? financial.capacityDaysMostLikely ?? 0),
      capacityDaysPessimistic: Number(overrides.capP ?? financial.capacityDaysPessimistic ?? 0),
      opportunityCost: overrides.opportunityCost || financial.opportunityCost || '',
    },
    stakeholders: Array.isArray(overrides.stakeholders) ? overrides.stakeholders : [],
    rca: { whys: [], problemStatement: '', rootCause: '', systemicBarrier: '', preventiveAction: '' },
    autoPropagate: overrides.autoPropagate !== false,
  };
}
