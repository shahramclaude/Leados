/**
 * app/core/csv.js — RFC 4180 CSV serializer/parser and purpose-limited,
 * formula-injection-safe workspace exports.
 *
 * Security & privacy invariants:
 *  - OWASP CWE-1236 neutralization: string cells starting with `=`, `+`, `-`,
 *    `@`, tab, CR, LF, or Unicode full-width formula prefixes (`＝`, `＋`,
 *    `－`, `＠`) — whether at index 0 or after leading whitespace — are
 *    prefixed with `'` so Excel, LibreOffice Calc, and Google Sheets treat
 *    them as literal text rather than executable formulas.
 *  - Finite numbers are formatted before formula checks so negative scores or
 *    deltas (e.g. `-4.5`) remain true numeric cells.
 *  - `null` and `undefined` serialize as `""` (empty cell), never `0` or
 *    `"null"`, preserving unknown values honestly.
 *  - Purpose limitation: confidential conflict/coaching records require an
 *    explicit opt-in `conflicts` scope and never appear in roster, activity,
 *    or review exports. Pulse exports expose only anonymity-checked weekly
 *    aggregates (`pulseSummary`), never raw per-response rows or `personId`.
 */

import { addDays, dayKey, weekStart } from './time.js';
import { feedbackLatency } from './domain/feedback.js';
import { goalProgress } from './domain/goals.js';
import { buildReviewEvidence, summarizeReviewEvidence } from './domain/reviews.js';
import { aggregate, comments } from './domain/pulse.js';
import { buildTeamTrends } from './domain/trends.js';
import { followThroughIndex, isOpenAction } from './domain/oneonone.js';
import { deriveDelegationLineage } from './domain/delegations.js';
import { willIndex, growthLinkForDelegation } from './domain/growth.js';
import { planKind } from './domain/onboarding.js';
import { assess, EVIDENCE_DEFINITIONS } from './domain/readiness.js';
import { FORBIDDEN_LINK_TYPES, classifyMendelowStakeholder, resolveLinkedEntity, summarizeCase } from './domain/cases.js';
import { classifySalience } from './domain/stakeholders.js';
import { PORTFOLIO_DECISION_LABELS, pertTriple } from './domain/capacity.js';
import {
  CALIBRATION_MIN_SAMPLES,
  OUTCOME_VALUES,
  caseCostPairs,
  decisionForecastPairs,
  estimatePairs,
  missingActualItems,
  missingCaseActuals,
  negotiationSettlementCalibration,
} from './domain/calibration.js';
import { summarizeNegotiation } from './domain/negotiation.js';
import { evaluateBudget, commitmentCalibration as budgetCommitmentCalibration } from './domain/finance.js';
import {
  CANDIDATE_STAGE_LABELS,
  REQUISITION_REASON_LABELS,
  REQUISITION_STATUS_LABELS,
  assessCandidate,
  retentionReview,
} from './domain/hiring.js';
import {
  CHANGE_KIND_LABELS,
  CHANGE_STATUS_LABELS,
  summarizeChange,
} from './domain/changes.js';
import {
  buildSuggestedScenarios,
  compareScenarios,
  computeSensitivityTornado,
} from './domain/scenarios.js';

const FORMULA_TRIGGERS = new Set([
  '=', '+', '-', '@',
  '\t', '\r', '\n',
  '\uFF1D', // ＝ full-width equals
  '\uFF0B', // ＋ full-width plus
  '\uFF0D', // － full-width minus
  '\uFF20', // ＠ full-width commercial at
]);

function isFormulaDangerousString(str) {
  if (!str) return false;
  if (FORMULA_TRIGGERS.has(str[0])) return true;
  const trimmed = str.trimStart();
  return Boolean(trimmed && FORMULA_TRIGGERS.has(trimmed[0]));
}

/**
 * Format and escape a single CSV cell according to RFC 4180 + OWASP CWE-1236.
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  let text = String(value);
  if (text.length === 0) return '';
  if (isFormulaDangerousString(text)) {
    text = `'${text}`;
  }
  const needsQuotes = /[",\r\n]/.test(text) || /^\s|\s$/.test(text);
  if (!needsQuotes) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Serialize column headers (`[{ key, header }]` or string keys) and row objects
 * or arrays into an RFC 4180 CRLF CSV string.
 */
export function serializeCsv(columns, rows) {
  const normalizedCols = columns.map((col) => (
    typeof col === 'string' ? { key: col, header: col } : col
  ));
  const lines = [
    normalizedCols.map((col) => escapeCsvCell(col.header)).join(','),
  ];
  for (const row of rows) {
    const cells = Array.isArray(row)
      ? normalizedCols.map((_, idx) => escapeCsvCell(row[idx]))
      : normalizedCols.map((col) => escapeCsvCell(row[col.key]));
    lines.push(cells.join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * RFC 4180 state-machine parser returning `{ headers, rows }` for round-trip
 * verification and spreadsheet import inspection.
 */
export function parseCsv(text) {
  const input = String(text ?? '');
  if (!input.length) return { headers: [], rows: [] };
  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\r') {
      if (input[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else if (ch === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (inQuotes || field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  if (!records.length) return { headers: [], rows: [] };
  const [headers, ...rows] = records;
  return { headers, rows };
}

export const CSV_EXPORTS = [
  {
    key: 'people',
    label: 'Team roster',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'people',
    description: 'Active and archived team members, roles, start dates, focus areas, and 1:1 talking points.',
  },
  {
    key: 'onboarding',
    label: 'Onboarding, transitions & return to work (30-60-90 plans)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'onboarding-plans',
    description: '30-60-90 scaffolding for new joiners, internal role transitions, and return-to-work plans (plan_kind / plan_label), peer buddies, stakeholder introduction coverage, phase check-ins, and checkpoints.',
  },
  {
    key: 'oneOnOnes',
    label: '1:1 meetings',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'one-on-ones',
    description: 'Logged 1:1 conversations, status, energy, summaries, wins, blockers, and action counts.',
  },
  {
    key: 'actions',
    label: 'Commitments & follow-ups',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'commitments',
    description: 'Open and completed 1:1 actions, manager-owned 30-60-90 check-in follow-ups, GROW development commitments and feedback follow-ups, with source provenance, due and completion dates.',
  },
  {
    key: 'feedback',
    label: 'Feedback & SBI log',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'feedback',
    description: 'Praise and constructive SBI notes, direction, observed-to-discussed latency, and follow-up dates.',
  },
  {
    key: 'goals',
    label: 'Goals & key results',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'goals-key-results',
    description: 'Goals, co-authorship status, confidence, overall progress, and one row per key result.',
  },
  {
    key: 'delegations',
    label: 'Delegations',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'delegations',
    description: 'Delegated outcomes, authority levels, support commitments, check-in progress, and completion or return notes.',
  },
  {
    key: 'growthPlans',
    label: 'Development plans (GROW)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'growth-plans',
    description: 'Active and closed GROW plans, review dates, competency focus, and commitment completion counts.',
  },
  {
    key: 'recognition',
    label: 'Recognition log',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'recognition',
    description: 'Specific recognition entries, visibility, and team values reinforced.',
  },
  {
    key: 'readiness',
    label: 'Succession & readiness',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'readiness',
    description: 'Succession seats, candidates, readiness ratings, behavioural evidence counts, and active 30-60-90 transition status.',
  },
  {
    key: 'decisions',
    label: 'Decision log (DACI)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'decisions',
    description: 'Team decisions, reversibility, DACI roles, rationale, review dates, and outcomes.',
  },
  {
    key: 'cases',
    label: 'Operational cases (FMEA, PERT & RCA)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'operational-cases',
    description: 'Cross-domain operational cases with FMEA Action Priority & RPN, 3-point PERT financial and capacity distributions, risk-adjusted ROI, 5-Whys systemic barriers, and stakeholder coalition balance.',
  },
  {
    key: 'changes',
    label: 'Organizational design, topologies & change execution',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'org-design-changes',
    description: 'Team Topologies splits/charters, Kotter 8-step progression, Lewin force-field equilibrium, cognitive load, Galbraith Star alignment, Mendelow/veto coalition, PERT effort, and Shewhart XmR telemetry.',
  },
  {
    key: 'negotiations',
    label: 'Negotiation workbench (BATNA, ZOPA & agreements)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'negotiations',
    description: 'Negotiation records with Fisher & Ury prep completeness, BATNA positions, Raiffa ZOPA coverage across measured issues, reservation gaps, agreed terms and ownership gaps, and impasse escalation links.',
  },
  {
    key: 'finance',
    label: 'Budget envelopes & financial commitments (encumbrance ledger)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'budget-finance',
    description: 'Budget envelopes with recorded actuals, open encumbrances, planned pipeline and forecast at completion per envelope (each in its own currency, never converted or summed across envelopes), plus one row per commitment line with its funded record and actual-vs-committed ratio.',
  },
  {
    key: 'portfolio',
    label: 'Capacity plan & portfolio allocation',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'capacity-portfolio',
    description: 'Operating-plan demand ledger: three-point effort and value estimates, funding decision and rationale, target and delivery dates, source provenance, and value density per person-day.',
  },
  {
    key: 'hiring',
    label: 'Selection & hiring (requisitions, evidence, decisions)',
    group: 'operational',
    sensitive: true,
    filenameSlug: 'selection-hiring',
    description: 'Open and closed roles, competencies, interview effort, recorded evidence with method and rater, candidate stage, decision and rationale. Contains named candidate data — keep it to the process it was collected for and delete it when the process ends.',
  },
  {
    key: 'caseLinks',
    label: 'Cross-module relationship graph',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'cross-module-links',
    description: 'Typed operational links connecting cases, DACI decisions, delegations, goals, and 1:1 coaching support (excludes confidential conflicts and anonymous pulses).',
  },
  {
    key: 'reviews',
    label: 'Calibration & review packets',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'review-packets',
    description: 'Dated review packets, evidence-span coverage, recency share, and calibration notes (excludes confidential conflicts and raw pulses).',
  },
  {
    key: 'pulseSummary',
    label: 'Pulse weekly summary (anonymity-safe)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'pulse-weekly-summary',
    description: 'Weekly aggregated pulse averages and comments strictly enforcing minimum response count and unanimity suppression; never exports individual rows.',
  },
  {
    key: 'healthTrends',
    label: 'Team health & habit trends (12 weeks)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'team-health-trends',
    description: 'Fortnightly checkpoint series across all five health dimensions, feedback latency, and delegation follow-through.',
  },
  {
    key: 'sensitivity',
    label: 'Scenario comparison & tornado sensitivity (CRN)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'scenario-sensitivity',
    description: 'Common-Random-Numbers counterfactual scenario comparison (Pareto frontier, Brooks’s Law diagnostics, delta overload odds, delta P80 days) and One-at-a-Time Tornado sensitivity rankings.',
  },
  {
    key: 'calibration',
    label: 'Forecast calibration (Brier & estimate accuracy)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'forecast-calibration',
    description: 'Scored predictions vs outcomes across five calibration ledgers: decision forecasts with per-decision Brier contributions, delivered-work forecast-vs-actual ratios scored against funding-time snapshots, settled case exposure/occurrence scores against opening forecasts, direction- and currency-segmented negotiation settlement actuals/reference classes, budget commitment actual-vs-encumbered ratios, and missing actuals.',
  },
  {
    key: 'stakeholders',
    label: 'Stakeholder influence register (Mendelow, salience & veto players)',
    group: 'sensitive',
    sensitive: true,
    filenameSlug: 'stakeholder-register',
    description: 'Named political assessments: power/interest/legitimacy/urgency ratings, Mitchell-Agle-Wood salience class, Tsebelis veto flags and bases, candid stances, briefing notes and contact history. Contextual-integrity governed — scrub stances before sharing upwards.',
  },
  {
    key: 'conflicts',
    label: 'Difficult situations & coaching notes (Confidential)',
    group: 'sensitive',
    sensitive: true,
    filenameSlug: 'confidential-conflicts',
    description: 'Private mediation and coaching preparation notes. Contains sensitive interpersonal records — handle with restricted access.',
  },
];

function personLookup(state) {
  const map = new Map();
  for (const p of state.people || []) map.set(p.id, p.name);
  return (id) => (id ? map.get(id) || '' : '');
}

function buildScopeTable(state, scope, now) {
  const nameOf = personLookup(state);
  const today = dayKey(now);

  switch (scope) {
    case 'people': {
      const columns = [
        { key: 'person_id', header: 'person_id' },
        { key: 'name', header: 'name' },
        { key: 'role', header: 'role' },
        { key: 'level', header: 'level' },
        { key: 'team', header: 'team' },
        { key: 'manager_id', header: 'manager_id' },
        { key: 'status', header: 'status' },
        { key: 'start_date', header: 'start_date' },
        { key: 'archived_at', header: 'archived_at' },
        { key: 'focus', header: 'focus' },
        { key: 'talking_points', header: 'talking_points' },
      ];
      const rows = (state.people || []).map((p) => ({
        person_id: p.id,
        name: p.name,
        role: p.role,
        level: p.level || '',
        team: p.team || '',
        manager_id: p.managerId,
        status: p.status,
        start_date: p.startDate,
        archived_at: p.archivedAt ? p.archivedAt.slice(0, 10) : null,
        focus: p.focus,
        talking_points: (p.talkingPoints || []).join('; '),
      }));
      return { columns, rows };
    }

    case 'onboarding': {
      const columns = [
        { key: 'plan_id', header: 'plan_id' },
        { key: 'plan_kind', header: 'plan_kind' },
        { key: 'plan_label', header: 'plan_label' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'start_date', header: 'start_date' },
        { key: 'status', header: 'status' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'buddy_name', header: 'buddy_name' },
        { key: 'role_clarity', header: 'role_clarity' },
        { key: 'early_win', header: 'early_win' },
        { key: 'stakeholders_met', header: 'stakeholders_met' },
        { key: 'stakeholders_total', header: 'stakeholders_total' },
        { key: 'day30_checkin_on', header: 'day30_checkin_on' },
        { key: 'day60_checkin_on', header: 'day60_checkin_on' },
        { key: 'day90_checkin_on', header: 'day90_checkin_on' },
        { key: 'checkpoint_id', header: 'checkpoint_id' },
        { key: 'horizon_days', header: 'horizon_days' },
        { key: 'category', header: 'category' },
        { key: 'checkpoint_title', header: 'checkpoint_title' },
        { key: 'checkpoint_due', header: 'checkpoint_due' },
        { key: 'checkpoint_done', header: 'checkpoint_done' },
        { key: 'checkpoint_completed_on', header: 'checkpoint_completed_on' },
        { key: 'checkpoint_notes', header: 'checkpoint_notes' },
      ];
      const rows = [];
      for (const plan of state.onboarding || []) {
        const buddyDisplay = plan.buddyId ? (nameOf(plan.buddyId) || plan.buddyName || '') : (plan.buddyName || '');
        const stakeholders = plan.stakeholders || [];
        const base = {
          plan_id: plan.id,
          plan_kind: planKind(plan),
          plan_label: plan.label || '',
          person_id: plan.personId,
          person_name: nameOf(plan.personId),
          start_date: plan.startDate,
          status: plan.status,
          completed_on: plan.completedOn,
          buddy_name: buddyDisplay,
          role_clarity: plan.roleClarity,
          early_win: plan.earlyWin,
          stakeholders_met: stakeholders.filter((s) => s.met).length,
          stakeholders_total: stakeholders.length,
          day30_checkin_on: plan.reviews?.[30]?.heldOn || null,
          day60_checkin_on: plan.reviews?.[60]?.heldOn || null,
          day90_checkin_on: plan.reviews?.[90]?.heldOn || null,
        };
        const cps = plan.checkpoints || [];
        if (!cps.length) {
          rows.push({
            ...base,
            checkpoint_id: null,
            horizon_days: null,
            category: null,
            checkpoint_title: null,
            checkpoint_due: null,
            checkpoint_done: null,
            checkpoint_completed_on: null,
            checkpoint_notes: null,
          });
        } else {
          for (const cp of cps) {
            rows.push({
              ...base,
              checkpoint_id: cp.id,
              horizon_days: cp.horizon,
              category: cp.category,
              checkpoint_title: cp.title,
              checkpoint_due: cp.due,
              checkpoint_done: Boolean(cp.done),
              checkpoint_completed_on: cp.completedOn,
              checkpoint_notes: cp.notes,
            });
          }
        }
      }
      return { columns, rows };
    }

    case 'oneOnOnes': {
      const columns = [
        { key: 'meeting_id', header: 'meeting_id' },
        { key: 'date', header: 'date' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'status', header: 'status' },
        { key: 'mood', header: 'mood' },
        { key: 'agenda_topics', header: 'agenda_topics' },
        { key: 'notes', header: 'notes' },
        { key: 'open_actions', header: 'open_actions' },
        { key: 'completed_actions', header: 'completed_actions' },
        { key: 'carried_in', header: 'carried_in' },
        { key: 'carried_out', header: 'carried_out' },
        { key: 'dropped_actions', header: 'dropped_actions' },
      ];
      const rows = (state.oneOnOnes || [])
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((m) => {
          const actions = m.actions || [];
          return {
            meeting_id: m.id,
            date: m.date,
            person_id: m.personId,
            person_name: nameOf(m.personId),
            status: m.status,
            mood: m.mood,
            agenda_topics: (m.agenda || []).map((item) => item.text).filter(Boolean).join('; '),
            notes: m.notes,
            // A promise that was carried forward or dropped is not open: the
            // successor (or the decision) is the live record.
            open_actions: actions.filter(isOpenAction).length,
            completed_actions: actions.filter((a) => a.done).length,
            carried_in: actions.filter((a) => a.carriedFrom).length,
            carried_out: actions.filter((a) => !a.done && !a.dropped && a.carriedToMeetingId).length,
            dropped_actions: actions.filter((a) => a.dropped).length,
          };
        });
      return { columns, rows };
    }

    case 'actions': {
      const columns = [
        { key: 'source_type', header: 'source_type' },
        { key: 'source_id', header: 'source_id' },
        { key: 'source_date', header: 'source_date' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'commitment', header: 'commitment' },
        { key: 'due_on', header: 'due_on' },
        { key: 'owner', header: 'owner' },
        { key: 'done', header: 'done' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'state', header: 'state' },
        { key: 'carried_forward_count', header: 'carried_forward_count' },
        { key: 'first_agreed_on', header: 'first_agreed_on' },
        { key: 'confirmed_in_meeting', header: 'confirmed_in_meeting' },
        { key: 'linked_delegation_id', header: 'linked_delegation_id' },
        { key: 'source_checkin_id', header: 'source_checkin_id' },
        { key: 'source_plan_id', header: 'source_plan_id' },
        { key: 'source_horizon', header: 'source_horizon' },
        { key: 'source_held_on', header: 'source_held_on' },
        { key: 'carried_from_id', header: 'carried_from_id' },
      ];
      const rows = [];
      const followThrough = followThroughIndex(state);
      for (const m of state.oneOnOnes || []) {
        for (const a of m.actions || []) {
          const info = followThrough.get(`${m.id}|${a.id}`) || { depth: 0, firstAgreedOn: m.date };
          rows.push({
            source_type: '1:1 action',
            source_id: m.id,
            source_date: m.date,
            person_id: m.personId,
            person_name: nameOf(m.personId),
            commitment: a.text,
            due_on: a.due,
            // Empty, not a guess: only 1:1 actions carry a recorded owner, and
            // an unrecorded one stays blank in the export too.
            owner: a.owner || null,
            done: Boolean(a.done),
            completed_on: a.completedOn,
            state: a.done ? 'done' : a.dropped ? 'dropped' : a.carriedToMeetingId ? 'carried-forward' : 'open',
            carried_forward_count: info.depth,
            first_agreed_on: info.firstAgreedOn,
            confirmed_in_meeting: a.completedInMeetingId || null,
          });
        }
      }
      const supportLookup = new Map((state.managerSupport || []).map((record) => [record.id, record]));
      for (const record of state.managerSupport || []) {
        let origin = record;
        let carriedForwardCount = 0;
        const seen = new Set([record.id]);
        while (origin.carriedFromId && supportLookup.has(origin.carriedFromId) && !seen.has(origin.carriedFromId)) {
          origin = supportLookup.get(origin.carriedFromId);
          seen.add(origin.id);
          carriedForwardCount += 1;
        }
        rows.push({
          source_type: 'Manager support',
          source_id: record.id,
          source_date: record.addedOn,
          person_id: record.personId,
          person_name: nameOf(record.personId),
          commitment: record.text,
          due_on: record.due,
          owner: 'leader',
          done: record.status === 'done',
          completed_on: record.completedOn,
          state: record.status === 'carried' ? 'carried-forward' : record.status,
          carried_forward_count: carriedForwardCount,
          first_agreed_on: origin.addedOn,
          confirmed_in_meeting: record.completedInMeetingId || null,
          source_checkin_id: record.sourceCheckinId,
          source_plan_id: record.sourcePlanId,
          source_horizon: record.sourceHorizon,
          source_held_on: record.sourceHeldOn,
          carried_from_id: record.carriedFromId,
        });
      }
      for (const p of state.growthPlans || []) {
        const chain = willIndex(p);
        for (const w of p.will || []) {
          const info = chain.get(w.id) || { depth: 0, firstAgreedOn: w.addedOn || null };
          rows.push({
            source_type: 'GROW commitment',
            source_id: p.id,
            source_date: (p.createdAt || '').slice(0, 10) || null,
            person_id: p.personId,
            person_name: nameOf(p.personId),
            commitment: w.text,
            due_on: w.due,
            done: Boolean(w.done),
            completed_on: w.completedOn,
            state: w.done ? 'done' : w.dropped ? 'dropped' : w.carriedToId ? 'carried-forward' : 'open',
            carried_forward_count: info.depth,
            first_agreed_on: info.firstAgreedOn,
            confirmed_in_meeting: null,
            linked_delegation_id: w.delegationId || null,
          });
        }
      }
      for (const f of state.feedback || []) {
        if (!f.followUpOn && !f.followUpDone) continue;
        rows.push({
          source_type: 'Feedback follow-up',
          source_id: f.id,
          source_date: f.date,
          person_id: f.personId,
          person_name: nameOf(f.personId),
          commitment: f.situation ? `Follow up: ${f.situation}` : `Follow up on ${f.kind} feedback`,
          due_on: f.followUpOn,
          done: Boolean(f.followUpDone),
          completed_on: f.followUpCompletedOn,
        });
      }
      for (const plan of state.onboarding || []) {
        const kind = planKind(plan);
        const sourcePrefix = kind === 'role-transition'
          ? 'Role transition'
          : kind === 'reboarding'
            ? 'Return to work'
            : 'Onboarding';
        for (const cp of plan.checkpoints || []) {
          rows.push({
            source_type: `${sourcePrefix} Day ${cp.horizon}`,
            source_id: plan.id,
            source_date: plan.startDate,
            person_id: plan.personId,
            person_name: nameOf(plan.personId),
            commitment: cp.title,
            due_on: cp.due,
            done: Boolean(cp.done),
            completed_on: cp.completedOn,
          });
        }
      }
      return { columns, rows };
    }

    case 'feedback': {
      const columns = [
        { key: 'feedback_id', header: 'feedback_id' },
        { key: 'date', header: 'date' },
        { key: 'observed_on', header: 'observed_on' },
        { key: 'latency_days', header: 'latency_days' },
        { key: 'latency_status', header: 'latency_status' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'direction', header: 'direction' },
        { key: 'kind', header: 'kind' },
        { key: 'situation', header: 'situation' },
        { key: 'behavior', header: 'behavior' },
        { key: 'impact', header: 'impact' },
        { key: 'tags', header: 'tags' },
        { key: 'follow_up_on', header: 'follow_up_on' },
        { key: 'follow_up_done', header: 'follow_up_done' },
        { key: 'follow_up_completed_on', header: 'follow_up_completed_on' },
      ];
      const rows = (state.feedback || [])
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((f) => {
          const lat = feedbackLatency(f);
          const latencyStatus = f.direction !== 'given'
            ? 'not-applicable'
            : lat.status === 'measured'
              ? 'measured'
              : lat.status === 'invalid'
                ? 'invalid-order'
                : 'unmeasured';
          return {
            feedback_id: f.id,
            date: f.date,
            observed_on: f.observedOn,
            latency_days: f.direction === 'given' && lat.status === 'measured' ? lat.days : null,
            latency_status: latencyStatus,
            person_id: f.personId,
            person_name: nameOf(f.personId),
            direction: f.direction,
            kind: f.kind,
            situation: f.situation,
            behavior: f.behavior,
            impact: f.impact,
            tags: (f.tags || []).join('; '),
            follow_up_on: f.followUpOn,
            follow_up_done: Boolean(f.followUpDone),
            follow_up_completed_on: f.followUpCompletedOn,
          };
        });
      return { columns, rows };
    }

    case 'goals': {
      const columns = [
        { key: 'goal_id', header: 'goal_id' },
        { key: 'source_review_id', header: 'source_review_id' },
        { key: 'goal_title', header: 'goal_title' },
        { key: 'scope', header: 'scope' },
        { key: 'owner_id', header: 'owner_id' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'co_authored', header: 'co_authored' },
        { key: 'status', header: 'status' },
        { key: 'confidence', header: 'confidence' },
        { key: 'due_date', header: 'due_date' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'goal_progress_pct', header: 'goal_progress_pct' },
        { key: 'checkin_count', header: 'checkin_count' },
        { key: 'last_checkin_on', header: 'last_checkin_on' },
        { key: 'kr_id', header: 'kr_id' },
        { key: 'kr_title', header: 'kr_title' },
        { key: 'kr_start', header: 'kr_start' },
        { key: 'kr_target', header: 'kr_target' },
        { key: 'kr_current', header: 'kr_current' },
        { key: 'kr_unit', header: 'kr_unit' },
      ];
      const rows = [];
      for (const g of state.goals || []) {
        const progress = goalProgress(g);
        const checkins = (g.checkins || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const lastCheckin = checkins.length ? checkins[checkins.length - 1].date : null;
        const base = {
          goal_id: g.id,
          source_review_id: g.sourceReviewId,
          goal_title: g.title,
          scope: g.scope,
          owner_id: g.ownerId,
          owner_name: nameOf(g.ownerId),
          co_authored: g.coAuthored === true ? 'yes' : g.coAuthored === false ? 'no' : null,
          status: g.status,
          confidence: g.confidence,
          due_date: g.dueDate,
          completed_on: g.completedOn,
          goal_progress_pct: progress,
          checkin_count: checkins.length,
          last_checkin_on: lastCheckin,
        };
        if (!(g.keyResults || []).length) {
          rows.push({
            ...base,
            kr_id: null,
            kr_title: null,
            kr_start: null,
            kr_target: null,
            kr_current: null,
            kr_unit: null,
          });
        } else {
          for (const kr of g.keyResults) {
            rows.push({
              ...base,
              kr_id: kr.id,
              kr_title: kr.title,
              kr_start: kr.start,
              kr_target: kr.target,
              kr_current: kr.current,
              kr_unit: kr.unit,
            });
          }
        }
      }
      return { columns, rows };
    }

    case 'delegations': {
      const columns = [
        { key: 'delegation_id', header: 'delegation_id' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'title', header: 'title' },
        { key: 'authority_level', header: 'authority_level' },
        { key: 'status', header: 'status' },
        { key: 'delegated_on', header: 'delegated_on' },
        { key: 'due_on', header: 'due_on' },
        { key: 'last_checkin_on', header: 'last_checkin_on' },
        { key: 'last_progress', header: 'last_progress' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'returned_on', header: 'returned_on' },
        { key: 'expected_outcome', header: 'expected_outcome' },
        { key: 'support', header: 'support' },
        { key: 'completion_or_return_note', header: 'completion_or_return_note' },
        { key: 'linked_growth_plan_id', header: 'linked_growth_plan_id' },
        { key: 'prior_delegation_id', header: 'prior_delegation_id' },
        { key: 'superseded_by_delegation_id', header: 'superseded_by_delegation_id' },
        { key: 'recovered_on', header: 'recovered_on' },
        { key: 'recovery_note', header: 'recovery_note' },
        { key: 'attempt_number', header: 'attempt_number' },
        { key: 'source_negotiation_id', header: 'source_negotiation_id' },
        { key: 'source_term_id', header: 'source_term_id' },
      ];
      const rows = (state.delegations || []).map((d) => {
        const sortedCheckins = (d.checkins || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const latest = sortedCheckins.length ? sortedCheckins[sortedCheckins.length - 1] : null;
        const link = growthLinkForDelegation(state, d.id);
        const lineage = deriveDelegationLineage(state, d.id);
        return {
          delegation_id: d.id,
          person_id: d.personId,
          person_name: nameOf(d.personId),
          title: d.title,
          authority_level: d.authority,
          status: d.status,
          delegated_on: d.delegatedOn,
          due_on: d.dueOn,
          last_checkin_on: latest ? latest.date : null,
          last_progress: latest ? latest.progress : null,
          completed_on: d.completedOn,
          returned_on: d.returnedOn,
          expected_outcome: d.expectedOutcome,
          support: d.support,
          completion_or_return_note: d.status === 'returned' ? d.returnReason : d.completionNote,
          linked_growth_plan_id: link?.plan?.id || null,
          prior_delegation_id: d.priorDelegationId || null,
          superseded_by_delegation_id: d.supersededByDelegationId || null,
          recovered_on: d.recoveredOn || null,
          recovery_note: d.recoveryNote || null,
          attempt_number: lineage.attemptNumber,
          source_negotiation_id: d.sourceNegotiationId || null,
          source_term_id: d.sourceTermId || null,
        };
      });
      return { columns, rows };
    }

    case 'growthPlans': {
      const columns = [
        { key: 'plan_id', header: 'plan_id' },
        { key: 'source_review_id', header: 'source_review_id' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'status', header: 'status' },
        { key: 'created_on', header: 'created_on' },
        { key: 'review_on', header: 'review_on' },
        { key: 'closed_on', header: 'closed_on' },
        { key: 'goal', header: 'goal' },
        { key: 'reality', header: 'reality' },
        { key: 'options_count', header: 'options_count' },
        { key: 'will_total', header: 'will_total' },
        { key: 'will_completed', header: 'will_completed' },
        { key: 'will_open', header: 'will_open' },
        { key: 'will_carried', header: 'will_carried' },
        { key: 'will_dropped', header: 'will_dropped' },
        { key: 'will_linked_delegations', header: 'will_linked_delegations' },
        { key: 'reviews_held', header: 'reviews_held' },
        { key: 'last_reviewed_on', header: 'last_reviewed_on' },
        { key: 'review_deferrals', header: 'review_deferrals' },
        { key: 'competencies', header: 'competencies' },
      ];
      const rows = (state.growthPlans || []).map((p) => {
        // `will_total` stays the number of rows on record; the split below is
        // what the leader can act on and is never derived from a guess.
        const will = p.will || [];
        const live = will.filter((w) => !w.carriedToId);
        const open = live.filter((w) => !w.done && !w.dropped);
        const reviews = (p.reviews || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
        return {
          plan_id: p.id,
          source_review_id: p.sourceReviewId,
          person_id: p.personId,
          person_name: nameOf(p.personId),
          status: p.status,
          created_on: (p.createdAt || '').slice(0, 10) || null,
          review_on: p.reviewOn,
          closed_on: p.closedOn,
          goal: p.goal,
          reality: p.reality,
          options_count: (p.options || []).length,
          will_total: will.length,
          will_completed: will.filter((w) => w.done).length,
          will_open: open.length,
          will_carried: will.filter((w) => w.carriedToId).length,
          will_dropped: will.filter((w) => w.dropped).length,
          will_linked_delegations: live.filter((w) => !w.dropped && w.delegationId).length,
          reviews_held: (p.reviews || []).length,
          last_reviewed_on: reviews[0]?.date || null,
          review_deferrals: p.reviewDeferrals || 0,
          competencies: (p.competencies || []).join('; '),
        };
      });
      return { columns, rows };
    }

    case 'recognition': {
      const columns = [
        { key: 'recognition_id', header: 'recognition_id' },
        { key: 'date', header: 'date' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'visibility', header: 'visibility' },
        { key: 'what', header: 'what' },
        { key: 'values', header: 'values' },
      ];
      const rows = (state.recognition || [])
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((r) => ({
          recognition_id: r.id,
          date: r.date,
          person_id: r.personId,
          person_name: nameOf(r.personId),
          visibility: r.visibility === 'public' ? 'public' : 'private',
          what: r.what,
          values: (r.values || []).join('; '),
        }));
      return { columns, rows };
    }

    case 'readiness': {
      const columns = [
        { key: 'readiness_id', header: 'readiness_id' },
        { key: 'seat', header: 'seat' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'person_role', header: 'person_role' },
        { key: 'rating', header: 'rating' },
        { key: 'rating_label', header: 'rating_label' },
        { key: 'evidence_supported', header: 'evidence_supported' },
        { key: 'evidence_met_count', header: 'evidence_met_count' },
        { key: 'evidence_total', header: 'evidence_total' },
        { key: 'active_transition_label', header: 'active_transition_label' },
        { key: 'warning', header: 'warning' },
        { key: 'notes', header: 'notes' },
        { key: 'updated_on', header: 'updated_on' },
      ];
      const peopleById = new Map((state.people || []).map((p) => [p.id, p]));
      const rows = (state.readiness || [])
        .slice()
        .sort((a, b) => String(a.seat || '').localeCompare(String(b.seat || '')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .map((rec) => {
          const person = peopleById.get(rec.personId) || null;
          const assessment = assess(state, rec.personId, now, state.settings, rec.seat);
          const activeTransition = (state.onboarding || []).find(
            (p) => p.personId === rec.personId && p.status === 'active' && planKind(p) === 'role-transition',
          );
          return {
            readiness_id: rec.id,
            seat: rec.seat || '',
            person_id: rec.personId,
            person_name: nameOf(rec.personId),
            person_role: person?.role || '',
            rating: rec.rating,
            rating_label: assessment.label,
            evidence_supported: Boolean(assessment.supported),
            evidence_met_count: assessment.evidence.metCount,
            evidence_total: EVIDENCE_DEFINITIONS.length,
            active_transition_label: activeTransition ? (activeTransition.label || 'Role transition') : null,
            warning: assessment.warning || null,
            notes: rec.notes || '',
            updated_on: (rec.updatedAt || '').slice(0, 10) || null,
          };
        });
      return { columns, rows };
    }

    case 'decisions': {
      const columns = [
        { key: 'decision_id', header: 'decision_id' },
        { key: 'date', header: 'date' },
        { key: 'title', header: 'title' },
        { key: 'question', header: 'question' },
        { key: 'reversibility', header: 'reversibility' },
        { key: 'driver', header: 'driver' },
        { key: 'approver', header: 'approver' },
        { key: 'contributors', header: 'contributors' },
        { key: 'informed', header: 'informed' },
        { key: 'chosen', header: 'chosen' },
        { key: 'rationale', header: 'rationale' },
        { key: 'forecast_probability_pct', header: 'forecast_probability_pct' },
        { key: 'brier_contribution', header: 'brier_contribution' },
        { key: 'review_on', header: 'review_on' },
        { key: 'reviewed_on', header: 'reviewed_on' },
        { key: 'outcome', header: 'outcome' },
        { key: 'outcome_notes', header: 'outcome_notes' },
      ];
      const rows = (state.decisions || [])
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((d) => ({
          decision_id: d.id,
          date: d.date,
          title: d.title,
          question: d.question,
          reversibility: d.reversibility,
          driver: d.driver,
          approver: d.approver,
          contributors: d.contributors,
          informed: d.informed,
          chosen: d.chosen,
          rationale: d.rationale,
          forecast_probability_pct: d.forecastProbability ?? '',
          brier_contribution: d.reviewedOn && d.forecastProbability !== null && d.forecastProbability !== undefined && OUTCOME_VALUES[d.outcome] !== undefined
            ? Math.round((((d.forecastProbability / 100) - OUTCOME_VALUES[d.outcome]) ** 2) * 10000) / 10000
            : '',
          review_on: d.reviewOn,
          reviewed_on: d.reviewedOn,
          outcome: d.outcome,
          outcome_notes: d.outcomeNotes,
        }));
      return { columns, rows };
    }

    case 'calibration': {
      // One row per scored (or unscorable) prediction. Decision rows carry the
      // stated probability vs the reviewed outcome with its Brier
      // contribution; estimate rows carry the funding-time forecast vs the
      // recorded actual; missing-actual rows make the evidence gap explicit
      // instead of silently absent.
      const columns = [
        { key: 'record_type', header: 'record_type' },
        { key: 'record_id', header: 'record_id' },
        { key: 'title', header: 'title' },
        { key: 'forecast_made_on', header: 'forecast_made_on' },
        { key: 'outcome_on', header: 'outcome_on' },
        { key: 'forecast', header: 'forecast' },
        { key: 'actual_or_outcome', header: 'actual_or_outcome' },
        { key: 'score', header: 'score' },
        { key: 'scored_against', header: 'scored_against' },
      ];
      const rows = [];
      for (const pair of decisionForecastPairs(state)) {
        rows.push({
          record_type: 'decision-forecast',
          record_id: pair.decisionId,
          title: pair.title,
          forecast_made_on: pair.date || '',
          outcome_on: pair.reviewedOn,
          forecast: `${Math.round(pair.p * 100)}%`,
          actual_or_outcome: pair.outcome,
          score: pair.brier,
          scored_against: 'brier (lower is better)',
        });
      }
      for (const pair of estimatePairs(state)) {
        rows.push({
          record_type: 'effort-estimate',
          record_id: pair.itemId,
          title: pair.title,
          forecast_made_on: '',
          outcome_on: pair.completedOn || '',
          forecast: `${pair.expected}d`,
          actual_or_outcome: `${pair.actual}d`,
          score: pair.ratio,
          scored_against: `${pair.source} ratio (1.0 is exact)`,
        });
      }
      for (const missing of missingActualItems(state)) {
        rows.push({
          record_type: 'missing-actual',
          record_id: missing.itemId,
          title: missing.title,
          forecast_made_on: '',
          outcome_on: missing.completedOn || '',
          forecast: `${missing.expected}d`,
          actual_or_outcome: 'not recorded',
          score: '',
          scored_against: 'unscorable until actuals are recorded',
        });
      }
      // Schema v22 case-cost ledger: one row per settled case, split by FAIR
      // leg — magnitude (realised vs assessed exposure) and frequency
      // (assessed probability vs materialisation, Brier-scored) — plus the
      // resolved cases whose forecasts remain unscored.
      for (const pair of caseCostPairs(state)) {
        if (pair.exposureRatio !== null) {
          rows.push({
            record_type: 'case-exposure',
            record_id: pair.caseId,
            title: pair.title,
            forecast_made_on: pair.openedOn || '',
            outcome_on: pair.settledOn || '',
            forecast: `${pair.currency} ${pair.costExpected}`,
            actual_or_outcome: `${pair.currency} ${pair.realisedExposure}`,
            score: pair.exposureRatio,
            scored_against: `${pair.source} ratio (1.0 is exact)`,
          });
        }
        if (pair.occurrenceBrier !== null) {
          rows.push({
            record_type: 'case-occurrence',
            record_id: pair.caseId,
            title: pair.title,
            forecast_made_on: pair.openedOn || '',
            outcome_on: pair.settledOn || '',
            forecast: `${Math.round(pair.assessedProbability * 100)}%`,
            actual_or_outcome: pair.materialised ? 'materialised' : 'did not materialise',
            score: pair.occurrenceBrier,
            scored_against: 'brier (lower is better)',
          });
        }
      }
      for (const missing of missingCaseActuals(state)) {
        rows.push({
          record_type: 'case-missing-actuals',
          record_id: missing.caseId,
          title: missing.title,
          forecast_made_on: '',
          outcome_on: missing.resolvedOn || '',
          forecast: missing.costExpected !== null ? `${missing.currency} ${missing.costExpected}` : '',
          actual_or_outcome: 'not recorded',
          score: '',
          scored_against: 'unscorable until settled actuals are recorded',
        });
      }

      // Session 38: ex-post deal values use the recorded agreement and its
      // explicit realised value, with no FX conversion and no invented savings.
      const negotiationCal = negotiationSettlementCalibration(state);
      for (const pair of negotiationCal.pairs) {
        rows.push({
          record_type: 'negotiation-settlement',
          record_id: pair.negotiationId,
          title: pair.title,
          forecast_made_on: pair.agreedOn || '',
          outcome_on: pair.settledOn || '',
          forecast: `${pair.currency} ${pair.agreedValue}`,
          actual_or_outcome: `${pair.currency} ${pair.realisedValue}`,
          score: pair.favorableVariancePct,
          scored_against: `${pair.direction}-direction variance % (positive is favorable)`,
        });
      }
      for (const cohort of negotiationCal.cohorts) {
        rows.push({
          record_type: 'negotiation-reference-class',
          record_id: cohort.cohortKey,
          title: `Settlement reference class · ${cohort.currency} · ${cohort.direction}`,
          forecast_made_on: '',
          outcome_on: cohort.pairs.at(-1)?.settledOn || '',
          forecast: `${cohort.n} comparable settlement(s)`,
          actual_or_outcome: cohort.verdict.label,
          score: cohort.sufficient ? cohort.medianShortfallPct : '',
          scored_against: cohort.sufficient
            ? `median directional shortfall %; P80 ${cohort.p80ShortfallPct}% · n=${cohort.n}`
            : `counts only below n=${CALIBRATION_MIN_SAMPLES} · n=${cohort.n}`,
        });
      }
      for (const missing of negotiationCal.missingItems) {
        rows.push({
          record_type: 'negotiation-missing-actual',
          record_id: missing.negotiationId,
          title: missing.title,
          forecast_made_on: '',
          outcome_on: missing.settledOn || '',
          forecast: '',
          actual_or_outcome: 'not comparable',
          score: '',
          scored_against: missing.reason,
        });
      }

      // Schema v24 fifth ledger: budget commitment accuracy. Ratios are
      // dimensionless and pool across currencies; the exported amount pair
      // always stays inside its own envelope currency.
      const commitCal = budgetCommitmentCalibration(state);
      for (const pair of commitCal.pairs) {
        rows.push({
          record_type: 'budget-commitment',
          record_id: pair.lineId,
          title: `${pair.budgetName}: ${pair.title}`,
          forecast_made_on: '',
          outcome_on: pair.spentOn || '',
          forecast: `${pair.currency} ${pair.committedAmount}`,
          actual_or_outcome: `${pair.currency} ${pair.actualAmount}`,
          score: pair.ratio,
          scored_against: 'actual/committed ratio (1.0 is exact)',
        });
      }
      if (commitCal.n) {
        rows.push({
          record_type: 'budget-reference-class',
          record_id: 'budget-commitments',
          title: 'Budget commitment reference class',
          forecast_made_on: '',
          outcome_on: commitCal.pairs.at(-1)?.spentOn || '',
          forecast: `${commitCal.n} scored commitment(s)`,
          actual_or_outcome: commitCal.sufficient
            ? `Median ${commitCal.medianRatio}x (P80 ${commitCal.p80Ratio}x)`
            : 'Counts only — no median until the floor is met',
          score: commitCal.sufficient ? commitCal.medianRatio : '',
          scored_against: commitCal.sufficient
            ? `median actual/committed ratio · n=${commitCal.n}`
            : `counts only below n=${commitCal.minSamples} · n=${commitCal.n}`,
        });
      }
      for (const missing of commitCal.missingItems) {
        rows.push({
          record_type: 'budget-missing-actual',
          record_id: missing.lineId,
          title: `${missing.budgetName}: ${missing.title}`,
          forecast_made_on: '',
          outcome_on: '',
          forecast: '',
          actual_or_outcome: 'not comparable',
          score: '',
          scored_against: missing.reason,
        });
      }
      return { columns, rows };
    }

    case 'reviews': {
      const columns = [
        { key: 'review_id', header: 'review_id' },
        { key: 'period_start', header: 'period_start' },
        { key: 'period_end', header: 'period_end' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'status', header: 'status' },
        { key: 'updated_on', header: 'updated_on' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'evidence_items', header: 'evidence_items' },
        { key: 'dated_evidence', header: 'dated_evidence' },
        { key: 'source_types', header: 'source_types' },
        { key: 'early_half_evidence', header: 'early_half_evidence' },
        { key: 'late_half_evidence', header: 'late_half_evidence' },
        { key: 'rating', header: 'rating' },
        { key: 'manager_achievements', header: 'manager_achievements' },
        { key: 'manager_development', header: 'manager_development' },
        { key: 'manager_next_steps', header: 'manager_next_steps' },
        { key: 'self_achievements', header: 'self_achievements' },
        { key: 'self_challenges', header: 'self_challenges' },
        { key: 'self_growth', header: 'self_growth' },
        { key: 'self_support', header: 'self_support' },
      ];
      const rows = (state.reviews || []).map((r) => {
        const evidence = r.status === 'complete' && Array.isArray(r.evidence) && r.evidence.length
          ? r.evidence
          : buildReviewEvidence(state, r.personId, r.periodStart, r.periodEnd);
        const summary = summarizeReviewEvidence(evidence, r.periodStart, r.periodEnd);
        return {
          review_id: r.id,
          period_start: r.periodStart,
          period_end: r.periodEnd,
          person_id: r.personId,
          person_name: nameOf(r.personId),
          status: r.status,
          updated_on: (r.updatedAt || '').slice(0, 10) || null,
          completed_on: r.completedAt ? r.completedAt.slice(0, 10) : null,
          evidence_items: summary.total,
          dated_evidence: summary.dated,
          source_types: summary.sourceTypes,
          early_half_evidence: summary.early,
          late_half_evidence: summary.late,
          rating: r.manager?.rating || null,
          manager_achievements: r.manager?.achievements || '',
          manager_development: r.manager?.development || '',
          manager_next_steps: r.manager?.nextSteps || '',
          self_achievements: r.selfReflection?.achievements || '',
          self_challenges: r.selfReflection?.challenges || '',
          self_growth: r.selfReflection?.growth || '',
          self_support: r.selfReflection?.support || '',
        };
      });
      return { columns, rows };
    }

    case 'pulseSummary': {
      const columns = [
        { key: 'week_start', header: 'week_start' },
        { key: 'week_end', header: 'week_end' },
        { key: 'responses_total', header: 'responses_total' },
        { key: 'usable_responses', header: 'usable_responses' },
        { key: 'incomplete_responses', header: 'incomplete_responses' },
        { key: 'min_required', header: 'min_required' },
        { key: 'privacy_status', header: 'privacy_status' },
        { key: 'blocked_reason', header: 'blocked_reason' },
        { key: 'overall_avg', header: 'overall_avg' },
        { key: 'safety_avg', header: 'safety_avg' },
        { key: 'clarity_avg', header: 'clarity_avg' },
        { key: 'workload_avg', header: 'workload_avg' },
        { key: 'growth_avg', header: 'growth_avg' },
        { key: 'comments_status', header: 'comments_status' },
        { key: 'released_comments', header: 'released_comments' },
      ];
      const pulseDates = (state.pulses || [])
        .map((p) => p.date)
        .filter((d) => d && d <= today)
        .sort();
      const rows = [];
      if (pulseDates.length > 0) {
        const firstWeek = weekStart(pulseDates[0]);
        const currentWeek = weekStart(today);
        for (let wk = firstWeek; wk <= currentWeek; wk = addDays(wk, 7)) {
          const wkEnd = addDays(wk, 6);
          const effectiveEnd = wkEnd > today ? today : wkEnd;
          const windowDays = wkEnd > today
            ? Math.max(1, Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${wk}T00:00:00Z`)) / 86400000) + 1)
            : 7;
          const agg = aggregate(state, effectiveEnd, { windowDays });
          if (agg.n === 0) continue;
          const released = agg.blocked ? [] : comments(state, effectiveEnd, windowDays);
          const rawCommentCount = (state.pulses || []).filter(
            (p) => p.date >= wk && p.date <= effectiveEnd && (p.comment || '').trim().length > 0,
          ).length;
          const commentsStatus = rawCommentCount === 0
            ? 'none'
            : released.length > 0
              ? 'released'
              : 'suppressed';
          rows.push({
            week_start: wk,
            week_end: effectiveEnd,
            responses_total: agg.n,
            usable_responses: agg.usableResponses,
            incomplete_responses: agg.incompleteResponses,
            min_required: agg.minRequired,
            privacy_status: agg.blocked ? 'suppressed' : 'released',
            blocked_reason: agg.blockedReason,
            overall_avg: agg.blocked ? null : agg.overall,
            safety_avg: agg.blocked ? null : agg.dimensions.safety.avg,
            clarity_avg: agg.blocked ? null : agg.dimensions.clarity.avg,
            workload_avg: agg.blocked ? null : agg.dimensions.workload.avg,
            growth_avg: agg.blocked ? null : agg.dimensions.growth.avg,
            comments_status: commentsStatus,
            released_comments: released.length ? released.map((c) => c.comment).join(' | ') : null,
          });
        }
      }
      return { columns, rows };
    }

    case 'healthTrends': {
      const columns = [
        { key: 'period_start', header: 'period_start' },
        { key: 'period_end', header: 'period_end' },
        { key: 'status', header: 'status' },
        { key: 'overall_score', header: 'overall_score' },
        { key: 'coverage', header: 'coverage' },
        { key: 'fidelity', header: 'fidelity' },
        { key: 'cadence_score', header: 'cadence_score' },
        { key: 'feedback_score', header: 'feedback_score' },
        { key: 'clarity_score', header: 'clarity_score' },
        { key: 'growth_score', header: 'growth_score' },
        { key: 'wellbeing_score', header: 'wellbeing_score' },
        { key: 'wellbeing_status', header: 'wellbeing_status' },
        { key: 'feedback_latency_avg_days', header: 'feedback_latency_avg_days' },
        { key: 'feedback_latency_samples', header: 'feedback_latency_samples' },
        { key: 'delegation_follow_through_pct', header: 'delegation_follow_through_pct' },
        { key: 'delegation_evaluated', header: 'delegation_evaluated' },
      ];
      const trends = buildTeamTrends(state, now, { horizon: '12w' });
      const rows = trends.points.map((pt, idx) => {
        const lat = trends.latency.points[idx];
        const del = trends.delegations.points[idx];
        return {
          period_start: pt.periodStart,
          period_end: pt.periodEnd,
          status: pt.status,
          overall_score: pt.overall,
          coverage: pt.status === 'measured' ? pt.coverage : null,
          fidelity: pt.fidelity,
          cadence_score: pt.dimensions.cadence.score,
          feedback_score: pt.dimensions.feedback.score,
          clarity_score: pt.dimensions.clarity.score,
          growth_score: pt.dimensions.growth.score,
          wellbeing_score: pt.dimensions.wellbeing.score,
          wellbeing_status: pt.dimensions.wellbeing.status,
          feedback_latency_avg_days: lat.averageDays,
          feedback_latency_samples: lat.measured,
          delegation_follow_through_pct: del.followThroughPct,
          delegation_evaluated: del.evaluated,
        };
      });
      return { columns, rows };
    }

    case 'cases': {
      const columns = [
        { key: 'case_id', header: 'case_id' },
        { key: 'kind', header: 'kind' },
        { key: 'status', header: 'status' },
        { key: 'title', header: 'title' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'linked_goal', header: 'linked_goal' },
        { key: 'opened_on', header: 'opened_on' },
        { key: 'review_on', header: 'review_on' },
        { key: 'resolved_on', header: 'resolved_on' },
        { key: 'fmea_severity', header: 'fmea_severity' },
        { key: 'fmea_probability', header: 'fmea_probability' },
        { key: 'fmea_detectability', header: 'fmea_detectability' },
        { key: 'fmea_rpn', header: 'fmea_rpn' },
        { key: 'fmea_action_priority', header: 'fmea_action_priority' },
        { key: 'fmea_residual_rpn', header: 'fmea_residual_rpn' },
        { key: 'pert_currency', header: 'pert_currency' },
        { key: 'pert_cost_expected', header: 'pert_cost_expected' },
        { key: 'pert_cost_p10', header: 'pert_cost_p10' },
        { key: 'pert_cost_p90', header: 'pert_cost_p90' },
        { key: 'expected_unmitigated_loss', header: 'expected_unmitigated_loss' },
        { key: 'mitigation_cost', header: 'mitigation_cost' },
        { key: 'net_risk_adjusted_value', header: 'net_risk_adjusted_value' },
        { key: 'mitigation_roi', header: 'mitigation_roi' },
        { key: 'pert_capacity_days_expected', header: 'pert_capacity_days_expected' },
        { key: 'opportunity_cost', header: 'opportunity_cost' },
        { key: 'root_cause', header: 'root_cause' },
        { key: 'systemic_barrier', header: 'systemic_barrier' },
        { key: 'preventive_action', header: 'preventive_action' },
        { key: 'stakeholder_count', header: 'stakeholder_count' },
        { key: 'coalition_net_power', header: 'coalition_net_power' },
        { key: 'linked_records_count', header: 'linked_records_count' },
        { key: 'actuals_materialised', header: 'actuals_materialised' },
        { key: 'actual_realised_exposure', header: 'actual_realised_exposure' },
        { key: 'actual_mitigation_spend', header: 'actual_mitigation_spend' },
        { key: 'actual_diverted_days', header: 'actual_diverted_days' },
        { key: 'exposure_ratio', header: 'exposure_ratio' },
        { key: 'spend_ratio', header: 'spend_ratio' },
        { key: 'diverted_days_ratio', header: 'diverted_days_ratio' },
        { key: 'occurrence_brier', header: 'occurrence_brier' },
        { key: 'forecast_source', header: 'forecast_source' },
        { key: 'settled_on', header: 'settled_on' },
      ];
      const scoredByCase = new Map(caseCostPairs(state).map((p) => [p.caseId, p]));
      const rows = (state.cases || []).map((c) => {
        const s = summarizeCase(c, state, now);
        const pair = scoredByCase.get(c.id) || null;
        return {
          case_id: c.id,
          kind: c.kind,
          status: c.status,
          title: c.title,
          owner_name: s.owner ? s.owner.name : null,
          linked_goal: s.linkedGoal ? s.linkedGoal.title : null,
          opened_on: c.openedOn,
          review_on: c.reviewOn,
          resolved_on: c.resolvedOn,
          fmea_severity: s.fmea.severity,
          fmea_probability: s.fmea.probability,
          fmea_detectability: s.fmea.detectability,
          fmea_rpn: s.fmea.rpn,
          fmea_action_priority: s.fmea.actionPriority,
          fmea_residual_rpn: s.fmea.residualRpn,
          pert_currency: s.pert.hasFinancialEstimate ? s.pert.currency : null,
          pert_cost_expected: s.pert.hasFinancialEstimate ? s.pert.cost.expected : null,
          pert_cost_p10: s.pert.hasFinancialEstimate ? s.pert.cost.p10 : null,
          pert_cost_p90: s.pert.hasFinancialEstimate ? s.pert.cost.p90 : null,
          expected_unmitigated_loss: s.pert.hasFinancialEstimate ? s.pert.expectedUnmitigatedLoss : null,
          mitigation_cost: s.pert.mitigationCost > 0 ? s.pert.mitigationCost : null,
          net_risk_adjusted_value: s.pert.hasFinancialEstimate ? s.pert.netRiskAdjustedValue : null,
          mitigation_roi: s.pert.mitigationRoi,
          pert_capacity_days_expected: s.pert.hasCapacityEstimate ? s.pert.capacity.expected : null,
          opportunity_cost: s.pert.opportunityCost || null,
          root_cause: s.rca.rootCause || null,
          systemic_barrier: s.rca.systemicBarrier || null,
          preventive_action: s.rca.preventiveAction || null,
          stakeholder_count: s.coalition.total,
          coalition_net_power: s.coalition.total > 0 ? s.coalition.netPowerBalance : null,
          linked_records_count: s.links.length,
          actuals_materialised: pair ? (pair.materialised === null ? null : pair.materialised ? 'yes' : 'no') : null,
          actual_realised_exposure: pair ? pair.realisedExposure : null,
          actual_mitigation_spend: pair ? pair.mitigationSpend : null,
          actual_diverted_days: pair ? pair.divertedDays : null,
          exposure_ratio: pair ? pair.exposureRatio : null,
          spend_ratio: pair ? pair.spendRatio : null,
          diverted_days_ratio: pair ? pair.daysRatio : null,
          occurrence_brier: pair ? pair.occurrenceBrier : null,
          forecast_source: pair ? pair.source : null,
          settled_on: pair ? pair.settledOn : null,
        };
      });
      return { columns, rows };
    }

    case 'portfolio': {
      const columns = [
        { key: 'item_id', header: 'item_id' },
        { key: 'title', header: 'title' },
        { key: 'kind', header: 'kind' },
        { key: 'status', header: 'status' },
        { key: 'decision', header: 'decision' },
        { key: 'decision_on', header: 'decision_on' },
        { key: 'rationale', header: 'rationale' },
        { key: 'source_type', header: 'source_type' },
        { key: 'source_id', header: 'source_id' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'effort_days_optimistic', header: 'effort_days_optimistic' },
        { key: 'effort_days_most_likely', header: 'effort_days_most_likely' },
        { key: 'effort_days_pessimistic', header: 'effort_days_pessimistic' },
        { key: 'effort_days_pert_expected', header: 'effort_days_pert_expected' },
        { key: 'value_currency', header: 'value_currency' },
        { key: 'value_optimistic', header: 'value_optimistic' },
        { key: 'value_most_likely', header: 'value_most_likely' },
        { key: 'value_pessimistic', header: 'value_pessimistic' },
        { key: 'value_pert_expected', header: 'value_pert_expected' },
        { key: 'value_density_per_person_day', header: 'value_density_per_person_day' },
        { key: 'created_on', header: 'created_on' },
        { key: 'target_on', header: 'target_on' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'released_on', header: 'released_on' },
      ];
      const rows = (state.portfolio || []).map((item) => {
        const effort = pertTriple(item.effortDays);
        const value = pertTriple(item.value);
        return {
          item_id: item.id,
          title: item.title,
          kind: item.kind,
          status: item.status,
          decision: PORTFOLIO_DECISION_LABELS[item.decision] || item.decision,
          decision_on: item.decisionOn,
          rationale: item.rationale,
          source_type: item.sourceType,
          source_id: item.sourceId,
          owner_name: item.ownerId ? nameOf(item.ownerId) : null,
          effort_days_optimistic: effort.optimistic,
          effort_days_most_likely: effort.mostLikely,
          effort_days_pessimistic: effort.pessimistic,
          effort_days_pert_expected: effort.expected,
          value_currency: value.measured ? item.currency : null,
          value_optimistic: value.measured ? value.optimistic : null,
          value_most_likely: value.measured ? value.mostLikely : null,
          value_pessimistic: value.measured ? value.pessimistic : null,
          value_pert_expected: value.measured ? value.expected : null,
          value_density_per_person_day: value.measured && effort.expected > 0
            ? Math.round((value.expected / effort.expected) * 100) / 100
            : null,
          created_on: item.createdOn,
          target_on: item.targetOn,
          completed_on: item.completedOn,
          released_on: item.releasedOn,
        };
      });
      return { columns, rows };
    }


    case 'hiring': {
      const columns = [
        { key: 'record_type', header: 'record_type' },
        { key: 'requisition_id', header: 'requisition_id' },
        { key: 'role', header: 'role' },
        { key: 'status', header: 'status' },
        { key: 'reason', header: 'reason' },
        { key: 'opened_on', header: 'opened_on' },
        { key: 'target_start_on', header: 'target_start_on' },
        { key: 'closed_on', header: 'closed_on' },
        { key: 'competencies', header: 'competencies' },
        { key: 'interview_effort_most_likely_days', header: 'interview_effort_most_likely_days' },
        { key: 'daily_vacancy_cost', header: 'daily_vacancy_cost' },
        { key: 'candidate_id', header: 'candidate_id' },
        { key: 'candidate_name', header: 'candidate_name' },
        { key: 'candidate_stage', header: 'candidate_stage' },
        { key: 'applied_on', header: 'applied_on' },
        { key: 'evidence_count', header: 'evidence_count' },
        { key: 'evidence_kinds', header: 'evidence_kinds' },
        { key: 'evidence_weight', header: 'evidence_weight' },
        { key: 'competency_coverage_pct', header: 'competency_coverage_pct' },
        { key: 'decision_outcome', header: 'decision_outcome' },
        { key: 'decided_on', header: 'decided_on' },
        { key: 'decision_rationale', header: 'decision_rationale' },
        { key: 'evidence_gap_acknowledged', header: 'evidence_gap_acknowledged' },
        { key: 'start_on', header: 'start_on' },
        { key: 'hired_person', header: 'hired_person' },
      ];
      const rows = [];
      // Index once: `filter` inside the requisition loop is O(roles × candidates).
      const candidatesByReq = new Map();
      for (const candidate of state.candidates || []) {
        if (!candidate) continue;
        const bucket = candidatesByReq.get(candidate.reqId);
        if (bucket) bucket.push(candidate);
        else candidatesByReq.set(candidate.reqId, [candidate]);
      }
      for (const req of state.requisitions || []) {
        const base = {
          requisition_id: req.id,
          role: req.title,
          status: REQUISITION_STATUS_LABELS[req.status] || req.status,
          reason: REQUISITION_REASON_LABELS[req.reason] || req.reason,
          opened_on: req.openedOn,
          target_start_on: req.targetStartOn,
          closed_on: req.closedOn,
          competencies: (req.competencies || []).map((c) => `${c.name} (w${c.weight}${c.required ? '' : ', optional'})`).join('; '),
          interview_effort_most_likely_days: req.effortDays?.mostLikely ?? null,
          daily_vacancy_cost: req.dailyVacancyCost ?? null,
        };
        rows.push({ ...base, record_type: 'requisition' });
        for (const candidate of candidatesByReq.get(req.id) || []) {
          // Assessed without a prior override: the export states the raw
          // evidence weight, which is a fact about the record, not a verdict.
          const assessment = assessCandidate(candidate, req, { prior: state.settings?.hiringBaseRate });
          rows.push({
            ...base,
            record_type: 'candidate',
            candidate_id: candidate.id,
            candidate_name: candidate.name,
            candidate_stage: CANDIDATE_STAGE_LABELS[candidate.stage] || candidate.stage,
            applied_on: candidate.appliedOn,
            evidence_count: candidate.signals.length,
            evidence_kinds: [...new Set(candidate.signals.map((sig) => sig.kind))].join('; '),
            evidence_weight: Math.round(assessment.audit.totalWeight * 100) / 100,
            competency_coverage_pct: assessment.coverage.pct,
            decision_outcome: candidate.decision?.outcome || 'pending',
            decided_on: candidate.decision?.decidedOn || null,
            decision_rationale: candidate.decision?.rationale || '',
            evidence_gap_acknowledged: candidate.decision?.evidenceGapAcknowledged === true,
            start_on: candidate.startOn,
            hired_person: candidate.personId ? nameOf(candidate.personId) : null,
          });
        }
      }
      return { columns, rows };
    }

    case 'caseLinks': {
      const columns = [
        { key: 'link_id', header: 'link_id' },
        { key: 'source_type', header: 'source_type' },
        { key: 'source_id', header: 'source_id' },
        { key: 'source_title', header: 'source_title' },
        { key: 'relation', header: 'relation' },
        { key: 'target_type', header: 'target_type' },
        { key: 'target_id', header: 'target_id' },
        { key: 'target_title', header: 'target_title' },
        { key: 'rule_id', header: 'rule_id' },
        { key: 'created_on', header: 'created_on' },
        { key: 'summary', header: 'summary' },
      ];
      const rows = (state.links || [])
        .filter((l) => l && !FORBIDDEN_LINK_TYPES.includes(l.sourceType) && !FORBIDDEN_LINK_TYPES.includes(l.targetType))
        .map((l) => {
          const src = resolveLinkedEntity(state, l.sourceType, l.sourceId);
          const dst = resolveLinkedEntity(state, l.targetType, l.targetId);
          if (!src || !dst) return null;
          return {
            link_id: l.id,
            source_type: l.sourceType,
            source_id: l.sourceId,
            source_title: src.title,
            relation: l.relation,
            target_type: l.targetType,
            target_id: l.targetId,
            target_title: dst.title,
            rule_id: l.ruleId || null,
            created_on: l.createdOn || null,
            summary: l.summary || null,
          };
        })
        .filter(Boolean);
      return { columns, rows };
    }

    case 'conflicts': {
      const columns = [
        { key: 'conflict_id', header: 'conflict_id' },
        { key: 'title', header: 'title' },
        { key: 'opened_on', header: 'opened_on' },
        { key: 'updated_on', header: 'updated_on' },
        { key: 'status', header: 'status' },
        { key: 'safety', header: 'safety' },
        { key: 'coordinator', header: 'coordinator' },
        { key: 'participants', header: 'participants' },
        { key: 'summary', header: 'summary' },
        { key: 'process', header: 'process' },
        { key: 'sharing_boundary', header: 'sharing_boundary' },
        { key: 'agreements_count', header: 'agreements_count' },
        { key: 'commitments_total', header: 'commitments_total' },
        { key: 'commitments_completed', header: 'commitments_completed' },
        { key: 'next_follow_up_on', header: 'next_follow_up_on' },
        { key: 'latest_follow_up_outcome', header: 'latest_follow_up_outcome' },
      ];
      const rows = (state.conflicts || []).map((c) => {
        const agreements = c.agreements || [];
        const allCommitments = agreements.flatMap((a) => a.actions || []);
        const followUps = (c.followUps || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const latestFollowUp = followUps.length ? followUps[followUps.length - 1] : null;
        return {
          conflict_id: c.id,
          title: c.title,
          opened_on: c.openedOn,
          updated_on: (c.updatedAt || '').slice(0, 10) || null,
          status: c.status,
          safety: c.safety,
          coordinator: c.coordinator,
          participants: (c.participants || []).map((p) => `${p.name} (${p.participation})`).join('; '),
          summary: c.summary,
          process: c.process,
          sharing_boundary: c.sharing,
          agreements_count: agreements.length,
          commitments_total: allCommitments.length,
          commitments_completed: allCommitments.filter((act) => Boolean(act.completedOn)).length,
          next_follow_up_on: c.nextFollowUpOn,
          latest_follow_up_outcome: latestFollowUp ? latestFollowUp.outcome : null,
        };
      });
      return { columns, rows };
    }

    case 'changes': {
      const columns = [
        { key: 'change_id', header: 'change_id' },
        { key: 'title', header: 'title' },
        { key: 'kind', header: 'kind' },
        { key: 'status', header: 'status' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'opened_on', header: 'opened_on' },
        { key: 'target_on', header: 'target_on' },
        { key: 'review_on', header: 'review_on' },
        { key: 'anchored_on', header: 'anchored_on' },
        { key: 'reversibility', header: 'reversibility' },
        { key: 'kotter_stage', header: 'kotter_stage' },
        { key: 'kotter_progress_pct', header: 'kotter_progress_pct' },
        { key: 'kotter_skipped_steps', header: 'kotter_skipped_steps' },
        { key: 'current_topology', header: 'current_topology' },
        { key: 'target_topology', header: 'target_topology' },
        { key: 'interaction_mode', header: 'interaction_mode' },
        { key: 'cognitive_load_total', header: 'cognitive_load_total' },
        { key: 'blocking_handoffs_delta', header: 'blocking_handoffs_delta' },
        { key: 'driving_forces_sum', header: 'driving_forces_sum' },
        { key: 'restraining_forces_effective', header: 'restraining_forces_effective' },
        { key: 'force_field_equilibrium', header: 'force_field_equilibrium' },
        { key: 'star_aligned_points', header: 'star_aligned_points' },
        { key: 'veto_players_aligned', header: 'veto_players_aligned' },
        { key: 'effort_pert_expected_days', header: 'effort_pert_expected_days' },
        { key: 'risk_adjusted_roi_pct', header: 'risk_adjusted_roi_pct' },
        { key: 'verified_xmr_shifts', header: 'verified_xmr_shifts' },
        { key: 'impacted_people', header: 'impacted_people' },
        { key: 'vision', header: 'vision' },
        { key: 'non_goals', header: 'non_goals' },
      ];
      const rows = (state.changes || []).map((c) => {
        const s = summarizeChange(c, state, now);
        return {
          change_id: c.id,
          title: c.title,
          kind: CHANGE_KIND_LABELS[c.kind] || c.kind,
          status: CHANGE_STATUS_LABELS[c.status] || c.status,
          owner_name: nameOf(c.ownerId) || null,
          opened_on: c.openedOn,
          target_on: c.targetOn,
          review_on: c.reviewOn,
          anchored_on: c.anchoredOn,
          reversibility: c.reversibility,
          kotter_stage: s.kotter.currentMeta.label,
          kotter_progress_pct: Math.round((s.kotter.completedCount / 8) * 100),
          kotter_skipped_steps: s.kotter.skippedSteps.map((x) => x.label).join('; ') || null,
          current_topology: s.topology.currentTypeLabel,
          target_topology: s.topology.targetTypeLabel,
          interaction_mode: s.topology.interactionModeLabel,
          cognitive_load_total: s.topology.cognitiveLoadTarget,
          blocking_handoffs_delta: s.topology.handoffsDelta,
          driving_forces_sum: s.forceField.drivingSum,
          restraining_forces_effective: s.forceField.effectiveRestrainingSum,
          force_field_equilibrium: s.forceField.equilibrium,
          star_aligned_points: s.star.alignedCount,
          veto_players_aligned: s.coalition.vetoPlayers.length
            ? `${s.coalition.vetoPlayers.length - s.coalition.unalignedVetoPlayers.length}/${s.coalition.vetoPlayers.length}`
            : null,
          effort_pert_expected_days: s.economics.effort.measured ? s.economics.effort.expected : null,
          risk_adjusted_roi_pct: s.economics.riskAdjustedNetBenefit,
          verified_xmr_shifts: s.metrics.verifiedShiftCount,
          impacted_people: (c.impacts || []).map((i) => nameOf(i.personId)).filter(Boolean).join('; ') || null,
          vision: c.vision || null,
          non_goals: c.nonGoals || null,
        };
      });
      return { columns, rows };
    }

    case 'negotiations': {
      const columns = [
        { key: 'negotiation_id', header: 'negotiation_id' },
        { key: 'kind', header: 'kind' },
        { key: 'status', header: 'status' },
        { key: 'title', header: 'title' },
        { key: 'counterparty', header: 'counterparty' },
        { key: 'counterparty_role', header: 'counterparty_role' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'linked_goal', header: 'linked_goal' },
        { key: 'source_type', header: 'source_type' },
        { key: 'opened_on', header: 'opened_on' },
        { key: 'next_session_on', header: 'next_session_on' },
        { key: 'review_on', header: 'review_on' },
        { key: 'closed_on', header: 'closed_on' },
        { key: 'strategic', header: 'strategic' },
        { key: 'stakes_currency', header: 'stakes_currency' },
        { key: 'stakes_value', header: 'stakes_value' },
        { key: 'batna_description', header: 'batna_description' },
        { key: 'batna_value', header: 'batna_value' },
        { key: 'counterparty_batna_estimate', header: 'counterparty_batna_estimate' },
        { key: 'issue_count', header: 'issue_count' },
        { key: 'zopa_issue_count', header: 'zopa_issue_count' },
        { key: 'no_zopa_issue_count', header: 'no_zopa_issue_count' },
        { key: 'incomplete_issue_count', header: 'incomplete_issue_count' },
        { key: 'weighted_zopa_coverage_pct', header: 'weighted_zopa_coverage_pct' },
        { key: 'prep_completeness_pct', header: 'prep_completeness_pct' },
        { key: 'prep_blockers', header: 'prep_blockers' },
        { key: 'our_interests', header: 'our_interests' },
        { key: 'their_interests', header: 'their_interests' },
        { key: 'objective_criteria', header: 'objective_criteria' },
        { key: 'package_options', header: 'package_options' },
        { key: 'agreed_terms_count', header: 'agreed_terms_count' },
        { key: 'owned_terms_count', header: 'owned_terms_count' },
        { key: 'unowned_terms_count', header: 'unowned_terms_count' },
        { key: 'returned_terms_count', header: 'returned_terms_count' },
        { key: 'recovered_terms_count', header: 'recovered_terms_count' },
        { key: 'settled_on', header: 'settled_on' },
        { key: 'realised_value', header: 'realised_value' },
        { key: 'realisation_ratio', header: 'realisation_ratio' },
        { key: 'counterparty_delivered', header: 'counterparty_delivered' },
        { key: 'batna_breached', header: 'batna_breached' },
        { key: 'settlement_note', header: 'settlement_note' },
        { key: 'escalation_case_id', header: 'escalation_case_id' },
        { key: 'linked_records_count', header: 'linked_records_count' },
      ];
      const nameOf = (personId) => (state.people || []).find((p) => p.id === personId)?.name || null;
      const rows = (state.negotiations || []).map((n) => {
        const s = summarizeNegotiation(n, state, now);
        const terms = n.agreedTerms || [];
        const se = s.settlementEvaluation;
        return {
          negotiation_id: n.id,
          kind: n.kind,
          status: n.status,
          title: n.title,
          counterparty: n.counterparty || null,
          counterparty_role: n.counterpartyRole || null,
          owner_name: n.ownerId ? nameOf(n.ownerId) : null,
          linked_goal: s.links.some((l) => l.peer.type === 'goal')
            ? (state.goals || []).find((g) => g.id === n.linkedGoalId)?.title || null
            : null,
          source_type: n.sourceType || null,
          opened_on: n.openedOn,
          next_session_on: n.nextSessionOn,
          review_on: n.reviewOn,
          closed_on: n.closedOn,
          strategic: n.strategic ? 'yes' : 'no',
          stakes_currency: n.stakesValue !== null ? n.stakesCurrency : null,
          stakes_value: n.stakesValue,
          batna_description: n.ourBatnaDescription || null,
          batna_value: n.ourBatnaValue,
          counterparty_batna_estimate: n.theirBatnaEstimate || null,
          issue_count: s.analyses.length,
          zopa_issue_count: s.analyses.filter((a) => a.status === 'zopa').length,
          no_zopa_issue_count: s.blockingGaps.length,
          incomplete_issue_count: s.incompleteIssues.length,
          weighted_zopa_coverage_pct: s.zopaCoveragePct,
          prep_completeness_pct: s.prep.completenessPct,
          prep_blockers: s.prep.blockers.join('; ') || null,
          our_interests: (n.ourInterests || []).join('; ') || null,
          their_interests: (n.theirInterests || []).join('; ') || null,
          objective_criteria: (n.objectiveCriteria || []).join('; ') || null,
          package_options: (n.options || []).join('; ') || null,
          agreed_terms_count: terms.length,
          owned_terms_count: terms.filter((t) => t.ownerId).length,
          unowned_terms_count: terms.filter((t) => !t.ownerId).length,
          returned_terms_count: s.delivery?.returned ?? 0,
          recovered_terms_count: s.delivery?.recovered ?? 0,
          settled_on: se?.settledOn || null,
          realised_value: se?.realisedValue ?? null,
          realisation_ratio: se?.realisationRatio ?? null,
          counterparty_delivered: se?.counterpartyDelivered === true ? 'yes' : se?.counterpartyDelivered === false ? 'no' : null,
          batna_breached: se?.settled ? (se.batnaBreached ? 'yes' : 'no') : null,
          settlement_note: se?.note || null,
          escalation_case_id: n.escalationCaseId,
          linked_records_count: s.links.length,
        };
      });
      return { columns, rows };
    }

    case 'sensitivity': {
      const columns = [
        { key: 'record_type', header: 'record_type' },
        { key: 'id', header: 'id' },
        { key: 'label', header: 'label' },
        { key: 'category', header: 'category' },
        { key: 'pareto_optimal', header: 'pareto_optimal' },
        { key: 'brooks_law_trap', header: 'brooks_law_trap' },
        { key: 'overload_probability_pct', header: 'overload_probability_pct' },
        { key: 'delta_overload_pct_pts', header: 'delta_overload_pct_pts' },
        { key: 'effective_p80_days', header: 'effective_p80_days' },
        { key: 'delta_p80_days', header: 'delta_p80_days' },
        { key: 'p80_swing_days', header: 'p80_swing_days' },
        { key: 'overload_swing_pct_pts', header: 'overload_swing_pct_pts' },
        { key: 'net_risk_adjusted_value', header: 'net_risk_adjusted_value' },
        { key: 'delta_net_value', header: 'delta_net_value' },
        { key: 'currency', header: 'currency' },
        { key: 'favorable_case', header: 'favorable_case' },
        { key: 'adverse_case', header: 'adverse_case' },
        { key: 'seed', header: 'seed' },
        { key: 'trials', header: 'trials' },
      ];
      const fastTrials = (state.portfolio || []).length > 60 ? 200 : 400;
      const presets = buildSuggestedScenarios(state, { now }).slice(0, (state.portfolio || []).length > 60 ? 2 : 5);
      const cmp = compareScenarios(state, presets, { now, trials: fastTrials });
      const tornado = computeSensitivityTornado(state, { now, trials: fastTrials, maxItems: (state.portfolio || []).length > 60 ? 3 : 5 });

      const rows = [];
      for (const s of cmp.scenarios) {
        rows.push({
          record_type: s.isBaseline ? 'baseline' : 'scenario',
          id: s.id,
          label: s.name,
          category: s.category,
          pareto_optimal: s.paretoOptimal,
          brooks_law_trap: s.brooksLawTrap,
          overload_probability_pct: Math.round((s.monteCarlo.overloadProbability ?? 0) * 100),
          delta_overload_pct_pts: Math.round((s.deltas.overloadProbability ?? 0) * 100),
          effective_p80_days: s.monteCarlo.effectiveP80Days,
          delta_p80_days: s.deltas.effectiveP80Days,
          p80_swing_days: null,
          overload_swing_pct_pts: null,
          net_risk_adjusted_value: s.economics.measured ? s.economics.netRiskAdjustedValue : null,
          delta_net_value: s.economics.measured ? s.deltas.netRiskAdjustedValue : null,
          currency: s.economics.currency,
          favorable_case: null,
          adverse_case: s.appliedLevers.map((l) => l.summary).join('; ') || null,
          seed: cmp.seed,
          trials: cmp.trials,
        });
      }
      if (tornado.available) {
        for (const b of tornado.bars) {
          rows.push({
            record_type: 'sensitivity_driver',
            id: b.id,
            label: b.label,
            category: b.category,
            pareto_optimal: null,
            brooks_law_trap: null,
            overload_probability_pct: Math.round((b.baselineOverloadProb ?? 0) * 100),
            delta_overload_pct_pts: null,
            effective_p80_days: b.baselineP80Days,
            delta_p80_days: null,
            p80_swing_days: b.p80SwingDays,
            overload_swing_pct_pts: b.overloadSwingPct,
            net_risk_adjusted_value: null,
            delta_net_value: b.valueSwing,
            currency: tornado.currency,
            favorable_case: `${b.favorableLabel} (${b.deltaFavorableP80Days <= 0 ? '' : '+'}${b.deltaFavorableP80Days}d P80)`,
            adverse_case: `${b.adverseLabel} (${b.deltaAdverseP80Days <= 0 ? '' : '+'}${b.deltaAdverseP80Days}d P80)`,
            seed: tornado.seed,
            trials: tornado.trials,
          });
        }
      }
      return { columns, rows };
    }

    case 'finance': {
      // One row per commitment line, envelope figures repeated from the same
      // evaluated snapshot. Budgets with no lines still export one row so an
      // empty envelope is visible rather than silently absent. Every amount
      // stays in its own envelope currency — rows are never summed in-file.
      const columns = [
        { key: 'budget_id', header: 'budget_id' },
        { key: 'budget_name', header: 'budget_name' },
        { key: 'budget_status', header: 'budget_status' },
        { key: 'currency', header: 'currency' },
        { key: 'ceiling', header: 'ceiling' },
        { key: 'period_label', header: 'period_label' },
        { key: 'period_starts_on', header: 'period_starts_on' },
        { key: 'period_ends_on', header: 'period_ends_on' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'spent_recorded_actuals', header: 'spent_recorded_actuals' },
        { key: 'committed_open', header: 'committed_open' },
        { key: 'planned_pipeline', header: 'planned_pipeline' },
        { key: 'forecast_at_completion', header: 'forecast_at_completion' },
        { key: 'forecast_utilisation_pct', header: 'forecast_utilisation_pct' },
        { key: 'remaining_vs_ceiling', header: 'remaining_vs_ceiling' },
        { key: 'forecast_state', header: 'forecast_state' },
        { key: 'line_id', header: 'line_id' },
        { key: 'line_title', header: 'line_title' },
        { key: 'line_category', header: 'line_category' },
        { key: 'line_status', header: 'line_status' },
        { key: 'committed_amount', header: 'committed_amount' },
        { key: 'actual_amount', header: 'actual_amount' },
        { key: 'actual_vs_committed_ratio', header: 'actual_vs_committed_ratio' },
        { key: 'committed_on', header: 'committed_on' },
        { key: 'expected_on', header: 'expected_on' },
        { key: 'spent_on', header: 'spent_on' },
        { key: 'released_on', header: 'released_on' },
        { key: 'actuals_due_on', header: 'actuals_due_on' },
        { key: 'funds_type', header: 'funds_type' },
        { key: 'funds_title', header: 'funds_title' },
        { key: 'line_owner_name', header: 'line_owner_name' },
        { key: 'line_note', header: 'line_note' },
      ];
      const rows = [];
      for (const budget of state.budgets || []) {
        const ev = evaluateBudget(budget, now, { watchPct: state.settings?.budgetWatchPct });
        const base = {
          budget_id: budget.id,
          budget_name: budget.name,
          budget_status: budget.status,
          currency: budget.currency,
          ceiling: ev.limit,
          period_label: budget.periodLabel || null,
          period_starts_on: budget.startsOn,
          period_ends_on: budget.endsOn,
          owner_name: budget.ownerId ? nameOf(budget.ownerId) || null : null,
          spent_recorded_actuals: ev.spentKnown,
          committed_open: ev.committedOpen,
          planned_pipeline: ev.plannedPipeline,
          forecast_at_completion: ev.forecastAtCompletion,
          forecast_utilisation_pct: ev.forecastUtilisation === null ? null : Math.round(ev.forecastUtilisation * 100),
          remaining_vs_ceiling: ev.remainingVsLimit,
          forecast_state: ev.breach ? 'breach' : ev.watch ? 'watch' : ev.pipelineBreach ? 'pipeline-breach' : ev.hasLimit ? 'within-ceiling' : 'tracking-only',
        };
        const lines = budget.lines || [];
        if (!lines.length) {
          rows.push({ ...base, line_id: null, line_title: null, line_category: null, line_status: null, committed_amount: null, actual_amount: null, actual_vs_committed_ratio: null, committed_on: null, expected_on: null, spent_on: null, released_on: null, actuals_due_on: null, funds_type: null, funds_title: null, line_owner_name: null, line_note: null });
          continue;
        }
        for (const line of lines) {
          const src = line.sourceType && line.sourceId ? resolveLinkedEntity(state, line.sourceType, line.sourceId) : null;
          rows.push({
            ...base,
            line_id: line.id,
            line_title: line.title,
            line_category: line.category,
            line_status: line.status,
            committed_amount: line.committedAmount,
            actual_amount: line.actualAmount,
            actual_vs_committed_ratio: line.status === 'spent' && line.committedAmount > 0 && line.actualAmount !== null
              ? Math.round((line.actualAmount / line.committedAmount) * 100) / 100
              : null,
            committed_on: line.committedOn,
            expected_on: line.expectedOn,
            spent_on: line.spentOn,
            released_on: line.releasedOn,
            actuals_due_on: line.actualsDueOn,
            funds_type: line.sourceType,
            funds_title: src?.title || null,
            line_owner_name: line.ownerId ? nameOf(line.ownerId) || null : null,
            line_note: line.note || null,
          });
        }
      }
      return { columns, rows };
    }

    case 'stakeholders': {
      // One row per register record with derived Mendelow quadrant and
      // Mitchell-Agle-Wood salience. All free text passes the shared
      // CWE-1236 neutralizer via serializeCsv; nulls stay empty cells.
      const columns = [
        { key: 'stakeholder_id', header: 'stakeholder_id' },
        { key: 'name', header: 'name' },
        { key: 'org', header: 'org' },
        { key: 'role', header: 'role' },
        { key: 'linked_person_name', header: 'linked_person_name' },
        { key: 'category', header: 'category' },
        { key: 'status', header: 'status' },
        { key: 'power_1_5', header: 'power_1_5' },
        { key: 'interest_1_5', header: 'interest_1_5' },
        { key: 'mendelow_quadrant', header: 'mendelow_quadrant' },
        { key: 'legitimacy_1_5', header: 'legitimacy_1_5' },
        { key: 'urgency_1_5', header: 'urgency_1_5' },
        { key: 'salience_class', header: 'salience_class' },
        { key: 'salience_score_3_15', header: 'salience_score_3_15' },
        { key: 'confidence_adjusted_salience', header: 'confidence_adjusted_salience' },
        { key: 'estimate_confidence', header: 'estimate_confidence' },
        { key: 'veto_player', header: 'veto_player' },
        { key: 'veto_basis', header: 'veto_basis' },
        { key: 'stance', header: 'stance' },
        { key: 'comms_cadence', header: 'comms_cadence' },
        { key: 'last_contact_on', header: 'last_contact_on' },
        { key: 'next_contact_on', header: 'next_contact_on' },
        { key: 'alliance_edges', header: 'alliance_edges' },
        { key: 'opposition_edges', header: 'opposition_edges' },
        { key: 'influence_edges', header: 'influence_edges' },
        { key: 'stance_history_entries', header: 'stance_history_entries' },
        { key: 'latest_stance_on', header: 'latest_stance_on' },
        { key: 'contact_log_entries', header: 'contact_log_entries' },
        { key: 'tags', header: 'tags' },
        { key: 'key_message', header: 'key_message' },
        { key: 'preferred_comms', header: 'preferred_comms' },
        { key: 'influence_notes', header: 'influence_notes' },
      ];
      const rows = (state.stakeholders || []).map((s) => {
        const salience = classifySalience(s);
        const mendelow = classifyMendelowStakeholder({
          power: s.power,
          interest: s.interest,
          stance: s.stance,
          commsCadence: s.commsCadence,
          nextCommsOn: s.nextContactOn,
          lastCommsOn: s.lastContactOn,
        });
        const edges = (kind) => (s.alliances || []).filter((e) => e.kind === kind).length;
        const history = (s.stanceHistory || []).slice().sort((a, b) => String(b.on).localeCompare(String(a.on)));
        return {
          stakeholder_id: s.id,
          name: s.name,
          org: s.org || null,
          role: s.role || null,
          linked_person_name: s.personId ? nameOf(s.personId) || null : null,
          category: s.category,
          status: s.status,
          power_1_5: s.power,
          interest_1_5: s.interest,
          mendelow_quadrant: mendelow.quadrant,
          legitimacy_1_5: s.legitimacy,
          urgency_1_5: s.urgency,
          salience_class: salience.salienceClass,
          salience_score_3_15: salience.salienceScore,
          confidence_adjusted_salience: salience.expectedSalienceScore,
          estimate_confidence: s.estimateConfidence,
          veto_player: s.vetoPlayer ? 'yes' : 'no',
          veto_basis: s.vetoBasis || null,
          stance: s.stance,
          comms_cadence: s.commsCadence,
          last_contact_on: s.lastContactOn,
          next_contact_on: s.nextContactOn,
          alliance_edges: edges('alliance'),
          opposition_edges: edges('opposition'),
          influence_edges: edges('influences'),
          stance_history_entries: (s.stanceHistory || []).length,
          latest_stance_on: history[0]?.on || null,
          contact_log_entries: (s.contactLog || []).length,
          tags: (s.tags || []).join('; '),
          key_message: s.keyMessage || null,
          preferred_comms: s.preferredComms || null,
          influence_notes: s.influenceNotes || null,
        };
      });
      return { columns, rows };
    }

    default:
      return null;
  }
}

/**
 * Generate a scoped, formula-injection-safe CSV export from `state`.
 */
export function exportWorkspaceCsv(
  state,
  scope,
  {
    now = new Date(),
    pruneOverdueCandidates = false,
    redactStakeholderStances = false,
  } = {},
) {
  const descriptor = CSV_EXPORTS.find((item) => item.key === scope);
  if (!descriptor) {
    return {
      ok: false,
      reason: 'unknown-scope',
      error: `Unknown CSV export scope "${scope}".`,
    };
  }
  let effectiveState = state;
  let omitted = null;

  if (pruneOverdueCandidates && scope === 'hiring') {
    const review = retentionReview(state, { now, settings: state?.settings || {} });
    const dueIds = new Set(review.due.map((r) => r.candidate.id));
    effectiveState = {
      ...effectiveState,
      candidates: (effectiveState.candidates || []).filter((c) => !dueIds.has(c.id)),
    };
    omitted = { ...(omitted || {}), overdueCandidatesOmitted: dueIds.size };
  }

  if (redactStakeholderStances && (scope === 'cases' || scope === 'changes' || scope === 'stakeholders')) {
    let scrubbed = 0;
    effectiveState = {
      ...effectiveState,
      stakeholders: scope === 'stakeholders'
        ? (effectiveState.stakeholders || []).map((s) => {
            const sensitive = (s?.stance && s.stance !== 'neutral') || s?.vetoPlayer === true ||
              Boolean(String(s?.keyMessage || s?.influenceNotes || '').trim());
            if (sensitive) scrubbed += 1;
            return {
              ...s,
              stance: 'neutral',
              vetoPlayer: false,
              keyMessage: '',
              influenceNotes: '',
              vetoBasis: '',
              stanceHistory: (s.stanceHistory || []).map((e) => ({ ...e, stance: 'neutral', context: '' })),
            };
          })
        : effectiveState.stakeholders,
      cases: scope === 'cases'
        ? (effectiveState.cases || []).map((c) => ({
            ...c,
            stakeholders: Array.isArray(c.stakeholders)
              ? c.stakeholders.map((s) => {
                  const hasMsg = Boolean(String(s?.keyMessage || s?.notes || '').trim());
                  if ((s?.stance && s.stance !== 'neutral') || hasMsg) scrubbed += 1;
                  return { ...s, stance: 'neutral', keyMessage: '', notes: '' };
                })
              : [],
          }))
        : effectiveState.cases,
      changes: scope === 'changes'
        ? (effectiveState.changes || []).map((chg) => ({
            ...chg,
            coalition: Array.isArray(chg.coalition)
              ? chg.coalition.map((m) => {
                  if ((m?.stance && m.stance !== 'neutral') || Boolean(m?.vetoPlayer) || Boolean(String(m?.keyMessage || '').trim())) scrubbed += 1;
                  return { ...m, stance: 'neutral', vetoPlayer: false, keyMessage: '' };
                })
              : [],
          }))
        : effectiveState.changes,
    };
    omitted = { ...(omitted || {}), stakeholderRecordsScrubbed: scrubbed };
  }

  const built = buildScopeTable(effectiveState, scope, now);
  const csv = serializeCsv(built.columns, built.rows);
  const today = dayKey(now);
  return {
    ok: true,
    scope: descriptor.key,
    label: descriptor.label,
    sensitive: descriptor.sensitive,
    filename: `leados-${descriptor.filenameSlug}-${today}.csv`,
    rowCount: built.rows.length,
    columnCount: built.columns.length,
    csv,
    ...(omitted ? { omitted } : {}),
  };
}
