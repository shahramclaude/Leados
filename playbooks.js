/* LeadOS pt-3 · js/playbooks.js — the mentor layer.
   Playbooks are DATA, not bespoke screens: each declares prefill(ctx, P),
   fields[], and submit(values, ctx) → event list. js/ui.js renders them
   generically; js/engine.js findings carry .play and resolve through
   forFinding() below. Every save path also appends playbook.completed — the
   record that you did the work, distinct from the events the work produced.
   Carried to pt-2 contract: 1:1 run sheet + skip variant · SBI · DESC ·
   delegation ladder L1–L5 with check-in spacing (printed assumptions) ·
   situational D→S (printed heuristic, per-task) · decision-review · goal-review.
   NEW in pt-3: growth-plan (SL-prefilled from latest sl.assessed, style-derived
   review window, printed where each default came from) and growth-review
   (check-in + D re-assessment extends the plan's spine; close with outcome).
   Doctrine: no playbook ever fakes certainty — recommended text is labeled. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.playbooks = 'js/playbooks.js';

LEADOS.playbooks = (function () {
  'use strict';

  function P() { return LEADOS.events.project(LEADOS.store.state()); }
  function personName(Pj, pid) { var p = Pj.peopleById[pid]; return p ? p.name : '(unknown)'; }
  function inDays(n) { return LEADOS.events.inDaysIso(n).slice(0, 10); }

  /* Situational heuristic — printed, per-task, honest about its limits. */
  var SL = {
    heuristic: function (competence, commitment) {
      if (competence == null || commitment == null) return { d: null, why: 'both sliders required — no guess' };
      var d;
      if (competence <= 2 && commitment >= 3) d = 'D1';
      else if (competence <= 2) d = 'D2';
      else if (competence <= 3 && commitment <= 2) d = 'D3';
      else if (competence <= 3) d = 'D2';
      else if (commitment <= 2) d = 'D3';
      else d = 'D4';
      return { d: d, why: 'printed heuristic: competence ' + competence + '/5 · commitment ' + commitment + '/5 → ' + d +
        ' (D1 low-skill/high-will · D2 some-skill/low-or-wavering-will · D3 high-skill/variable-will · D4 high/high). A 2-slider map is a starting hypothesis, not an assessment — re-check on the task.' };
    },
    styleFor: function (d) {
      return { D1: 'S1', D2: 'S2', D3: 'S3', D4: 'S4' }[d] || null;
    },
    styleLine: function (s) {
      return {
        S1: 'S1 Directing — high direction, low support. You define the what and the how; short leash, fast feedback.',
        S2: 'S2 Coaching — high direction, high support. You still decide, but you explain the why and hear them first.',
        S3: 'S3 Supporting — low direction, high support. They decide; your job is listening and unblocking.',
        S4: 'S4 Delegating — low direction, low support. Hand it over, agree the checkpoints, get out of the way.'
      }[s] || '';
    },
    reviewDaysFor: function (s) { return { S1: 7, S2: 10, S3: 14, S4: 21 }[s] || 14; }
  };
  var DELEGATION_LEVELS = {
    1: 'L1 Tell — you decide, they execute. Check in daily. Right for irreversible or urgent work, or D1 on this task.',
    2: 'L2 Sell — you decide, you explain, they execute. Check in every ~3 days (assumption, printed).',
    3: 'L3 Consult — they propose, you decide. Weekly check-in. Builds judgment with a safety net.',
    4: 'L4 Agree — you decide together. Bi-weekly check-in (assumption). For proven D3 people on new ground.',
    5: 'L5 Delegate — they decide, you get informed at milestones. Reserve for D4. Your check-in is the milestone, not the work.'
  };

  var PLAYS = [
    { id: 'oneonone', title: '1:1 run sheet', mode: 'direct',
      forWhat: 'R1 cadence · R7 burnout talking points · skip variant for R8',
      prefill: function (ctx, Pj) {
        var p = Pj.peopleById[ctx.personId], notes = [];
        if (!p) return { notes: ['person not found'] };
        var last = (ctx.mode === 'skip' ? Pj.skiplevelLast : Pj.oneononeLast)[ctx.personId];
        notes.push('1:1 with ' + p.name + ' — last: ' + (last ? String(last.ts).slice(0, 10) : 'never logged'));
        var owned = Pj.openGoals.filter(function (g) { return g.ownerId === ctx.personId; });
        if (owned.length) notes.push('their open goals: ' + owned.map(function (g) { return '"' + g.title + '" (' + g.progressN + ' progress notes)'; }).join(' · '));
        var dels = Pj.delegationsOpenByPerson[ctx.personId] || [];
        if (dels.length) notes.push('holding ' + dels.length + ' open delegations: ' + dels.slice(0, 3).map(function (x) { return '"' + x.task + '" L' + (x.level || '—'); }).join(' · '));
        var plans = Pj.plansByPerson[ctx.personId] ? Pj.plansByPerson[ctx.personId].filter(function (x) { return !x.closed; }) : [];
        if (plans.length) notes.push('open growth plans: ' + plans.map(function (x) { return '"' + x.goal + '" (' + (x.d || 'D?') + ' → ' + (x.s || 'S?') + ', ' + x.checkins + ' check-ins)'; }).join(' · '));
        var sl = Pj.slByPerson[ctx.personId];
        if (sl) notes.push('latest SL read: ' + (sl.d || 'D?') + ' → ' + (sl.s || 'S?') + ' on ' + String(sl.ts).slice(0, 10) + (sl.note ? ' (“' + sl.note + '”)' : ''));
        var pu = (Pj.pulsesByPerson[ctx.personId] || []).filter(function (x) { return x.measured; });
        if (pu.length) { var lp = pu[pu.length - 1]; notes.push('latest measured pulse: load ' + lp.load + '/10 · mood ' + lp.mood + '/10 (' + String(lp.ts).slice(0, 10) + ')'); }
        if (ctx.burnout) notes.push('R7 fired — the trend is a signal to talk, not a verdict. Open with how THEY are, before any agenda. Do not quote the slope at them; ask about load and listen.');
        notes.push('agenda: their items first · wins (name one, specifically) · blockers you can remove · ONE growth beat · commitments both ways');
        return { notes: notes };
      },
      fields: [
        { k: 'note', label: 'Notes — what was said, what you committed to', kind: 'textarea', help: 'Stored verbatim on the oneonone.logged event. Commitments you write down are the ones that happen.' },
        { k: 'pulse', label: 'Record a measured pulse too (load + mood)?', kind: 'select', options: ['no', 'yes'], value: 'no', help: 'Measured = you actually asked. R7 ignores estimated readings by design.' },
        { k: 'load', label: 'Their self-reported load 0–10', kind: 'number', showIf: { k: 'pulse', v: 'yes' } },
        { k: 'mood', label: 'Their self-reported mood 0–10', kind: 'number', showIf: { k: 'pulse', v: 'yes' } }
      ],
      submit: function (v, ctx) {
        var evs = [[ctx.mode === 'skip' ? 'skiplevel.logged' : 'oneonone.logged', { personId: ctx.personId, note: v.note || '', mode: ctx.mode || 'direct' }].slice(0, 2)];
        evs[0][0] = ctx.mode === 'skip' ? 'skiplevel.logged' : 'oneonone.logged';
        if (v.pulse === 'yes') {
          var load = +v.load, mood = +v.mood;
          if (isNaN(load) || isNaN(mood) || load < 0 || load > 10 || mood < 0 || mood > 10) return { error: 'pulse values must be numbers 0–10 — R7 discards out-of-range anyway' };
          evs.push(['pulse.recorded', { personId: ctx.personId, load: load, mood: mood, measured: true }]);
        }
        return { events: evs };
      } },

    { id: 'sbi', title: 'SBI feedback', mode: null,
      forWhat: 'R4 imbalance · any reinforcing/corrective moment',
      prefill: function (ctx, Pj) {
        var notes = ['SBI for ' + personName(Pj, ctx.personId) + ' — Situation (when/where, one specific instance) → Behavior (what you observed, no adjectives about character) → Impact (the effect on the work/team), then ask before you advise.'];
        if (ctx.kind === 'corrective-heavy') notes.push('R4 fired all-corrective — this SBI is pre-set REINFORCING. Catch them doing the thing right, specifically. “Good job” without S/B/I is not feedback.');
        if (ctx.kind === 'positive-heavy') notes.push('R4 fired all-reinforcing — this SBI is pre-set CORRECTIVE. One growth note, one instance, end with the ask.');
        var recent = (Pj.feedbackByPerson[ctx.personId] || []).slice(-3);
        if (recent.length) notes.push('recent feedback on file: ' + recent.map(function (f) { return (f.polarity || '?') + ' ' + String(f.ts).slice(0, 10); }).join(' · '));
        return { values: { polarity: ctx.kind === 'corrective-heavy' ? 'positive' : ctx.kind === 'positive-heavy' ? 'corrective' : 'positive' }, notes: notes };
      },
      fields: [
        { k: 'polarity', label: 'Polarity', kind: 'select', options: ['positive', 'corrective'] },
        { k: 's', label: 'S — Situation', kind: 'text', help: '“In Tuesday’s design review…” — one instance, dated' },
        { k: 'b', label: 'B — Behavior', kind: 'text', help: 'Observable action only. If a camera could not see it, it is not behavior.' },
        { k: 'i', label: 'I — Impact', kind: 'text', help: 'The effect on the work or the team — not on your mood.' },
        { k: 'ask', label: 'Then ask', kind: 'text', value: 'How do you see it?', help: 'Feedback without a question is a verdict. Ask, then listen.' }
      ],
      submit: function (v, ctx) {
        if (!v.s && !v.b && !v.i) return { error: 'S/B/I all empty — without at least one field this is a note about your feelings, not feedback' };
        return { events: [['feedback.given', { personId: ctx.personId, polarity: v.polarity, sbi: { s: v.s || '', b: v.b || '', i: v.i || '', ask: v.ask || '' } }]] };
      } },

    { id: 'desc', title: 'DESC conflict script', mode: null,
      forWhat: 'R6 repeated conflict · one-off escalations',
      prefill: function (ctx, Pj) {
        var notes = ['DESC — Describe (facts only) · Express (the effect, owned with “I”) · Specify (the change you need) · Consequences (what happens either way). Written down before the talk, not improvised during it.'];
        var pair = null;
        for (var i = 0; i < Pj.openConflictPairs.length; i++) if (Pj.openConflictPairs[i].pairKey === ctx.pairKey) pair = Pj.openConflictPairs[i];
        if (pair) {
          var latest = pair.events[pair.events.length - 1];
          var an = latest.aId ? personName(Pj, latest.aId) : null, bn = latest.bId ? personName(Pj, latest.bId) : null;
          notes.push('pair: ' + (an || 'unlinked') + ' ↔ ' + (bn || 'unlinked') + ' · ' + pair.events.length + ' logged conflicts · latest ' + String(latest.ts).slice(0, 10));
          if (!an || !bn) notes.push('one or both parties are unlinked text — name real roster people in the Describe field, and link them on the next conflict.logged');
          return { values: { d: 'Between ' + (an || 'A') + ' and ' + (bn || 'B') + ': ' + (latest.text || '') }, notes: notes, pair: pair };
        }
        return { notes: notes };
      },
      fields: [
        { k: 'd', label: 'D — Describe', kind: 'textarea', help: 'Facts a neutral observer would agree on. No motives, no history.' },
        { k: 'e', label: 'E — Express', kind: 'text', help: '“I see deadlines slip and I carry the risk” — owned, not accused.' },
        { k: 's', label: 'S — Specify', kind: 'text', help: 'The ONE change you are asking for. If you list three, you get none.' },
        { k: 'c', label: 'C — Consequences', kind: 'text', help: 'Both directions: what improves if it changes, what you will do if it does not.' }
      ],
      submit: function (v, ctx, pre) {
        if (!v.d) return { error: 'Describe is empty — DESC without D is a speech, not a structure' };
        var ids = (pre && pre.pair) ? pre.pair.events.map(function (x) { return x.id; }) : [];
        return { events: [['conflict.followup', { conflictIds: ids, pairKey: ctx.pairKey || null, note: 'DESC held — D:' + (v.d || '') + ' | E:' + (v.e || '') + ' | S:' + (v.s || '') + ' | C:' + (v.c || '') }]] };
      } },

    { id: 'delegation', title: 'Delegation ladder', mode: null,
      forWhat: 'R5 overload · deliberate level-setting (L1 Tell → L5 Delegate)',
      prefill: function (ctx, Pj) {
        var notes = ['Pick the level on purpose, say it out loud to them, and set the check-in BEFORE handing over. Levels:'];
        Object.keys(DELEGATION_LEVELS).forEach(function (l) { notes.push(DELEGATION_LEVELS[l]); });
        var open = ctx.personId ? (Pj.delegationsOpenByPerson[ctx.personId] || []) : [];
        if (open.length) notes.push(personName(Pj, ctx.personId) + ' already holds ' + open.length + ' open — R5 fires past 4. Consider closing or re-scoping one first.');
        var sl = ctx.personId ? Pj.slByPerson[ctx.personId] : null;
        if (sl) notes.push('latest SL read ' + (sl.d || 'D?') + ' suggests ≤ ' + sl.s + ' behavior on this task: ' + SL.styleLine(sl.s));
        return { values: { level: 3, checkInDate: inDays(7) }, notes: notes };
      },
      fields: [
        { k: 'personId', label: 'Person', kind: 'person' },
        { k: 'task', label: 'Task — one sentence, outcome stated', kind: 'text' },
        { k: 'level', label: 'Level 1–5', kind: 'select', options: ['1', '2', '3', '4', '5'], help: 'Guidance per level is printed above; L4/L5 without evidence of D3/D4 is hope, not delegation.' },
        { k: 'checkInDate', label: 'First check-in date', kind: 'date', help: 'Defaults printed as assumptions: L1 daily · L2 ~3d · L3 7d · L4 14d · L5 at milestone.' }
      ],
      submit: function (v) {
        if (!v.personId) return { error: 'pick a person' };
        if (!v.task) return { error: 'a delegation without a task is a vibe' };
        return { events: [['delegation.assigned', { personId: v.personId, task: v.task, level: +v.level, checkInDate: v.checkInDate || null }]] };
      } },

    { id: 'situational', title: 'Situational read (D→S)', mode: null,
      forWhat: 'before delegating, after a miss, quarterly re-reads',
      prefill: function (ctx, Pj) {
        var notes = ['Development level is PER TASK, not per person. The same human is D4 on code review and D1 on client negotiation.'];
        var sl = ctx.personId ? Pj.slByPerson[ctx.personId] : null;
        if (sl) notes.push('latest read for ' + personName(Pj, ctx.personId) + ': ' + sl.d + ' → ' + sl.s + ' (' + String(sl.ts).slice(0, 10) + (sl.note ? ' — ' + sl.note : '') + ')' + (ctx.task ? ' — re-run the sliders for THIS task, do not copy the old grade' : ''));
        notes.push(SL.heuristic(null, null).why.replace('both sliders required — no guess', 'set both sliders below — the mapping prints itself'));
        return { values: { competence: 3, commitment: 3 }, notes: notes };
      },
      fields: [
        { k: 'personId', label: 'Person', kind: 'person' },
        { k: 'task', label: 'Task this read applies to', kind: 'text' },
        { k: 'competence', label: 'Competence on THIS task 1–5', kind: 'select', options: ['1', '2', '3', '4', '5'] },
        { k: 'commitment', label: 'Commitment/confidence on THIS task 1–5', kind: 'select', options: ['1', '2', '3', '4', '5'] }
      ],
      live: function (v) { /* rendered live under the form */
        var h = SL.heuristic(v.competence == null ? null : +v.competence, v.commitment == null ? null : +v.commitment);
        var s = h.d ? SL.styleFor(h.d) : null;
        return h.why + (s ? '\n→ ' + SL.styleLine(s) : '');
      },
      submit: function (v) {
        if (!v.personId) return { error: 'pick a person' };
        var h = SL.heuristic(+v.competence, +v.commitment);
        if (!h.d) return { error: h.why };
        return { events: [['sl.assessed', { personId: v.personId, competence: +v.competence, commitment: +v.commitment, d: h.d, s: SL.styleFor(h.d), note: v.task || '' }]] };
      } },

    { id: 'decision-review', title: 'Decision review', mode: null,
      forWhat: 'R2 past-due decisions · scheduled revisits',
      prefill: function (ctx, Pj) {
        var d = Pj.decisionById[ctx.decisionId], notes = [];
        if (d) notes.push('“' + d.title + '” — decided ' + String(d.ts).slice(0, 10) + ' · review was ' + (d.reviewDate ? String(d.reviewDate).slice(0, 10) : 'never set'));
        notes.push('A review is not a confession. State: what you expected → what happened → what you keep / change. The lesson travels; the blame does not.');
        return { notes: notes };
      },
      fields: [
        { k: 'result', label: 'Outcome — what actually happened', kind: 'textarea' },
        { k: 'lessons', label: 'Lessons — keep / change, one line each', kind: 'textarea' }
      ],
      submit: function (v, ctx) {
        if (!v.result) return { error: 'no outcome written — “discussed” is not an outcome' };
        return { events: [['decision.outcome', { decisionId: ctx.decisionId, result: v.result, lessons: v.lessons || '' }]] };
      } },

    { id: 'goal-review', title: 'Goal review', mode: null,
      forWhat: 'R3 ownerless or silent goals',
      prefill: function (ctx, Pj) {
        var g = Pj.goalById[ctx.goalId], notes = [];
        if (g) {
          notes.push('“' + g.title + '” — set ' + String(g.ts).slice(0, 10) + ' · owner: ' + (g.ownerId ? personName(Pj, g.ownerId) : 'NO OWNER — fix that first') + ' · ' + g.progressN + ' progress notes, last ' + (g.lastProgressTs ? String(g.lastProgressTs).slice(0, 10) : 'never'));
          if (g.ownerId == null) notes.push('An ownerless goal is a decision by omission. Either name an owner below or close it — both are leadership; leaving it is not.');
        }
        return { notes: notes };
      },
      fields: [
        { k: 'ownerId', label: 'Owner (only if unset or changing)', kind: 'person', allowEmpty: true },
        { k: 'note', label: 'Progress note — movement, blocker, or next step', kind: 'textarea', help: 'Empty owner + empty note = nothing to save.' },
        { k: 'close', label: 'Close this goal?', kind: 'select', options: ['keep open', 'close done', 'close dropped'], help: 'Closing a stale goal is a service to the living ones.' }
      ],
      submit: function (v, ctx) {
        var evs = [];
        if (v.ownerId) evs.push(['goal.updated', { goalId: ctx.goalId, ownerId: v.ownerId }]);
        if (v.note) evs.push(['goal.progress', { goalId: ctx.goalId, note: v.note }]);
        if (v.close === 'close done' || v.close === 'close dropped') evs.push(['goal.closed', { goalId: ctx.goalId, result: v.close === 'close done' ? 'done' : 'dropped' }]);
        if (!evs.length) return { error: 'nothing changed — set an owner, write a note, or close it' };
        return { events: evs };
      } },

    { id: 'growth-plan', title: 'Growth plan (SL-anchored)', mode: null, /* pt-3 */
      forWhat: 'turning a situational read into follow-through — the plan R10 then guards',
      prefill: function (ctx, Pj) {
        var notes = ['A growth plan is: one goal · one task to practice on · a development read (D) · the leading style you will actually use (S) · concrete actions · a review date you will keep. R10 watches the review date — a plan nobody reviews is a plan nobody runs.'];
        var values = {};
        if (ctx.personId) {
          var sl = Pj.slByPerson[ctx.personId];
          if (sl) {
            var s = SL.styleFor(sl.d);
            values.d = sl.d; values.reviewBy = inDays(SL.reviewDaysFor(s));
            notes.push('pre-filled D=' + sl.d + ' from latest sl.assessed (' + String(sl.ts).slice(0, 10) + (sl.note ? ' — ' + sl.note : '') + ') · S=' + s + ' mapped · review window ' + SL.reviewDaysFor(s) + 'd from style — all printed sources, change any of them');
          } else {
            values.reviewBy = inDays((Pj.settings && Pj.settings.coachingReviewDefaultDays) || 14);
            notes.push('no sl.assessed on file for ' + personName(Pj, ctx.personId) + ' — run the situational read first, or pick D here and know it is self-graded · review window defaulted from settings.coachingReviewDefaultDays (' + ((Pj.settings && Pj.settings.coachingReviewDefaultDays) || 14) + 'd)');
          }
        }
        values.actions = '';
        return { values: values, notes: notes };
      },
      fields: [
        { k: 'personId', label: 'Person', kind: 'person' },
        { k: 'goal', label: 'Growth goal — the capability, not the deliverable', kind: 'text', help: '“Leads client calls solo” beats “be more senior”.' },
        { k: 'task', label: 'Task to practice it on', kind: 'text' },
        { k: 'd', label: 'Development level on this task', kind: 'select', options: ['D1', 'D2', 'D3', 'D4'], help: 'Per task, not per person. The situational playbook computes this from sliders if you want the printed heuristic.' },
        { k: 'actions', label: 'Actions — one per line', kind: 'textarea', help: 'Concrete, dated-ish, few. Three actions you both remember beat ten you both forget.' },
        { k: 'reviewBy', label: 'Review date', kind: 'date', help: 'Defaults: S1 7d · S2 10d · S3 14d · S4 21d (printed assumptions); R10 fires the day after if no check-in.' }
      ],
      live: function (v) { var s = SL.styleFor(v.d); return s ? SL.styleLine(s) + '\n(That style is what gets saved on the plan; the review window default follows it.)' : 'pick a D level — the style mapping prints here'; },
      submit: function (v) {
        if (!v.personId) return { error: 'pick a person' };
        if (!v.goal) return { error: 'a plan without a goal is a calendar entry' };
        if (!v.d) return { error: 'pick a development level — style follows from it' };
        var s = SL.styleFor(v.d);
        return { events: [['plan.created', {
          personId: v.personId, goal: v.goal, task: v.task || '', d: v.d, s: s,
          actions: String(v.actions || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean),
          reviewBy: v.reviewBy || null
        }]] };
      } },

    { id: 'growth-review', title: 'Growth review', mode: null, /* pt-3 — resolves R10 with data */
      forWhat: 'R10 overdue reviews · the standing rhythm of coaching',
      prefill: function (ctx, Pj) {
        var pl = Pj.plansById[ctx.planId], notes = [], values = {};
        if (pl) {
          notes.push('“' + pl.goal + '” for ' + personName(Pj, pl.personId) + ' — created ' + String(pl.ts).slice(0, 10) + (pl.task ? ' · practicing on: ' + pl.task : '') + ' · ' + (pl.d || 'D?') + ' → ' + (pl.s || 'S?'));
          notes.push('spine so far: ' + pl.spine.map(function (x) { return (x.d || '?') + ' @' + String(x.ts).slice(0, 10); }).join(' → ') + ' · check-ins: ' + pl.checkins + ' · review was ' + (pl.reviewBy ? String(pl.reviewBy).slice(0, 10) : 'never set'));
          if (pl.actions.length) notes.push('agreed actions: ' + pl.actions.join(' · '));
          var sNow = SL.styleFor(pl.d);
          values.reviewBy = inDays(SL.reviewDaysFor(sNow));
          notes.push('review questions: what did they try? what worked — name ONE specifically? what is the next smallest stretch? is the D read still right? If they moved, SAY the move — “you handled that client pushback solo” lands harder than “good progress”.');
          notes.push('re-assess D below only if it genuinely changed on this task; the new value extends the plan’s spine and re-derives the style (printed).');
        } else notes.push('plan not found — stale link');
        return { values: values, notes: notes };
      },
      fields: [
        { k: 'note', label: 'Check-in note — evidence and next step', kind: 'textarea' },
        { k: 'progress', label: 'Progress 0–100 (your read)', kind: 'number', help: 'A number you can defend in one sentence, or leave blank.' },
        { k: 'd', label: 'Re-assessed D (optional — only if it moved)', kind: 'select', options: ['', 'D1', 'D2', 'D3', 'D4'] },
        { k: 'reviewBy', label: 'Next review date', kind: 'date', help: 'Re-arming R10. Default follows the current style: S1 7d · S2 10d · S3 14d · S4 21d.' },
        { k: 'close', label: 'Close the plan?', kind: 'select', options: ['keep open', 'achieved', 're-scoped', 'dropped'] }
      ],
      submit: function (v, ctx) {
        var evs = [];
        var hasCheckin = v.note || (v.progress !== '' && v.progress != null) || v.d;
        var closing = v.close && v.close !== 'keep open';
        if (hasCheckin) {
          var data = { planId: ctx.planId, note: v.note || '' };
          if (v.progress !== '' && v.progress != null) {
            var pr = +v.progress;
            if (isNaN(pr) || pr < 0 || pr > 100) return { error: 'progress must be 0–100' };
            data.progress = pr;
          }
          if (v.d) data.d = v.d;
          if (v.reviewBy) data.nextReviewBy = v.reviewBy; /* projection folds this onto the plan and re-arms R10 */
          evs.push(['plan.checkin', data]);
        }
        if (closing) {
          var cd = { planId: ctx.planId, result: v.close, note: v.note || '' };
          if (v.reviewBy) cd.nextReviewBy = v.reviewBy;
          evs.push(['plan.closed', cd]);
        }
        if (!evs.length) return { error: v.reviewBy ? 'a next review date rides on a check-in or a close — write the note for what you actually saw' : 'nothing to save — a review that changes nothing and says nothing is not a review' };
        return { events: evs };
      } }
  ];

  var byId = {};
  PLAYS.forEach(function (p) { byId[p.id] = p; });

  /* forFinding(fin, P) → ctx for the playbook, or null when a finding has no
     playbook (R9 fixes on the Roster; ENG is an engine fault — both print why). */
  function forFinding(f, Pj) {
    if (!f.play) return null;
    var src = f.sources && f.sources.length ? f.sources[0] : null;
    switch (f.rule) {
      case 'R1': return { playId: 'oneonone', ctx: { personId: f.key.slice(3), mode: 'direct' } };
      case 'R2': return src ? { playId: 'decision-review', ctx: { decisionId: src } } : null;
      case 'R3':
        if (!src) return null;
        var ev = null;
        for (var i = 0; i < LEADOS.store.state().events.length; i++) { var e = LEADOS.store.state().events[i]; if (e.id === src) { ev = e; break; } }
        var goalId = ev && ev.data ? (ev.data.goalId || null) : null;
        return goalId ? { playId: 'goal-review', ctx: { goalId: goalId } } : null;
      case 'R4':
        var pid = f.key.slice(3);
        var kind = /all corrective/.test(f.title) ? 'corrective-heavy' : 'positive-heavy';
        return { playId: 'sbi', ctx: { personId: pid, kind: kind } };
      case 'R5': return { playId: 'delegation', ctx: { personId: f.key.slice(3) } };
      case 'R6': return { playId: 'desc', ctx: { pairKey: f.key.slice(3) } };
      case 'R7': return { playId: 'oneonone', ctx: { personId: f.key.slice(3), mode: 'direct', burnout: true } };
      case 'R8': return { playId: 'oneonone', ctx: { personId: f.key.slice(3), mode: 'skip' } };
      case 'R10': return src ? { playId: 'growth-review', ctx: { planId: src } } : null;
    }
    return null;
  }

  /* run(playId, ctx, values): shared submit path — appends events in order,
     then playbook.completed. Returns first error, or {ok, n}. */
  function run(playId, ctx, values) {
    var pl = byId[playId];
    if (!pl) return { error: 'no playbook ' + playId };
    var pre = pl.prefill ? pl.prefill(ctx || {}, P()) : null;
    var r = pl.submit(values || {}, ctx || {}, pre);
    if (!r || r.error) return r || { error: 'empty submit' };
    var n = 0;
    for (var i = 0; i < r.events.length; i++) {
      var pair = r.events[i];
      if (!pair || !pair[0] || !pair[1]) continue;
      var ev = LEADOS.events.append(pair[0], pair[1], { silent: true });
      if (ev.error) return { error: ev.error };
      n++;
    }
    LEADOS.events.append('playbook.completed', { playId: playId, ctx: ctx || {} }, { silent: true });
    if (LEADOS.ui && typeof LEADOS.ui.refresh === 'function') LEADOS.ui.refresh();
    return { ok: true, n: n };
  }

  return { PLAYS: PLAYS, byId: byId, forFinding: forFinding, run: run, SL: SL, DELEGATION_LEVELS: DELEGATION_LEVELS };
})();
