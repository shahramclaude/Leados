/**
 * app/core/domain/incidentCommandActions.js — the seat-checked commands of the
 * Major-Incident Command & Notification-Clock Register (ADR-0240, Schema v194).
 *
 * ELEVEN human acts and a scan, and nothing else: DECLARE an incident, ASSIGN a
 * response line's lead and duty, ACCEPT a line in your own name, ASSUME command,
 * TRANSFER command to a named successor, CLOSE the operational incident,
 * STAND COMMAND DOWN, RECORD a notification against its obligation, CHANGE the
 * declared severity, SET the conventions, and SCAN. Every state, interval,
 * deadline and notification verdict is re-derived on read by `incidentCommand.js`;
 * nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A DECLARATION REQUIRES A WRITTEN CRITERION. The severity is declared
 *    against the criterion the seat writes, and the criterion is printed beside
 *    the severity from then on. "It felt like a P1" is not a declaration.
 *  - DETECTION IS NOT DECLARATION. Both instants are required and the detection
 *    instant must precede or equal the declaration. A declaration recorded with
 *    no detection instant is refused, because the interval the register exists to
 *    print would otherwise be manufactured from the creation time.
 *  - A DECLARED CLOCK REQUIRES A SOURCE AND A WHOLE-MINUTE PERIOD. A deadline
 *    with no instrument behind it is a number somebody typed, and the register
 *    will not print a legal deadline it cannot source.
 *  - A NOTIFICATION REQUIRES ONE OF THE INCIDENT'S OWN CLOCKS. An obligation
 *    that names no clock can never be due, and an invented deadline is worse
 *    than a printed gap — so the gap is what gets printed, with its reason.
 *  - COMMAND TRANSFERS TO A NAMED HAND, WITH A REASON, AND ONLY FROM A HOLDER.
 *    A handover from nobody is not a handover; a handover to the sender is not a
 *    handover; a successor must be able to reach the lines they will command.
 *  - SEVERITY IS RAISED BY ANYONE HOLDING A LINE AND LOWERED ONLY BY THE
 *    COMMANDER. Raising is the safe direction and must never wait for a seat.
 *  - RESOLUTION AND STAND-DOWN ARE SEPARATE ACTS IN THAT ORDER. Only the
 *    commander closes the incident; only the commander releases command; and
 *    command may not be released before the incident is closed.
 *  - EVERY WRITE IS RUN THROUGH THE LOADER. A write the loader would refuse on
 *    reload is refused now, at the door, with the reason — never written and
 *    then silently dropped by the next load.
 *  - A STOOD-DOWN OR RESOLVED INCIDENT TAKES NO FURTHER ACTS except a declared
 *    recurrence, which is a NEW incident naming the one it follows.
 */

import { dayKey, toDate } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { incidentAttentionCount, incidentReport } from './incidentCommand.js';
import {
  normalizeMicIncidents,
  normalizeMicActs,
  normalizeMicSettings,
  micClockMinutes,
  micId,
  micInstant,
  micRef,
  micText,
} from './incidentCommandSchema.js';
import {
  MIC_BOUNDS,
  MIC_CLOCK_ORIGIN_KEYS,
  MIC_CLOCK_SOURCE_KEYS,
  MIC_EVENTS,
  MIC_LIMITS as L,
  MIC_NOTIFY_PARTY_KEYS,
  MIC_REFUSALS,
  MIC_RESPONSE_DUTIES,
  MIC_RIGHTS,
  MIC_ROUTE,
  MIC_SEVERITY_KEYS,
  MIC_SETTING_KEYS,
  responseDutyRow,
  responseDutyText,
  severityRank,
} from './incidentCommandRegistry.js';

const REFUSAL = (key) => `incidentCommand:${key}`;

export function createIncidentCommandActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const ok = (extra = {}) => ({ ok: true, ...extra });
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
    if (seat.readOnly) return fail(MIC_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank check
   * — so the right is re-proved HERE, exactly as every register in this
   * workspace re-proves it.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(MIC_REFUSALS.notSeated);
    const verdict = canAct(MIC_RIGHTS.READ, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg };
  }

  function matrixFor(at, cfg) {
    return buildMatrix(store.state, { now: at, settings: cfg });
  }

  /**
   * Is this identifier a real hand for a commanding role? The undeclared
   * operator seat (`leader`) IS a legitimate commander — it is the workspace's
   * own single-operator view — but it is not a roster person, and the two facts
   * must never be conflated. Before this test existed, an operator seat could
   * take command and then be told "that person is not on the active roster" on
   * the very next act, which is a door that lies about why it refused.
   *
   * An ARCHIVED roster person is never a legal hand.
   */
  function personOrOperator(id) {
    if (!id) return null;
    if (id === 'leader') return { id: 'leader', name: 'Operator seat', status: 'active', operator: true };
    return rows('people').find((row) => row && row.id === id) || null;
  }

  function isLegalHand(id) {
    const person = personOrOperator(id);
    return Boolean(person) && person.status !== 'archived';
  }

  function holdsPerson(check, personId, matrix) {
    if (!personId) return false;
    if (check.seat.fullAccess) return true;
    const nodeId = check.seat.nodeId || check.seat.id || null;
    if (personId === nodeId) return true;
    if (check.seat.scope?.has?.(personId)) return true;
    if (check.seat.lineScope?.has?.(personId)) return true;
    return false;
  }

  function liveIncident(check, incidentId, { allowResolved = false, allowStoodDown = false } = {}) {
    const id = micId(incidentId);
    if (!id) return { error: fail('Choose an incident.', 'incidentId') };
    const report = incidentReport(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    const incident = report.incidents.find((row) => row.id === id) || null;
    if (!incident) return { error: fail(MIC_REFUSALS.notFound, 'incidentId', REFUSAL('not-found')) };
    if (!allowStoodDown && incident.state === 'stood-down') {
      return { error: fail(MIC_REFUSALS.alreadyStoodDown, 'incidentId', REFUSAL('stood-down')) };
    }
    if (!allowResolved && incident.resolvedAt) {
      return { error: fail(MIC_REFUSALS.alreadyResolved, 'incidentId', REFUSAL('resolved')) };
    }
    return { incident, report };
  }

  /**
   * Who may act on an incident: the commander, a line lead, the declarer, or a
   * seat that holds one of the people on it through the tree or a declared line.
   * A seat that holds nobody on the incident writes nothing on it.
   */
  function partyTo(check, incident, matrix) {
    if (check.seat.fullAccess) return true;
    const nodeId = check.seat.nodeId || check.seat.id || null;
    if (!nodeId) return false;
    if (incident.commanderId === nodeId) return true;
    if (incident.declaredById === nodeId) return true;
    if (incident.lines.some((line) => line.leadId === nodeId)) return true;
    return incident.peopleIds.some((id) => holdsPerson(check, id, matrix));
  }

  function canReach(check, personId, matrix) {
    if (!personId) return false;
    if (check.seat.fullAccess) return true;
    return holdsPerson(check, personId, matrix);
  }

  /**
   * Would this person be able to reach the incident's lines as commander? The
   * test is the reporting graph's own: the candidate must sit strictly ABOVE
   * every line lead, or hold that lead on a declared reporting line. A
   * successor who cannot reach a single line would be a commander in name only —
   * the exact vacancy a handover is supposed to close.
   */
  function reachesLines(check, incident, matrix, personId) {
    if (check.seat.fullAccess) return true;
    const ids = [...new Set(incident.lines.map((line) => line.leadId).filter(Boolean))];
    if (!ids.length) return true;
    const node = matrix?.nodes?.get(personId) || null;
    if (!node) return false;
    const descendants = node.descendants || new Set();
    const lineScope = check.seat.lineScope || new Set();
    return ids.every((id) => descendants.has(id) || (id !== personId && lineScope.has(id)));
  }

  /**
   * Write ONE act through the store's transaction boundary, after proving the
   * row round-trips. Returns the stored act, or `{ error }` when the register
   * would not read its own row back — in which case nothing is written.
   */
  function commitAct(check, incidentId, act, event, summary) {
    const id = idFactory('miact');
    const entry = { id, incidentId, actorId: check.actorId, ...act };
    const incidents = normalizeMicIncidents(store.state.micIncidents, []);
    const proven = normalizeMicActs([entry, ...(Array.isArray(store.state.micActs) ? store.state.micActs : [])], incidents, [])
      .find((row) => row.id === id) || null;
    if (!proven) return { error: fail('The register refused its own act on a reload of exactly the row it was about to store, so nothing was kept. This is a defect in the register, not in your entry.', null, REFUSAL('load-refused')) };
    const stored = commit((draft) => {
      if (!Array.isArray(draft.micActs)) draft.micActs = [];
      draft.micActs.unshift(proven);
      if (draft.micActs.length > L.acts * 4) draft.micActs.length = L.acts * 4;
    }, eventFor(event, incidentId, summary));
    if (!stored) return { error: fail(store.persistError || 'The act could not be persisted. Nothing was saved.', null, REFUSAL('persist')) };
    return { act: proven };
  }

  /**
   * EVERY write goes through the store's own transaction boundary. Nothing here
   * mutates `store.state` directly: a direct mutation would skip the audit event,
   * the atomic transaction and the post-commit spine — which is where the rule
   * that chases a blown clock actually runs. The house lane is `store.update`.
   */
  function commit(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return !store.persistError;
  }

  const eventFor = (type, entityId, summary) => ({ type, entity: 'incident', entityId, summary: String(summary || '').slice(0, 300) });

  /** The stored row is the row the loader returns: prove it at the door. */
  function loadsBack(incidentId) {
    const warnings = [];
    const incidents = normalizeMicIncidents(store.state.micIncidents, warnings);
    const acts = normalizeMicActs(store.state.micActs, incidents, warnings);
    const incident = incidents.find((row) => row.id === incidentId) || null;
    return { incidents, acts, incident, warnings };
  }

  const api = {};

  /* --------------------------------------------------------------- declare */

  api.incidentDeclare = (input = {}) => {
    const check = seatFor(MIC_RIGHTS.COMMAND);
    if (!check.ok) return check;
    if (!check.seat.fullAccess && check.seat.rank < L.declareMinRank) {
      return fail(`An incident is declared from rank ${L.declareMinRank} upward. ${check.seat.label} is rank ${check.seat.rank}.`, null, REFUSAL('rank'));
    }
    if (rows('micIncidents').length >= L.incidents) {
      return fail(`The incident ledger holds its declared maximum of ${L.incidents} rows. Export the record and archive older incidents before declaring another.`, null, REFUSAL('ceiling'));
    }

    const title = micText(input.title, L.titleMax);
    if (title.length < L.titleMin) return fail(`Name the incident in at least ${L.titleMin} characters.`, 'title');
    const severity = MIC_SEVERITY_KEYS.includes(input.severity) ? input.severity : null;
    if (!severity) return fail('Declare the severity. The register prints the criterion you chose it against, so “it felt like a P1” is not a declaration.', 'severity');
    const criterion = micText(input.criterion, L.textMax);
    if (criterion.length < L.textMin) {
      return fail(`Write the criterion you declared this severity against, in at least ${L.textMin} characters. A severity with no written criterion cannot be reviewed later.`, 'criterion', REFUSAL('criterion'));
    }

    const at = check.at;
    const nowIso = at.toISOString();
    const detectedAt = micInstant(input.detectedAt || nowIso);
    if (!detectedAt) return fail('Give a real detection instant. The interval from detection to declaration is the first figure a review asks for.', 'detectedAt');
    const declaredAt = micInstant(input.declaredAt || nowIso);
    if (!declaredAt) return fail('Give a real declaration instant.', 'declaredAt');
    if (declaredAt < detectedAt) {
      return fail('The declaration instant precedes the detection instant. The register will not read a declaration backwards to make an interval look better.', 'declaredAt', REFUSAL('declared-before-detected'));
    }
    const nowMs = at.getTime();
    if (toDate(declaredAt).getTime() > nowMs + L.horizonMaxDays * 86400000) {
      return fail(`A declaration may not be dated more than ${L.horizonMaxDays} days ahead of this device’s clock.`, 'declaredAt', REFUSAL('declared-future'));
    }
    if (toDate(detectedAt).getTime() < nowMs - L.backfillMaxDays * 86400000) {
      return fail('That detection instant is more than ten years before this device’s clock. Check the date.', 'detectedAt');
    }

    // Response lines.
    const rawLines = Array.isArray(input.lines) ? input.lines : [];
    if (rawLines.length < L.linesMin) return fail('Declare at least one response line. An incident with no line has no duty anybody holds.', 'lines', REFUSAL('no-lines'));
    if (rawLines.length > L.linesMax) return fail(`One incident may carry at most ${L.linesMax} response lines. Past six it is a programme, and a programme is not an incident.`, 'lines');
    const lines = [];
    const seenDuties = new Set();
    for (const raw of rawLines) {
      const duty = String(raw?.duty || '').trim();
      if (!responseDutyRow(duty)) return fail('Every response line must carry one of the declared duties.', 'lines');
      if (seenDuties.has(duty)) return fail(MIC_REFUSALS.lineDuplicate, 'lines', REFUSAL('line-duplicate'));
      seenDuties.add(duty);
      lines.push({
        lineId: idFactory('miln'),
        duty,
        dutyText: micText(raw?.dutyText || responseDutyText(duty), L.textMax),
        leadId: raw?.leadId ? micId(raw.leadId) : null,
      });
    }

    // Declared clocks: each needs a source, a period and an origin.
    const rawClocks = Array.isArray(input.clocks) ? input.clocks : [];
    const clocks = [];
    const seenClockKeys = new Set();
    for (const raw of rawClocks) {
      const source = MIC_CLOCK_SOURCE_KEYS.includes(raw?.clockSource) ? raw.clockSource : null;
      const origin = MIC_CLOCK_ORIGIN_KEYS.includes(raw?.clockOrigin) ? raw.clockOrigin : 'awareness';
      const mins = micClockMinutes(Number(raw?.clockMinutes));
      const basis = micText(raw?.basis, L.textMax);
      if (!source) return fail('Every declared clock must name the instrument it was read off.', 'clocks', REFUSAL('clock-source'));
      if (!mins) return fail(MIC_REFUSALS.clockRange, 'clocks', REFUSAL('clock-range'));
      if (basis.length < L.textMin) return fail(MIC_REFUSALS.clockSourced, 'clocks', REFUSAL('clock-basis'));
      const key = idFactory('mick');
      if (seenClockKeys.has(key)) continue;
      seenClockKeys.add(key);
      clocks.push({ key, clockSource: source, clockMinutes: mins, clockOrigin: origin, basis, declaredAt: nowIso, declaredById: check.actorId });
    }

    // Notification obligations: who, on which of these clocks, and why.
    const rawNotifications = Array.isArray(input.notifications) ? input.notifications : [];
    if (rawNotifications.length > L.notifMax) return fail(`One incident may carry at most ${L.notifMax} notification obligations.`, 'notifications');
    const clockKeys = new Set(clocks.map((clock) => clock.key));
    const notifications = [];
    for (const raw of rawNotifications) {
      const party = MIC_NOTIFY_PARTY_KEYS.includes(raw?.party) ? raw.party : null;
      if (!party) return fail('Every notification obligation must name who had to be told, from the declared list.', 'notifications');
      const basis = micText(raw?.basis, L.textMax);
      if (basis.length < L.textMin) return fail('Write the basis of this notification obligation — the duty and the instrument that requires it.', 'notifications');
      // A dialog that declares a clock and an obligation in ONE act cannot know
      // the clock's generated key, so the positional token `first` is accepted
      // and resolved to the first declared clock. Any OTHER key must be a real
      // key on this incident — a typo is refused, never silently dropped.
      let clockKey = null;
      if (raw?.clockKey === 'first') {
        clockKey = clocks[0]?.key || null;
      } else if (raw?.clockKey) {
        clockKey = micId(raw.clockKey);
        if (!clockKey || !clockKeys.has(clockKey)) return fail(MIC_REFUSALS.notifClock, 'notifications', REFUSAL('notif-clock'));
      }
      notifications.push({ notifId: idFactory('minf'), party, basis, clockKey });
    }

    const followsUpOn = input.followsUpOn ? micId(input.followsUpOn) : null;
    if (followsUpOn) {
      const prior = rows('micIncidents').find((row) => row && row.id === followsUpOn);
      if (!prior) return fail('The incident this one follows is not on the record. Nothing was saved.', 'followsUpOn', REFUSAL('prior-not-found'));
    }

    const id = idFactory('minc');
    const incident = {
      id,
      title,
      severity,
      criterion,
      detectedAt,
      declaredAt,
      declaredById: check.actorId,
      followsUpOn,
      clocks,
      lines,
      notifications,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // Prove the round-trip BEFORE committing: the row the loader would return on
    // the next load is the row that goes in, or nothing goes in at all.
    const proofWarnings = [];
    const proof = normalizeMicIncidents([incident, ...rows('micIncidents')], proofWarnings).find((row) => row.id === id) || null;
    if (!proof) {
      return fail('The register refused its own declaration on a reload of exactly the row it was about to store, so nothing was kept. This is a defect in the register, not in your entry.', null, REFUSAL('load-refused'));
    }

    const stored = commit((draft) => {
      if (!Array.isArray(draft.micIncidents)) draft.micIncidents = [];
      draft.micIncidents.unshift(proof);
    }, eventFor(MIC_EVENTS.DECLARED, id, `Incident declared at ${severity}: one of the most consequential records this workspace holds. The detection and declaration instants are recorded as given, never inferred.`));
    if (!stored) return fail(store.persistError || 'The declaration could not be persisted. Nothing was saved.', null, REFUSAL('persist'));
    const readBack = loadsBack(id);
    if (!readBack.incident) {
      return fail('The record accepted the declaration but could not read it back, so it is not being trusted. Export the workspace before continuing. This is a defect in the register.', null, REFUSAL('load-refused'));
    }
    return saved({ incidentId: id, event: MIC_EVENTS.DECLARED, severity });
  };

  /* ------------------------------------------------------------ assign line */

  api.incidentAssignLine = (input = {}) => {
    const check = seatFor(MIC_RIGHTS.COMMAND);
    if (!check.ok) return check;
    const resolved = liveIncident(check, input.incidentId);
    if (resolved.error) return resolved.error;
    const { incident } = resolved;
    const matrix = matrixFor(check.at, check.cfg);
    if (!partyTo(check, incident, matrix)) return fail(MIC_REFUSALS.notYourIncident, null, REFUSAL('not-party'));

    const lineId = micId(input.lineId, 60);
    const line = incident.lines.find((row) => row.lineId === lineId) || null;
    if (!line) return fail('That response line is not on this incident.', 'lineId');
    const leadId = micId(input.leadId);
    if (!leadId) return fail('Name the lead of this line. A duty nobody holds is printed as unled, never invented.', 'leadId');
    if (!isLegalHand(leadId)) return fail(MIC_REFUSALS.personNotActive, 'leadId', REFUSAL('person-not-active'));
    if (leadId === incident.commanderId) {
      return fail('The person commanding this incident cannot also lead a response line on it. Command is the separate hand that coordinates lines, not one of them — name a different lead.', 'leadId', REFUSAL('commander-leads-line'));
    }
    if (!check.seat.fullAccess && !canReach(check, leadId, matrix)) {
      return fail('This seat does not hold that person through the tree or a declared line. One line does not name another line’s people into an incident.', 'leadId', REFUSAL('not-your-person'));
    }

    const at = check.at.toISOString();
    const written = commitAct(check, incident.id, { kind: 'assign', lineId, leadId, assignedAt: at, at },
      MIC_EVENTS.LINE_ASSIGNED,
      'A response line was staffed. The lead named is a person the acting seat reaches on the graph; the duty is unowned until that hand accepts it.');
    if (written.error) return written.error;
    return saved({ incidentId: incident.id, actId: written.act.id, event: MIC_EVENTS.LINE_ASSIGNED });
  };

  /* ------------------------------------------------------------ accept line */

  api.incidentAcceptLine = (input = {}) => {
    const check = seatFor(MIC_RIGHTS.COMMAND);
    if (!check.ok) return check;
    const resolved = liveIncident(check, input.incidentId);
    if (resolved.error) return resolved.error;
    const { incident } = resolved;
    const lineId = micId(input.lineId, 60);
    const line = incident.lines.find((row) => row.lineId === lineId) || null;
    if (!line) return fail('That response line is not on this incident.', 'lineId');
    if (!line.leadId) return fail('No lead is named on this line yet. An acceptance is the lead’s own word; assign a lead first.', 'lineId', REFUSAL('no-lead'));
    // The house rule, taken from the undertaking ledger's deliver door: ONLY the
    // holder accepts, in their own name, and there is no operator bypass. An
    // acceptance recorded by the acting seat for somebody else would be written
    // and then ignored by the reader (which matches the act's actor against the
    // line's lead) — a writer and a reader disagreeing about who owns a duty is
    // exactly the class of defect this register refuses to ship. The operator
    // view takes the line by declaring that person's seat, or does not take it.
    if (line.leadId !== check.actorId) {
      return fail(MIC_REFUSALS.selfAccept, 'lineId', REFUSAL('not-your-line'));
    }
    if (line.acceptedAt) return ok({ incidentId: incident.id, alreadyAccepted: true });
    const at = check.at.toISOString();
    const written = commitAct(check, incident.id, { kind: 'accept', lineId, acceptedAt: at, at },
      MIC_EVENTS.LINE_LEAD_ACCEPTED,
      'A line lead accepted their own line. The duty it carries is now owned in their name.');
    if (written.error) return written.error;
    return saved({ incidentId: incident.id, actId: written.act.id, event: MIC_EVENTS.LINE_LEAD_ACCEPTED });
  };

  /* --------------------------------------------------------- assume command */

  api.incidentAssumeCommand = (input = {}) => {
    const check = seatFor(MIC_RIGHTS.COMMAND);
    if (!check.ok) return check;
    const resolved = liveIncident(check, input.incidentId);
    if (resolved.error) return resolved.error;
    const { incident } = resolved;
    const matrix = matrixFor(check.at, check.cfg);
    if (!partyTo(check, incident, matrix) && !canReach(check, check.actorId, matrix)) {
      return fail(MIC_REFUSALS.notYourIncident, null, REFUSAL('not-party'));
    }
    if (incident.commanderId === check.actorId) {
      return fail('This seat already holds command on this incident.', null, REFUSAL('already-commander'));
    }
    if (incident.commanderId) {
      return fail('Somebody else holds command. Command moves between hands by a recorded transfer with a named successor and a reason — never by a second assumption. Take command from the holder, or ask them to transfer it.', null, REFUSAL('must-transfer'));
    }
    const at = check.at.toISOString();
    const written = commitAct(check, incident.id, { kind: 'assume', assumedAt: at, at },
      MIC_EVENTS.COMMAND_ASSUMED,
      'Command was taken. The hand is recorded by name and the instant is exact; the register never infers a commander from who is talking.');
    if (written.error) return written.error;
    return saved({ incidentId: incident.id, actId: written.act.id, event: MIC_EVENTS.COMMAND_ASSUMED });
  };

  /* ------------------------------------------------------- transfer command */

  api.incidentTransferCommand = (input = {}) => {
    const check = seatFor(MIC_RIGHTS.COMMAND);
    if (!check.ok) return check;
    const resolved = liveIncident(check, input.incidentId);
    if (resolved.error) return resolved.error;
    const { incident } = resolved;
    if (!incident.commanderId) return fail(MIC_REFUSALS.noCommander, null, REFUSAL('no-commander'));
    if (incident.commanderId !== check.actorId && !check.seat.fullAccess) {
      return fail('Only the hand currently holding command may hand it over. A third party cannot reassign a commander.', null, REFUSAL('not-commander'));
    }
    const toId = micId(input.toId);
    if (!toId) return fail('Name the successor. A handover with no named successor is how an incident ends up with nobody in command.', 'toId');
    if (toId === incident.commanderId) return fail(MIC_REFUSALS.alreadyCommander, 'toId', REFUSAL('same-hand'));
    if (!isLegalHand(toId)) return fail(MIC_REFUSALS.personNotActive, 'toId', REFUSAL('person-not-active'));
    const reason = micText(input.reason, L.textMax);
    if (reason.length < L.textMin) return fail(MIC_REFUSALS.textShort, 'reason', REFUSAL('reason-short'));

    const matrix = matrixFor(check.at, check.cfg);
    if (!reachesLines(check, incident, matrix, toId)) {
      return fail(MIC_REFUSALS.transferReach, 'toId', REFUSAL('successor-reach'));
    }

    const at = check.at.toISOString();
    const written = commitAct(check, incident.id, { kind: 'transfer', toId, reason, transferredAt: at, at },
      MIC_EVENTS.COMMAND_TRANSFERRED,
      'Command was handed over to a named successor with a reason. The successor must reach every response line; a commander who cannot reach a line would be a commander in name only.');
    if (written.error) return written.error;
    if (written.act.toId !== toId) return fail('The stored handover does not name the successor that was chosen, so it is not being trusted.', null, REFUSAL('load-refused'));
    return saved({ incidentId: incident.id, actId: written.act.id, event: MIC_EVENTS.COMMAND_TRANSFERRED });
  };

  /* ------------------------------------------------------ change severity */

  api.incidentChangeSeverity = (input = {}) => {
    const check = seatFor(MIC_RIGHTS.COMMAND);
    if (!check.ok) return check;
    const resolved = liveIncident(check, input.incidentId);
    if (resolved.error) return resolved.error;
    const { incident } = resolved;
    const severity = MIC_SEVERITY_KEYS.includes(input.severity) ? input.severity : null;
    if (!severity) return fail('Choose the new severity.', 'severity');
    if (severity === incident.severity) return fail(MIC_REFUSALS.severitySame, 'severity', REFUSAL('severity-same'));
    const matrix = matrixFor(check.at, check.cfg);
    if (!partyTo(check, incident, matrix)) return fail(MIC_REFUSALS.notYourIncident, null, REFUSAL('not-party'));
    const raising = (severityRank(severity) ?? 9) < (severityRank(incident.severity) ?? 9);
    if (!raising && incident.commanderId !== check.actorId && !check.seat.fullAccess) {
      return fail(MIC_REFUSALS.severityLower, 'severity', REFUSAL('severity-lower'));
    }
    const reason = micText(input.reason, L.textMax);
    if (reason.length < L.textMin) return fail(MIC_REFUSALS.textShort, 'reason', REFUSAL('reason-short'));
    const at = check.at.toISOString();
    const written = commitAct(check, incident.id, { kind: 'severity', severity, reason, changedAt: at, at },
      MIC_EVENTS.SEVERITY_CHANGED,
      'The declared severity was changed by a dated act with a written reason. Raising is open to anyone holding a line; lowering is the commanding seat alone.');
    if (written.error) return written.error;
    return saved({ incidentId: incident.id, actId: written.act.id, event: MIC_EVENTS.SEVERITY_CHANGED, severity, raised: raising });
  };

  /* ----------------------------------------------------- record notification */

  api.incidentRecordNotification = (input = {}) => {
    const check = seatFor(MIC_RIGHTS.COMMAND);
    if (!check.ok) return check;
    const resolved = liveIncident(check, input.incidentId);
    if (resolved.error) return resolved.error;
    const { incident } = resolved;
    const matrix = matrixFor(check.at, check.cfg);
    if (!partyTo(check, incident, matrix)) return fail(MIC_REFUSALS.notYourIncident, null, REFUSAL('not-party'));

    const notifId = micId(input.notifId, 60);
    const notif = incident.notifications.find((row) => row.notifId === notifId) || null;
    if (!notif) return fail('That notification obligation is not on this incident.', 'notifId');
    if (notif.recordedAt) {
      return fail('That obligation is already recorded as notified. The register keeps the first record; a correction is a new incident or an explicit supersede, not a second notification.', 'notifId', REFUSAL('already-recorded'));
    }
    const reference = micRef(input.reference);
    if (!reference) return fail(MIC_REFUSALS.notifyReference, 'reference', REFUSAL('reference'));
    const notifiedAt = micInstant(input.notifiedAt || check.at.toISOString());
    if (!notifiedAt) return fail('Give the real instant the notification went out.', 'notifiedAt');
    if (notifiedAt > check.at.toISOString()) {
      return fail('The notification instant is in the future. Record what has happened, not what will.', 'notifiedAt', REFUSAL('notified-future'));
    }
    if (notifiedAt < incident.declaredAt) {
      return fail('The notification instant precedes the incident declaration. A notification before the thing it notifies was declared cannot be a record of this incident.', 'notifiedAt', REFUSAL('notified-before-declared'));
    }

    const at = check.at.toISOString();
    const written = commitAct(check, incident.id, { kind: 'notify', notifId, reference, notifiedAt, at },
      MIC_EVENTS.NOTIFICATION_RECORDED,
      'A notification was recorded against its own declared clock, with the reference it went out under. Recording it does not erase a deadline that had already passed: the overrun is printed beside the record.');
    if (written.error) return written.error;
    // The overrun is re-read (never computed here) and returned so the caller can
    // print what the register will now show.
    const fresh = incidentReport(store.state, { now: check.at, settings: check.cfg, seat: check.seat })
      .incidents.find((row) => row.id === incident.id);
    const row = fresh?.notifications.find((item) => item.notifId === notifId) || null;
    return saved({
      incidentId: incident.id,
      actId: written.act.id,
      event: MIC_EVENTS.NOTIFICATION_RECORDED,
      state: row?.state || null,
      overrunMinutes: row?.overrunMinutes ?? null,
    });
  };

  /* ----------------------------------------------------------- resolve */

  api.incidentResolve = (input = {}) => {
    const check = seatFor(MIC_RIGHTS.COMMAND);
    if (!check.ok) return check;
    const resolved = liveIncident(check, input.incidentId, { allowResolved: true });
    if (resolved.error) return resolved.error;
    const { incident } = resolved;
    if (incident.resolvedAt) return fail(MIC_REFUSALS.alreadyResolved, null, REFUSAL('already-resolved'));
    if (incident.commanderId !== check.actorId && !check.seat.fullAccess) {
      return fail(MIC_REFUSALS.resolveByCommander, null, REFUSAL('not-commander'));
    }
    const evidenceText = micText(input.evidenceText, L.textMax);
    if (evidenceText.length < L.textMin) {
      return fail(`Record the evidence that the operation is closed, in at least ${L.textMin} characters. “It seems fine” is not evidence, and this act is the one a review will read.`, 'evidenceText', REFUSAL('evidence-short'));
    }
    const resolvedAt = micInstant(input.resolvedAt || check.at.toISOString());
    if (!resolvedAt) return fail('Give the real instant the incident was closed.', 'resolvedAt');
    if (resolvedAt < incident.declaredAt) return fail('The resolution instant precedes the declaration.', 'resolvedAt', REFUSAL('resolve-before-declared'));
    if (resolvedAt > check.at.toISOString()) return fail('The resolution instant is in the future.', 'resolvedAt', REFUSAL('resolve-future'));

    const at = check.at.toISOString();
    const written = commitAct(check, incident.id, { kind: 'resolve', evidenceText, resolvedAt, at },
      MIC_EVENTS.RESOLVED,
      'The operational incident was closed by the commanding seat, with the evidence it was closed on. Command is NOT released by resolution: the bridge stays open until a stand-down act.');
    if (written.error) return written.error;
    return saved({ incidentId: incident.id, actId: written.act.id, event: MIC_EVENTS.RESOLVED });
  };

  /* ---------------------------------------------------------- stand down */

  api.incidentStandDown = (input = {}) => {
    const check = seatFor(MIC_RIGHTS.COMMAND);
    if (!check.ok) return check;
    const resolved = liveIncident(check, input.incidentId, { allowResolved: true });
    if (resolved.error) return resolved.error;
    const { incident } = resolved;
    if (!incident.commanderId) return fail(MIC_REFUSALS.noCommander, null, REFUSAL('no-commander'));
    if (incident.commanderId !== check.actorId && !check.seat.fullAccess) {
      return fail('Only the hand holding command may release it. Somebody else standing the incident down would leave the commander holding a bridge nobody told them was closed.', null, REFUSAL('not-commander'));
    }
    if (!incident.resolvedAt) return fail(MIC_REFUSALS.standDownBeforeResolve, null, REFUSAL('not-resolved'));
    const reason = micText(input.reason, L.textMax);
    if (reason.length < L.textMin) return fail(MIC_REFUSALS.textShort, 'reason', REFUSAL('reason-short'));
    const stoodDownAt = micInstant(input.stoodDownAt || check.at.toISOString());
    if (!stoodDownAt) return fail('Give the real instant command was released.', 'stoodDownAt');
    if (stoodDownAt < incident.resolvedAt) return fail('Command cannot be released before the incident it commands was closed.', 'stoodDownAt', REFUSAL('standdown-before-resolve'));
    if (stoodDownAt > check.at.toISOString()) return fail('The stand-down instant is in the future.', 'stoodDownAt', REFUSAL('standdown-future'));

    const at = check.at.toISOString();
    const written = commitAct(check, incident.id, { kind: 'stand-down', reason, stoodDownAt, at },
      MIC_EVENTS.STOOD_DOWN,
      'Command was released by the hand that held it, on a named instant, with a reason. The clock facts and every notification row stay printed after the stand-down.');
    if (written.error) return written.error;
    return saved({ incidentId: incident.id, actId: written.act.id, event: MIC_EVENTS.STOOD_DOWN });
  };

  /* --------------------------------------------------------- conventions */

  api.incidentSetConventions = (input = {}) => {
    const check = seatFor(MIC_RIGHTS.COMMAND);
    if (!check.ok) return check;
    if (!check.seat.fullAccess && (check.seat.rank || 0) < 4) {
      return fail('The register’s conventions bound every deadline on every incident, so they are set by a director seat or above.', null, REFUSAL('rank'));
    }
    const next = { ...(store.state.settings || {}) };
    const apply = (key, value, bounds) => {
      if (value === undefined || value === null || value === '') return null;
      const n = Math.round(Number(value));
      if (!Number.isFinite(n)) return `${key} must be a number.`;
      if (n < bounds.min || n > bounds.max) return `${key} must be between ${bounds.min} and ${bounds.max}.`;
      next[key] = n;
      return null;
    };
    const errors = [
      apply(MIC_SETTING_KEYS.closingWindowMinutes, input.closingWindowMinutes, MIC_BOUNDS.closingWindowMinutes),
      apply(MIC_SETTING_KEYS.chaseDays, input.chaseDays, MIC_BOUNDS.chaseDays),
      apply(MIC_SETTING_KEYS.lapsedAskDays, input.lapsedAskDays, MIC_BOUNDS.lapsedAskDays),
      apply(MIC_SETTING_KEYS.acknowledgeVarianceMinutes, input.acknowledgeVarianceMinutes, MIC_BOUNDS.acknowledgeVarianceMinutes),
    ].filter(Boolean);
    if (errors.length) return fail(errors[0]);
    if (typeof input.autoPropagate === 'boolean') next[MIC_SETTING_KEYS.autoPropagate] = input.autoPropagate;
    const normalized = normalizeMicSettings(next);
    const stored = commit((draft) => {
      draft.settings = { ...(draft.settings || {}), ...normalized };
    }, eventFor(MIC_EVENTS.CONVENTIONS_SET, MIC_ROUTE, 'The incident command conventions were changed. They bound every deadline on every incident, which is why a director seat sets them.'));
    if (!stored) return fail(store.persistError || 'The conventions could not be persisted. Nothing was saved.', null, REFUSAL('persist'));
    return saved({ event: MIC_EVENTS.CONVENTIONS_SET, conventions: normalized });
  };

  /* ----------------------------------------------------------------- scan */

  /**
   * The explicit scan. It writes ONE derived event and lets the post-commit
   * spine re-read the whole register — which is the only place a condition is
   * computed. The scan itself decides nothing, asks nobody and repairs nothing:
   * it is the door a leader knocks on at 09:00 when they want the clocks read
   * at the current instant. Pause-governed like every other path.
   */
  api.incidentScan = () => {
    const check = seatFor(MIC_RIGHTS.COMMAND);
    if (!check.ok) return check;
    const report = incidentReport(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    const stored = commit(() => {}, eventFor(MIC_EVENTS.SCANNED, MIC_ROUTE,
      `Incident command scan requested (${MIC_EVENTS.SCANNED}): declared clocks, notification obligations and command states re-read from the record at this instant.`));
    if (!stored) return fail(store.persistError || 'The scan could not be committed. Nothing was changed.', null, REFUSAL('persist'));
    return saved({
      event: MIC_EVENTS.SCANNED,
      scannedAt: check.at.toISOString(),
      incidents: report.totals.incidents,
      lapsed: report.totals.notificationsLapsed,
      closing: report.incidents.reduce((n, incident) => n + incident.notifications.filter((row) => row.closing).length, 0),
      noCommander: report.totals.noCommander,
      commandStanding: report.totals.commandStanding,
    });
  };

  /* ---------------------------------------------------------------- reads */

  api.incidentReport = ({ seat = null } = {}) => {
    const check = readCheck();
    if (!check.ok) return check;
    const at = clock();
    const report = incidentReport(store.state, { now: at, settings: settings(), seat: seat || check.seat });
    return { ok: true, report };
  };

  api.incidentAttentionCount = () => {
    const check = readCheck();
    if (!check.ok) return 0;
    return incidentAttentionCount(store.state, { now: clock(), settings: settings(), seat: check.seat });
  };

  api.incidentCandidates = () => {
    const check = readCheck();
    if (!check.ok) return check;
    const report = incidentReport(store.state, { now: clock(), settings: settings(), seat: check.seat });
    return {
      ok: true,
      incidents: report.incidents
        .filter((incident) => incident.state !== 'stood-down')
        .map((incident) => ({
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          severityLabel: incident.severityRow?.label || incident.severity,
          state: incident.state,
          stateLabel: incident.stateLabel,
          commanderId: incident.commanderId,
          commanderName: incident.commanderName,
          lines: incident.lines,
          clocks: incident.clocks.map((clock) => ({ key: clock.key, label: `${clock.sourceLabel} · ${clock.clockMinutes} min` })),
          notifications: incident.notifications.map((row) => ({ notifId: row.notifId, party: row.party, partyLabel: row.partyLabel, state: row.state })),
          apex: incident.apex,
        })),
    };
  };

  api.micResponseDuties = () => MIC_RESPONSE_DUTIES.map((row) => ({ key: row.key, label: row.label, says: row.says }));

  return api;
}

export default createIncidentCommandActions;
