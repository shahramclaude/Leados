/**
 * app/core/domain/assuranceFindingActions.js — the seat-checked commands of the
 * Assurance Finding & Remediation Register (ADR-0232).
 *
 * FOUR human acts, one declaration and a scan, and nothing else: DECLARE a
 * finding, ASSIGN a remediation owner on an accountable line, ASSERT the fix as
 * that owner, VERIFY it as an independent seat above the owner, and ACCEPT the
 * residual risk as an executive who does not own the remediation. Every state,
 * flag, count and rate is re-derived on read by `assuranceFinding.js`; nothing
 * derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - Declaration is FIRST-PERSON: `declaredById` is the acting seat's own
 *    identity. The synthetic workspace leader never speaks for a person, so the
 *    undeclared operator view is refused at every write with a printed reason.
 *  - ACCOUNTABILITY IS NOT IMPOSED SILENTLY. A declaration may name any
 *    accountable line on the roster, but that line's holder must then NAME THE
 *    OWNER AND THE DAY themselves (assign). Being named is an ask, not a
 *    verdict; the holder's own act is what puts the work on the record.
 *  - ONE ASSIGNMENT PER LINE. A second is refused and the first stands. A line's
 *    target day may not fall after the finding's own declared remediation date:
 *    a line that needs longer is a new finding, not a silent extension.
 *  - ONLY THE NAMED OWNER ASSERTS, and only on the line they were named for,
 *    and only after an assignment exists. An assertion is a claim.
 *  - VERIFICATION IS INDEPENDENT. The verifier must sit strictly above the
 *    owner on the reporting DAG — never the owner, never a subordinate of the
 *    owner, never on an unrelated branch — and the same hand never tests its own
 *    work twice in a row. A rejection returns the line to remediation owed and
 *    closes nothing.
 *  - ACCEPTANCE IS AN EXECUTIVE ACT at rank 4 or above, and never by a person
 *    who owns remediation on that finding: the party who failed to fix it does
 *    not decide that the enterprise can live with it.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { buildAssuranceFindings } from './assuranceFinding.js';
import { buildAssuranceReport, assuranceFindingAttentionCount, assuranceVerifierReach } from './assuranceFindingReport.js';
import {
  afrDay,
  afrInstant,
  afrText,
  normalizeFindingActs,
  normalizeFindings,
} from './assuranceSchema.js';
import {
  AFR_DECISIONS,
  AFR_EVENTS,
  AFR_LIMITS as L,
  AFR_REFUSALS as R,
  AFR_RIGHTS,
  AFR_ROUTE,
  AFR_RULE_ID,
  AFR_SEVERITY_KEYS,
  AFR_SOURCE_KEYS,
} from './assuranceRegistry.js';

const REFUSAL = (key) => `assurance-finding:${key}`;
const NOT_SEATED = 'No seat is resolved. Declare a valid seat before acting; the assurance register is never changed from an unknown operating position.';
const CLOSED_STATES = ['closed-verified', 'closed-accepted'];

const DAY_MS = 86400000;

export function createAssuranceFindingActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(NOT_SEATED);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? null : (seat.nodeId || seat.id || null);
    if (!actorId || actorId === LEADER_ID) {
      return fail('A finding is a first-person act of a named person. The undeclared operator view cannot speak for one — declare a seat on the Altitude Lens.', null, REFUSAL(R.noActor));
    }
    const person = rows('people').find((row) => row && row.id === actorId) || null;
    if (!person) return fail('This seat is not a person on the roster. A finding is declared by a named person, and nothing is declared in their place.', null, REFUSAL(R.noActor));
    return { ok: true, seat, at, cfg, actorId, person, today: dayKey(at), built };
  }

  function readSeat() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    return { seat: activeSeat(built), at, cfg, built };
  }

  /** Reads re-prove the right inside the action; they are not free-form. */
  function readCheck() {
    const resolved = readSeat();
    if (resolved.seat.readOnly) return fail(NOT_SEATED);
    const verdict = canAct(AFR_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...resolved };
  }

  const rosterPerson = (id) => {
    const key = afrText(id, 120);
    if (!key) return null;
    return rows('people').find((row) => row && row.id === key) || null;
  };
  const isActive = (person) => Boolean(person) && person.status !== 'archived';

  const reach = (seat, id) => Boolean(seat.fullAccess
    || (seat.scope && seat.scope.has(id))
    || (seat.lineScope && seat.lineScope.has(id)));

  /** The loaded rows the kernel itself would read — the same gate, before writing. */
  const loadedFindings = () => normalizeFindings(rows('assuranceFindings'), []);
  const loadedActs = (findings) => normalizeFindingActs(rows('assuranceFindingActs'), findings, []);

  function findingContext(check, findingId) {
    const key = afrText(findingId, 120);
    if (!key) return fail('Name the finding.', 'findingId', REFUSAL(R.unknownFinding));
    const findings = loadedFindings();
    const finding = findings.find((row) => row.id === key) || null;
    if (!finding) return fail('That finding is not on this register.', 'findingId', REFUSAL(R.unknownFinding));
    const report = buildAssuranceFindings(store.state, { now: check.at });
    const row = report.rows.find((candidate) => candidate.id === finding.id) || null;
    if (!row) return fail('That finding cannot be read back from the record. Nothing was saved.', 'findingId', REFUSAL(R.unreadable));
    return { ok: true, finding, row, findings, report };
  }

  /** The accountable entry this seat's act belongs to — narrowed, never chosen. */
  function lineContext(ctx, input, { requireResolved = true } = {}) {
    const lineId = afrText(input.lineId, 120);
    if (!lineId) return fail('Name the accountable line this act belongs to.', 'lineId', REFUSAL(R.notAccountable));
    const entry = ctx.row.accountable.find((candidate) => candidate.lineId === lineId) || null;
    if (!entry) return fail('That line is not accountable on this finding.', 'lineId', REFUSAL(R.notAccountable));
    if (requireResolved && !entry.resolved) {
      return fail('That accountable line no longer resolves on the reporting graph — it was ended or withdrawn. The register prints the gap rather than moving the accountability to another line. Nothing was saved.', 'lineId', REFUSAL(R.lineUnresolved));
    }
    return { ok: true, entry, lineId };
  }

  const refField = (value, label) => {
    const text = afrText(value, L.refMax + 20);
    if (text.length < L.refMin) return fail(`${label}: at least ${L.refMin} characters — a named reference a reviewer could actually go and look at.`);
    return text.slice(0, L.refMax);
  };

  /**
   * The moment an act is dated: the declared value where one is given (this is
   * how a back-dated paper record is entered honestly, and how the test suite
   * pins a timeline), and the acting clock's own instant otherwise. A value that
   * is present but unreadable is refused — an unparseable timestamp is never
   * silently replaced by "now".
   */
  function actInstant(input, field, { notBefore = null } = {}) {
    const raw = input[field];
    if (raw === undefined || raw === null || raw === '') return clock().toISOString();
    const at = afrInstant(raw);
    if (!at) return fail(`Give a real calendar moment for the ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.`, field, REFUSAL(R.unreadable));
    if (Date.parse(at) > clock().getTime() + 5 * 60 * 1000) {
      return fail('An act cannot be dated after the moment it is recorded.', field, REFUSAL(R.futureDated));
    }
    if (notBefore && Date.parse(at) < Date.parse(notBefore)) {
      return fail('An act cannot predate the record it answers.', field, REFUSAL(R.beforeOpened));
    }
    return at;
  }

  return {
    /**
     * Declare a finding. First-person: the acting seat is the declarant. The
     * accountable lines are declared (person + the line they hold it on); they
     * are not inferred from the reporting graph, because a machine that decides
     * who is accountable for a control failure has made the finding for you.
     */
    assuranceFindingDeclare(input = {}) {
      const check = seatFor(AFR_RIGHTS.DECLARE);
      if (!check.ok) return check;

      const controlRef = refField(input.controlRef, 'The control that did not operate');
      if (typeof controlRef !== 'string') return controlRef;
      const scopeRef = refField(input.scopeRef, 'Where it applies');
      if (typeof scopeRef !== 'string') return scopeRef;
      const criteriaRef = refField(input.criteriaRef, 'What it should have been');
      if (typeof criteriaRef !== 'string') return criteriaRef;

      const source = AFR_SOURCE_KEYS.includes(input.source) ? input.source : null;
      if (!source) return fail('Say who found it — a closed list, so “an audit said so” and “the person doing the work said so” stay different facts.', 'source', REFUSAL(R.unreadable));
      const severity = AFR_SEVERITY_KEYS.includes(input.severity) ? input.severity : null;
      if (!severity) return fail('Declare the severity. Severity is a human judgement about magnitude and likelihood, and this register never derives it from a count, a figure or a date.', 'severity', REFUSAL(R.unreadable));
      const statement = afrText(input.statement, L.textMax);
      if (statement.length < L.textMin) {
        return fail(`State what was found in at least ${L.textMin} characters — what happened, not what it means.`, 'statement', REFUSAL(R.unreadable));
      }

      const rawAccountable = Array.isArray(input.accountable) ? input.accountable : null;
      if (!rawAccountable || rawAccountable.length < L.accountableMin || rawAccountable.length > L.accountableMax) {
        return fail(`Name between ${L.accountableMin} and ${L.accountableMax} accountable line(s) — the person who holds the accountability and the line they hold it on. A cross-functional failure usually has more than one.`, 'accountable', REFUSAL(R.notAccountable));
      }
      const today = check.today;
      const activeLines = (state) => (Array.isArray(state.reportingLines) ? state.reportingLines : []).filter((line) => line
        && line.status === 'active'
        && (!line.fromISO || String(line.fromISO).slice(0, 10) <= today)
        && (!line.toISO || String(line.toISO).slice(0, 10) >= today));
      const lines = activeLines(store.state);
      const accountable = [];
      const seenPairs = new Set();
      const seenLines = new Set();
      for (const raw of rawAccountable) {
        if (!raw || typeof raw !== 'object') return fail('Each accountable line names a person and the line they hold it on.', 'accountable', REFUSAL(R.notAccountable));
        const person = rosterPerson(raw.personId);
        if (!person) return fail('Every accountable person must be on the roster.', 'accountable', REFUSAL(R.ownerUnknown));
        if (!isActive(person)) return fail(`An archived person cannot carry accountability: ${person.name || person.id}.`, 'accountable', REFUSAL(R.ownerArchived));
        const lineId = afrText(raw.lineId, 120);
        const line = lines.find((candidate) => candidate.id === lineId && candidate.personId === person.id) || null;
        if (!line) return fail(`${person.name || person.id} does not hold an active declared line with that id. Name the line they are accountable on, or declare the line first.`, 'accountable', REFUSAL(R.lineUnresolved));
        const pair = `${person.id}|${lineId}`;
        if (seenPairs.has(pair)) return fail('The same person and line is accountable once.', 'accountable', REFUSAL(R.notAccountable));
        if (seenLines.has(lineId)) return fail('A line appears once — the same line named twice would double its own roll-up.', 'accountable', REFUSAL(R.notAccountable));
        seenPairs.add(pair);
        seenLines.add(lineId);
        accountable.push({ personId: person.id, lineId });
      }

      const openedOn = afrDay(input.openedOn) || today;
      if (openedOn > today) return fail('A finding cannot be opened on a day that has not happened.', 'openedOn', REFUSAL(R.futureDated));
      let remediationDueOn = afrDay(input.remediationDueOn);
      if (!remediationDueOn) {
        const days = Number(input.remediationDays);
        if (!Number.isInteger(days) || days < L.remediationMinDays || days > L.remediationMaxDays) {
          return fail(`Declare a remediation window of ${L.remediationMinDays} to ${L.remediationMaxDays} days — a commitment the record can break visibly.`, 'remediationDays', REFUSAL(R.dueOutOfRange));
        }
        remediationDueOn = dayKey(new Date(Date.parse(`${openedOn}T00:00:00.000Z`) + days * DAY_MS));
      }
      if (remediationDueOn <= openedOn) return fail('The remediation target must fall after the day the finding was opened.', 'remediationDueOn', REFUSAL(R.dueOutOfRange));

      let verifyDueOn = afrDay(input.verifyDueOn);
      if (!verifyDueOn) {
        const days = Number(input.verificationDays);
        if (!Number.isInteger(days) || days < L.verificationMinDays || days > L.verificationMaxDays) {
          return fail(`Declare a verification window of ${L.verificationMinDays} to ${L.verificationMaxDays} days after the remediation target — the day an independent test is owed by.`, 'verificationDays', REFUSAL(R.dueOutOfRange));
        }
        verifyDueOn = dayKey(new Date(Date.parse(`${remediationDueOn}T00:00:00.000Z`) + days * DAY_MS));
      }
      if (verifyDueOn <= remediationDueOn) return fail('Verification is owed after the remediation target, not before it.', 'verifyDueOn', REFUSAL(R.dueOutOfRange));

      const existing = loadedFindings();
      if (existing.length >= L.findings) return fail('The finding register is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('afr');
      const createdAt = check.at.toISOString();
      const candidate = {
        id,
        controlRef,
        scopeRef,
        criteriaRef,
        source,
        severity,
        statement,
        accountable,
        declaredById: check.actorId,
        openedOn,
        remediationDueOn,
        verifyDueOn,
        createdAt,
      };
      const loaded = normalizeFindings([...existing, candidate], []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The finding could not be stored as a row this register can read back. Nothing was saved.', 'statement', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.assuranceFindings = Array.isArray(draft.assuranceFindings) ? draft.assuranceFindings : [];
        draft.assuranceFindings.push(stored);
      }, {
        type: AFR_EVENTS.DECLARED,
        entity: 'assurance-finding',
        entityId: id,
        summary: `Assurance finding declared on ${stored.controlRef} (${stored.scopeRef}) — ${stored.severity}, ${stored.accountable.length} accountable line(s); remediation owed by ${stored.remediationDueOn}, independent verification by ${stored.verifyDueOn}.`.slice(0, 300),
      });
      return saved({ findingId: id, accountable: stored.accountable });
    },

    /**
     * Assign — the holder of an accountable line names the remediation owner
     * and the day. First-person: the acting seat must BE the holder, so a line
     * can never be assigned by somebody else on its behalf.
     */
    assuranceFindingAssign(input = {}) {
      const check = seatFor(AFR_RIGHTS.REMEDIATE);
      if (!check.ok) return check;
      const ctx = findingContext(check, input.findingId);
      if (!ctx.ok) return ctx;
      if (CLOSED_STATES.includes(ctx.row.state)) return fail('This finding is closed. Nothing more is owed on it.', 'findingId', REFUSAL(R.alreadyClosed));
      const line = lineContext(ctx, input);
      if (!line.ok) return line;
      const { entry } = line;
      if (entry.personId !== check.actorId) {
        return fail('Only the holder of an accountable line names its remediation owner — being named accountable is an ask, and the holder’s own act is what puts the work on the record.', 'lineId', REFUSAL(R.notAccountable));
      }
      if (entry.lineState !== 'unassigned') {
        return fail('This line already carries an assignment. A second never overwrites the first.', 'lineId', REFUSAL(R.alreadyAssigned));
      }
      const owner = rosterPerson(input.ownerId);
      if (!owner) return fail('Name the person who owns the fix. The owner is a person this workspace can see, or the assignment is not recorded.', 'ownerId', REFUSAL(R.ownerUnknown));
      if (!isActive(owner)) return fail('The named owner is archived on the roster. An archived person cannot own a fix.', 'ownerId', REFUSAL(R.ownerArchived));
      if (!reach(check.seat, owner.id)) {
        return fail('The named owner is neither in this seat’s tree nor on an active Matrix line this seat holds. Name an owner this seat can reach.', 'ownerId', REFUSAL(R.ownerOutOfReach));
      }
      const note = afrText(input.note, L.textMax);
      if (note.length < L.textMin) return fail(`Say why this owner and this day, in at least ${L.textMin} characters — the reason is what makes the assignment readable later.`, 'note', REFUSAL(R.unreadable));
      const dueOn = afrDay(input.dueOn);
      if (!dueOn) return fail('Give a real calendar day the fix is owed by.', 'dueOn', REFUSAL(R.dueOutOfRange));
      if (dueOn < check.today) return fail('The fix cannot be owed on a day that has already passed.', 'dueOn', REFUSAL(R.dueOutOfRange));
      if (dueOn > ctx.finding.remediationDueOn) {
        return fail(`A line may not promise later than the finding does. This finding’s remediation target is ${ctx.finding.remediationDueOn}; a line that needs longer is a new finding, not a silent extension.`, 'dueOn', REFUSAL(R.dueOutOfRange));
      }
      const assignedAt = actInstant(input, 'assignedAt', { notBefore: ctx.finding.createdAt });
      if (typeof assignedAt !== 'string') return assignedAt;

      const existingActs = loadedActs(ctx.findings);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('afa');
      const act = {
        id, findingId: ctx.finding.id, actorId: check.actorId, kind: 'assign',
        lineHolderId: entry.personId, lineId: entry.lineId,
        ownerId: owner.id, dueOn, note, assignedAt,
      };
      const loaded = normalizeFindingActs([...existingActs, act], ctx.findings, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The assignment could not be stored as an act this register can read back. Nothing was saved.', 'note', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.assuranceFindingActs = Array.isArray(draft.assuranceFindingActs) ? draft.assuranceFindingActs : [];
        draft.assuranceFindingActs.push(stored);
      }, {
        type: AFR_EVENTS.ASSIGNED,
        entity: 'assurance-finding',
        entityId: ctx.finding.id,
        summary: `Remediation owner named on one accountable line of ${ctx.finding.id}; the fix is owed by ${dueOn}. The owner cannot verify their own fix.`.slice(0, 300),
      });
      return saved({ actId: id, ownerId: owner.id, dueOn });
    },

    /** The named owner's assertion — a claim, never a closure. */
    assuranceFindingAssert(input = {}) {
      const check = seatFor(AFR_RIGHTS.REMEDIATE);
      if (!check.ok) return check;
      const ctx = findingContext(check, input.findingId);
      if (!ctx.ok) return ctx;
      if (CLOSED_STATES.includes(ctx.row.state)) return fail('This finding is closed. Nothing more is owed on it.', 'findingId', REFUSAL(R.alreadyClosed));
      const line = lineContext(ctx, input);
      if (!line.ok) return line;
      const { entry } = line;
      if (entry.ownerId !== check.actorId) {
        return fail('Only the named remediation owner asserts the fix on this line. This line names somebody else.', 'lineId', REFUSAL(R.notOwner));
      }
      if (entry.lineState === 'unassigned') {
        return fail('This line carries no assignment, so there is no owner to assert it. Nothing was saved.', 'lineId', REFUSAL(R.noAssignment));
      }
      if (entry.lineState === 'asserted') {
        return fail('Your assertion is already on the record and awaits independent verification. A second assertion is not a stronger fix.', 'lineId', REFUSAL(R.assertionPending));
      }
      const changeText = afrText(input.changeText, L.textMax);
      if (changeText.length < L.textMin) return fail(`Say what actually changed, in at least ${L.textMin} characters — the control, the step, the system.`, 'changeText', REFUSAL(R.unreadable));
      const evidenceRef = afrText(input.evidenceRef, L.refMax + 20);
      if (evidenceRef.length < L.refMin) return fail(`Name the evidence you would show a reviewer — a record, a report, a test, a sample — in at least ${L.refMin} characters.`, 'evidenceRef', REFUSAL(R.unreadable));
      const assertedAt = actInstant(input, 'assertedAt', { notBefore: entry.assignedOn ? `${entry.assignedOn}T00:00:00.000Z` : ctx.finding.createdAt });
      if (typeof assertedAt !== 'string') return assertedAt;

      const existingActs = loadedActs(ctx.findings);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('afa');
      const act = {
        id, findingId: ctx.finding.id, actorId: check.actorId, kind: 'assert',
        lineHolderId: entry.personId, lineId: entry.lineId,
        changeText, evidenceRef: evidenceRef.slice(0, L.refMax), assertedAt,
      };
      const loaded = normalizeFindingActs([...existingActs, act], ctx.findings, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The assertion could not be stored as an act this register can read back. Nothing was saved.', 'changeText', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.assuranceFindingActs = Array.isArray(draft.assuranceFindingActs) ? draft.assuranceFindingActs : [];
        draft.assuranceFindingActs.push(stored);
      }, {
        type: AFR_EVENTS.ASSERTED,
        entity: 'assurance-finding',
        entityId: ctx.finding.id,
        summary: `A fix is asserted on one accountable line of ${ctx.finding.id}. It closes nothing: an independent verification is now owed.`.slice(0, 300),
      });
      return saved({ actId: id, state: 'asserted-awaiting-verification' });
    },

    /**
     * Verify — the independent key. Strictly above the owner on the reporting
     * DAG, never the owner, never a subordinate, never the same hand twice in a
     * row. A rejection returns the line to remediation owed.
     */
    assuranceFindingVerify(input = {}) {
      const check = seatFor(AFR_RIGHTS.VERIFY);
      if (!check.ok) return check;
      const ctx = findingContext(check, input.findingId);
      if (!ctx.ok) return ctx;
      if (CLOSED_STATES.includes(ctx.row.state)) return fail('This finding is closed. Nothing more is owed on it.', 'findingId', REFUSAL(R.alreadyClosed));
      const line = lineContext(ctx, input);
      if (!line.ok) return line;
      const { entry } = line;
      if (entry.lineState === 'unassigned' || entry.lineState === 'remediating') {
        return fail('Nothing has been asserted on this line yet, so there is nothing to test.', 'lineId', REFUSAL(R.nothingToVerify));
      }
      if (entry.lineState === 'verified') {
        return fail('This line’s fix is already verified. A second verification of the same assertion is not independence.', 'lineId', REFUSAL(R.verificationCurrent));
      }
      if (entry.lineState === 'rejected' && entry.assertionCount < 1) {
        return fail('This line owes a fresh assertion before it can be tested again.', 'lineId', REFUSAL(R.nothingToVerify));
      }
      const decision = AFR_DECISIONS.includes(input.decision) ? input.decision : null;
      if (!decision) return fail('Record “confirm” or “reject” — a closed list, so the counts mean one thing.', 'decision', REFUSAL(R.unreadable));
      // INDEPENDENCE. The same predicate the badge uses, so the register never
      // promises a seat a verification the action then refuses.
      const matrix = buildMatrix(store.state, { now: check.at, settings: { ...check.cfg, activeSeatId: null } });
      if (!assuranceVerifierReach(matrix, check.seat, entry.ownerId)) {
        return fail(decision === 'reject'
          ? 'Rejection is also an independent act: you must sit strictly above the remediation owner on the reporting graph — never be the owner, never be below them, never be on an unrelated branch. Nothing was saved.'
          : 'Verification is an independent key: you must sit strictly above the remediation owner on the reporting graph — never be the owner, never be below them, never be on an unrelated branch. The person who owns the fix does not grade it.', 'lineId', REFUSAL(R.notIndependent));
      }
      const methodText = afrText(input.methodText, L.textMax);
      if (methodText.length < L.textMin) return fail(`Say how you tested it, in at least ${L.textMin} characters — what you looked at, over what period, and what you saw.`, 'methodText', REFUSAL(R.unreadable));
      const verifiedAt = actInstant(input, 'verifiedAt', { notBefore: entry.assertedOn ? `${entry.assertedOn}T00:00:00.000Z` : ctx.finding.createdAt });
      if (typeof verifiedAt !== 'string') return verifiedAt;

      const existingActs = loadedActs(ctx.findings);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('afa');
      const act = {
        id, findingId: ctx.finding.id, actorId: check.actorId, kind: 'verify',
        lineHolderId: entry.personId, lineId: entry.lineId,
        decision, methodText, verifiedAt,
      };
      const loaded = normalizeFindingActs([...existingActs, act], ctx.findings, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The verification could not be stored as an act this register can read back. Nothing was saved.', 'methodText', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.assuranceFindingActs = Array.isArray(draft.assuranceFindingActs) ? draft.assuranceFindingActs : [];
        draft.assuranceFindingActs.push(stored);
      }, {
        type: AFR_EVENTS.VERIFIED,
        entity: 'assurance-finding',
        entityId: ctx.finding.id,
        summary: decision === 'confirm'
          ? `An independent seat verified the fix on one accountable line of ${ctx.finding.id}.`
          : `An independent seat REJECTED the fix on one accountable line of ${ctx.finding.id}; remediation is owed again.`,
      });
      return saved({ actId: id, decision });
    },

    /**
     * Accept — the residual risk, by a named executive who does not own the
     * remediation. This is the only way a finding closes without verification,
     * and it is dated, reasoned and reviewable.
     */
    assuranceFindingAccept(input = {}) {
      const check = seatFor(AFR_RIGHTS.ACCEPT);
      if (!check.ok) return check;
      if (!check.seat.fullAccess && !(Number(check.seat.rank) >= L.acceptMinRank)) {
        return fail(`Accepting a residual risk is an executive act (rank ${L.acceptMinRank} or above). This seat does not carry that altitude.`, null, REFUSAL(R.notAuthority));
      }
      const ctx = findingContext(check, input.findingId);
      if (!ctx.ok) return ctx;
      if (CLOSED_STATES.includes(ctx.row.state)) return fail('This finding is already closed. An acceptance cannot be stacked on a closure.', 'findingId', REFUSAL(R.alreadyClosed));
      const owners = ctx.row.accountable.map((entry) => entry.ownerId).filter(Boolean);
      if (owners.includes(check.actorId)) {
        return fail('The party who owns the remediation does not decide that the enterprise can live with the risk. Acceptance is refused from a remediation owner on this finding.', 'findingId', REFUSAL(R.acceptorIsOwner));
      }
      const reason = afrText(input.reason, L.textMax);
      if (reason.length < L.textMin) return fail(`Say why the residual risk is acceptable, in at least ${L.textMin} characters — what it would cost to fix, and what the enterprise is choosing instead.`, 'reason', REFUSAL(R.unreadable));
      const reviewOn = afrDay(input.reviewOn);
      if (!reviewOn) return fail('Give a real calendar day this acceptance is revisited.', 'reviewOn', REFUSAL(R.unreadable));
      if (reviewOn <= check.today) return fail('An acceptance is revisited on a future day, or it is not a review at all.', 'reviewOn', REFUSAL(R.unreadable));
      const acceptedAt = actInstant(input, 'acceptedAt', { notBefore: ctx.finding.createdAt });
      if (typeof acceptedAt !== 'string') return acceptedAt;

      const existingActs = loadedActs(ctx.findings);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL(R.ledgerFull));
      const id = idFactory('afa');
      const act = {
        id, findingId: ctx.finding.id, actorId: check.actorId, kind: 'accept',
        reason, reviewOn, acceptedAt,
      };
      const loaded = normalizeFindingActs([...existingActs, act], ctx.findings, []);
      const stored = loaded.find((row) => row.id === id) || null;
      if (!stored) return fail('The acceptance could not be stored as an act this register can read back. Nothing was saved.', 'reason', REFUSAL(R.unreadable));
      store.update((draft) => {
        draft.assuranceFindingActs = Array.isArray(draft.assuranceFindingActs) ? draft.assuranceFindingActs : [];
        draft.assuranceFindingActs.push(stored);
      }, {
        type: AFR_EVENTS.ACCEPTED,
        entity: 'assurance-finding',
        entityId: ctx.finding.id,
        summary: `The residual risk on ${ctx.finding.id} was accepted by a named authority, to be revisited on ${reviewOn}. This is not a verification.`,
      });
      return saved({ actId: id, state: 'closed-accepted', reviewOn });
    },

    /** Run the rule now. The pause governs this path exactly as it governs a commit. */
    assuranceFindingScan() {
      const check = seatFor(AFR_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: AFR_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${AFR_ROUTE}#${AFR_RULE_ID}`,
        summary: `Assurance finding register scan requested (${AFR_RULE_ID}): overdue remediation, overdue verification and repeat findings re-read from the record.`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ----------------------------------------------------------------- reads */

    assuranceFindingReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildAssuranceReport(store.state, { now: check.at, seat: check.seat });
    },

    assuranceFindingAttentionCount() {
      const { seat, at } = readSeat();
      return assuranceFindingAttentionCount(store.state, { now: at, seat });
    },

    /**
     * Dialog support: the active declared lines a declaration may name as
     * accountable (each with its holder and manager, so the dialog never
     * guesses a line), and the reachable, active people an assignment may name
     * as remediation owner.
     */
    assuranceFindingCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const today = check.today;
      const personName = (id) => {
        const person = rosterPerson(id);
        return person ? (person.name || id) : id;
      };
      const lines = (Array.isArray(store.state.reportingLines) ? store.state.reportingLines : [])
        .filter((line) => line && line.status === 'active'
          && (!line.fromISO || String(line.fromISO).slice(0, 10) <= today)
          && (!line.toISO || String(line.toISO).slice(0, 10) >= today))
        .map((line) => ({
          id: line.id,
          personId: line.personId,
          personName: personName(line.personId),
          managerId: line.managerId,
          managerName: personName(line.managerId),
          kind: line.kind || 'line',
        }))
        .sort((a, b) => String(a.personName).localeCompare(String(b.personName)) || String(a.id).localeCompare(String(b.id)));
      const owners = rows('people')
        .filter((row) => row && row.id && isActive(row) && reach(check.seat, row.id))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || row.level || '' }));
      return { ok: true, lines, owners };
    },
  };
}

export default createAssuranceFindingActions;
