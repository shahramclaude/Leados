/**
 * app/core/domain/domainSenseActions.js — the seat-checked commands of the
 * Decision-Domain Sensing Register (ADR-0228, Cynefin, `RULE-DSN-01`).
 *
 * FOUR human acts and a scan, and nothing else: DECLARE a decision (owner,
 * panel on declared lines, sensing window), ASSESS it (a declared panel
 * member, on the line declared for them, never the owner, with evidence
 * matched to the domain stated) and COMMIT a mode (the owner, once). Every
 * domain, fit state and count is re-derived on read by `domainSense.js`;
 * nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A decision is a DECLARED record: its title, owner, panel, window and
 *    basis evidence are human declarations. Nothing is inferred from a case,
 *    a strategy cycle, a risk statement or the reporting graph.
 *  - An assessment counts only from a declared panel member, on the line
 *    declared for that member, once, and never from the owner. A reading
 *    whose basis does not support its domain is refused by the reader and
 *    printed, never counted.
 *  - One mode commitment per decision, by the owner only; a second is
 *    refused and the first stands.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused
 *    now.
 */

import { dayKey } from '../time.js';
import { dsnId, dsnInstant, normalizeDecisions, normalizeDecisionActs } from './domainSenseSchema.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { buildDomainSense } from './domainSense.js';
import {
  DSN_LIMITS as L,
  DSN_RIGHTS,
  DSN_EVENTS,
  DSN_RULE_ID,
  DSN_HREF,
  DSN_MODE_KEYS,
  DSN_DOMAIN_KEYS,
} from './domainSenseRegistry.js';

const REFUSAL = (key) => `domain-sense:${key}`;
const NOT_SEATED = 'No seat is resolved. Declare a valid seat before acting; the domain register is never changed from an unknown operating position.';

function dsnText(value, max = L.textMax) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function createDomainSenseActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, ok: true });

  /** The acting seat and its PERSON. Every act here is a named person's act. */
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
      return fail('A domain decision is a named person\'s declaration. The undeclared operator view cannot speak for one — declare a seat on the Altitude Lens.', null, REFUSAL('no-actor'));
    }
    const person = rows('people').find((row) => row && row.id === actorId) || null;
    if (!person) return fail('This seat is not a person on the roster. Nothing is declared in their place.', null, REFUSAL('actor-not-on-roster'));
    return { ok: true, seat, at, cfg, actorId, person, today: dayKey(at) };
  }

  function readSeat() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    return { seat: activeSeat(built), at, cfg };
  }

  function readCheck() {
    const resolved = readSeat();
    if (resolved.seat.readOnly) return fail(NOT_SEATED);
    const verdict = canAct(DSN_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...resolved };
  }

  function rosterPerson(id) {
    const key = dsnId(id, 120);
    if (!key) return null;
    return rows('people').find((row) => row && row.id === key) || null;
  }

  const isActive = (person) => Boolean(person) && person.status !== 'archived';

  /** Decisions the register already holds, normalized the same way a reload would. */
  function loadedDecisions() {
    return normalizeDecisions(rows('domainDecisions'), []);
  }

  /** Acts the register already holds, normalized against the live decisions. */
  function loadedActs() {
    return normalizeDecisionActs(rows('domainSenseActs'), loadedDecisions(), []);
  }

  function decisionContext(decisionId) {
    const key = dsnId(decisionId, 120);
    if (!key) return fail('Name the decision.', 'decisionId', REFUSAL('decision-id-missing'));
    const decision = loadedDecisions().find((row) => row.id === key) || null;
    if (!decision) return fail('That decision is not on this register.', 'decisionId', REFUSAL('unknownDecision'));
    return { ok: true, decision };
  }

  const hasAssess = (decisionId, actorId) => loadedActs()
    .some((act) => act.kind === 'assess' && act.decisionId === decisionId && act.actorId === actorId);
  const hasCommit = (decisionId) => loadedActs()
    .some((act) => act.kind === 'commit' && act.decisionId === decisionId);

  function panelSeat(decision, memberId, lineId) {
    return decision.panel.find((seat) => seat.memberId === memberId && seat.lineId === lineId) || null;
  }

  return {
    /**
     * Declare a decision. The owner, the panel (each member on a declared
     * line) and the sensing window are declared; nothing is chosen by the
     * system and nothing is inferred.
     */
    domainDeclare(input = {}) {
      const check = seatFor(DSN_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const title = dsnText(input.title, L.titleMax);
      if (title.length < L.titleMin) {
        return fail(`Name the decision in at least ${L.titleMin} characters — the matter, and why its kind of cause and effect needs stating.`, 'title', REFUSAL('title-invalid'));
      }
      const owner = rosterPerson(input.ownerId);
      if (!owner || !isActive(owner)) {
        return fail('Name the owner as an active person on this roster. An owner nobody can identify cannot commit a mode.', 'ownerId', REFUSAL('owner-unknown'));
      }
      const rawPanel = Array.isArray(input.panel) ? input.panel : [];
      if (rawPanel.length < L.panelMin || rawPanel.length > L.panelMax) {
        return fail(`Declare between ${L.panelMin} and ${L.panelMax} panel members.`, 'panel', REFUSAL('panel-size'));
      }
      const seen = new Set();
      const panel = [];
      for (const raw of rawPanel) {
        const memberId = dsnId(raw.memberId, 120);
        const lineId = dsnId(raw.lineId, 120);
        if (!memberId || !lineId || seen.has(memberId)) return fail('Each panel member needs a distinct person and a declared line.', 'panel', REFUSAL('panel-invalid'));
        const member = rosterPerson(memberId);
        if (!member || !isActive(member)) return fail(`Panel member ${memberId} is not an active person on this roster.`, 'panel', REFUSAL('panel-member-unknown'));
        seen.add(memberId);
        panel.push({ memberId, lineId });
      }
      const openedAt = dsnInstant(input.openedAt) || check.at.toISOString();
      if (Date.parse(openedAt) > check.at.getTime() + 5 * 60 * 1000) {
        return fail('A decision cannot be opened after the moment it is declared.', 'openedAt', REFUSAL('opened-in-future'));
      }
      let senseByAt = dsnInstant(input.senseByAt);
      if (!senseByAt) {
        const days = Number(input.senseInDays);
        if (!Number.isInteger(days) || days < L.senseMinDays || days > L.senseMaxDays) {
          return fail(`Declare a sensing window of ${L.senseMinDays} to ${L.senseMaxDays} days.`, 'senseInDays', REFUSAL('window-invalid'));
        }
        senseByAt = new Date(Date.parse(openedAt) + days * 86400000).toISOString();
      }
      const windowDays = (Date.parse(senseByAt) - Date.parse(openedAt)) / 86400000;
      if (!(windowDays >= L.senseMinDays && windowDays <= L.senseMaxDays)) {
        return fail(`The sensing window must fall between ${L.senseMinDays} and ${L.senseMaxDays} days after opening.`, 'senseByAt', REFUSAL('window-invalid'));
      }
      if (loadedDecisions().length >= L.decisions) return fail('The decision register is full. Nothing was saved.', null, REFUSAL('register-full'));
      const id = idFactory('dsn');
      const row = { id, title, ownerId: owner.id, panel, openedAt, senseByAt };
      const loaded = normalizeDecisions([...loadedDecisions(), row], []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The decision could not be stored as a row this register can read back. Nothing was saved.', 'title', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.domainDecisions = Array.isArray(draft.domainDecisions) ? draft.domainDecisions : [];
        draft.domainDecisions.push(stored);
      }, {
        type: DSN_EVENTS.DECLARED,
        entity: 'domainDecision',
        entityId: id,
        summary: `Decision-domain sensing: ${stored.title} declared, owned by ${stored.ownerId}, panel of ${stored.panel.length}, sensing window closes ${stored.senseByAt}`.slice(0, 300),
      });
      return saved({ decisionId: id });
    },

    /**
     * Assess — a declared panel member, on the line declared for them, once,
     * never the owner, with evidence matched to the domain stated. The reader
     * refuses a basis that does not support the domain; nothing here repairs
     * a reading.
     */
    domainAssess(input = {}) {
      const check = seatFor(DSN_RIGHTS.ASSESS);
      if (!check.ok) return check;
      const ctx = decisionContext(input.decisionId);
      if (!ctx.ok) return ctx;
      const { decision } = ctx;
      const seat = panelSeat(decision, check.actorId, input.lineId);
      if (!seat) {
        return fail('You are not a declared member of this panel on that line — a reading counts only from the line it was declared on.', 'lineId', REFUSAL('notOnPanel'));
      }
      if (check.actorId === decision.ownerId) {
        return fail('The owner does not assess their own decision. The party who gains from calling it clear or complicated does not grade it.', null, REFUSAL('ownerSelfAssessment'));
      }
      if (hasAssess(decision.id, check.actorId)) {
        return fail('You have already recorded your reading on this decision. A second never overwrites the first.', null, REFUSAL('alreadyAssessed'));
      }
      const domain = DSN_DOMAIN_KEYS.includes(input.domain) ? input.domain : null;
      if (!domain) return fail('State the domain: clear, complicated, complex, chaotic or disorder.', 'domain', REFUSAL('domain-invalid'));
      const assessedAt = dsnInstant(input.assessedAt) || check.at.toISOString();
      if (Date.parse(assessedAt) > check.at.getTime() + 5 * 60 * 1000) {
        return fail('A reading cannot be dated after the moment it is recorded.', 'assessedAt', REFUSAL('assessed-in-future'));
      }
      if (Date.parse(assessedAt) < Date.parse(decision.openedAt)) {
        return fail('A reading cannot predate the decision it senses.', 'assessedAt', REFUSAL('beforeOpened'));
      }
      const basis = input.basis && typeof input.basis === 'object' && !Array.isArray(input.basis) ? input.basis : null;
      const existingActs = loadedActs();
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL('acts-full'));
      const id = idFactory('dsa');
      const act = { id, decisionId: decision.id, actorId: check.actorId, kind: 'assess', lineId: seat.lineId, domain, basis, at: assessedAt };
      const loaded = normalizeDecisionActs([...existingActs, act], loadedDecisions(), []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The reading could not be stored as an act this register can read back. Nothing was saved.', 'basis', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.domainSenseActs = Array.isArray(draft.domainSenseActs) ? draft.domainSenseActs : [];
        draft.domainSenseActs.push(stored);
      }, {
        type: DSN_EVENTS.ASSESSED,
        entity: 'domainDecision',
        entityId: decision.id,
        summary: `Decision-domain sensing: a reading on ${decision.id} from ${check.actorId} on ${seat.lineId}, basis ${basis.kind}`.slice(0, 300),
      });
      return saved({ actId: id });
    },

    /** The owner's single mode commitment — read for fit, never enforced. */
    domainCommit(input = {}) {
      const check = seatFor(DSN_RIGHTS.COMMIT);
      if (!check.ok) return check;
      const ctx = decisionContext(input.decisionId);
      if (!ctx.ok) return ctx;
      const { decision } = ctx;
      if (check.actorId !== decision.ownerId) {
        return fail('Only the named owner commits a mode for this decision. A manager on another line cannot commit in their place.', null, REFUSAL('notOwner'));
      }
      if (hasCommit(decision.id)) {
        return fail('A mode is already committed on this decision. A second commitment is refused and the first stands.', null, REFUSAL('alreadyCommitted'));
      }
      const mode = DSN_MODE_KEYS.includes(input.mode) ? input.mode : null;
      if (!mode) return fail('Commit to a mode: standard practice, expert analysis, safe-to-fail probe, stabilise first or decompose.', 'mode', REFUSAL('mode-invalid'));
      const rationale = dsnText(input.rationale, L.textMax);
      if (rationale.length < L.textMin) {
        return fail(`Say why this mode fits the domain, in at least ${L.textMin} characters.`, 'rationale', REFUSAL('rationale-missing'));
      }
      const committedAt = dsnInstant(input.committedAt) || check.at.toISOString();
      if (Date.parse(committedAt) > check.at.getTime() + 5 * 60 * 1000) {
        return fail('A commitment cannot be dated after the moment it is recorded.', 'committedAt', REFUSAL('committed-in-future'));
      }
      if (Date.parse(committedAt) < Date.parse(decision.openedAt)) {
        return fail('A commitment cannot predate the decision it answers.', 'committedAt', REFUSAL('beforeOpened'));
      }
      const existingActs = loadedActs();
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL('acts-full'));
      const id = idFactory('dsa');
      const act = { id, decisionId: decision.id, actorId: check.actorId, kind: 'commit', mode, rationale, at: committedAt };
      const loaded = normalizeDecisionActs([...existingActs, act], loadedDecisions(), []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The commitment could not be stored as an act this register can read back. Nothing was saved.', 'rationale', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.domainSenseActs = Array.isArray(draft.domainSenseActs) ? draft.domainSenseActs : [];
        draft.domainSenseActs.push(stored);
      }, {
        type: DSN_EVENTS.COMMITTED,
        entity: 'domainDecision',
        entityId: decision.id,
        summary: `Decision-domain sensing: the owner committed the ${mode} mode on ${decision.id}`.slice(0, 300),
      });
      return saved({ actId: id });
    },

    /** Re-read the register: overdue and stale flags are recomputed from the record. */
    domainScan() {
      const check = seatFor(DSN_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: DSN_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${DSN_HREF}#${DSN_RULE_ID}`,
        summary: `Decision-domain sensing register scan requested (${DSN_RULE_ID}): overdue windows and stale readings re-read from the record.`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ----------------------------------------------------------------- reads */

    domainSenseReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildDomainSense(store.state, { now: check.at });
    },

    domainSenseAttentionCount() {
      const { seat, at } = readSeat();
      const personId = seat.fullAccess ? null : (seat.nodeId || seat.id || null);
      if (!personId) return 0;
      const report = buildDomainSense(store.state, { now: at });
      let owed = 0;
      for (const row of report.rows) {
        let owes = false;
        if (row.ownerId === personId && !row.commit) owes = true;
        if (!owes) {
          for (const seatRow of row.panel) {
            if (seatRow.memberId === personId && seatRow.memberId !== row.ownerId && !row.readings.some((r) => r.assessorId === personId)) {
              owes = true;
              break;
            }
          }
        }
        if (owes) owed += 1;
      }
      return owed;
    },

    /** Dialog support: the active people who can be named as owner or panel. */
    domainSenseCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      return rows('people')
        .filter((row) => row && row.id && isActive(row))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || row.level || '', level: row.level || '' }));
    },

    /** Active people with the lines they hold — for declaring a panel on declared lines. */
    domainSensePanelCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const byPerson = new Map();
      for (const raw of rows('reportingLines')) {
        if (!raw || raw.status !== 'active') continue;
        let list = byPerson.get(raw.personId);
        if (!list) { list = []; byPerson.set(raw.personId, list); }
        list.push({ id: raw.id, managerId: raw.managerId || '', kind: raw.kind || '' });
      }
      const nameOf = new Map();
      for (const p of rows('people')) if (p && p.id) nameOf.set(p.id, p.name || p.id);
      return rows('people')
        .filter((row) => row && row.id && isActive(row))
        .map((row) => ({
          id: row.id,
          name: row.name || row.id,
          role: row.role || row.level || '',
          level: row.level || '',
          lines: (byPerson.get(row.id) || []).map((l) => ({ ...l, managerName: nameOf.get(l.managerId) || l.managerId })),
        }));
    },
  };
}
