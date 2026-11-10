/**
 * app/core/domain/roleClarityRegistry.js — the declared vocabulary of Cross-Line
 * Role Clarity Reconciliation (ADR-0153, Schema v128, `#/onboarding?panel=clarity`,
 * CSV #115).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. Sam sits on two lines: Dana's functional
 * team, where she is "owns the migration end-to-end", and Priya's project, where
 * she is "support the migration when asked". Both briefs exist, both are dated,
 * both read as reasonable sentences, and nothing in the workspace ever put them
 * side by side. Two managers grading the same work against different definitions
 * of good is not a person problem and it is not a calibration problem — it is a
 * ROLE problem, and it is visible the moment both definitions are read together,
 * which is before any assessment happens, not after.
 *
 * WHAT THIS MODULE IS. One bounded read model over the briefs the workspace
 * already stores: for one person's onboarding window, what each line declared
 * the person accountable FOR (a closed accountability-domain lexicon), the
 * decision right the person holds in that line (a closed three-step scale), and
 * how that line will know success (a closed three-step standing) — joined ACROSS
 * lines for the same person, so two lines that never compared notes can be
 * reconciled by the director who holds both.
 *
 * WHAT IT IS NEVER ALLOWED TO DO (Bulletproof Reliability Mandate)
 * ---------------------------------------------------------------
 *  - It NEVER INFERS A MARK FROM PROSE. The `scope` text is printed; it is never
 *    parsed, classified, weighted or auto-tagged. A brief that declares no marks
 *    reads `unscoped-line` and is excluded from every comparison, named as such.
 *    Guessing what a paragraph meant would be the exact failure this module
 *    refuses to commit.
 *  - It NEVER IMPUTS A DEFINITION FOR A LINE THAT NEVER BRIEFED. The home line is
 *    carried by the 30-60-90 plan as a PRINTED PRESUMPTION — the plan does not
 *    decompose into accountability domains, and this module does not pretend it
 *    does. A secondary line that never briefed reads `absent-line` and the case
 *    reads `unbriefed`.
 *  - It NEVER RATES THE PERSON. Every finding is on a LINE or on a DOMAIN. There
 *    is no person score, no ranking, no composite, and no per-line share of the
 *    person anywhere in this module.
 *  - It NEVER SETTLES A CONFLICT. `contested` names the two labels that cannot
 *    both be served; choosing which definition wins is a human act this module
 *    deliberately cannot perform.
 *  - It IS INERT in a single-chain workspace: no row, no finding, no verdict
 *    beyond `single-chain`, and no behaviour change for any existing plan.
 *
 * FRAMEWORK BASIS. Kahn, Wolfe, Quinn & Snoek (1964), *Organizational Stress:
 * Studies in Role Conflict and Ambiguity* — role conflict (incompatible
 * prescriptions held by different senders) and role ambiguity (missing or
 * inconsistent information about rights, duties and criteria); Katz & Kahn
 * (1978), *The Social Psychology of Organizations* — the role set as the set of
 * senders whose expectations define a role; Galbraith (1973, 1994) — matrix
 * coordination costs are information-processing costs, and an unresolved role
 * definition is unprocessed information. Decision rights follow the RACI/RAPID
 * convention as a closed three-step scale; success criteria follow the
 * management-by-objectives requirement that "good" be observable, printed here as
 * `written` / `verbal` / `unstated`.
 */

export const ROLE_CLARITY_ENGINE_VERSION = 'role-clarity-2026.11-v1';

/**
 * The closed accountability-domain lexicon. TEN domains, chosen to be
 * industry-neutral and exhaustive at the altitude of a role definition — finer
 * than job families, coarser than task lists. A domain is a thing a person can be
 * answerable for on a line; it is deliberately NOT a maturity model, not a skill
 * taxonomy and not a workload measure.
 */
export const ROLE_CLARITY_DOMAINS = Object.freeze([
  { key: 'delivery', label: 'Delivery & execution' },
  { key: 'technical', label: 'Technical & craft' },
  { key: 'quality', label: 'Quality & standards' },
  { key: 'people', label: 'People & team' },
  { key: 'budget', label: 'Budget & resources' },
  { key: 'risk', label: 'Risk & compliance' },
  { key: 'stakeholder', label: 'Stakeholder & communications' },
  { key: 'strategy', label: 'Strategy & direction' },
  { key: 'operations', label: 'Operations & process' },
  { key: 'data', label: 'Data & reporting' },
]);

export const ROLE_CLARITY_DOMAIN_KEYS = Object.freeze(ROLE_CLARITY_DOMAINS.map((d) => d.key));
const DOMAIN_LABELS = new Map(ROLE_CLARITY_DOMAINS.map((d) => [d.key, d.label]));

export function roleClarityDomainLabel(key) {
  return DOMAIN_LABELS.get(String(key || '')) || String(key || '');
}

/**
 * The closed decision-right scale (RACI-informed). `decides` — the person may
 * make the call on this line's domain; `advises` — the person recommends and the
 * line decides; `informed` — the person is told. Ranked so an EXACT INTEGER
 * spread can be computed: a spread of two or more across lines means one line
 * briefed a decision-maker and another briefed a bystander — both about the same
 * person on the same job.
 */
export const ROLE_CLARITY_DECISION_RIGHTS = Object.freeze([
  { key: 'decides', label: 'Decides', rank: 2 },
  { key: 'advises', label: 'Advises', rank: 1 },
  { key: 'informed', label: 'Informed', rank: 0 },
]);
const RIGHT_BY_KEY = new Map(ROLE_CLARITY_DECISION_RIGHTS.map((r) => [r.key, r]));

export function roleClarityDecisionRight(key) {
  return RIGHT_BY_KEY.get(String(key || '')) || null;
}
export function roleClarityDecisionRightRank(key) {
  return RIGHT_BY_KEY.get(String(key || ''))?.rank ?? null;
}

/**
 * The closed success-criteria standing. `written` — this line has stated, in
 * words, how it will know the person succeeded; `verbal` — it was said but not
 * written; `unstated` — nobody on this line has said how success will be read.
 * A spread of two or more means one line will grade against a standard it wrote
 * down and another line never named its standard at all.
 */
export const ROLE_CLARITY_CRITERIA = Object.freeze([
  { key: 'written', label: 'Written down', rank: 2 },
  { key: 'verbal', label: 'Said, not written', rank: 1 },
  { key: 'unstated', label: 'Never stated', rank: 0 },
]);
const CRITERIA_BY_KEY = new Map(ROLE_CLARITY_CRITERIA.map((c) => [c.key, c]));

export function roleClarityCriteria(key) {
  return CRITERIA_BY_KEY.get(String(key || '')) || null;
}
export function roleClarityCriteriaRank(key) {
  return CRITERIA_BY_KEY.get(String(key || ''))?.rank ?? null;
}

/**
 * The kinds of structural finding this module emits. Every one is about a LINE
 * or a DOMAIN, never about the person. `lineKeys` names the lines involved;
 * `domain` is present only on domain findings.
 */
export const ROLE_CLARITY_FINDING_KINDS = Object.freeze([
  'absent-line',
  'unscoped-line',
  'overlapping-scope',
  'contested-authority',
  'divergent-criteria',
]);

/**
 * Case-level verdicts, in DECLARED precedence (lowest severity wins the print;
 * this is the order the board sorts worst-first and the precedence the panel
 * declares). Six claims, never collapsed into one word.
 */
export const ROLE_CLARITY_VERDICTS = Object.freeze([
  {
    key: 'unbriefed',
    label: 'A line never said what the person is for',
    severity: 0,
    tone: 'bad',
    open: true,
    detail: 'A secondary line in force during the window wrote no brief at all, so there is no definition of the job on that line to reconcile. Nothing is imputed: a missing definition is reported, never invented.',
  },
  {
    key: 'contested',
    label: 'The lines cannot both be served',
    severity: 1,
    tone: 'bad',
    open: true,
    detail: 'Two lines that will both grade this person declared definitions that cannot both be satisfied — a decision-right spread of two or more steps, or a written-versus-unstated criteria spread. The conflict is named now, before it is graded as the person’s performance.',
  },
  {
    key: 'unscoped-pair',
    label: 'No comparable definitions',
    severity: 2,
    tone: 'warn',
    open: true,
    detail: 'Fewer than two lines in force declared a comparable definition (a domain set, a decision right or a criteria standing). The briefs that exist are printed beside each other, but no comparison is drawn, because a comparison would be invented rather than read.',
  },
  {
    key: 'overlapping',
    label: 'Both lines claim the same ground',
    severity: 3,
    tone: 'warn',
    open: true,
    detail: 'At least one accountability domain is claimed by two or more lines. That is the normal shape of a matrix — but it must be visible for the person to serve both definitions and for the director to know which one wins when they collide.',
  },
  {
    key: 'partitioned',
    label: 'The definitions partition cleanly',
    severity: 4,
    tone: 'good',
    open: false,
    detail: 'Every accountability domain claimed in this window is claimed by exactly one line, and no decision-right or criteria spread opens a conflict. The two definitions describe one job, divided.',
  },
  {
    key: 'single-chain',
    label: 'Single line — nothing to reconcile',
    severity: 5,
    tone: 'neutral',
    open: false,
    detail: 'This person sat on one line for the window. The ordinary 30-60-90 applies; this lens adds no row to it.',
  },
]);

export const ROLE_CLARITY_VERDICT_KEYS = Object.freeze(ROLE_CLARITY_VERDICTS.map((v) => v.key));
const VERDICT_BY_KEY = new Map(ROLE_CLARITY_VERDICTS.map((v) => [v.key, v]));

export function roleClarityVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '')) || null;
}

/** Bound on stored rows and text. Every cap is counted, never silent. */
export const ROLE_CLARITY_LIMITS = Object.freeze({
  /** Domains a single brief may claim. All ten may be used; the cap only bounds garbage. */
  domainsPerBrief: ROLE_CLARITY_DOMAINS.length,
  /** Rows the board renders before the remainder is counted only. */
  board: 40,
  /** Findings printed per case before the remainder are counted only. */
  findings: 40,
});

/**
 * The one clamped convention pair, both printed and neither fitted. A spread of
 * two or more steps is `contested` on either scale — the scales are three steps
 * wide, so two is the widest spread there is, and declaring it is declaring the
 * scale, not tuning a threshold.
 */
export const ROLE_CLARITY_SPREAD_LIMIT = 2;
export const ROLE_CLARITY_WINDOW_DAYS = 90;

/** What this screen refuses to compute, printed verbatim on the Method panel and the CSV. */
export const ROLE_CLARITY_REFUSALS = Object.freeze([
  'It never parses, classifies or auto-tags the brief text. Marks are declared by the line that wrote them or they do not exist.',
  'It never invents a definition for a line that wrote no brief — a secondary absence reads as a gap, and the home line reads as the printed presumption the plan already carries.',
  'It never scores, ranks or rates the person, and it never reports a per-line share of them.',
  'It never settles a contested definition. Naming the conflict is the product; choosing which line wins is a human act.',
  'It never treats an acknowledgement as evidence of agreement. The person’s acknowledgement of a brief is a separate act this lens does not re-read.',
  'It never compares across windows. Two briefs from different 90-day windows are history, not a contradiction in force today.',
]);

/** The frameworks named, for the Method panel and the ADR. */
export const ROLE_CLARITY_FRAMEWORKS = Object.freeze([
  'Kahn, Wolfe, Quinn & Snoek (1964) — Organizational Stress: role conflict as incompatible prescriptions from different senders; role ambiguity as missing information about duties, rights and criteria.',
  'Katz & Kahn (1978) — the Social Psychology of Organizations: the role set, and why every sender whose expectation defines the role must be heard.',
  'Galbraith (1973, 1982, 1994) — design criteria for matrix organisations: clarity of accountability, decision rights and information channels as the coordination cost of the matrix form.',
  'RACI / RAPID convention — decision rights as a closed, declarable scale rather than free prose.',
  'Management by objectives (Drucker 1954) — a success criterion the holder of the work cannot state is not a criterion, it is a hope.',
]);
