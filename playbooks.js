/* LeadOS pt-1 · js/playbooks.js — the mentor layer.
   Structured playbooks that PRE-FILL from live projections and RESOLVE by
   writing events — the same append path every module uses, so the engine sees
   the resolution on next render. No playbook mutates state directly, ever.
   pt-1 ships 7: 1:1 run sheet · SBI · DESC · delegation ladder · SL assessment ·
   decision review · goal review. Each carries its why in-line (the mentor voice):
   transparent reasoning, no borrowed certainty. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.playbooks = 'js/playbooks.js';

LEADOS.playbooks = (function () {
  'use strict';

  function fmtD(iso) { return iso ? String(iso).slice(0, 10) : '—'; }
  function ago(P, today, iso) { var a = Math.floor((new Date(today) - new Date(iso)) / 864e5); return isNaN(a) ? '—' : a + 'd ago'; }
  function personOptions(P, includeSkips) {
    return P.people.filter(function (p) { return !p.archived && (includeSkips || !p.reportsTo); })
      .map(function (p) { return { v: p.id, t: p.name + (p.reportsTo ? ' (skip-level)' : '') }; });
  }
  function need(v) { return v != null && String(v).trim() !== ''; }

  var PB = {
    oneonone: {
      id: 'oneonone', title: '1:1 run sheet', resolves: ['R1', 'R7'],
      tagline: 'The highest-leverage recurring meeting a new multi-team leader owns.',
      why: ['Skip-level note: your directs are now LEADS — use the sheet to coach their leadership, not to manage their tickets. If most of the hour was status, you held a standup, not a 1:1.',
        'The sheet is structured but the first ten minutes are theirs. A 1:1 that starts with your agenda trains them to bring you nothing.'],
      sections: function (ctx, P) {
        var pid = ctx.personId, p = P.peopleById[pid];
        var last = pid && P.oneononeLast[pid];
        var dels = (pid && P.delegationsOpenByPerson[pid]) || [];
        var pulses = (pid && P.pulsesByPerson[pid]) || [];
        var sl = pid && P.slByPerson[pid];
        var pre = ['Person: ' + (p ? p.name : '— select —') + (p && p.role ? ' · ' + p.role : ''),
          'last 1:1: ' + (last ? fmtD(last.ts) + ' (' + ago(P, LEADOS.events.todayIso(), last.ts) + ')' : 'never logged'),
          'open delegations: ' + dels.length + (dels.length ? ' — ' + dels.slice(0, 3).map(function (d) { return d.task + ' (L' + (d.level || '?') + ')'; }).join(' · ') : ''),
          'latest pulse: ' + (pulses.length ? 'load ' + pulses[pulses.length - 1].load + '/10 · mood ' + pulses[pulses.length - 1].mood + '/10 · ' + fmtD(pulses[pulses.length - 1].ts) + (pulses[pulses.length - 1].measured === false ? ' (estimated)' : ' (measured)') : 'none recorded'),
          'SL readiness: ' + (sl ? sl.d + ' → style ' + sl.s + ' (assessed ' + fmtD(sl.ts) + ')' : 'not assessed — the sl-assess playbook is the missing input')];
        if (ctx.finding && ctx.finding.rule === 'R7') pre.push('R7 basis carried in: ' + (ctx.finding.basis[1] || ctx.finding.basis[0] || ''));
        return [
          { h: 'Pre-fill from LeadOS data', mono: pre },
          { h: 'Run of sheet (40–50 min)', mono: [
            '1. Their items first (10m) — "what’s on your list?" then silence. Count to five.',
            '2. How are they doing as a LEAD (10m) — their team’s health, their hardest conversation this week, one person they’re growing.',
            '3. Delegation check (10m) — walk the open items above: right level? whose decision is it really?',
            '4. Feedback both ways (5m) — one SBI from you, one ask for them.',
            '5. Commitments (5m) — each side names one. Write theirs below; it lands in the event.'] },
          { h: 'Load-cutting variant (only if R7 fired)', mono: ['Do NOT open with "are you okay?" — open the workload list and ask: "which of these would you not restart?" Cut first, empathize second; burnout conversations that change nothing teach people the conversation is theater.'] }
        ];
      },
      fields: function (ctx, P) {
        return [
          { key: 'personId', label: 'Person', type: 'select', options: personOptions(P), value: ctx.personId || '', required: true },
          { key: 'theirTopItem', label: 'Their top item (in their words)', type: 'text', help: 'Signals whose meeting it was.' },
          { key: 'commitment', label: 'Their commitment', type: 'text' },
          { key: 'myCommitment', label: 'Your commitment to them', type: 'text' },
          { key: 'note', label: 'Notes', type: 'textarea', rows: 4 },
          { key: 'nextInDays', label: 'Next 1:1 in (days)', type: 'number', value: ctx.cadence || '' }
        ];
      },
      submit: function (v, ctx) {
        if (!need(v.personId)) return { error: 'person required' };
        LEADOS.events.append('oneonone.logged', { personId: v.personId, theirTopItem: v.theirTopItem || '', commitment: v.commitment || '', myCommitment: v.myCommitment || '', note: v.note || '', nextInDays: v.nextInDays ? Number(v.nextInDays) : null }, { silent: true });
        LEADOS.events.append('playbook.completed', { playId: 'oneonone', personId: v.personId }, { silent: true });
        return { ok: true, summary: '1:1 logged — R1 for this person clears on render' };
      }
    },

    sbi: {
      id: 'sbi', title: 'SBI feedback', resolves: ['R4'],
      tagline: 'Situation → Behavior → Impact. Feedback that can’t be argued with, because it’s footage, not verdict.',
      why: ['SBI works because it separates observation from judgment: "in Tuesday’s review you cut Maria off twice" is discussable; "you’re dismissive" is only debatable.',
        'Deliver the ask as a question after the impact. People adopt conclusions they say out loud themselves.'],
      sections: function (ctx, P) {
        var pid = ctx.personId;
        var hint = '';
        if (ctx.finding && ctx.finding.rule === 'R4') hint = ctx.finding.basis[0] + ' — pre-selected polarity is the MISSING one';
        return [{ h: 'Pre-fill', mono: ['Person: ' + (P.peopleById[pid] ? P.peopleById[pid].name : '— select —'), hint || 'no imbalance finding attached — choose polarity deliberately'] },
          { h: 'Structure', mono: ['S — where/when: one meeting, one moment. Never "lately" or "always".', 'B — the footage: what a camera would have recorded. No adjectives about character.', 'I — the effect: on the decision, the team, the numbers. Concrete, theirs to verify.', 'Ask — "what’s your read on that?" then stop talking.'] }];
      },
      fields: function (ctx, P) {
        var missing = '';
        if (ctx.finding && ctx.finding.rule === 'R4') missing = ctx.finding.title.indexOf('corrective') >= 0 ? 'positive' : 'corrective';
        return [
          { key: 'personId', label: 'Person', type: 'select', options: personOptions(P), value: ctx.personId || '', required: true },
          { key: 'polarity', label: 'Polarity', type: 'select', options: [{ v: 'positive', t: 'positive (reinforcing)' }, { v: 'corrective', t: 'corrective (redirecting)' }], value: missing, required: true, help: missing ? 'Pre-filled: the polarity this person has been missing.' : '' },
          { key: 's', label: 'Situation', type: 'textarea', rows: 2 },
          { key: 'b', label: 'Behavior (footage only)', type: 'textarea', rows: 2 },
          { key: 'i', label: 'Impact', type: 'textarea', rows: 2 },
          { key: 'ask', label: 'The question you’ll end with', type: 'text' }
        ];
      },
      submit: function (v, ctx) {
        if (!need(v.personId) || !need(v.polarity)) return { error: 'person + polarity required' };
        if (!need(v.s) || !need(v.b) || !need(v.i)) return { error: 'S, B and I are all required — a partial SBI is an opinion with extra steps' };
        LEADOS.events.append('feedback.given', { personId: v.personId, polarity: v.polarity, sbi: { s: v.s, b: v.b, i: v.i, ask: v.ask || '' } }, { silent: true });
        LEADOS.events.append('playbook.completed', { playId: 'sbi', personId: v.personId }, { silent: true });
        return { ok: true, summary: 'SBI logged as feedback.given — R4 recounts the 60d window on render' };
      }
    },

    desc: {
      id: 'desc', title: 'DESC conflict script', resolves: ['R6'],
      tagline: 'Describe → Express → Specify → Consequences. For the third time the same two people collide.',
      why: ['DESC keeps you on the third rail of mediation: you are changing the PATTERN between two people, not ruling on who was right in the last incident.',
        'If this is the second-plus occurrence, the conflict is feeding on a structure — an unclear owner, a shared resource, a broken handoff. Specify the structural change, not just the behavioral wish.'],
      sections: function (ctx, P) {
        var cs = [];
        if (ctx.finding && ctx.finding.rule === 'R6') {
          var evs = P.openConflicts.filter(function (c) { return c.pairKey === ctx.finding.key.slice(3); });
          cs = evs.map(function (c, i) { return (i + 1) + '. ' + fmtD(c.ts) + ' — ' + (c.text || '(no text)') + ' [' + c.id + ']'; });
        }
        return [{ h: 'Open incidents in this cluster', mono: cs.length ? cs : ['no finding attached — log incidents first for a data-backed conversation'] },
          { h: 'Script skeleton', mono: ['D — describe the pattern as data: dates, incidents, no adjectives.', 'E — express the cost: delivery risk, team watching you tolerate it.', 'S — specify the change: who decides what, by when, in writing.', 'C — consequences: what YOU will do if #3 happens (escalate, split the interface) — a commitment, not a threat.'] }];
      },
      fields: function (ctx, P) {
        return [
          { key: 'aId', label: 'Party A', type: 'select', options: personOptions(P, true), value: ctx.aId || '' },
          { key: 'bId', label: 'Party B', type: 'select', options: personOptions(P, true), value: ctx.bId || '' },
          { key: 'text', label: 'Cluster label (if unnamed)', type: 'text' },
          { key: 'd', label: 'D — Describe (pattern as data)', type: 'textarea', rows: 3, required: true },
          { key: 'e', label: 'E — Express (cost)', type: 'textarea', rows: 2 },
          { key: 's', label: 'S — Specify (the structural change)', type: 'textarea', rows: 2, required: true },
          { key: 'c', label: 'C — Consequences (your commitment)', type: 'textarea', rows: 2 },
          { key: 'outcome', label: 'Outcome of the conversation', type: 'select', options: [{ v: 'followup', t: 'held — follow-up pending' }, { v: 'resolved', t: 'held — resolved (specify agreed change)' }], value: 'followup', required: true },
          { key: 'note', label: 'Resolution/follow-up note', type: 'textarea', rows: 2 }
        ];
      },
      submit: function (v, ctx) {
        if (!need(v.d) || !need(v.s)) return { error: 'D and S are required — a DESC without Specify is a venting session' };
        var pairKey = null, conflictIds = [];
        if (ctx.finding && ctx.finding.rule === 'R6') {
          pairKey = ctx.finding.key.slice(3);
          var P = LEADOS.events.project(LEADOS.store.state());
          conflictIds = P.openConflicts.filter(function (c) { return c.pairKey === pairKey; }).map(function (c) { return c.id; });
        }
        var descData = { aId: v.aId || null, bId: v.bId || null, d: v.d, e: v.e || '', s: v.s, c: v.c || '' };
        LEADOS.events.append(v.outcome === 'resolved' ? 'conflict.resolved' : 'conflict.followup',
          { conflictIds: conflictIds, pairKey: pairKey, note: v.note || '', desc: descData, aId: v.aId || null, bId: v.bId || null, text: v.text || '' }, { silent: true });
        LEADOS.events.append('playbook.completed', { playId: 'desc' }, { silent: true });
        return { ok: true, summary: v.outcome === 'resolved' ? 'Resolution logged — R6 clears until a NEWER conflict reopens the pair' : 'Follow-up logged — R6 stays open until resolution; that is deliberate' };
      }
    },

    delegation: {
      id: 'delegation', title: 'Delegation ladder L1–L5', resolves: ['R5'],
      tagline: 'Most delegation failure is level ambiguity: you thought L4, they heard L2.',
      why: ['L1 exact instructions · L2 research + report back · L3 recommend, you approve · L4 decide, inform after · L5 full ownership.',
        'Match the level to the person’s readiness for THIS task (SL), not to your general trust in them — trust is global, readiness is per-task.',
        'Every open delegation needs a check-in date. Without one, L4 silently decays into abandonment, and R5 starts counting.'],
      sections: function (ctx, P) {
        var pid = ctx.personId, sl = pid && P.slByPerson[pid];
        var open = (pid && P.delegationsOpenByPerson[pid]) || [];
        var map = { D1: 'L1–L2 (high direction)', D2: 'L2–L3 (direction + explanation)', D3: 'L3–L4 (support, light direction)', D4: 'L4–L5 (hand it over)' };
        return [{ h: 'Pre-fill', mono: [
            'Person: ' + (P.peopleById[pid] ? P.peopleById[pid].name : '— select —'),
            'open delegations: ' + open.length + (open.length >= 4 ? ' — at/over R5 threshold; close or re-level before adding' : ''),
            'SL readiness: ' + (sl ? sl.d + ' → suggested ' + map[sl.d] + ' (guidance, not a rule — you were there)' : 'not assessed; pick the level from the task risk, then assess'),
            'Your level words in the handoff: "this is L3 — bring me a recommendation, I decide." Say the number.'] },
          { h: 'Ladder', mono: ['L1 — do exactly this. (crisis, irreversible, novice)', 'L2 — look into it, report what you find.', 'L3 — recommend; I approve before action.', 'L4 — decide; tell me after.', 'L5 — own it; no report required.'] }];
      },
      fields: function (ctx, P) {
        return [
          { key: 'personId', label: 'Person', type: 'select', options: personOptions(P), value: ctx.personId || '', required: true },
          { key: 'task', label: 'Task / decision being delegated', type: 'text', required: true },
          { key: 'level', label: 'Ladder level', type: 'select', options: [1, 2, 3, 4, 5].map(function (n) { return { v: String(n), t: 'L' + n }; }), value: '3', required: true },
          { key: 'checkInDate', label: 'Check-in date', type: 'date', required: true, help: 'Required. Level without a date is hope.' },
          { key: 'saidLevelOutLoud', label: 'I said the level number out loud', type: 'checkbox' }
        ];
      },
      submit: function (v, ctx) {
        if (!need(v.personId) || !need(v.task) || !need(v.checkInDate)) return { error: 'person, task and check-in date required' };
        LEADOS.events.append('delegation.assigned', { personId: v.personId, task: v.task, level: Number(v.level), checkInDate: v.checkInDate, saidLevelOutLoud: !!v.saidLevelOutLoud }, { silent: true });
        LEADOS.events.append('playbook.completed', { playId: 'delegation', personId: v.personId }, { silent: true });
        return { ok: true, summary: 'Delegation logged at L' + v.level + ' — R5 recounts open items on render' };
      }
    },

    'sl-assess': {
      id: 'sl-assess', title: 'Situational readiness (D→S)', resolves: [],
      tagline: 'Same person, different task, different readiness. Style follows the task, not the person.',
      why: ['The situational claim that survives contact with a real team: competence and commitment vary PER TASK, so your style must too. "She’s a D4" is a category error; "she’s D4 on releases, D2 on stakeholder management" is actionable.',
        'Mismatch costs are asymmetric: over-directing a D4 breeds resentment fast; under-directing a D1 breeds failure slow. When unsure, err one level more directive with a dated check-in.'],
      sections: function (ctx, P) {
        var pid = ctx.personId, p = P.peopleById[pid];
        var hist = P.peopleById[pid] ? P.slByPerson[pid] : null;
        return [{ h: 'Pre-fill', mono: ['Person: ' + (p ? p.name : '— select —'), 'latest assessment: ' + (hist ? hist.d + ' → ' + hist.s + ' (' + fmtD(hist.ts) + ')' : 'none yet'),
            'Assess for a NAMED task — the fields below ask which.'] },
          { h: 'Rubric', mono: ['D1 low competence · high commitment → S1 Directing (show, define "done", check daily)', 'D2 some competence · low/variable commitment → S2 Coaching (direct + explain the why)', 'D3 high competence · variable commitment → S3 Supporting (facilitate, lend confidence, they decide)', 'D4 high competence · high commitment → S4 Delegating (outcome + constraints, then get out)'] }];
      },
      fields: function (ctx, P) {
        return [
          { key: 'personId', label: 'Person', type: 'select', options: personOptions(P, true), value: ctx.personId || '', required: true },
          { key: 'task', label: 'Task/domain this assessment is for', type: 'text', required: true },
          { key: 'competence', label: 'Demonstrated competence for THIS task', type: 'select', options: [{ v: 'low', t: 'low — no track record' }, { v: 'some', t: 'some — parts proven' }, { v: 'high', t: 'high — repeatedly proven' }], required: true },
          { key: 'commitment', label: 'Commitment/confidence for THIS task', type: 'select', options: [{ v: 'high', t: 'high' }, { v: 'variable', t: 'variable — fluctuates' }, { v: 'low', t: 'low' }], required: true }
        ];
      },
      submit: function (v, ctx) {
        if (!need(v.personId) || !need(v.task) || !need(v.competence) || !need(v.commitment)) return { error: 'all fields required — partial assessments are how styles drift' };
        var d, s;
        if (v.competence === 'low') { d = 'D1'; s = 'S1'; }
        else if (v.competence === 'some') { d = 'D2'; s = 'S2'; }
        else { d = (v.commitment === 'high') ? 'D4' : 'D3'; s = d === 'D4' ? 'S4' : 'S3'; }
        LEADOS.events.append('sl.assessed', { personId: v.personId, task: v.task, competence: v.competence, commitment: v.commitment, d: d, s: s }, { silent: true });
        LEADOS.events.append('playbook.completed', { playId: 'sl-assess', personId: v.personId }, { silent: true });
        return { ok: true, summary: 'Readiness ' + d + ' → style ' + s + ' logged for "' + v.task + '" — delegation ladder and run sheets now pre-fill it' };
      }
    },

    'decision-review': {
      id: 'decision-review', title: 'Decision review', resolves: ['R2'],
      tagline: 'A decision past its review date with no outcome logged is how organizations learn nothing, expensively.',
      why: ['The review is where the decision pays rent: keep (validated), change, reverse, or abandon. "Abandoned" is a legitimate outcome — logging it closes the loop; ignoring it teaches the team that reviews are theater.',
        'Write one line of lessons. A decision journal only compounds if every entry has an ending.'],
      sections: function (ctx, P) {
        var did = ctx.decisionId;
        var dec = null;
        P.openDecisions.forEach(function (d) { if (d.id === did) dec = d; });
        return [{ h: 'The decision', mono: dec ? ['"' + dec.title + '"', 'decided ' + fmtD(dec.ts) + ' · severity ' + (dec.severity || '—') + ' · review was due ' + fmtD(dec.reviewDate)] : ['— select below (no finding attached) —'] }];
      },
      fields: function (ctx, P) {
        return [
          { key: 'decisionId', label: 'Open decision', type: 'select', options: P.openDecisions.map(function (d) { return { v: d.id, t: '"' + d.title + '" · due ' + fmtD(d.reviewDate) }; }), value: ctx.decisionId || '', required: true },
          { key: 'result', label: 'Outcome', type: 'select', options: [{ v: 'validated', t: 'validated — keep' }, { v: 'changed', t: 'changed — adjust course' }, { v: 'reversed', t: 'reversed — undo' }, { v: 'abandoned', t: 'abandoned — quietly died; say so' }], required: true },
          { key: 'lessons', label: 'One line of lessons', type: 'textarea', rows: 3, required: true }
        ];
      },
      submit: function (v, ctx) {
        if (!need(v.decisionId) || !need(v.result)) return { error: 'decision and outcome required' };
        if (!need(v.lessons)) return { error: 'lessons required — that line is the point of the review' };
        LEADOS.events.append('decision.outcome', { decisionId: v.decisionId, result: v.result, lessons: v.lessons }, { silent: true });
        LEADOS.events.append('playbook.completed', { playId: 'decision-review' }, { silent: true });
        return { ok: true, summary: 'Outcome logged — R2 clears; the decision stays in the record forever' };
      }
    },

    'goal-review': {
      id: 'goal-review', title: 'Goal review', resolves: ['R3'],
      tagline: 'Ownerless and silent goals are not goals; they are wishes with deadlines.',
      why: ['An owner is one name, not a team. "The platform team owns it" means the conversation about it will happen at your level, late.',
        'Silence past two weeks usually means the goal was deprioritized and nobody said it — the review is where you say it, on purpose.'],
      sections: function (ctx, P) {
        var gid = ctx.goalId, g = gid && P.goalById[gid];
        return [{ h: 'The goal', mono: g ? ['"' + g.title + '"', 'set ' + fmtD(g.ts) + ' · owner ' + (g.ownerId && P.peopleById[g.ownerId] ? P.peopleById[g.ownerId].name : 'NONE') + ' · last progress ' + (g.lastProgressTs ? fmtD(g.lastProgressTs) : 'never') + ' · progress notes: ' + g.progressN] : ['— select below —'] }];
      },
      fields: function (ctx, P) {
        return [
          { key: 'goalId', label: 'Open goal', type: 'select', options: P.openGoals.map(function (g) { return { v: g.id, t: '"' + g.title + '"' + (g.ownerId ? '' : ' · NO OWNER') }; }), value: ctx.goalId || '', required: true },
          { key: 'ownerId', label: 'Set/changed owner (leave empty to keep)', type: 'select', options: [{ v: '', t: '— keep current —' }].concat(personOptions(P, true)), value: '' },
          { key: 'note', label: 'Progress note (what moved, what’s next)', type: 'textarea', rows: 3 },
          { key: 'close', label: 'Close this goal', type: 'select', options: [{ v: '', t: '— keep open —' }, { v: 'done', t: 'close — done' }, { v: 'dropped', t: 'close — consciously dropped (say why)' }], value: '' }
        ];
      },
      submit: function (v, ctx) {
        if (!need(v.goalId)) return { error: 'goal required' };
        var did = false;
        if (need(v.ownerId)) { LEADOS.events.append('goal.updated', { goalId: v.goalId, ownerId: v.ownerId }, { silent: true }); did = true; }
        if (need(v.note)) { LEADOS.events.append('goal.progress', { goalId: v.goalId, note: v.note }, { silent: true }); did = true; }
        if (need(v.close)) { LEADOS.events.append('goal.closed', { goalId: v.goalId, result: v.close, note: v.note || '' }, { silent: true }); did = true; }
        if (!did) return { error: 'nothing to log — set an owner, write a progress note, or close it' };
        LEADOS.events.append('playbook.completed', { playId: 'goal-review' }, { silent: true });
        return { ok: true, summary: 'Goal updated — R3 re-measures silence from now' };
      }
    }
  };

  function list() {
    return Object.keys(PB).map(function (k) { var p = PB[k]; return { id: p.id, title: p.title, tagline: p.tagline, resolves: p.resolves }; });
  }
  function get(id) { return PB[id] || null; }

  return { list: list, get: get };
})();
