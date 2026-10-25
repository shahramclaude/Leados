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
    description: 'Active and archived team members, roles, start dates, 1:1 cadence targets, and stated career goals.',
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
    description: 'Open and completed 1:1 actions, GROW development commitments, and feedback follow-ups with due and completion dates.',
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
    description: 'Specific recognition entries and team values reinforced.',
  },
  {
    key: 'decisions',
    label: 'Decision log (RAPID)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'decisions',
    description: 'Team decisions, reversibility, RAPID roles, rationale, review dates, and outcomes.',
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
      }));
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
      ];
      const rows = (state.oneOnOnes || [])
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((m) => {
          const actions = m.actions || [];
          const doneCount = actions.filter((a) => a.done).length;
          return {
            meeting_id: m.id,
            date: m.date,
            person_id: m.personId,
            person_name: nameOf(m.personId),
            status: m.status,
            mood: m.mood,
            agenda_topics: (m.agenda || []).map((item) => item.text).filter(Boolean).join('; '),
            notes: m.notes,
            open_actions: actions.length - doneCount,
            completed_actions: doneCount,
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
        { key: 'owner', header: 'owner' },
        { key: 'commitment', header: 'commitment' },
        { key: 'due_on', header: 'due_on' },
        { key: 'done', header: 'done' },
        { key: 'status', header: 'status' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'drop_reason', header: 'drop_reason' },
      ];
      const rows = [];
      for (const m of state.oneOnOnes || []) {
        for (const a of m.actions || []) {
          const status = a.status || (a.done ? 'completed' : 'open');
          rows.push({
            source_type: '1:1 action',
            source_id: m.id,
            source_date: m.date,
            person_id: m.personId,
            person_name: nameOf(m.personId),
            owner: a.owner || 'leader',
            commitment: a.text,
            due_on: a.due,
            done: Boolean(a.done),
            status,
            completed_on: a.completedOn,
            drop_reason: a.dropReason || null,
          });
        }
      }
      for (const p of state.growthPlans || []) {
        for (const w of p.will || []) {
          const status = w.status || (w.done ? 'completed' : 'open');
          rows.push({
            source_type: 'GROW commitment',
            source_id: p.id,
            source_date: (p.createdAt || '').slice(0, 10) || null,
            person_id: p.personId,
            person_name: nameOf(p.personId),
            owner: 'them',
            commitment: w.text,
            due_on: w.due,
            done: Boolean(w.done),
            status,
            completed_on: w.completedOn,
            drop_reason: w.dropReason || null,
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
          owner: 'leader',
          commitment: f.situation ? `Follow up: ${f.situation}` : `Follow up on ${f.kind} feedback`,
          due_on: f.followUpOn,
          done: Boolean(f.followUpDone),
          status: f.followUpDone ? 'completed' : 'open',
          completed_on: f.followUpCompletedOn,
          drop_reason: null,
        });
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
            : lat.measured
              ? 'measured'
              : lat.invalid
                ? 'invalid-order'
                : 'unmeasured';
          return {
            feedback_id: f.id,
            date: f.date,
            observed_on: f.observedOn,
            latency_days: f.direction === 'given' && lat.measured ? lat.days : null,
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
      ];
      const rows = (state.delegations || []).map((d) => {
        const sortedCheckins = (d.checkins || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const latest = sortedCheckins.length ? sortedCheckins[sortedCheckins.length - 1] : null;
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
        };
      });
      return { columns, rows };
    }

    case 'growthPlans': {
      const columns = [
        { key: 'plan_id', header: 'plan_id' },
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
        { key: 'competencies', header: 'competencies' },
      ];
      const rows = (state.growthPlans || []).map((p) => {
        const will = p.will || [];
        return {
          plan_id: p.id,
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
          what: r.what,
          values: (r.values || []).join('; '),
        }));
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
          review_on: d.reviewOn,
          reviewed_on: d.reviewedOn,
          outcome: d.outcome,
          outcome_notes: d.outcomeNotes,
        }));
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

    default:
      return null;
  }
}

/**
 * Generate a scoped, formula-injection-safe CSV export from `state`.
 */
export function exportWorkspaceCsv(state, scope, { now = new Date() } = {}) {
  const descriptor = CSV_EXPORTS.find((item) => item.key === scope);
  if (!descriptor) {
    return {
      ok: false,
      reason: 'unknown-scope',
      error: `Unknown CSV export scope "${scope}".`,
    };
  }
  const built = buildScopeTable(state, scope, now);
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
  };
}
