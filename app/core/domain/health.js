/**
 * app/core/domain/health.js — the composite team-health score.
 *
 * Five dimensions, each 0–100, each with a formula that can be explained to the
 * person being measured. Dimensions with no data return null and their weight
 * is redistributed rather than scored as zero — an unmeasured thing is not a
 * failing thing. The result carries its own audit trail (`drivers`) so the UI
 * never has to assert a number it cannot justify.
 *
 * Weights (sum 1.0): cadence .24 · feedback .20 · clarity .20 · growth .16 ·
 * wellbeing .20.
 */

import { addDays, clamp, dayKey, daysBetween, daysSince, isOverdue, mean, round } from '../time.js';
import { cadence } from './oneonone.js';
import { tenureDays } from './people.js';
import { personFeedbackStats } from './feedback.js';
import { goalHealth, activeGoals } from './goals.js';
import { activePlan, planProgress } from './growth.js';
import { aggregate } from './pulse.js';

export const DIMENSIONS = [
  { key: 'cadence', label: 'Conversation rhythm', weight: 0.24, question: 'Are 1:1s actually happening?' },
  { key: 'feedback', label: 'Feedback flow', weight: 0.2, question: 'Do people know where they stand?' },
  { key: 'clarity', label: 'Clarity of priorities', weight: 0.2, question: 'Does everyone know what matters now?' },
  { key: 'growth', label: 'Growth in motion', weight: 0.16, question: 'Is anyone getting better on purpose?' },
  { key: 'wellbeing', label: 'Safety & load', weight: 0.2, question: 'Is it safe and sustainable to speak up?' },
];

function scorer(key) {
  return DIMENSIONS.find((d) => d.key === key);
}

/**
 * Reconstruct workspace state as of `asOf` and record per-dimension fidelity.
 *
 * Exact dimensions derive strictly from dated events or Schema v5 dated
 * snapshots (goal check-in key-result snapshots, initial values, completion
 * dates, archive timestamps). Where pre-v5 or directly edited records lack a
 * dated snapshot, the reconstruction uses current mutable fields and explicitly
 * marks that dimension `approximate` with a human-readable reason.
 */
export function reconstructStateAt(state, asOf, { currentDay = null } = {}) {
  const asOfDay = dayKey(asOf) || (typeof asOf === 'string' ? asOf.slice(0, 10) : new Date(asOf).toISOString().slice(0, 10));
  const keep = (day) => !day || (daysBetween(day, asOfDay) ?? 0) >= 0;
  const isHistorical = currentDay ? asOfDay < currentDay : true;
  const cloned = JSON.parse(JSON.stringify(state));

  const notes = {
    cadence: new Set(),
    feedback: new Set(),
    clarity: new Set(),
    growth: new Set(),
    wellbeing: new Set(),
    delegations: new Set(),
    stakeholders: new Set(),
    forecastIntegrity: new Set(),
  };

  let rosterApproximate = false;
  cloned.people = (cloned.people || [])
    .filter((p) => keep((p.createdAt || '').slice(0, 10)))
    .map((p) => {
      if (p.status !== 'archived') return p;
      const archivedDay = p.archivedAt ? p.archivedAt.slice(0, 10) : null;
      if (archivedDay && archivedDay > asOfDay) {
        return { ...p, status: 'active', archivedAt: null };
      }
      if (!archivedDay && isHistorical) {
        rosterApproximate = true;
      }
      return p;
    });
  if (rosterApproximate) {
    const msg = 'An archived team member has no archive date, so past roster membership uses current status.';
    notes.cadence.add(msg);
    notes.feedback.add(msg);
    notes.clarity.add(msg);
    notes.growth.add(msg);
  }

  // Rewind the follow-through ledger too. A promise that was completed,
  // dropped or carried forward after the snapshot date must be open again at
  // that date, and a successor that did not exist yet must not be left as the
  // only copy of the promise.
  const keptMeetings = (cloned.oneOnOnes || []).filter((m) => keep(m.date));
  const keptMeetingIds = new Set(keptMeetings.map((m) => m.id));
  cloned.oneOnOnes = keptMeetings.map((m) => ({
    ...m,
    actions: (m.actions || []).map((a) => {
      let next = a;
      if (next.done) {
        const doneAt = !next.completedOn || next.completedOn <= asOfDay;
        next = {
          ...next,
          done: doneAt,
          completedOn: doneAt ? next.completedOn : null,
          completedInMeetingId: doneAt ? next.completedInMeetingId : null,
        };
      }
      if (next.completedInMeetingId && !keptMeetingIds.has(next.completedInMeetingId)) {
        next = { ...next, completedInMeetingId: null };
      }
      if (next.dropped && next.droppedOn && next.droppedOn > asOfDay) {
        next = { ...next, dropped: false, droppedOn: null, droppedReason: '', droppedInMeetingId: null };
      }
      if (next.droppedInMeetingId && !keptMeetingIds.has(next.droppedInMeetingId)) {
        next = { ...next, droppedInMeetingId: null };
      }
      if (next.carriedToMeetingId && !keptMeetingIds.has(next.carriedToMeetingId)) {
        next = { ...next, carriedToMeetingId: null, carriedToActionId: null };
      }
      if (next.carriedFrom && !keptMeetingIds.has(next.carriedFrom.meetingId)) {
        next = { ...next, carriedFrom: null };
      }
      return next;
    }),
  }));

  const keptSupport = (cloned.managerSupport || []).filter((record) =>
    keep(record.addedOn || (record.createdAt || '').slice(0, 10)),
  );
  const keptSupportIds = new Set(keptSupport.map((record) => record.id));
  cloned.managerSupport = keptSupport.map((record) => {
    let next = { ...record };
    if (next.status === 'done' && next.completedOn && next.completedOn > asOfDay) {
      next = { ...next, status: 'open', completedOn: null, completedInMeetingId: null };
    }
    if (next.status === 'dropped' && next.droppedOn && next.droppedOn > asOfDay) {
      next = { ...next, status: 'open', droppedOn: null, droppedReason: '', droppedInMeetingId: null };
    }
    if (next.status === 'carried' && next.carriedOn && next.carriedOn > asOfDay) {
      next = { ...next, status: 'open', carriedToId: null, carriedOn: null, carriedInMeetingId: null };
    }
    if (next.completedInMeetingId && !keptMeetingIds.has(next.completedInMeetingId)) next.completedInMeetingId = null;
    if (next.droppedInMeetingId && !keptMeetingIds.has(next.droppedInMeetingId)) next.droppedInMeetingId = null;
    if (next.carriedInMeetingId && !keptMeetingIds.has(next.carriedInMeetingId)) next.carriedInMeetingId = null;
    if (next.carriedFromMeetingId && !keptMeetingIds.has(next.carriedFromMeetingId)) next.carriedFromMeetingId = null;
    if (next.carriedToId && !keptSupportIds.has(next.carriedToId)) next.carriedToId = null;
    if (next.carriedFromId && !keptSupportIds.has(next.carriedFromId)) next.carriedFromId = null;
    return next;
  });

  cloned.feedback = (cloned.feedback || [])
    .filter((f) => keep(f.date))
    .map((f) => {
      if (!f.followUpDone) return f;
      if (f.followUpCompletedOn) {
        const doneAt = f.followUpCompletedOn <= asOfDay;
        return { ...f, followUpDone: doneAt, followUpCompletedOn: doneAt ? f.followUpCompletedOn : null };
      }
      return f;
    });

  cloned.pulses = (cloned.pulses || []).filter((p) => keep(p.date));
  cloned.recognition = (cloned.recognition || []).filter((r) => keep(r.date));
  cloned.decisions = (cloned.decisions || [])
    .filter((d) => keep(d.date))
    .map((d) => {
      if (d.reviewedOn && d.reviewedOn > asOfDay) {
        return { ...d, reviewedOn: null, outcome: 'pending', outcomeNotes: '' };
      }
      return d;
    });

  const keptDelegationPreIds = new Set(
    (cloned.delegations || [])
      .filter((d) => keep(d.delegatedOn || (d.createdAt || '').slice(0, 10)))
      .map((d) => d.id),
  );
  cloned.delegations = (cloned.delegations || [])
    .filter((d) => keptDelegationPreIds.has(d.id))
    .map((d) => {
      const checkins = (d.checkins || []).filter((c) => keep(c.date));
      const priorDelegationId = d.priorDelegationId && keptDelegationPreIds.has(d.priorDelegationId) ? d.priorDelegationId : null;
      if (d.status === 'done' && d.completedOn && d.completedOn > asOfDay) {
        return { ...d, status: 'active', completedOn: null, completionNote: '', priorDelegationId, supersededByDelegationId: null, recoveredOn: null, checkins };
      }
      if (d.status === 'returned' && d.returnedOn && d.returnedOn > asOfDay) {
        return { ...d, status: 'active', returnedOn: null, returnReason: '', priorDelegationId, supersededByDelegationId: null, recoveredOn: null, checkins };
      }
      const recoveredLater = (d.recoveredOn && d.recoveredOn > asOfDay) || (d.supersededByDelegationId && !keptDelegationPreIds.has(d.supersededByDelegationId));
      if (recoveredLater) {
        return { ...d, priorDelegationId, supersededByDelegationId: null, recoveredOn: null, checkins };
      }
      return { ...d, priorDelegationId, checkins };
    });
  const keptDelegationIds = new Set(cloned.delegations.map((d) => d.id));

  cloned.growthPlans = (cloned.growthPlans || [])
    .filter((p) => keep((p.createdAt || '').slice(0, 10)))
    .map((p) => {
      let status = p.status;
      if (status === 'done') {
        if (p.closedOn && p.closedOn > asOfDay) status = 'active';
        else if (!p.closedOn && isHistorical) {
          notes.growth.add('A closed development plan has no recorded closing date.');
        }
      }
      if (isHistorical && p.stagesUpdatedOn && p.stagesUpdatedOn > asOfDay) {
        notes.growth.add('Development plan stages were edited in place after this period.');
      }
      // Rewind the development ledger the same way the 1:1 ledger is rewound:
      // a commitment completed, dropped or carried after the snapshot date was
      // still live at that date, and its successor did not exist yet.
      const will = (p.will || []).map((w) => {
        let next = w;
        if (next.delegationId && !keptDelegationIds.has(next.delegationId)) {
          next = { ...next, delegationId: null };
        }
        if (next.done) {
          if (next.completedOn) {
            const doneAt = next.completedOn <= asOfDay;
            next = { ...next, done: doneAt, completedOn: doneAt ? next.completedOn : null, completedInReviewId: doneAt ? next.completedInReviewId : null };
          } else if (isHistorical) {
            notes.growth.add('Some completed development commitments predated completion-date tracking.');
          }
        }
        if (next.dropped && next.droppedOn && next.droppedOn > asOfDay) {
          next = { ...next, dropped: false, droppedOn: null, droppedReason: '', droppedInReviewId: null };
        }
        if (next.addedOn && next.addedOn > asOfDay) {
          // The successor was agreed after the snapshot: not a promise yet.
          next = { ...next, carriedFromId: null, carriedInReviewId: null, _future: true };
        }
        return next;
      });
      const live = will.filter((w) => !w._future).map(({ _future, ...rest }) => rest);
      const keptIds = new Set(live.map((w) => w.id));
      const rewound = live.map((w) => (w.carriedToId && !keptIds.has(w.carriedToId) ? { ...w, carriedToId: null } : w));
      const reviews = (p.reviews || []).filter((r) => keep(r.date));
      if (reviews.length !== (p.reviews || []).length) {
        notes.growth.add('A development review was recorded after this snapshot; its decisions are rewound but the review date is not reconstructed.');
      }
      return {
        ...p,
        status,
        will: rewound,
        reviews,
        // The next-review date was agreed in whichever review came last, so it
        // is not reconstructed backwards — the dimension is marked approximate
        // instead of inventing a date.
        reviewOn: reviews.length === (p.reviews || []).length ? p.reviewOn : null,
      };
    });

  cloned.goals = (cloned.goals || [])
    .filter((g) => keep((g.createdAt || '').slice(0, 10)))
    .map((g) => {
      const allCheckins = (g.checkins || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const past = allCheckins.filter((c) => keep(c.date));
      const lastPast = past.length ? past[past.length - 1] : null;

      let status = g.status;
      if (status === 'done') {
        if (g.completedOn && g.completedOn > asOfDay) status = 'active';
        else if (!g.completedOn && isHistorical) {
          notes.clarity.add('A completed goal has no recorded completion date.');
        }
      }

      let confidence;
      if (lastPast) {
        confidence = lastPast.confidence;
      } else if (g.initialConfidence) {
        confidence = g.initialConfidence;
      } else if (!allCheckins.length) {
        confidence = g.confidence || 'on-track';
      } else {
        if (isHistorical) notes.clarity.add('Initial goal confidence before the first check-in was not separately recorded.');
        confidence = g.confidence || 'on-track';
      }

      let keyResults = (g.keyResults || []).map((kr) => ({ ...kr }));
      if (keyResults.length && isHistorical) {
        if (g.krUpdatedOn && (!lastPast || g.krUpdatedOn > lastPast.date) && g.krUpdatedOn > asOfDay) {
          notes.clarity.add('Key results were added or removed after this period.');
        }
        if (lastPast && Array.isArray(lastPast.keyResults)) {
          const snap = new Map(lastPast.keyResults.map((item) => [item.id, item.current]));
          let missingSnap = false;
          keyResults = keyResults.map((kr) => {
            if (snap.has(kr.id)) return { ...kr, current: snap.get(kr.id) };
            if (typeof kr.initialCurrent === 'number') return { ...kr, current: kr.initialCurrent };
            missingSnap = true;
            return kr;
          });
          if (missingSnap) notes.clarity.add('Some key-result values were not captured in earlier check-in snapshots.');
        } else if (lastPast && !Array.isArray(lastPast.keyResults)) {
          notes.clarity.add('Earlier goal check-ins did not store key-result numeric snapshots; current values are used.');
        } else if (!lastPast) {
          const allHaveInitial = keyResults.every((kr) => typeof kr.initialCurrent === 'number');
          if (allHaveInitial) {
            keyResults = keyResults.map((kr) => ({ ...kr, current: kr.initialCurrent }));
          } else if (allCheckins.length > 0 || keyResults.some((kr) => kr.current !== kr.start)) {
            notes.clarity.add('Initial key-result values before check-in snapshots were not separately stored.');
          }
        }
      }

      return {
        ...g,
        status,
        checkins: past,
        confidence,
        keyResults,
      };
    });

  cloned.cases = (cloned.cases || [])
    .filter((c) => keep(c.openedOn || (c.createdAt || '').slice(0, 10)))
    .map((c) => {
      const wasResolvedLater = (c.status === 'resolved' || c.status === 'closed') && c.resolvedOn && c.resolvedOn > asOfDay;
      const stakeholders = (c.stakeholders || []).map((s) =>
        s.lastCommsOn && s.lastCommsOn > asOfDay ? { ...s, lastCommsOn: null } : s,
      );
      // Schema v22: a case rewound to before its resolution had not settled
      // yet, so its settled actuals must rewind with it; likewise an opening
      // forecast frozen after the cutoff did not exist at that point.
      const forecastSnapshot = c.forecastSnapshot && c.forecastSnapshot.frozenOn && c.forecastSnapshot.frozenOn > asOfDay
        ? null
        : c.forecastSnapshot;
      if (wasResolvedLater) {
        return { ...c, status: 'open', resolvedOn: null, resolutionNotes: '', actuals: null, forecastSnapshot, stakeholders };
      }
      return { ...c, forecastSnapshot, stakeholders };
    });

  // Portfolio items did not exist before `createdOn`, and work cannot be
  // funded, delivered or released at a date that has not happened yet. No
  // health or trend dimension consumes portfolio data today, but rewinding it
  // here keeps the rewind contract honest for any module that later does.
  cloned.portfolio = (cloned.portfolio || [])
    .filter((item) => keep(item.createdOn || item.createdAt?.slice(0, 10)))
    .map((item) => {
      let next = item;
      if (next.decisionOn && next.decisionOn > asOfDay) {
        next = { ...next, decision: 'undecided', decisionOn: null, rationale: '' };
      }
      if (next.completedOn && next.completedOn > asOfDay) {
        next = { ...next, status: next.status === 'done' ? 'open' : next.status, completedOn: null };
      }
      if (next.releasedOn && next.releasedOn > asOfDay) {
        next = { ...next, status: next.status === 'released' ? 'open' : next.status, releasedOn: null };
      }
      return next;
    });

  cloned.requisitions = (cloned.requisitions || [])
    .filter((r) => keep(r.openedOn || (r.createdAt || '').slice(0, 10)))
    .map((r) => {
      if (r.closedOn && r.closedOn > asOfDay && (r.status === 'filled' || r.status === 'cancelled')) {
        return { ...r, status: 'open', closedOn: null };
      }
      return r;
    });
  const keptReqIds = new Set(cloned.requisitions.map((r) => r.id));

  cloned.candidates = (cloned.candidates || [])
    .filter((c) => (!c.reqId || keptReqIds.has(c.reqId)) && keep(c.appliedOn || (c.createdAt || '').slice(0, 10)))
    .map((c) => {
      const signals = Array.isArray(c.signals)
        ? c.signals.filter((sig) => !sig?.date || keep(sig.date))
        : [];
      let stage = c.stage || 'applied';
      let decision = c.decision ? { ...c.decision } : { outcome: 'pending', rationale: '', decidedOn: null, evidenceGapAcknowledged: false };
      let offerOn = c.offerOn || null;
      let offerAcceptedOn = c.offerAcceptedOn || null;
      let hiredOn = c.hiredOn || null;
      let personId = c.personId || null;

      if (hiredOn && hiredOn > asOfDay) {
        hiredOn = null;
        offerAcceptedOn = offerAcceptedOn && offerAcceptedOn > asOfDay ? null : offerAcceptedOn;
        personId = null;
        if (stage === 'hired') stage = offerOn && offerOn <= asOfDay ? 'offer' : (signals.length ? 'interviewing' : 'applied');
      }
      if (offerOn && offerOn > asOfDay) {
        offerOn = null;
        offerAcceptedOn = null;
        if (stage === 'offer') stage = signals.length ? 'interviewing' : 'applied';
      }
      if (decision?.decidedOn && decision.decidedOn > asOfDay) {
        decision = { outcome: 'pending', rationale: '', decidedOn: null, evidenceGapAcknowledged: false };
        if (stage === 'rejected' || stage === 'withdrawn') {
          stage = signals.length ? 'interviewing' : 'applied';
        }
      }
      if (signals.length === 0 && Array.isArray(c.signals) && c.signals.length > 0 && !['applied', 'rejected', 'withdrawn', 'hired', 'offer'].includes(stage)) {
        stage = 'applied';
      }
      return {
        ...c,
        stage,
        signals,
        decision,
        offerOn,
        offerAcceptedOn,
        hiredOn,
        personId,
      };
    });

  cloned.changes = (cloned.changes || [])
    .filter((c) => keep(c.openedOn || (c.createdAt || '').slice(0, 10)))
    .map((c) => {
      const anchoredLater = c.status === 'anchored' && c.anchoredOn && c.anchoredOn > asOfDay;
      const coalition = (c.coalition || []).map((s) =>
        s.lastBriefedOn && s.lastBriefedOn > asOfDay ? { ...s, lastBriefedOn: null } : s,
      );
      const shortTermWins = (c.shortTermWins || []).filter((w) => keep(w.achievedOn));
      const metrics = (c.metrics || []).map((m) => ({
        ...m,
        observations: (m.observations || []).filter((o) => keep(o.date)),
      }));
      if (anchoredLater) {
        return { ...c, status: 'stabilising', anchoredOn: null, coalition, shortTermWins, metrics };
      }
      return { ...c, coalition, shortTermWins, metrics };
    });

  cloned.negotiations = (cloned.negotiations || [])
    .filter((n) => keep(n.openedOn || (n.createdAt || '').slice(0, 10)))
    .map((n) => {
      const closedLater = (n.status === 'agreed' || n.status === 'withdrawn') && n.closedOn && n.closedOn > asOfDay;
      if (closedLater) {
        return { ...n, status: 'active', closedOn: null, agreedTerms: [], settlement: null };
      }
      const settledLater = n.settlement && n.settlement.settledOn && n.settlement.settledOn > asOfDay;
      const agreedTerms = Array.isArray(n.agreedTerms)
        ? n.agreedTerms.map((t) => ({
            ...t,
            settledValue: settledLater ? null : (t.settledValue ?? null),
            priorOwners: Array.isArray(t.priorOwners)
              ? t.priorOwners.filter((po) => !po?.recoveredOn || keep(po.recoveredOn))
              : [],
          }))
        : [];
      return {
        ...n,
        agreedTerms,
        settlement: settledLater ? null : (n.settlement || null),
      };
    });

  // Budgets did not exist before their creation, and money cannot have been
  // spent or released at a date that has not happened yet: a line rewound to
  // before its spend returns to encumbered with no actual (the recorded
  // committed figure is history; the actual belongs to the later date).
  cloned.budgets = (cloned.budgets || [])
    .filter((b) => keep((b.createdAt || '').slice(0, 10)))
    .map((b) => ({
      ...b,
      lines: (b.lines || []).map((line) => {
        if (line.status === 'spent' && line.spentOn && line.spentOn > asOfDay) {
          return { ...line, status: 'committed', actualAmount: null, spentOn: null, actualsDueOn: null };
        }
        if (line.status === 'released' && line.releasedOn && line.releasedOn > asOfDay) {
          return { ...line, status: 'committed', releasedOn: null, releasedReason: '' };
        }
        if (line.actualsDueOn && line.actualsDueOn > asOfDay) {
          return { ...line, actualsDueOn: null };
        }
        return line;
      }),
    }));

  // Stakeholder Influence Register (Schema v25): records created after the
  // cutoff did not exist yet; stance/contact entries dated later are stripped
  // and the register stance rewinds to the latest surviving stance entry.
  // Alliances carry no dates and remain, labelled approximate when history
  // had to be removed.
  cloned.stakeholders = (cloned.stakeholders || [])
    .filter((s) => keep((s.createdAt || '').slice(0, 10)))
    .map((s) => {
      const stanceHistory = (s.stanceHistory || []).filter((e) => keep(e.on));
      const contactLog = (s.contactLog || []).filter((e) => keep(e.on));
      const latestEntry = stanceHistory.slice().sort((a, b) => String(b.on).localeCompare(String(a.on)))[0] || null;
      const approximate =
        stanceHistory.length !== (s.stanceHistory || []).length ||
        contactLog.length !== (s.contactLog || []).length ||
        (latestEntry && latestEntry.stance !== s.stance);
      if (approximate) notes.stakeholders.add('Stakeholder stance and contact history later than the cutoff were removed');
      return {
        ...s,
        stance: latestEntry ? latestEntry.stance : s.stance,
        stanceHistory,
        contactLog,
        lastContactOn: keep(s.lastContactOn) ? s.lastContactOn : null,
        nextContactOn: keep(s.nextContactOn) ? s.nextContactOn : null,
      };
    });

  // Forecast-integrity challenges (Schema v26) are derived, dated records: a
  // challenge created after the cutoff did not exist yet, and a response or
  // band refresh dated later is removed with an explicit approximate-fidelity
  // note rather than pretending the earlier state is exactly recoverable.
  cloned.forecastChallenges = (cloned.forecastChallenges || [])
    .filter((c) => keep(c.createdOn || (c.createdAt || '').slice(0, 10)))
    .map((c) => {
      const respondedLater = c.status !== 'open' && c.respondedOn && c.respondedOn > asOfDay;
      const history = (c.history || []).filter((entry) => keep(entry.on));
      if (history.length !== (c.history || []).length || respondedLater) {
        notes.forecastIntegrity.add('Forecast-challenge responses or band refreshes later than the cutoff were removed; the recorded source estimate is unchanged');
      }
      return {
        ...c,
        status: respondedLater ? 'open' : c.status,
        respondedOn: respondedLater ? null : c.respondedOn,
        responseNote: respondedLater ? '' : c.responseNote,
        history,
      };
    });

  cloned.links = (cloned.links || []).filter((l) => keep(l.createdOn || (l.createdAt || '').slice(0, 10)));

  const fidelity = Object.fromEntries(
    Object.entries(notes).map(([key, set]) => [
      key,
      {
        level: !isHistorical || set.size === 0 ? 'exact' : 'approximate',
        reasons: [...set],
      },
    ]),
  );

  return { state: cloned, fidelity, asOfDay };
}

/**
 * Backwards-compatible wrapper returning the reconstructed state at `asOf`.
 */
export function truncateState(state, asOf) {
  return reconstructStateAt(state, asOf).state;
}

function cadenceDimension(state, now, settings) {
  const people = state.people.filter((p) => p.status !== 'archived');
  if (!people.length) return { score: null, detail: 'No team members yet.', drivers: [] };
  // Someone added this week has not had a chance to have a 1:1 yet. Scoring
  // them zero would punish the leader for a calendar that has not happened.
  const eligible = people.filter((p) => {
    const t = tenureDays(p, now);
    if (t !== null && t < 7 && !state.oneOnOnes.some((m) => m.personId === p.id)) return false;
    return true;
  });
  if (!eligible.length) {
    return { score: null, detail: 'New joiners only — conversation rhythm becomes measurable after the first week.', drivers: [] };
  }
  const perPerson = eligible.map((person) => {
    const c = cadence(state, person.id, now, settings);
    if (c.status === 'never') return { person, score: 0, c };
    const heldRatio = c.scheduledLast4 ? c.heldLast4 / c.scheduledLast4 : 0;
    // Recency: 100 while inside the cadence window, 0 at 2× the window.
    const recency = clamp(100 - ((c.daysSinceHeld - c.expectedDays * 0.5) / (c.expectedDays * 1.5)) * 100);
    return { person, score: round(0.6 * heldRatio * 100 + 0.4 * recency), c };
  });
  const score = round(mean(perPerson.map((p) => p.score)));
  const worst = perPerson.slice().sort((a, b) => a.score - b.score).slice(0, 3);
  return {
    score,
    detail: `60% of this score is how often scheduled 1:1s actually happen; 40% is how long since the last one.`,
    drivers: worst.map((w) => ({
      label: w.person.name,
      value: w.c.status === 'never' ? 'no 1:1 ever logged' : `${w.c.heldLast4}/${w.c.scheduledLast4} recent kept · last ${w.c.daysSinceHeld}d ago`,
      negative: w.score < 60,
    })),
  };
}

function feedbackDimension(state, now, settings) {
  const people = state.people.filter((p) => p.status !== 'archived');
  if (!people.length) return { score: null, detail: 'No team members yet.', drivers: [] };
  const target = settings.feedbackTargetDays;
  const eligible = people.filter((p) => {
    const t = tenureDays(p, now);
    if (t !== null && t < 14 && !state.feedback.some((f) => f.personId === p.id)) return false;
    return true;
  });
  if (!eligible.length) return { score: null, detail: 'No one has been on the team long enough to expect feedback yet.', drivers: [] };
  const perPerson = eligible.map((person) => {
    const s = personFeedbackStats(state, person.id, now, settings);
    let recency = 0;
    if (s.daysSinceGiven !== null) recency = clamp(100 - ((s.daysSinceGiven - target) / target) * 100);
    let penalty = 0;
    if (s.balance === 'praise-only') penalty = 15;
    if (s.balance === 'constructive-only') penalty = 10;
    return { person, score: clamp(recency - penalty), s };
  });
  const score = round(mean(perPerson.map((p) => p.score)));
  const worst = perPerson.slice().sort((a, b) => a.score - b.score).slice(0, 3);
  return {
    score,
    detail: `Based on days since the last feedback (target: every ${target} days), with a penalty for one-sided feedback.`,
    drivers: worst.map((w) => ({
      label: w.person.name,
      value: w.s.daysSinceGiven === null ? 'never' : `${w.s.daysSinceGiven}d ago`,
      negative: w.score < 60,
    })),
  };
}

function clarityDimension(state, now, settings) {
  const people = state.people.filter((p) => p.status !== 'archived');
  const active = activeGoals(state);
  const pulse = aggregate(state, now);
  const pulseClarity = pulse.blocked ? null : pulse.dimensions.clarity.avg;

  let goalScore = null;
  if (people.length) {
    const covered = people.filter((p) => active.some((g) => g.ownerId === p.id));
    const coverage = covered.length / people.length;
    const onTrack = active.length
      ? active.filter((g) => goalHealth(g, now).health === 'on-track').length / active.length
      : 0;
    goalScore = round((0.5 * coverage + 0.5 * onTrack) * 100);
  }
  if (goalScore === null && pulseClarity === null) {
    return { score: null, detail: 'No goals and no pulse data yet.', drivers: [] };
  }
  const score = round(
    pulseClarity === null
      ? goalScore
      : goalScore === null
        ? ((pulseClarity - 1) / 4) * 100
        : 0.6 * goalScore + 0.4 * ((pulseClarity - 1) / 4) * 100,
  );
  const drivers = [
    { label: 'Active goals', value: `${active.length}`, negative: active.length === 0 },
    {
      label: 'People with a goal',
      value: people.length ? `${people.filter((p) => active.some((g) => g.ownerId === p.id)).length}/${people.length}` : '0',
      negative: people.length > 0 && people.filter((p) => active.some((g) => g.ownerId === p.id)).length < people.length,
    },
    { label: 'Team-rated clarity', value: pulseClarity === null ? 'not enough pulse data' : `${pulseClarity}/5`, negative: pulseClarity !== null && pulseClarity < 3 },
  ];
  return { score, detail: '60% goal coverage and goal health, 40% how clearly the team rates its own priorities.', drivers };
}

function growthDimension(state, now, settings) {
  const people = state.people.filter((p) => p.status !== 'archived');
  if (!people.length) return { score: null, detail: 'No team members yet.', drivers: [] };
  const withPlan = people.filter((p) => activePlan(state, p.id));
  const coverage = withPlan.length / people.length;
  const completion = withPlan.length
    ? mean(withPlan.map((p) => planProgress(activePlan(state, p.id), now).percent)) / 100
    : 0;
  const pulse = aggregate(state, now);
  const pulseGrowth = pulse.blocked ? null : pulse.dimensions.growth.avg;
  const base = 0.55 * coverage + 0.45 * completion;
  const score = round(
    pulseGrowth === null ? base * 100 : (0.75 * base + 0.25 * ((pulseGrowth - 1) / 4)) * 100,
  );
  return {
    score,
    detail: 'How many people have a live development plan, how much of it they have completed, and how much they report learning.',
    drivers: [
      { label: 'People with a plan', value: `${withPlan.length}/${people.length}`, negative: withPlan.length < people.length },
      { label: 'Plan actions completed', value: `${round(completion * 100)}%`, negative: completion < 0.3 },
      { label: 'Team-rated growth', value: pulseGrowth === null ? 'not enough pulse data' : `${pulseGrowth}/5`, negative: pulseGrowth !== null && pulseGrowth < 3 },
    ],
  };
}

function wellbeingDimension(state, now) {
  const pulse = aggregate(state, now);
  if (pulse.blocked) {
    const detail = pulse.n === 0
      ? 'No pulse responses in the last two weeks.'
      : pulse.blockedReason === 'unanimous'
        ? `Suppressed: ${pulse.n} responses contain an identical answer slice, hidden to protect anonymity.`
        : `Suppressed: ${pulse.usableResponses} complete response(s), ${pulse.minRequired} needed to protect anonymity.`;
    return {
      score: null,
      detail,
      drivers: [],
    };
  }
  const safety = pulse.dimensions.safety.avg;
  const workload = pulse.dimensions.workload.avg;
  const score = round((0.55 * ((safety - 1) / 4) + 0.45 * ((workload - 1) / 4)) * 100);
  const countLabel = pulse.incompleteResponses
    ? `${pulse.usableResponses} complete (${pulse.n} total)`
    : `${pulse.usableResponses}`;
  return {
    score,
    detail: `55% psychological safety, 45% sustainable load, from ${countLabel} anonymous responses this fortnight.`,
    drivers: [
      { label: 'Safety', value: `${safety}/5`, negative: safety < 3 },
      { label: 'Workload', value: `${workload}/5`, negative: workload < 3 },
      { label: 'Responses', value: countLabel, negative: false },
    ],
  };
}

function dateSpanDays(state, now) {
  const all = [
    ...state.oneOnOnes.map((m) => m.date),
    ...state.feedback.map((f) => f.date),
    ...state.pulses.map((p) => p.date),
    ...state.recognition.map((r) => r.date),
    ...state.people.map((p) => (p.createdAt || '').slice(0, 10)),
  ].filter(Boolean);
  if (!all.length) return 0;
  const oldest = all.slice().sort()[0];
  return daysBetween(oldest, now) ?? 0;
}

export function dimensions(state, now) {
  const settings = state.settings;
  const raw = {
    cadence: cadenceDimension(state, now, settings),
    feedback: feedbackDimension(state, now, settings),
    clarity: clarityDimension(state, now, settings),
    growth: growthDimension(state, now, settings),
    wellbeing: wellbeingDimension(state, now),
  };
  return DIMENSIONS.map((meta) => {
    const value = raw[meta.key];
    return { ...meta, score: value.score, detail: value.detail, drivers: value.drivers };
  });
}

/**
 * @returns {{ overall:number|null, grade:string, dimensions:Array, coverage:number,
 *             trend:{available:boolean,delta:number|null,previous:number|null},
 *             label:string }}
 */
export function teamHealth(state, now, { withTrend = true, trendDays = 30 } = {}) {
  const dims = dimensions(state, now);
  const scored = dims.filter((d) => typeof d.score === 'number');
  if (!scored.length) {
    return {
      overall: null,
      grade: '—',
      dimensions: dims,
      coverage: 0,
      trend: { available: false, delta: null, previous: null },
      label: 'No scored dimensions yet: log a 1:1, some feedback or a pulse response to start measuring.',
    };
  }
  const weightSum = scored.reduce((sum, d) => sum + d.weight, 0);
  const overall = round(scored.reduce((sum, d) => sum + d.score * d.weight, 0) / weightSum, 1);
  const grade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'F';

  let trend = { available: false, delta: null, previous: null, reason: null };
  if (withTrend) {
    const cutoff = addDays(now, -trendDays);
    // A "trend" needs records that are actually older than the cutoff. Without
    // this guard, an empty past scores near zero and the app reports a fake
    // improvement — exactly the kind of number this project must not produce.
    const dated = [
      ...state.oneOnOnes.map((m) => m.date),
      ...state.feedback.map((f) => f.date),
      ...state.pulses.map((p) => p.date),
      ...state.recognition.map((r) => r.date),
    ].filter(Boolean);
    const olderThanCutoff = dated.filter((d) => (daysBetween(d, cutoff) ?? 0) >= 0).length;
    const heldBeforeCutoff = state.oneOnOnes.some((m) => m.status === 'held' && (daysBetween(m.date, cutoff) ?? 0) >= 0);
    if (dateSpanDays(state, now) >= trendDays + 14 && olderThanCutoff >= 2 && heldBeforeCutoff) {
      const reconstructed = reconstructStateAt(state, cutoff, { currentDay: dayKey(now) });
      const past = teamHealth(reconstructed.state, new Date(cutoff + 'T00:00:00.000Z'), { withTrend: false });
      const pastByKey = new Map(past.dimensions.map((d) => [d.key, d]));
      const shared = scored.filter((d) => typeof pastByKey.get(d.key)?.score === 'number');
      if (typeof past.overall === 'number' && shared.length > 0) {
        const sharedWeight = shared.reduce((sum, d) => sum + d.weight, 0);
        const matchedNow = round(shared.reduce((sum, d) => sum + d.score * d.weight, 0) / sharedWeight, 1);
        const matchedPast = round(shared.reduce((sum, d) => sum + pastByKey.get(d.key).score * d.weight, 0) / sharedWeight, 1);
        const pastScoredKeys = past.dimensions.filter((d) => typeof d.score === 'number').map((d) => d.key);
        const coverageChanged = scored.map((d) => d.key).join(',') !== pastScoredKeys.join(',');
        const approxReasons = shared.flatMap((d) => reconstructed.fidelity[d.key]?.reasons || []);
        trend = {
          available: true,
          delta: round(matchedNow - matchedPast, 1),
          previous: coverageChanged ? matchedPast : past.overall,
          rawOverallDelta: round(overall - past.overall, 1),
          matchedDimensions: shared.map((d) => d.key),
          coverageChanged,
          fidelity: approxReasons.length ? 'approximate' : 'exact',
          reason: null,
        };
      } else {
        trend.reason = 'No shared measured dimensions between now and 30 days ago.';
      }
    } else {
      trend.reason = `Not enough history yet: a ${trendDays}-day trend appears once records are at least ${trendDays + 14} days old.`;
    }
  }

  const weakest = scored.slice().sort((a, b) => a.score - b.score)[0];
  return {
    overall,
    grade,
    dimensions: dims,
    coverage: round(weightSum, 2),
    trend,
    weakest,
    label: `Weighted mean of ${scored.length} measured dimension(s); ${DIMENSIONS.length - scored.length} not yet measurable. Weakest: ${weakest.label} (${weakest.score}).`,
  };
}

export { isOverdue, daysSince };
