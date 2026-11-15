/**
 * app/core/domain/justCultureRegistry.js — the closed vocabulary of the Just
 * Culture Decision Record (ADR-0218, Schema v172, `#/just-culture`).
 *
 * THE DUTY, IN A FRONTLINE LEAD'S WORDS. A packing error sent the wrong item to a
 * customer. Priya, the lead, has two managers: the functional manager on her home
 * line and the project manager on a declared line. The first instinct is "she was
 * careless". The first question her manager should ask is different: did Priya
 * depart from a known procedure, was that a slip or a choice, did she choose it
 * knowing the risk, would a colleague with the same training have done the same,
 * and what in the system made the error easy? Only then is there a response, and
 * when the answers and the response disagree somebody must write down why.
 *
 * THE FRAMEWORKS THIS ENCODES, AND NOTHING BEYOND THEM.
 *  - Marx's Just Culture algorithm (2001): a departure is classed as human error,
 *    at-risk behaviour or reckless behaviour, and each class has a response class —
 *    console, coach or formal review. Citation details cited from memory,
 *    [UNVERIFIED] until checked against the primer.
 *  - Reason's latent-conditions model (Managing the Risks of Organizational
 *    Accidents, 1997): every individual departure is asked whether a system
 *    condition made it likely. A system condition that is present must be named
 *    as a system action owed. "None identified" is an answer; "untested" is not.
 *  - Dekker's substitution test (Just Culture: Balancing Safety and Accountability,
 *    2007): would a peer with the same training, in the same situation, most likely
 *    have done the same? A "yes" points the response at the system, not the person.
 *
 * WHAT THE REGISTER DOES. It holds one review per (event, person). The deciding
 * manager — a line the person ACTUALLY holds, named explicitly — answers the
 * questions with dated, closed answers. The register computes the response the
 * answers point to and prints it beside the response the manager chose. A mismatch
 * is not corrected: it is recorded, counted and carries the manager's written
 * reason. Every other line the person holds must concur or dissent before the
 * decision settles. A review whose deciding line has since ended is printed
 * `orphaned`, not quietly re-owned.
 *
 * WHAT IT NEVER DOES. It never infers culpability from text, never scores a person,
 * never decides or imposes a sanction (`formal-review` is a referral that this
 * register records and does not run), never shows an individual's review above the
 * manager altitude (the record class is `individual`), and never silently chooses
 * one of several managers as the owner. Seats are declarations, not authentication.
 */

export const JUST_CULTURE_ENGINE_VERSION = 'just-culture-2026.11-v1';
export const JUST_CULTURE_ADR = 'ADR-0218';
export const JUST_CULTURE_ROUTE = 'just-culture';
export const JUST_CULTURE_HREF = '#/just-culture';

export const JUST_CULTURE_EVENTS = Object.freeze({
  OPENED: 'justCulture.review.opened',
  DECIDED: 'justCulture.review.decided',
  REVISED: 'justCulture.review.revised',
  CONCURRED: 'justCulture.review.concurred',
  DISSENTED: 'justCulture.review.dissented',
  WITHDRAWN: 'justCulture.review.withdrawn',
});

/**
 * Three rights. Deciding and concurring are individual-altitude acts (ranks 1–2),
 * because the record they write is individual material. Reading is open at every
 * rank; the record class decides how much detail each rank receives.
 */
export const JUST_CULTURE_RIGHTS = Object.freeze({
  READ: 'read-just-culture',
  DECIDE: 'decide-just-culture',
  CONCUR: 'concur-just-culture',
});

export const JUST_CULTURE_LIMITS = Object.freeze({
  reviews: 600,
  acts: 4000,
  actsPerReview: 12,
  summaryMin: 12,
  summaryMax: 600,
  noteMin: 12,
  noteMax: 600,
  refMax: 80,
  personIdMax: 120,
  reviewsShown: 40,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  /** Below this many decisions held by one line, that line's counts are withheld. */
  lineFloorN: 3,
});

/* ------------------------------------------------------------ the questions */

/** Q1 — did the person depart from a known rule, procedure or agreed standard? */
export const JC_DEVIATION = Object.freeze([
  Object.freeze({ key: 'none', label: 'No departure from a known rule, procedure or agreed standard' }),
  Object.freeze({ key: 'departure', label: 'A departure from a known rule, procedure or agreed standard' }),
  Object.freeze({ key: 'unknown', label: 'Not yet established — cannot be decided until it is' }),
]);

/** Q2 — when there was a departure, was it a slip or a choice? */
export const JC_CHOICE = Object.freeze([
  Object.freeze({ key: 'unintended', label: 'Unintended — a slip, lapse or mistake of perception or memory' }),
  Object.freeze({ key: 'intended', label: 'Intended — a deliberate choice to act that way' }),
]);

/** Q3 — when intended, was the risk unrecognised or judged justified, or consciously disregarded? */
export const JC_RISK = Object.freeze([
  Object.freeze({ key: 'unaware-or-justified', label: 'The risk was not recognised, or was judged justified at the time (at-risk)' }),
  Object.freeze({ key: 'disregarded', label: 'A substantial, unjustifiable risk was consciously disregarded (reckless)' }),
]);

/** Q4 — the substitution test. Asked whenever there was a departure. */
export const JC_SUBSTITUTION = Object.freeze([
  Object.freeze({ key: 'peer-would-not', label: 'A peer with the same training, in the same situation, most likely would NOT have done the same' }),
  Object.freeze({ key: 'peer-would', label: 'A peer with the same training, in the same situation, most likely WOULD have done the same' }),
  Object.freeze({ key: 'untested', label: 'Not yet tested — cannot be decided until it is' }),
]);

/** Q5 — did a system condition make the departure more likely? Always asked. */
export const JC_SYSTEM = Object.freeze([
  Object.freeze({ key: 'present', label: 'A system condition contributed — a procedure, tool, workload, staffing or training gap' }),
  Object.freeze({ key: 'none-identified', label: 'No system condition contributed on the evidence available' }),
  Object.freeze({ key: 'untested', label: 'Not yet examined — cannot be decided until it is' }),
]);

/** The response classes. The register computes the one the answers point to; it never chooses. */
export const JC_RESPONSES = Object.freeze([
  Object.freeze({ key: 'console', label: 'Console — support and no individual corrective step; the system is the work' }),
  Object.freeze({ key: 'coach', label: 'Coach — an individual conversation about the risk, the procedure and the support needed' }),
  Object.freeze({ key: 'formal-review', label: 'Formal review — a referral to the formal process. Recorded here as a referral only; this register does not discipline' }),
]);

export const JC_DEVIATION_KEYS = Object.freeze(JC_DEVIATION.map((r) => r.key));
export const JC_CHOICE_KEYS = Object.freeze(JC_CHOICE.map((r) => r.key));
export const JC_RISK_KEYS = Object.freeze(JC_RISK.map((r) => r.key));
export const JC_SUBSTITUTION_KEYS = Object.freeze(JC_SUBSTITUTION.map((r) => r.key));
export const JC_SYSTEM_KEYS = Object.freeze(JC_SYSTEM.map((r) => r.key));
export const JC_RESPONSE_KEYS = Object.freeze(JC_RESPONSES.map((r) => r.key));
export const JC_ACT_KINDS = Object.freeze(['decided', 'revised', 'concurred', 'dissented', 'withdrawn']);
export const JC_STATES = Object.freeze([
  Object.freeze({ key: 'awaiting-decision', label: 'Awaiting decision — the deciding line has not answered the questions' }),
  Object.freeze({ key: 'awaiting-concurrence', label: 'Decided — waiting for another line the person holds to concur or dissent' }),
  Object.freeze({ key: 'contested', label: 'Contested — another line the person holds has dissented; the decision is not settled' }),
  Object.freeze({ key: 'settled', label: 'Settled — decided, and every line the person holds has concurred' }),
  Object.freeze({ key: 'orphaned', label: 'Orphaned — the deciding line no longer holds this person; a new owner is owed' }),
  Object.freeze({ key: 'withdrawn', label: 'Withdrawn before any decision' }),
]);
export const JC_STATE_KEYS = Object.freeze(JC_STATES.map((r) => r.key));

/**
 * THE ALGORITHM. A pure function of the answers, with no clock, no record and no
 * judgement about the person. It returns the response the stated answers POINT TO,
 * or `null` with the questions still owed. It is the only place the mapping lives.
 *
 *   no departure                         → console
 *   departure, unintended                → console
 *   departure, intended, at-risk         → coach
 *   departure, intended, reckless, the
 *     substitution test says a peer would
 *     have done the same (system-shaped) → coach
 *   departure, intended, reckless, the
 *     substitution test says a peer would
 *     NOT have                           → formal-review
 */
export function justCultureExpectation(answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const pending = [];
  if (!JC_DEVIATION_KEYS.includes(a.deviation) || a.deviation === 'unknown') pending.push('deviation');
  if (!JC_SYSTEM_KEYS.includes(a.system) || a.system === 'untested') pending.push('system');
  if (a.deviation === 'departure') {
    if (!JC_CHOICE_KEYS.includes(a.choice)) pending.push('choice');
    else if (a.choice === 'intended' && !JC_RISK_KEYS.includes(a.risk)) pending.push('risk');
    if (!JC_SUBSTITUTION_KEYS.includes(a.substitution) || a.substitution === 'untested') pending.push('substitution');
  }
  if (pending.length) return { response: null, path: 'indeterminate', pending };
  if (a.deviation === 'none') return { response: 'console', path: 'no-departure', pending: [] };
  if (a.choice === 'unintended') return { response: 'console', path: 'unintended-departure', pending: [] };
  if (a.risk === 'unaware-or-justified') return { response: 'coach', path: 'at-risk', pending: [] };
  if (a.substitution === 'peer-would') return { response: 'coach', path: 'reckless-system-shaped', pending: [] };
  return { response: 'formal-review', path: 'reckless-individual', pending: [] };
}

/** Labels, looked up by key. Unknown keys return null — never a plausible default. */
export const justCultureLabel = (list, key) => (list.find((row) => row.key === key) || null);
export const justCultureResponseLabel = (key) => justCultureLabel(JC_RESPONSES, key)?.label || null;
export const justCultureStateLabel = (key) => justCultureLabel(JC_STATES, key)?.label || null;

export const JUST_CULTURE_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
});

/** The method, printed on the screen and in the ADR. */
export const JUST_CULTURE_METHOD = Object.freeze({
  engine: JUST_CULTURE_ENGINE_VERSION,
  adr: JUST_CULTURE_ADR,
  frameworks: Object.freeze([
    'Marx (2001) Just Culture algorithm — human error, at-risk and reckless behaviour, with console, coach and formal-review responses [citation details UNVERIFIED]',
    'Reason (1997) latent conditions — every individual departure is asked whether a system condition made it likely',
    'Dekker (2007) substitution test — would a peer with the same training, in the same situation, have done the same',
  ]),
  printed: Object.freeze([
    'The response the answers point to is computed by a pure function and printed beside the response chosen.',
    'A response that departs from the answers is recorded with the manager’s written reason and counted, never corrected.',
    'Every other line the person holds must concur or dissent. A dissent contests the decision.',
    'A line that ended while holding a review leaves it orphaned. Ownership is never silently moved.',
    'Individual detail stays at the manager altitude. Above it, counts only, and a line with fewer decisions than the floor is withheld.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No culpability score, risk rating or label on a person.',
    'No sanction, discipline or HR outcome. A formal-review response is a referral.',
    'No inference from free text, from the number of incidents, or from a person’s history.',
    'Not an incident register, not a root-cause analysis and not a substitute for statutory reporting.',
  ]),
});

/* ------------------------------------------------------------------ CSV #160 */

export const JUST_CULTURE_CSV_SCOPE = 'just-culture-reviews';
export const JUST_CULTURE_CSV_COLUMNS = Object.freeze(['as_of', 'row_kind', 'key', 'count', 'blank_reason']);

/** CSV #160 (ADR-0218, Schema v172). AGGREGATE ONLY — counts of reviews by state, by response and by departure. No person, no line name, no event summary, no reference, no basis note and no date of any review crosses this boundary. A figure the reader cannot compute exports BLANK with its reason, never zero. */
export const JUST_CULTURE_CSV_DESCRIPTOR = Object.freeze({
  key: JUST_CULTURE_CSV_SCOPE,
  label: 'Just Culture reviews (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'just-culture-reviews',
  description: 'One summary row, one row per review state and one row per response, over every review held, as read on the as-of day. Every figure is an exact integer count. No person, line, event, reference or basis note is exported. A count the reader cannot compute is blank with its reason, never zero.',
});

