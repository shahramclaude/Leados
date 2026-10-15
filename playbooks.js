/* LeadOS pt-2 · js/playbooks.js — the mentor layer.
   Structured practice, not prose: every playbook pre-fills from live projections
   and resolves by appending events — the engine sees the outcome on the next
   render, so loops actually close (SBI logged → R4 recounts; outcome logged →
   R2 clears; skip logged → R8 resets). forFinding() is the bridge: every rule
   maps to the playbook that resolves it, with prefill pulled from the finding's
   own key and the projection. NEW in pt-2: oneonone skip-level + load-cutting
   modes (for R8/R7). Situational mapping is a printed heuristic — you can argue
   with it; that is the point of printing it. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.playbooks = 'js/playbooks.js';

LEADOS.playbooks = (function () {
  'use strict';

  function P() { return LEADOS.events.project(LEADOS.store.state()); }
  function personName(Pj, pid) { var p = Pj.peopleById[pid]; return p ? p.name : '(unknown)'; }
  function fmtD(iso) { return iso ? String(iso).slice(0, 10) : '—'; }

  var DELEG_LEVELS = {
    1: { name: 'Tell',    say: '“Here is exactly what to do and how.”', you: 'decide alone, instruct, watch closely' },
    2: { name: 'Sell',    say: '“Here is what I decided and why — questions welcome, decision stands.”', you: 'decide, explain, check understanding' },
    3: { name: 'Consult', say: '“Give me your recommendation; I still decide.”', you: 'hear them fully, then own the call' },
    4: { name: 'Agree',   say: '“We decide this together; my vote counts like yours.”', you: 'share risk explicitly, no shadow veto' },
    5: { name: 'Delegate',say: '“You decide. Tell me what happened at the check-in.”', you: 'hand over the call, keep the check-in, never snatch it back mid-flight' }
  };

  var S_STYLES = {
    S1: ['define the steps yourself and demonstrate once', 'short leash: daily or per-task check-ins', 'praise precision and effort, not outcomes yet', 'resist explaining “why” at length — D1 needs direction first'],
    S2: ['decide, then explain the reasoning and invite pushback', 'check in often; competence is partial, motivation is slipping', 'rebuild confidence by naming real progress specifically', 'ask “what would you do?” before you tell — then still decide'],
    S3: ['stop instructing; ask, listen, remove obstacles', 'your job is confidence, not method — they can do the work', 'share your own mistakes to de-risk theirs', 'agree check-ins together; competence is high, commitment is the variable'],
    S4: ['hand over the decision, not just the task (pair with delegation L4–L5)', 'check-ins become their appointments with you, not yours with them', 'stretch them: the risk here is boredom, not failure', 'ask what you should stop doing around them']
  };
  function dFromCC(comp, comm) {
    if (comp <= 1 && comm >= 3) return { d: 'D1', s: 'S1' };
    if (comp <= 2 && comm <= 2) return { d: 'D2', s: 'S2' };
    if (comp <= 2) return { d: 'D2', s: 'S2' };
    if (comm <= 2) return { d: 'D3', s: 'S3' };
    return { d: 'D4', s: 'S4' };
  }

  var DEFS = {
    'oneonone': {
      name: '1:1 run sheet',
      when: 'a cadence finding fired (R1), a skip-level is due (R8), or load-cutting is the job (R7).',
      build: function (pre, Pj) {
        var mode = pre.mode || 'normal';
        var pid = pre.personId || '';
        var lines = [];
        if (pid && Pj.peopleById[pid]) {
          var last = (mode === 'skip' ? Pj.skiplevelLast : Pj.oneononeLast)[pid];
          lines.push((mode === 'skip' ? 'last skip-level: ' : 'last 1:1: ') + (last ? fmtD(last.ts) : 'never logged'));
          var l = Pj.delegationsOpenByPerson[pid];
          if (l && l.length) lines.push('open delegations: ' + l.length + ' — ask which ones are quietly stuck');
          var sl = Pj.slByPerson[pid];
          if (sl) lines.push('last SL assessment: ' + sl.d + '→' + sl.s + ' on ' + fmtD(sl.ts) + ' — still true?');
        }
        if (mode === 'skip') {
          var p = Pj.peopleById[pid];
          var lead = p && p.reportsTo ? Pj.peopleById[p.reportsTo] : null;
          lines.push('skip contract: you listen, you do not manage around ' + (lead ? lead.name : 'their lead'));
          lines.push('ask: what does ' + (lead ? lead.name : 'your lead') + ' do more of than you need? less of?');
          lines.push('ask: what should I know that this room would never tell me first?');
        }
        if (mode === 'loadcut') {
          var pu = (Pj.pulsesByPerson[pid] || []).filter(function (e) { return e.measured; }).slice(-3);
          if (pu.length) lines.push('measured pulses: ' + pu.map(function (e) { return fmtD(e.ts) + ' L' + e.load + '/M' + e.mood; }).join(' · '));
          lines.push('goal: leave with ≥2 load items cut, moved, or dated — named in the note below');
          lines.push('do not open with “how are you”; open with the load list');
        }
        lines.push('close: one commitment each, said out loud');
        return {
          title: mode === 'skip' ? 'Skip-level 1:1' : mode === 'loadcut' ? 'Load-cutting 1:1' : '1:1',
          fields: [
            { k: 'personId', label: 'person', type: 'person', required: true, value: pid },
            { k: 'note', label: 'what was said / committed', type: 'textarea', required: true, hint: 'this becomes the event note — write it for future-you' }
          ],
          preface: lines.join('\n'),
          save: function (v) {
            var type = mode === 'skip' ? 'skiplevel.logged' : 'oneonone.logged';
            return { appends: [[type, { personId: v.personId, note: v.note, mode: mode }]],
              flash: (mode === 'skip' ? 'Skip-level' : '1:1') + ' logged — the cadence clock restarts now' };
          }
        };
      }
    },

    'sbi': {
      name: 'SBI feedback',
      when: 'feedback imbalance fired (R4), or any moment that deserves better than a vibe.',
      build: function (pre, Pj) {
        return {
          title: 'SBI — Situation · Behavior · Impact',
          fields: [
            { k: 'personId', label: 'person', type: 'person', required: true, value: pre.personId || '' },
            { k: 'polarity', label: 'polarity', type: 'select', required: true, value: pre.polarity || '',
              options: [{ v: '', l: '— choose (required; R4 counts this)' }, { v: 'positive', l: 'positive / reinforcing' }, { v: 'corrective', l: 'corrective' }] },
            { k: 's', label: 'Situation — when and where, specifically', type: 'text', hint: '“in Tuesday’s planning” beats “lately”' },
            { k: 'b', label: 'Behavior — the observable act, no adjectives', type: 'textarea', required: true },
            { k: 'i', label: 'Impact — on the work, the team, you', type: 'textarea', required: true },
            { k: 'ask', label: 'Ask — the change or the continuation you want (positive feedback still names it)', type: 'text' }
          ],
          preview: function (v) {
            if (!v.b && !v.i) return '';
            return '“In ' + (v.s || '…') + ', when you ' + (v.b || '…') + ', the impact was ' + (v.i || '…') + '.' + (v.ask ? ' Going forward: ' + v.ask : '') + '”';
          },
          save: function (v) {
            return { appends: [['feedback.given', { personId: v.personId, polarity: v.polarity, sbi: { s: v.s, b: v.b, i: v.i, ask: v.ask } }]],
              flash: 'Feedback logged with polarity ' + v.polarity + ' — R4 recounts on the next render' };
          }
        };
      }
    },

    'desc': {
      name: 'DESC script',
      when: 'a repeated conflict needs a structured hard conversation (R6) — stronger medicine than SBI.',
      build: function (pre, Pj) {
        var other = pre.bId && Pj.peopleById[pre.bId] ? Pj.peopleById[pre.bId].name : '';
        return {
          title: 'DESC — Describe · Express · Specify · Consequences',
          fields: [
            { k: 'personId', label: 'person you will talk to', type: 'person', required: true, value: pre.personId || '' },
            { k: 'd', label: 'Describe — the behavior, no verdicts', type: 'textarea', required: true,
              hint: other ? 'about the ' + other + ' situation: what happened, when, how often' : 'what happened, when, how often' },
            { k: 'e', label: 'Express — what it does to the work and to you', type: 'textarea', required: true },
            { k: 's', label: 'Specify — the observable change you are asking for', type: 'textarea', required: true },
            { k: 'c', label: 'Consequences — state the positive stakes first', type: 'text', hint: '“then the roadmap stands” before “or I reassign it”' }
          ],
          preview: function (v) {
            if (!v.d && !v.s) return '';
            return 'Draft: “' + (v.d || '…') + ' That means ' + (v.e || '…') + '. What I need instead: ' + (v.s || '…') + '.”' + (v.c ? ' Stakes: ' + v.c : '');
          },
          save: function (v) {
            return { appends: [['feedback.given', { personId: v.personId, polarity: 'corrective', desc: { d: v.d, e: v.e, s: v.s, c: v.c } }],
              ['conflict.followup', { conflictIds: pre.conflictIds || [], pairKey: pre.pairKey || null, note: 'DESC conversation prepared with ' + personName(Pj, v.personId) }]],
              flash: 'DESC logged; the pair stays on R6 until you log conflict.resolved' };
          }
        };
      }
    },

    'delegation': {
      name: 'delegation ladder L1–L5',
      when: 'handing work over at a stated level (and R5 when someone already carries too much).',
      build: function (pre, Pj) {
        var lv = pre.level || null;
        if (lv == null && pre.personId) { /* SL-informed default: D4 people earn rope */
          var sl = Pj.slByPerson[pre.personId];
          if (sl && sl.s === 'S4') lv = 4;
        }
        return {
          title: 'Delegate at a stated level',
          fields: [
            { k: 'personId', label: 'person', type: 'person', required: true, value: pre.personId || '' },
            { k: 'task', label: 'task / decision being delegated', type: 'text', required: true },
            { k: 'level', label: 'level', type: 'select', required: true, value: lv != null ? String(lv) : '',
              options: [{ v: '', l: '— choose the level you will actually say out loud' }].concat([1, 2, 3, 4, 5].map(function (n) { return { v: String(n), l: 'L' + n + ' ' + DELEG_LEVELS[n].name; }); })) },
            { k: 'checkInDate', label: 'check-in date', type: 'date', hint: 'required in spirit: delegation without a check-in is abandonment' },
            { k: 'dueNote', label: 'constraints / definition of done', type: 'textarea' }
          ],
          live: function (v) {
            if (!v.level) return '';
            var L = DELEG_LEVELS[v.level];
            return 'L' + v.level + ' ' + L.name + '\nsay: ' + L.say + '\nyou: ' + L.you;
          },
          save: function (v) {
            return { appends: [['delegation.assigned', { personId: v.personId, task: v.task, level: parseInt(v.level, 10), checkInDate: v.checkInDate || null, note: v.dueNote }]],
              flash: 'Delegated at L' + v.level + ' — R5 recounts open load now' };
          }
        };
      }
    },

    'situational': {
      name: 'situational D→S assessment',
      when: 'style-match a person on THE CURRENT TASK — D/S is per-task, not per-personality.',
      build: function (pre, Pj) {
        var cur = pre.personId ? Pj.slByPerson[pre.personId] : null;
        return {
          title: 'Situational assessment (task-scoped)',
          preface: (cur ? 'latest assessment for them: ' + cur.d + '→' + cur.s + ' on ' + fmtD(cur.ts) + ' — changed? log a new one, trends live in the dossier\n' : 'no prior assessment on file\n') + 'mapping heuristic (printed so you can argue with it): low comp + high commit → D1/S1 · low-either → D2/S2 · high comp + low commit → D3/S3 · high both → D4/S4',
          fields: [
            { k: 'personId', label: 'person', type: 'person', required: true, value: pre.personId || '' },
            { k: 'task', label: 'task this assessment is about', type: 'text', required: true, hint: 'S4 on spreadsheets, D1 on incident reviews — same person' },
            { k: 'competence', label: 'competence on this task', type: 'select', required: true, value: '',
              options: [{ v: '', l: '— choose' }, { v: '1', l: '1 — none yet' }, { v: '2', l: '2 — some' }, { v: '3', l: '3 — solid' }, { v: '4', l: '4 — expert' }] },
            { k: 'commitment', label: 'commitment / confidence on this task', type: 'select', required: true, value: '',
              options: [{ v: '', l: '— choose' }, { v: '1', l: '1 — none' }, { v: '2', l: '2 — shaky' }, { v: '3', l: '3 — steady' }, { v: '4', l: '4 — fired up' }] }
          ],
          live: function (v) {
            if (!v.competence || !v.commitment) return '';
            var r = dFromCC(parseInt(v.competence, 10), parseInt(v.commitment, 10));
            var warn = (cur && cur.s !== r.s && v.personId === curPid(pre)) ? '\n⚠ differs from their last assessment (' + cur.d + '→' + cur.s + '). Fine if the task or trend changed — say so in the note.' : '';
            return r.d + ' → lead with ' + r.s + ':\n' + S_STYLES[r.s].map(function (b) { return '· ' + b; }).join('\n') + warn;
          },
          save: function (v) {
            var r = dFromCC(parseInt(v.competence, 10), parseInt(v.commitment, 10));
            return { appends: [['sl.assessed', { personId: v.personId, task: v.task, competence: parseInt(v.competence, 10), commitment: parseInt(v.commitment, 10), d: r.d, s: r.s, note: v.note || '' }]],
              flash: r.d + '→' + r.s + ' logged; the delegation ladder will pre-read this' };
          }
        };
      }
    },

    'decision-review': {
      name: 'decision review',
      when: 'a decision passed its review date with no outcome (R2).',
      build: function (pre, Pj) {
        var optsOpen = Pj.openDecisions.map(function (d) { return { v: d.id, l: d.title + ' (review ' + fmtD(d.reviewDate) + ')' }; });
        return {
          title: 'Review a decision',
          fields: [
            { k: 'decisionId', label: 'open decision', type: 'select', required: true, value: pre.decisionId || '',
              options: [{ v: '', l: optsOpen.length ? '— choose (required)' : '— no open decisions' }].concat(optsOpen) },
            { k: 'result', label: 'verdict', type: 'select', required: true, value: '',
              options: [{ v: '', l: '— choose what actually happened' }, { v: 'kept', l: 'kept — it worked, say why' }, { v: 'amended', l: 'amended — direction held, shape changed' }, { v: 'reversed', l: 'reversed — wrong, and that is data too' }] },
            { k: 'lessons', label: 'what the review taught (this is the part future-you reads)', type: 'textarea', required: true }
          ],
          save: function (v) {
            return { appends: [['decision.outcome', { decisionId: v.decisionId, result: v.result, lessons: v.lessons }]],
              flash: 'Outcome logged — R2 clears only when the outcome event links the decision id' };
          }
        };
      }
    },

    'goal-review': {
      name: 'goal review',
      when: 'a goal is unowned or silent (R3) — give it an owner, a pulse, or a funeral.',
      build: function (pre, Pj) {
        var optsGoals = Pj.openGoals.map(function (g) { return { v: g.id, l: g.title + (g.ownerId ? ' · ' + personName(Pj, g.ownerId) : ' · NO OWNER') }; });
        var g = pre.goalId ? Pj.goalById[pre.goalId] : null;
        return {
          title: 'Review a goal',
          preface: g ? '“' + g.title + '” · set ' + fmtD(g.ts) + ' · owner ' + (g.ownerId ? personName(Pj, g.ownerId) : 'NOBODY') + ' · ' + g.progressN + ' progress logs (last ' + (g.lastProgressTs ? fmtD(g.lastProgressTs) : 'never') + ')\nthree honest options below exist because “do nothing” is how R3 found you' : '',
          fields: [
            { k: 'goalId', label: 'open goal', type: 'select', required: true, value: pre.goalId || '',
              options: [{ v: '', l: optsGoals.length ? '— choose (required)' : '— no open goals' }].concat(optsGoals) },
            { k: 'mode', label: 'move', type: 'select', required: true, value: '',
              options: [{ v: '', l: '— choose' }, { v: 'progress', l: 'log real progress' }, { v: 'assign', l: 'assign / change owner' }, { v: 'close', l: 'close it (kill it on purpose)' }] },
            { k: 'ownerId', label: 'owner (only for assign)', type: 'person', value: '' },
            { k: 'note', label: 'note (progress content, or why it closes)', type: 'textarea', required: true }
          ],
          save: function (v) {
            if (v.mode === 'assign') return { appends: [['goal.updated', { goalId: v.goalId, ownerId: v.ownerId || null }], ['note.added', { note: 'goal ' + v.goalId + ' reassigned: ' + v.note }]], flash: 'Owner set — an explicit null was the R3 trigger; this clears it' };
            if (v.mode === 'close') return { appends: [['goal.closed', { goalId: v.goalId, result: v.note }]], flash: 'Goal closed on purpose — R3 respects funerals' };
            return { appends: [['goal.progress', { goalId: v.goalId, note: v.note }]], flash: 'Progress logged — the 14d silence clock restarts' };
          }
        };
      }
    }
  };

  function curPid(pre) { return pre.personId || ''; }

  /* forFinding: rule → playbook + prefill, computed from the finding + projection */
  function forFinding(f, Pj) {
    var ent = f.key.split(':');
    var id = ent.slice(1).join(':');
    switch (f.rule) {
      case 'R1': return { id: 'oneonone', prefill: { personId: id, mode: 'normal' } };
      case 'R2': return { id: 'decision-review', prefill: { decisionId: id } };
      case 'R3': return { id: 'goal-review', prefill: { goalId: id } };
      case 'R4': {
        var win = (Pj.feedbackByPerson[id] || []).map(function (e) { return e.polarity; });
        var pos = win.filter(function (x) { return x === 'positive'; }).length;
        var missing = (pos / Math.max(1, win.length)) >= 0.8 ? 'corrective' : 'positive';
        return { id: 'sbi', prefill: { personId: id, polarity: missing } };
      }
      case 'R5': return { id: 'delegation', prefill: { personId: id } };
      case 'R6': {
        var c = Pj.openConflicts.filter(function (x) { return x.pairKey === id; })[0] || {};
        return { id: 'desc', prefill: { personId: c.aId || '', bId: c.bId || '', pairKey: id, conflictIds: [c.id].filter(Boolean) } };
      }
      case 'R7': return { id: 'oneonone', prefill: { personId: id, mode: 'loadcut' } };
      case 'R8': return { id: 'oneonone', prefill: { personId: id, mode: 'skip' } };
      case 'R9': return null; /* the fix is the roster line editor, not a conversation */
      default: return null;
    }
  }

  function open(id, prefill) {
    var def = DEFS[id];
    if (!def) { if (LEADOS.ui && LEADOS.ui.flash) LEADOS.ui.flash('no such playbook: ' + id, true); return; }
    var built = def.build(prefill || {}, P());
    LEADOS.ui.formModal({
      title: built.title,
      sub: 'playbook · ' + id + ' · resolves by appending events',
      preface: built.preface || '',
      fields: built.fields,
      preview: built.preview || null,
      live: built.live || null,
      saveLabel: 'Log it',
      onSave: function (v) {
        var r = built.save(v);
        r.appends.forEach(function (a) { LEADOS.events.append(a[0], a[1], { silent: true }); });
        LEADOS.events.append('playbook.completed', { playId: id }, { silent: true });
        LEADOS.store.save();
        if (LEADOS.ui) { LEADOS.ui.flash(r.flash || 'logged'); LEADOS.ui.refresh(); }
      }
    });
  }

  return {
    list: Object.keys(DEFS).map(function (id) { return { id: id, name: DEFS[id].name, when: DEFS[id].when }; }),
    open: open, forFinding: forFinding, LEVELS: DELEG_LEVELS, STYLES: S_STYLES
  };
})();
