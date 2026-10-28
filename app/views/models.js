/**
 * app/views/models.js — Evidence Governance (`#/models`), the Claim &
 * Counterfactual Registry.
 *
 * Five tabs in the order a leader actually asks the questions:
 *   Register   → every claim, its trust grade, provenance and counterfactual
 *   Conflicts  → where the records disagree under a stated criterion
 *   Challenges → the append-only ledger of dated observations against a claim
 *   Method     → the ladder, the criteria, and what each grade cannot mean
 *   Brief      → the one board-ready narrative, with confidence annotations
 *
 * Rendering and explaining only. Every mutation goes through `ctx.api`; the
 * post-commit spine owns the cross-module fan-out.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, table, kv, emptyState,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import {
  MODEL_ENGINE_VERSION,
  MODEL_TRUST_GRADES,
  MODEL_CHALLENGE_DIRECTIONS,
  MODEL_MAX_LIKELIHOOD_RATIO,
  MODEL_MIN_LIKELIHOOD_RATIO,
  buildModelGovernanceReport,
  modelGovernanceBrief,
  modelGovernanceSignals,
} from '../core/domain/claimRegistry.js';
import { openChallengeDialog } from '../ui/model-modals.js';

const TABS = [
  { key: 'register', label: 'Claim register' },
  { key: 'conflicts', label: 'Conflicts' },
  { key: 'challenges', label: 'Challenge ledger' },
  { key: 'method', label: 'Method & limits' },
  { key: 'brief', label: 'Board brief' },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

const MODULE_LABELS = {
  capital: 'Capital allocation',
  dynamics: 'System dynamics',
  premises: 'Premise sentinel',
  watch: 'Early warning',
  impact: 'Impact ledger',
  anomaly: 'Anomaly intelligence',
  decisions: 'Decisions',
};

const GRADED_BY_LABELS = {
  'model-ladder': 'Shared model ladder',
  'premise-sentinel': 'Premise Sentinel (Bayes + SPRT)',
  'impact-ledger': 'Impact Ledger (pre-registered test)',
  'control-chart': 'Control chart (in-sample limits)',
  'detector': 'Detector precision ledger',
  'decision-log': 'Decision log',
};

const fmt = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(Number(v))
  ? '—'
  : new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(Number(v)));

function gradeTone(grade) {
  const meta = MODEL_TRUST_GRADES[grade];
  if (!meta) return 'neutral';
  return meta.tone === 'bad' ? 'bad' : meta.tone === 'warn' ? 'warn' : meta.tone === 'good' ? 'good' : 'neutral';
}

function gradeBadge(claim) {
  return badge(claim.trustLabel, gradeTone(claim.trustGrade));
}

function provenanceCell(claim) {
  const p = claim.provenance;
  if (!p) return h('span', { class: 'muted tiny' }, 'not reported');
  const parts = [];
  if (Number.isFinite(Number(p.measured))) parts.push(`measured ${p.measured}`);
  if (Number.isFinite(Number(p.estimated))) parts.push(`estimated ${p.estimated}`);
  if (Number.isFinite(Number(p.assumed))) parts.push(`assumed ${p.assumed}`);
  return h('div', { class: 'view-stack', style: 'gap:2px' },
    h('span', { class: 'small' }, parts.length ? parts.join(' · ') : 'not reported'),
    p.assumedPct != null
      ? h('span', { class: p.assumedPct >= 40 ? 'text-warn tiny' : 'muted tiny' }, `${p.assumedPct}% conventions`)
      : null);
}

function counterfactualCell(claim) {
  const cf = claim.counterfactual;
  if (!cf) return h('span', { class: 'muted tiny' }, 'none declared');
  return h('div', { class: 'view-stack', style: 'gap:2px' },
    h('span', { class: 'small' }, cf.label),
    h('span', { class: 'muted tiny' },
      cf.value != null ? `${fmt(cf.value, 1)}${cf.unit ? ` ${cf.unit}` : ''}` : 'not priced'),
    cf.note ? h('span', { class: 'muted tiny' }, cf.note) : null);
}

/* ---------------------------------------------------------------- register */

function registerTab(ctx, report) {
  if (!report.claims.length) {
    return emptyState({
      title: 'No registered claims yet',
      body: 'A claim is registered for every quantitative statement LeadOS makes. Add people, cases, decisions, premises or dependencies and the registry fills from those records — nothing is invented to fill the page.',
      action: h('a', { class: 'btn btn-primary', href: '#/people' }, 'Add your team'),
    });
  }
  const gradeOrder = ['refuted', 'unvalidated', 'provisional', 'backtested', 'validated'];
  const grouped = gradeOrder
    .map((grade) => ({ grade, rows: report.claims.filter((c) => c.trustGrade === grade) }))
    .filter((g) => g.rows.length);

  return h('div', { class: 'view-stack' },
    banner({
      tone: 'info',
      title: 'Every number on every page is registered here',
      body: 'A claim is not a copy of a number — it is derived from the same records the source module reads, so it cannot drift. Each claim carries one trust grade, its provenance, the counterfactual it gives up, the records it consumed, and what would change the leader’s mind.',
    }),
    h('div', { class: 'grid-2' },
      stat({ label: 'Claims registered', value: report.aggregates.claims, hint: `${Object.keys(report.aggregates.byModule).length} source module(s)` }),
      stat({ label: 'Actionable', value: report.aggregates.actionable, hint: 'only a model graded Backtested or better may be called actionable', tone: report.aggregates.actionable ? 'good' : '' }),
      stat({ label: 'Conflicts', value: report.aggregates.conflicts, hint: `${report.aggregates.severeConflicts} severe`, tone: report.aggregates.severeConflicts ? 'bad' : '' }),
      stat({ label: 'Challenged', value: report.aggregates.challenged, hint: `${report.aggregates.challengable} claim(s) a leader could challenge` })),

    ...grouped.map(({ grade, rows }) => card({
      title: `${MODEL_TRUST_GRADES[grade].label} — ${rows.length}`,
      subtitle: MODEL_TRUST_GRADES[grade].meaning,
      body: table({
        caption: `${MODEL_TRUST_GRADES[grade].label} claims`,
        columns: [
          { label: 'Claim', render: (c) => h('div', { class: 'view-stack', style: 'gap:3px' },
            h('span', { class: 'small' }, c.statement),
            h('span', { class: 'muted tiny' }, `${MODULE_LABELS[c.module] || c.module} · ${GRADED_BY_LABELS[c.gradedBy] || c.gradedBy}`)) },
          { label: 'Grade', render: (c) => h('div', { class: 'view-stack', style: 'gap:2px' },
            gradeBadge(c),
            c.challenges > 0 ? badge(`posterior ${fmt(c.posteriorPct, 1)}%`, 'caution') : null) },
          { label: 'Evidence', render: (c) => h('div', { class: 'view-stack', style: 'gap:2px' },
            h('span', { class: 'small' }, `${c.evidenceCount} record(s)`),
            h('span', { class: 'muted tiny' }, c.skill != null ? `skill ${fmt(c.skill, 2)}` : 'no skill score')) },
          { label: 'Provenance', render: (c) => provenanceCell(c) },
          { label: 'Counterfactual', render: (c) => counterfactualCell(c) },
          { label: 'Action', render: (c) => h('div', { class: 'row-gap wrap' },
            c.route ? h('a', { class: 'btn btn-tiny btn-ghost', href: c.route }, 'Open module') : null,
            c.challengable !== false
              ? h('button', {
                class: 'btn btn-tiny', type: 'button',
                onClick: () => openChallengeDialog(ctx, { claim: c, onDone: () => ctx.refresh && ctx.refresh() }),
              }, 'Challenge')
              : h('span', { class: 'muted tiny', title: 'This claim is graded by its own module’s evidence machinery.' }, 'owns its evidence') ) },
        ],
        rows,
        emptyMessage: 'No claims at this grade.',
      }),
    })),
  );
}

/* --------------------------------------------------------------- conflicts */

function conflictsTab(ctx, report) {
  if (!report.conflicts.length) {
    return emptyState({
      title: 'No declared conflicts',
      body: 'The registry reports a conflict only when two records disagree under a criterion written down in the Method tab — a fragile assumption under an open decision, a commitment adopted on a refuted model, or a signal from a detector that lost to persistence. An empty list is the honest result when none of those hold.',
    });
  }
  const byClaim = new Map(report.claims.map((c) => [c.id, c]));
  return h('div', { class: 'view-stack' },
    banner({
      tone: report.aggregates.severeConflicts ? 'bad' : 'warn',
      title: `${report.conflicts.length} case(s) where the records disagree`,
      body: 'These are not bugs and they are not resolved automatically. Each is a question the leader has to answer with a decision, and the criterion that raised it is printed so it can be argued with.',
    }),
    ...report.conflicts.map((conflict) => card({
      title: conflict.statement,
      subtitle: `Severity ${conflict.severity}/4 · ${conflict.type.replace(/-/g, ' ')}`,
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, h('strong', null, 'Criterion: '), conflict.criterion),
        h('div', { class: 'grid-2' },
          h('div', null, kv('Claim A', byClaim.get(conflict.a)?.subjectLabel || conflict.a)),
          h('div', null, kv('Claim B', byClaim.get(conflict.b)?.subjectLabel || conflict.b))),
        table({
          caption: 'The two claims that disagree',
          columns: [
            { label: 'Side', render: (r) => r.side },
            { label: 'Claim', render: (r) => r.claim.statement },
            { label: 'Grade', render: (r) => gradeBadge(r.claim) },
            { label: 'Action', render: (r) => (r.claim.route ? h('a', { class: 'btn btn-tiny btn-ghost', href: r.claim.route }, 'Open') : null) },
          ],
          rows: [conflict.a, conflict.b]
            .map((id) => byClaim.get(id))
            .filter(Boolean)
            .map((claim, index) => ({ side: index === 0 ? 'A' : 'B', claim })),
        }),
        h('div', { class: 'row-gap wrap' },
          ...[conflict.a, conflict.b].map((id) => byClaim.get(id)).filter((c) => c && c.challengable !== false)
            .map((claim) => h('button', {
              class: 'btn btn-small', type: 'button',
              onClick: () => openChallengeDialog(ctx, { claim, onDone: () => ctx.refresh && ctx.refresh() }),
            }, `Challenge “${String(claim.subjectLabel || claim.id).slice(0, 34)}”`))),
      ),
    })),
  );
}

/* -------------------------------------------------------------- challenges */

function challengesTab(ctx, report) {
  const rows = [...(report.challenges || [])]
    .sort((a, b) => String(b.recordedOn).localeCompare(String(a.recordedOn)));
  const claimById = new Map(report.claims.map((c) => [c.id, c]));
  const orphans = rows.filter((row) => !claimById.has(row.claimId));
  return h('div', { class: 'view-stack' },
    banner({
      tone: 'info',
      title: 'An append-only ledger of the leader’s own evidence',
      body: `Every observation here is dated, typed and carries a declared likelihood ratio between ${MODEL_MIN_LIKELIHOOD_RATIO} and ${MODEL_MAX_LIKELIHOOD_RATIO}. The posterior is recomputed at read time from this ledger — no belief is ever overwritten, and deleting a row would visibly change a number you already saw.`,
    }),
    orphans.length
      ? banner({
        tone: 'warn',
        title: `${orphans.length} challenge(s) reference a claim that is no longer registered`,
        body: 'The source records changed. The observation is kept, because “someone disputed a number that no longer exists” is itself a governance fact — but it cannot move a posterior that no longer exists.',
      })
      : null,
    card({
      title: 'Challenge ledger',
      subtitle: `${rows.length} dated observation(s)`,
      body: rows.length
        ? table({
          caption: 'Dated challenges against registered claims',
          columns: [
            { label: 'Recorded', render: (r) => r.recordedOn },
            { label: 'Claim', render: (r) => h('div', { class: 'view-stack', style: 'gap:2px' },
              h('span', { class: 'small' }, claimById.get(r.claimId)?.subjectLabel || r.claimId),
              h('span', { class: 'muted tiny' }, claimById.get(r.claimId)?.statement || 'claim no longer registered')) },
            { label: 'Direction', render: (r) => badge(r.direction === 'supports' ? 'Supports' : 'Challenges', r.direction === 'supports' ? 'good' : 'warn') },
            { label: 'Likelihood ratio', render: (r) => `${fmt(r.likelihoodRatio, 3)} : 1` },
            { label: 'Observation', render: (r) => h('span', { class: 'small' }, r.observation) },
            { label: 'Posterior now', render: (r) => {
              const claim = claimById.get(r.claimId);
              return claim ? `${fmt(claim.posteriorPct, 1)}%` : '—';
            } },
          ],
          rows,
          emptyMessage: 'No challenges recorded. A claim nobody disputed is not thereby validated.',
        })
        : emptyState({
          title: 'No challenges recorded yet',
          body: 'Nothing here means no leader has contradicted these numbers — not that the numbers are right. Challenging a claim is how a declared belief becomes evidence.',
          action: h('button', {
            class: 'btn btn-primary', type: 'button',
            onClick: () => ctx.navigate && ctx.navigate('#/models?tab=register'),
          }, 'Open the claim register'),
        }),
    }),
  );
}

/* ------------------------------------------------------------------ method */

function methodTab(report) {
  return h('div', { class: 'view-stack' },
    card({
      title: 'The one trust ladder',
      subtitle: 'A claim and the module behind it cannot disagree, because both are derived from the same primitives by the same rule.',
      body: table({
        caption: 'Trust grades',
        columns: [
          { label: 'Grade', render: (r) => badge(r.label, r.tone === 'bad' ? 'bad' : r.tone === 'warn' ? 'warn' : r.tone === 'good' ? 'good' : 'neutral') },
          { label: 'Rank', render: (r) => r.rank },
          { label: 'What it means', render: (r) => r.meaning },
          { label: 'What it permits', render: (r) => r.recommendation },
        ],
        rows: Object.values(MODEL_TRUST_GRADES).sort((a, b) => b.rank - a.rank),
      }),
    }),
    card({
      title: 'Which machinery grades which claim',
      subtitle: 'Not every claim should be graded by the model ladder. A premise owns Bayes and the SPRT; an intervention owns its pre-registered test. Saying so is the point.',
      body: table({
        caption: 'Grading machinery by claim type',
        columns: [
          { label: 'Machinery', render: (r) => r.label },
          { label: 'What it actually computes', render: (r) => r.detail },
          { label: 'Claims here', render: (r) => r.count },
        ],
        rows: Object.entries(GRADED_BY_LABELS).map(([key, label]) => ({
          label,
          detail: {
            'model-ladder': 'Hindcast skill vs a frozen naive baseline, parameter provenance, and pooled out-of-sample checkpoints. A model that lost to persistence is graded Refuted, not “low confidence”.',
            'premise-sentinel': 'Bayes in log-odds with half-life-discounted likelihood ratios, Wald-style SPRT boundaries and Cromwell clamping. Not re-graded here, so the belief is not double-counted.',
            'impact-ledger': 'A pre-registered window, alpha and power, with placebo and pre-trend checks. A retrospective study is labelled retrospective.',
            'control-chart': 'In-sample XmR limits — exploratory and descriptive. An in-control chart is not a forecast and not proof of stability.',
            'detector': 'The one-way human verdict ledger, scored as precision with a Wilson interval below the verdict floor it reports counts only.',
            'decision-log': 'A registered decision with its typed premise links. It carries no statistical grade, and the page says so rather than inventing one.',
          }[key],
          count: report.claims.filter((c) => c.gradedBy === key).length,
        })),
      }),
    }),
    card({
      title: 'Conflict criteria — stated, so they can be argued with',
      subtitle: 'A conflict is reported only when these conditions hold on the records. There is no fuzzy-text contradiction detector.',
      body: table({
        caption: 'Declared conflict criteria',
        columns: [
          { label: 'Type', render: (r) => r.type },
          { label: 'Criterion', render: (r) => r.criterion },
          { label: 'Fired here', render: (r) => r.count },
        ],
        rows: [
          {
            type: 'fragile-premise-under-open-decision',
            criterion: 'Assumption-Based Planning (Dewar et al., RAND 1993): a load-bearing assumption whose declared signpost has fired (status watch/breached, or posterior below its watch threshold) while the decision it was registered to test is still open.',
            count: report.conflicts.filter((c) => c.type === 'fragile-premise-under-open-decision').length,
          },
          {
            type: 'adopted-on-refuted-model',
            criterion: 'Popperian falsification + MASE-style skill: a recommendation or prediction adopted while the model that produced it is graded Refuted on the leader’s own history.',
            count: report.conflicts.filter((c) => c.type === 'adopted-on-refuted-model').length,
          },
          {
            type: 'signal-vs-refuted-detector',
            criterion: 'Alert-precision measurement: an open alert while the detector’s own out-of-sample skill is ≤ 0. A detector that lost to persistence should not quietly train the leader to act on it.',
            count: report.conflicts.filter((c) => c.type === 'signal-vs-refuted-detector').length,
          },
        ],
      }),
    }),
    card({
      title: 'Honest limits',
      body: h('ul', { class: 'small view-stack' },
        h('li', null, 'The neutral 50% prior behind a challenge is a convention, not a measurement. It says “no view yet”, and the page prints it as such.'),
        h('li', null, 'A likelihood ratio is declared by the leader. The posterior therefore measures the declared evidence, not the world — two leaders with the same facts and different ratios will disagree, correctly and visibly.'),
        h('li', null, 'Conflicts are declared criteria over typed relations and measured verdicts. They are not a general contradiction detector, and an empty conflict list is not proof of coherence.'),
        h('li', null, 'Claims are derived, never stored. That makes them impossible to drift and impossible to edit: if a claim is wrong, the record behind it is what has to change.'),
        h('li', null, 'This registry does not compute a calibrated probability that a claim is true. It reports a grade, its provenance and the evidence count, and refuses to turn those into a single number that looks more certain than the inputs.')),
    }),
  );
}

/* ------------------------------------------------------------------- brief */

function briefTab(ctx, report) {
  const text = modelGovernanceBrief(report);
  return h('div', { class: 'view-stack' },
    banner({
      tone: 'info',
      title: 'One page a board can read',
      body: 'Every claim grouped by trust grade, every conflict with its criterion, and a “what would change my mind” section built from the blockers the ladder actually reports. Deterministic: the same records produce the same brief.',
    }),
    h('div', { class: 'row-gap wrap' },
      h('button', {
        class: 'btn btn-small btn-ghost', type: 'button',
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(text);
            toast('Board brief copied.', 'good');
          } catch {
            toast('Copy was blocked by the browser. Use Download instead.', 'bad');
          }
        },
      }, 'Copy brief'),
      h('button', {
        class: 'btn btn-small', type: 'button',
        onClick: () => downloadText(`leados-evidence-governance-${report.today}.md`, text, 'text/markdown;charset=utf-8'),
      }, 'Download brief (.md)')),
    card({ title: 'Evidence-governance brief', body: h('pre', { class: 'brief-pre', style: 'white-space:pre-wrap' }, text) }),
  );
}

/* ------------------------------------------------------------------ render */

export function renderModels(ctx) {
  const state = ctx.store && typeof ctx.store.getState === 'function' ? ctx.store.getState() : ctx.state;
  const report = buildModelGovernanceReport(state, ctx.now);
  const tab = TAB_KEYS.has(ctx.query.get('tab')) ? ctx.query.get('tab') : 'register';
  const signals = modelGovernanceSignals(report);

  const body = tab === 'conflicts'
    ? conflictsTab(ctx, report)
    : tab === 'challenges'
      ? challengesTab(ctx, report)
      : tab === 'method'
        ? methodTab(report)
        : tab === 'brief'
          ? briefTab(ctx, report)
          : registerTab(ctx, report);

  const signalBanners = signals
    .filter((s) => s.severity >= 3)
    .slice(0, 2)
    .map((s) => banner({
      tone: s.severity >= 4 ? 'bad' : 'warn',
      title: s.title,
      body: s.detail,
    }));

  return h('div', { class: 'view-stack' },
    pageHeader({
      eyebrow: `Evidence governance · ${MODEL_ENGINE_VERSION} · Schema v41`,
      title: 'What is this number worth?',
      subtitle: 'Every quantitative claim LeadOS makes, with one trust grade, its provenance, the counterfactual it gives up and the records it consumed — plus the conflicts the records genuinely disagree on.',
      actions: [
        h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            const result = ctx.api.refreshModelGovernance();
            toast(result.ok
              ? `Re-derived ${result.claims} claim(s) and ${result.conflicts} conflict(s); nothing was rewritten.`
              : (result.error || 'The refresh could not run.'), result.ok ? 'good' : 'bad');
            if (ctx.refresh) ctx.refresh();
          },
        }, 'Re-derive claims'),
        h('button', {
          class: 'btn btn-small btn-ghost', type: 'button',
          onClick: () => downloadText(`leados-evidence-governance-${report.today}.md`, modelGovernanceBrief(report), 'text/markdown;charset=utf-8'),
        }, 'Download brief'),
      ],
      meta: h('div', { class: 'row row-wrap' },
        badge(`${report.aggregates.claims} claims`, 'neutral'),
        badge(`${report.aggregates.actionable} actionable`, report.aggregates.actionable ? 'good' : 'caution'),
        badge(`${report.aggregates.conflicts} conflicts`, report.aggregates.severeConflicts ? 'bad' : 'neutral'),
        badge(`${report.aggregates.challenged} challenged`, report.aggregates.challenged ? 'info' : 'neutral')),
    }),
    ...signalBanners,
    report.sourceWarnings.length
      ? banner({
        tone: 'warn',
        title: `${report.sourceWarnings.length} source module(s) could not be read for claims`,
        body: report.sourceWarnings.join(' · '),
      })
      : null,
    h('div', { class: 'view-stack' },
      tabs({
        items: TABS.map((t) => (t.key === 'conflicts' ? { ...t, count: report.aggregates.conflicts } : t)),
        active: tab,
        onSelect: (key) => ctx.navigate && ctx.navigate(`#/models?tab=${key}`),
        ariaLabel: 'Evidence governance sections',
      }),
      body),
  );
}
