/* LeadOS mf-3 · js/ui.js — views, drawer, router, health wall.
   Doctrine: ui renders projections and engine output; it never keeps derived
   state between renders. Every mutation path (capture bar, playbooks, forms)
   ends in events + store.save() + full re-render — so Today, dossiers, and the
   engine can never disagree. The health wall (T1–T12, G1–G16) executes at
   render against the SAME code paths production uses; test keys are cleaned. */
window.LEADOS = window.LEADOS || {};
LEADOS.ui = (function () {
  'use strict';
  function S() { return LEADOS.store; }
  function EV() { return LEADOS.events; }
  function EN() { return LEADOS.engine; }
  function PB() { return LEADOS.playbooks; }

  /* ---------- icons: custom inline SVG, stroke 1.6 ---------- */
  var ICONS = {
    today: '<path d="M5 4v16"/><path d="M5 5h11l-2.5 3.5L16 12H5"/>',
    arrival: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-2 5-4 1 2-5z"/>',
    roster: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.2.3 3.8 1.9 4.3 4.3"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5"/><path d="M8 7.5h8"/>',
    health: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
    data: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5V18.5c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8V5.5"/><path d="M4.5 12c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8"/>',
    cal: '<rect x="4" y="5.5" width="16" height="15" rx="1"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>',
    chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.4c-.3.3-.8 0-.8-.4z"/>',
    alert: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 9.5V14M12 17.2v.3"/>',
    hand: '<path d="M7 11.5V6.8a1.4 1.4 0 0 1 2.8 0v4.2"/><path d="M9.8 11V4.9a1.4 1.4 0 0 1 2.8 0V11"/><path d="M12.6 11V6a1.4 1.4 0 0 1 2.8 0v6.6"/><path d="M7 11.5c-1.5 1.2-1.9 3-.9 4.7l2.3 3.6c.7 1.2 2 2.2 4 2.2 2.8 0 5-1.7 5-4.7v-4.8"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx=".8"/><rect x="13" y="4" width="7" height="7" rx=".8"/><rect x="4" y="13" width="7" height="7" rx=".8"/><rect x="13" y="13" width="7" height="7" rx=".8"/>',
    diamond: '<path d="M7 3.5h10l4 5-9 12L3 8.5z"/><path d="M3 8.5h18M12 20.5 8.5 8.5M12 20.5 15.5 8.5M7 3.5l1.5 5M17 3.5l-1.5 5"/>',
    goal: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.2"/>',
    shield: '<path d="M12 3.2 19.5 6v5.3c0 4.6-3.2 8-7.5 9.7-4.3-1.7-7.5-5.1-7.5-9.7V6z"/><path d="M8.5 11.8l2.4 2.4 4.5-4.6"/>',
    tour: '<path d="M9 4 4 5.6v14L9 17.8l6 1.8 5-1.6v-14L15 5.8z"/><path d="M9 4v13.8M15 5.8v13.8"/>',
    flag: '<path d="M6 3.5V21"/><path d="M6 4.5h10.5l-2.3 3.4 2.3 3.6H6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2.5"/>',
    belloff: '<path d="M8.2 5.4A5.7 5.7 0 0 1 18 11v3.3l1.7 2.2"/><path d="M6.2 9.7c-.1.4-.2.9-.2 1.3v3.3L3 18.5h12.5"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/><path d="M4 4l16 16"/>',
    bell: '<path d="M6.2 9.5a5.8 5.8 0 0 1 11.6 0V13l2 3H4.2l2-3z"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/>',
    dl: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11"/><path d="M4.5 19.5h15"/>',
    eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    pulse: '<path d="M3 12.5h4l2.5-6.5 4 12 2.5-6.5h5"/>'
  };
  function ic(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.today) + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function st() { return S().get(); }
  function today() { return S().todayISO(); }
  function personById(pid) {
    return (st().people || []).filter(function (p) { return p && p.id === pid; })[0] || null;
  }
  function nameOf(pid) { var p = personById(pid); return p ? p.name : 'unknown person'; }

  /* ---------- flash + write-failure pill ---------- */
  var FLASH = null;
  function setFlash(msg, isErr) { FLASH = { msg: msg, err: !!isErr }; }
  function pill() {
    var bad = st() && st().meta && st().meta.writeFailed;
    var el = document.getElementById('pill');
    if (el) el.style.display = bad ? 'block' : 'none';
  }
  function saveAndNote(okMsg) {
    var r = S().save(); pill();
    if (!r.ok && r.quota) setFlash('WRITE FAILED: storage quota. In-memory state intact — export your data at #/data NOW.', true);
    else if (okMsg) setFlash(okMsg);
  }

  /* ---------- shared event-writing ---------- */
  function emitSpecs(specs) {
    var lastConflictId = null, out = [];
    (specs || []).forEach(function (sp) {
      var data = {};
      Object.keys(sp.data || {}).forEach(function (k) {
        var v = sp.data[k];
        if (v === 'SELF') v = lastConflictId;          /* desc: resolve a conflict made in the same submit */
        if (v !== undefined) data[k] = v;
      });
      var ev = EV().emit(st(), sp.type, { personId: sp.personId || null, data: data, ts: sp.ts });
      if (sp.type === 'conflict.registered') lastConflictId = ev.id;
      out.push(ev);
    });
    return out;
  }
  function dateTs(dateStr) { /* user-picked day at noon local — stable day arithmetic */
    return dateStr ? dateStr + 'T12:00:00' : undefined;
  }

  /* ---------- generic drawer form ---------- */
  function fieldHTML(f) {
    var req = f.required ? ' <span class="req">*</span>' : '';
    var val = f.value == null ? '' : f.value;
    var inner = '';
    if (f.kind === 'check') {
      return '<label class="f check"><input type="checkbox" name="' + esc(f.key) + '"' + (val ? ' checked' : '') + '>' +
        '<span class="fl">' + esc(f.label) + '</span></label>';
    }
    if (f.kind === 'select' || f.kind === 'person') {
      var opts = f.options || personOpts();
      inner = '<select name="' + esc(f.key) + '">' + opts.map(function (o) {
        return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(val) ? ' selected' : '') + '>' + esc(o.l) + '</option>';
      }).join('') + '</select>';
    } else if (f.kind === 'area') {
      inner = '<textarea name="' + esc(f.key) + '">' + esc(val) + '</textarea>';
    } else if (f.kind === 'num') {
      inner = '<input type="number" step="any" name="' + esc(f.key) + '" value="' + esc(val) + '">';
    } else if (f.kind === 'date') {
      inner = '<input type="date" name="' + esc(f.key) + '" value="' + esc(val) + '">';
    } else {
      inner = '<input type="text" name="' + esc(f.key) + '" value="' + esc(val) + '">';
    }
    return '<label class="f"><span class="fl">' + esc(f.label) + req + '</span>' + inner +
      (f.hint ? '<span class="fh">' + esc(f.hint) + '</span>' : '') + '</label>';
  }
  function personOpts(includeSelf, placeholder) {
    var out = [{ v: '', l: placeholder || '— choose —' }];
    if (includeSelf) out.push({ v: 'me', l: 'me (my own)' });
    (st().people || []).forEach(function (p) {
      if (p && !p.archived) out.push({ v: p.id, l: p.name + (p.role ? ' · ' + p.role : '') });
    });
    return out;
  }
  function collectForm(fields, rootEl) {
    var v = {};
    fields.forEach(function (f) {
      var inp = rootEl.querySelector('[name="' + f.key + '"]');
      if (!inp) return;
      v[f.key] = f.kind === 'check' ? inp.checked : inp.value;
    });
    return v;
  }
  function validate(fields, v) {
    var errs = [];
    fields.forEach(function (f) {
      if (!f.required) return;
      if (f.kind === 'check') return;
      if (v[f.key] == null || String(v[f.key]).trim() === '') errs.push(f.label);
    });
    return errs;
  }

  var drawer = { open: false };
  function drawerShow(html) {
    document.getElementById('drawer').innerHTML = html;
    document.getElementById('drawer').classList.add('on');
    document.getElementById('scrim').classList.add('on');
    drawer.open = true;
  }
  function drawerClose() {
    document.getElementById('drawer').classList.remove('on');
    document.getElementById('scrim').classList.remove('on');
    drawer.open = false;
  }
  function dhead(title, sub) {
    return '<div class="dhead"><div><h2>' + esc(title) + '</h2>' + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') +
      '</div><button class="xbtn" data-x="1" aria-label="Close">' + ic('x') + '</button></div>';
  }
  function guideHTML(blocks) {
    return '<div class="guide">' + (blocks || []).map(function (b) {
      return '<span class="gh">' + esc(b.h) + '</span>' +
        (b.lines || []).map(function (l) { return '<p class="gl">' + esc(l) + '</p>'; }).join('') +
        (b.warn ? '<div class="gw">' + esc(b.warn) + '</div>' : '');
    }).join('') + '</div>';
  }

  /* ---------- playbooks ---------- */
  function pbCtx(prefill) {
    var pid = prefill && prefill.personId;
    return { state: st(), today: today(), person: pid ? personById(pid) : null,
      prefill: prefill || {}, nameOf: nameOf };
  }
  function openPlaybook(id, prefill, values) {
    var pb = PB().PBS[id];
    if (!pb) return;
    prefill = prefill || {};
    var ctx = pbCtx(prefill);
    var fields = pb.fields(ctx, Object.assign({}, prefill, values || {}));
    var html = dhead(pb.title, 'playbook · writes resolving events') +
      guideHTML(pb.guide(ctx, prefill)) +
      '<form id="dform" novalidate>' + fields.map(fieldHTML).join('') +
      '<div class="errtxt" id="derr"></div>' +
      '<div class="actions"><button type="submit" class="btn">' + ic('arrow') + 'Record through event layer</button></div>' +
      '<p class="muted-note" style="margin-top:10px">Submitting writes events to the shared store — Today, dossiers and the engine all recompute from them. Nothing here is a side-channel.</p></form>';
    drawerShow(html);
    document.getElementById('dform').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = collectForm(fields, this);
      var errs = validate(fields, v);
      if (errs.length) { document.getElementById('derr').textContent = 'required: ' + errs.join(', '); return; }
      var res = pb.submit(v, ctx);
      if (res && res.error) { document.getElementById('derr').textContent = res.error; return; }
      emitSpecs(res.events);
      drawerClose();
      saveAndNote(res.flash || 'Recorded.');
      render();
    });
  }

  /* ---------- quick capture (the shared event layer's front door) ---------- */
  var CAPTURES = {
    'oneonone.logged': { title: 'Log a 1:1', icon: 'cal',
      fields: function () { return [
        { key: 'personId', label: 'Person', kind: 'person', required: 1 },
        { key: 'date', label: 'Date', kind: 'date', required: 1, value: today() },
        { key: 'mood', label: 'Mood 1–10 (only if they said it)', kind: 'num', value: '' },
        { key: 'load', label: 'Load 1–10 (only if they said it)', kind: 'num', value: '' },
        { key: 'estimated', label: 'These numbers are MY estimate, not their words', kind: 'check', value: false,
          hint: 'estimated pulses are excluded from overload trends by doctrine' },
        { key: 'note', label: 'Note', kind: 'area', value: '' } ]; },
      build: function (v) {
        var evs = [{ type: 'oneonone.logged', personId: v.personId, ts: dateTs(v.date),
          data: { note: v.note || undefined } }];
        var m = Number(v.mood), l = Number(v.load);
        if (v.mood !== '' && v.load !== '' && isFinite(m) && isFinite(l))
          evs.push({ type: 'pulse.logged', personId: v.personId, ts: dateTs(v.date),
            data: { mood: m, load: l, estimated: !!v.estimated } });
        return { events: evs, flash: '1:1 logged' + (evs.length > 1 ? ' with pulse (' + (v.estimated ? 'estimated — excluded from R7' : 'measured') + ')' : '') + '.' };
      } },
    'pulse.logged': { title: 'Log a pulse reading', icon: 'pulse',
      fields: function () { return [
        { key: 'personId', label: 'Person', kind: 'person', required: 1 },
        { key: 'date', label: 'Date', kind: 'date', required: 1, value: today() },
        { key: 'mood', label: 'Mood 1–10', kind: 'num', required: 1, value: '' },
        { key: 'load', label: 'Load 1–10', kind: 'num', required: 1, value: '' },
        { key: 'estimated', label: 'Estimated by me, not spoken', kind: 'check', value: false } ]; },
      build: function (v) { return { events: [{ type: 'pulse.logged', personId: v.personId, ts: dateTs(v.date),
        data: { mood: Number(v.mood), load: Number(v.load), estimated: !!v.estimated } }],
        flash: v.estimated ? 'Pulse logged as ESTIMATED — R7 will ignore it by design.' : 'Measured pulse logged.' }; } },
    'feedback.logged': { title: 'Log feedback', icon: 'chat',
      fields: function () { return [
        { key: 'personId', label: 'Person', kind: 'person', required: 1 },
        { key: 'polarity', label: 'Polarity', kind: 'select', required: 1, value: 'positive',
          options: [{ v: 'positive', l: 'positive' }, { v: 'corrective', l: 'corrective' }] },
        { key: 'sbi', label: 'What was said (SBI)', kind: 'area', required: 1, value: '' },
        { key: 'date', label: 'Date', kind: 'date', required: 1, value: today() } ]; },
      build: function (v) { return { events: [{ type: 'feedback.logged', personId: v.personId, ts: dateTs(v.date),
        data: { polarity: v.polarity, sbi: v.sbi } }], flash: 'Feedback logged into the 60d balance.' }; } },
    'decision.logged': { title: 'Log a decision', icon: 'diamond',
      fields: function () { return [
        { key: 'title', label: 'The decision', kind: 'text', required: 1, value: '' },
        { key: 'context', label: 'What was knowable at the time', kind: 'area', value: '' },
        { key: 'reviewDate', label: 'Review date (R2 holds you to it)', kind: 'date', required: 1, value: today() } ]; },
      build: function (v) { return { events: [{ type: 'decision.logged',
        data: { title: v.title, context: v.context || undefined, reviewDate: v.reviewDate } }],
        flash: 'Decision logged with a review date.' }; } },
    'decision.outcome': { title: 'Record a decision outcome', icon: 'diamond',
      fields: function () { return [
        { key: 'existing', label: 'Decision', kind: 'select', required: 1, value: '',
          options: [{ v: '', l: '— choose open decision —' }].concat(EV().openDecisions(st()).map(function (d) { return { v: d.id, l: d.label }; })) },
        { key: 'outcome', label: 'Verdict', kind: 'select', required: 1, value: 'mixed',
          options: [{ v: 'right', l: 'right call' }, { v: 'wrong', l: 'wrong call' }, { v: 'mixed', l: 'mixed' }] },
        { key: 'lesson', label: 'The one-sentence lesson', kind: 'area', value: '' } ]; },
      build: function (v) { return { events: [{ type: 'decision.outcome',
        data: { decisionId: v.existing, outcome: v.outcome, lesson: v.lesson || undefined } }],
        flash: 'Outcome recorded — calibration bank grows.' }; } },
    'goal.set': { title: 'Set a goal', icon: 'goal',
      fields: function () { return [
        { key: 'title', label: 'Goal', kind: 'text', required: 1, value: '' },
        { key: 'ownerPersonId', label: 'Owner (one name)', kind: 'select', value: '', options: personOpts(true, '— NO OWNER (R3 will nag) —') },
        { key: 'reviewBy', label: 'Review by', kind: 'date', value: '' } ]; },
      build: function (v) { return { events: [{ type: 'goal.set',
        data: { title: v.title, ownerPersonId: v.ownerPersonId || undefined, reviewBy: v.reviewBy || undefined } }],
        flash: v.ownerPersonId ? 'Goal set with owner.' : 'Goal set WITHOUT owner — R3 will hold you to it.' }; } },
    'goal.progress': { title: 'Log goal progress', icon: 'goal',
      fields: function () { return [
        { key: 'existing', label: 'Goal', kind: 'select', required: 1, value: '',
          options: [{ v: '', l: '— choose —' }].concat(EV().openGoals(st()).map(function (g) { return { v: g.id, l: g.label }; })) },
        { key: 'note', label: 'A dated fact', kind: 'area', required: 1, value: '' } ]; },
      build: function (v) { return { events: [{ type: 'goal.progress', data: { goalId: v.existing, note: v.note } }],
        flash: 'Progress logged — stall clock reset.' }; } },
    'delegation.assigned': { title: 'Assign a delegation', icon: 'hand',
      fields: function () { return [
        { key: 'personId', label: 'Person', kind: 'person', required: 1 },
        { key: 'title', label: 'What', kind: 'text', required: 1, value: '' },
        { key: 'level', label: 'Level on the ladder', kind: 'select', required: 1, value: '3',
          options: PB().LEVELS.map(function (l, i) { return { v: String(i + 1), l: l }; }) } ]; },
      build: function (v) { return { events: [{ type: 'delegation.assigned', personId: v.personId,
        data: { title: v.title, level: Number(v.level) } }], flash: 'Assigned at level ' + v.level + '.' }; } },
    'delegation.closed': { title: 'Close a delegation', icon: 'hand',
      fields: function () { return [
        { key: 'existing', label: 'Open delegation', kind: 'select', required: 1, value: '',
          options: [{ v: '', l: '— choose —' }].concat(EV().openDelegations(st()).map(function (d) {
            return { v: d.id, l: (d.personId ? nameOf(d.personId) + ': ' : '') + d.label }; })) },
        { key: 'result', label: 'Outcome note', kind: 'area', value: '' } ]; },
      build: function (v) { return { events: [{ type: 'delegation.closed',
        data: { delegationId: v.existing, result: v.result || undefined } }], flash: 'Delegation closed.' }; } },
    'conflict.registered': { title: 'Register a conflict', icon: 'alert',
      fields: function () { return [
        { key: 'personId', label: 'Person on your roster', kind: 'person', required: 1 },
        { key: 'counterpart', label: 'Counterpart', kind: 'text', value: '', hint: 'record it — pair-level patterns need this' },
        { key: 'note', label: 'What it is about', kind: 'area', required: 1, value: '' } ]; },
      build: function (v) { return { events: [{ type: 'conflict.registered', personId: v.personId,
        data: { counterpart: v.counterpart || undefined, note: v.note } }], flash: 'Conflict registered unresolved.' }; } },
    'conflict.resolved': { title: 'Resolve a conflict', icon: 'alert',
      fields: function () { return [
        { key: 'existing', label: 'Open conflict', kind: 'select', required: 1, value: '',
          options: [{ v: '', l: '— choose —' }].concat(EV().openConflicts(st()).map(function (c) { return { v: c.id, l: c.label }; })) },
        { key: 'how', label: 'The actual agreement', kind: 'area', required: 1, value: '', hint: 'vague peace counts as unresolved — write the agreement' } ]; },
      build: function (v) { return { events: [{ type: 'conflict.resolved', data: { conflictId: v.existing, how: v.how } }],
        flash: 'Resolved with an agreement on record.' }; } },
    'incident.registered': { title: 'Register an incident', icon: 'alert',
      fields: function () { return [
        { key: 'title', label: 'What happened', kind: 'text', required: 1, value: '' },
        { key: 'severity', label: 'Severity', kind: 'select', required: 1, value: 'medium',
          options: [{ v: 'high', l: 'high' }, { v: 'medium', l: 'medium' }, { v: 'low', l: 'low' }] },
        { key: 'personId', label: 'Person involved (optional)', kind: 'person', value: '' } ]; },
      build: function (v) { return { events: [{ type: 'incident.registered', personId: v.personId || null,
        data: { title: v.title, severity: v.severity } }], flash: 'Incident registered — R12 watches for silence.' }; } },
    'incident.update': { title: 'Update an incident', icon: 'alert',
      fields: function (prefill) { return [
        { key: 'existing', label: 'Open incident', kind: 'select', required: 1,
          value: (prefill && prefill.incidentId) || '',
          options: [{ v: '', l: '— choose —' }].concat(EV().openIncidents(st()).map(function (x) { return { v: x.id, l: x.label }; })) },
        { key: 'note', label: 'What changed', kind: 'area', required: 1, value: '' } ]; },
      build: function (v) { return { events: [{ type: 'incident.update', data: { incidentId: v.existing, note: v.note } }],
        flash: 'Incident touched — staleness clock reset.' }; } },
    'incident.resolved': { title: 'Resolve an incident', icon: 'alert',
      fields: function () { return [
        { key: 'existing', label: 'Open incident', kind: 'select', required: 1, value: '',
          options: [{ v: '', l: '— choose —' }].concat(EV().openIncidents(st()).map(function (x) { return { v: x.id, l: x.label }; })) },
        { key: 'how', label: 'Resolution', kind: 'area', required: 1, value: '' } ]; },
      build: function (v) { return { events: [{ type: 'incident.resolved', data: { incidentId: v.existing, how: v.how } }],
        flash: 'Incident resolved.' }; } },
    'tour.visit': { title: 'Log a listening-tour visit', icon: 'tour',
      fields: function () { return [
        { key: 'mode', label: 'Who', kind: 'select', required: 1, value: 'lead',
          options: [{ v: 'lead', l: 'a direct lead' }, { v: 'skiplevel', l: 'a skip-level' }, { v: 'peer', l: 'a peer / partner' }] },
        { key: 'personId', label: 'Person on roster (required for leads)', kind: 'person', value: '' },
        { key: 'counterpart', label: 'Name (if not on roster)', kind: 'text', value: '' },
        { key: 'themes', label: 'Themes in their words', kind: 'area', required: 1, value: '' } ]; },
      build: function (v) {
        if (v.mode === 'lead' && !v.personId) return { error: 'a lead visit needs a roster person — coverage counts them' };
        return { events: [{ type: 'tour.visit', personId: v.personId || null,
          data: { mode: v.mode, counterpart: v.counterpart || undefined, themes: v.themes } }],
          flash: 'Visit logged — tour coverage recomputed.' };
      } },
    'expectation.logged': { title: 'Capture an expectation', icon: 'shield',
      fields: function () { return [
        { key: 'source', label: 'Source', kind: 'select', required: 1, value: 'boss',
          options: [{ v: 'boss', l: 'my boss' }, { v: 'self', l: 'my own commitment' }] },
        { key: 'items', label: 'Expectations — one per line', kind: 'area', required: 1, value: '' } ]; },
      build: function (v) {
        var items = v.items.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!items.length) return { error: 'at least one expectation line' };
        return { events: [{ type: 'expectation.logged', data: { source: v.source, items: items } }],
          flash: items.length + ' expectation(s) captured.' };
      } },
    'earlywin.committed': { title: 'Commit an early win', icon: 'flag',
      fields: function () { return [
        { key: 'title', label: 'The win', kind: 'text', required: 1, value: '' },
        { key: 'metric', label: 'The metric a skeptic would accept', kind: 'text', required: 1, value: '' },
        { key: 'verifyDate', label: 'Verify by', kind: 'date', required: 1, value: today() },
        { key: 'announcedTo', label: 'Announced to (optional)', kind: 'text', value: '' } ]; },
      build: function (v) { return { events: [{ type: 'earlywin.committed',
        data: { title: v.title, metric: v.metric, verifyDate: v.verifyDate, announcedTo: v.announcedTo || undefined } }],
        flash: 'Committed. R11 will hold the verify date.' }; } }
  };
  function openCapture(id, prefill, values) {
    var cap = CAPTURES[id];
    if (!cap) return;
    var fields = cap.fields(prefill || {});
    if (values) fields.forEach(function (f) { if (values[f.key] !== undefined) f.value = values[f.key]; });
    var html = dhead(cap.title, 'quick capture → shared event layer') +
      '<form id="dform" novalidate>' + fields.map(fieldHTML).join('') +
      '<div class="errtxt" id="derr"></div>' +
      '<div class="actions"><button type="submit" class="btn">' + ic('arrow') + 'Write event</button></div></form>';
    drawerShow(html);
    document.getElementById('dform').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = collectForm(fields, this);
      var errs = validate(fields, v);
      if (errs.length) { document.getElementById('derr').textContent = 'required: ' + errs.join(', '); return; }
      var res = cap.build(v);
      if (res && res.error) { document.getElementById('derr').textContent = res.error; return; }
      emitSpecs(res.events);
      drawerClose();
      saveAndNote(res.flash || 'Event written.');
      render();
    });
  }

  /* ---------- TODAY ---------- */
  function bandFor(score) { return score >= 64 ? 'p1' : score >= 48 ? 'p2' : 'p3'; }
  function findingRow(f, i) {
    var cls = f.confidence.level === 'high' ? 'hi' : f.confidence.level === 'medium' ? 'med' : 'lo';
    var acts = '<div class="actions">';
    if (f.playbook) acts += '<button class="btn mini" data-pb="' + esc(f.playbook) + '" data-i="' + i + '">' + ic('arrow') + 'Open playbook</button>';
    if (f.capture) acts += '<button class="btn mini ghost" data-cap="' + esc(f.capture) + '" data-i="' + i + '">' + ic('arrow') + 'Log update</button>';
    acts += '<button class="btn mini ghost" data-snooze="' + i + '" title="hide for 7 days — an event, reversible">' + ic('clock') + 'Snooze 7d</button>';
    acts += '<button class="btn mini ghost" data-dismiss="' + i + '" title="hide until you unmute — an event, reversible">' + ic('belloff') + 'Dismiss</button>';
    acts += '</div>';
    return '<li class="row ' + bandFor(f.score) + '"><div class="no">' + (i + 1) + '</div><div class="stripe"></div><div>' +
      '<span class="rtag">' + esc(f.tag) + (f.personId ? ' · ' + esc(nameOf(f.personId)) : '') + '</span>' +
      '<p class="rt">' + esc(f.title) + '</p><p class="ra">' + esc(f.action) + '</p>' +
      '<div class="basis">' + f.basis.map(function (b) { return '<div>' + esc(b) + '</div>'; }).join('') +
      '<div class="bwhy">confidence: ' + esc(f.confidence.level.toUpperCase()) + ' — ' + esc(f.confidence.why) + '</div></div>' +
      '<div class="scoreline"><span class="chip ' + cls + '">' + esc(f.confidence.level) + '</span> &nbsp;' + esc(f.breakdown) + '</div>' +
      acts + '</div></li>';
  }
  function renderToday(root, rankedRes) {
    var s = st(), a = EV().arrival(s, today());
    var openLoops = EV().openDecisions(s).length + EV().openGoals(s).length +
      EV().openIncidents(s).length + a.wins.open.length;
    var html = '<div class="vhead"><h1>Today</h1><span class="sub">' + esc(today()) + ' · ranked next-best actions</span></div>';
    html += '<div class="stateline">' +
      (a.set ? '<span>day <b>' + (a.day == null ? '?' : a.day) + '</b> since ' + esc(a.startDate) + '</span>' : '<span>arrival clock: <b>not set</b></span>') +
      '<span>roster: <b>' + (s.people || []).filter(function (p) { return p && !p.archived; }).length + '</b></span>' +
      '<span>open loops: <b>' + openLoops + '</b> <span class="muted-note">(decisions + goals + incidents + wins)</span></span>' +
      '<span>event stream: <b>' + s.events.length + '</b></span></div>';
    if (FLASH) {
      html += '<div class="flash' + (FLASH.err ? ' err' : '') + '">' + esc(FLASH.msg) + '</div>'; FLASH = null;
    }
    if (!a.set) {
      html += '<div class="callout"><span class="ct">setup · not an engine finding</span>' +
        'The arrival instrument is off. Set the date you took over and R9–R11 start watching the things new leaders miss. ' +
        '<a class="lnk" href="#/arrival">Set your start date →</a></div>';
    }
    /* capture bar */
    var chips = [['oneonone.logged', '1:1'], ['pulse.logged', 'pulse'], ['feedback.logged', 'feedback'],
      ['decision.logged', 'decision'], ['decision.outcome', 'outcome'], ['goal.set', 'goal'], ['goal.progress', 'progress'],
      ['delegation.assigned', 'delegate'], ['delegation.closed', 'close del.'], ['conflict.registered', 'conflict'],
      ['conflict.resolved', 'resolve'], ['incident.registered', 'incident'], ['incident.update', 'inc. update'],
      ['tour.visit', 'tour visit'], ['expectation.logged', 'expectation'], ['earlywin.committed', 'early win']];
    html += '<div class="qbar">' + chips.map(function (c) {
      return '<button class="qchip" data-cap="' + c[0] + '">' + ic(CAPTURES[c[0]].icon) + esc(c[1]) + '</button>';
    }).join('') + '</div>';

    if (!(s.people || []).length && !s.events.length) {
      html += '<div class="empty"><b>Nothing here yet — that is a fact, not a failure.</b><br>' +
        'Load the seeded sample set at <a class="lnk" href="#/data">#/data</a> to see every rule fire with full reasoning, ' +
        'or add your first lead at <a class="lnk" href="#/roster">#/roster</a> and the engine starts working from your first event.</div>';
    }
    var r = rankedRes || EN().ranked(s, today());
    if (!r.items.length) {
      html += '<div class="empty"><b>' + (s.events.length ? 'No open recommendations.' : '') + '</b>' +
        (s.events.length ? ' The engine read ' + s.events.length + ' events and has nothing it would rather you did differently. That is a measured statement, not a compliment — keep logging.' : '') + '</div>';
    } else {
      html += '<ol class="rank">' + r.items.map(findingRow).join('') + '</ol>';
    }
    if (r.muted.length) {
      html += '<div class="mutedwrap"><span class="rtag">suppressed by your own events (' + r.muted.length + ') — reversible</span>' +
        r.muted.map(function (f, i) {
          return '<div class="mutedrow"><span class="mk">' + esc(f.mutedAs) + '</span><span style="flex:1">' + esc(f.title) + '</span>' +
            '<button class="btn mini ghost" data-unmute="' + i + '">' + ic('bell') + 'Unmute</button></div>';
        }).join('') + '</div>';
    }
    html += '<p class="footnote">Order = score (severity × confidence factor). Every row shows its triggering data and its confidence reasoning; the engine prints what it knows and what it assumes. Snooze/dismiss are engine.* events — exportable and reversible.</p>';
    root.innerHTML = html;
    bindToday(root, r);
  }
  function bindToday(root, r) {
    root.querySelectorAll('[data-cap]').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = b.getAttribute('data-i');
        var pre = {};
        if (idx != null && r.items[idx] && r.items[idx].ruleId === 'R12') pre.incidentId = r.items[idx].meta.incidentId;
        openCapture(b.getAttribute('data-cap'), pre);
      });
    });
    root.querySelectorAll('[data-pb]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = r.items[Number(b.getAttribute('data-i'))];
        var pre = Object.assign({ personId: f.personId }, f.prefill || {});
        if (f.ruleId === 'R2') pre = { decisionId: f.meta.key };
        if (f.ruleId === 'R3') pre = { goalId: f.meta.key, personId: f.personId };
        if (f.ruleId === 'R10' && f.meta.missing && f.meta.missing[0]) pre.personId = f.meta.missing[0];
        openPlaybook(b.getAttribute('data-pb'), pre);
      });
    });
    root.querySelectorAll('[data-snooze]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = r.items[Number(b.getAttribute('data-snooze'))];
        var until = new Date(Date.now() + EN().DOCTRINE.SNOOZE_DAYS * 86400000).toISOString().slice(0, 10);
        emitSpecs([{ type: 'engine.snooze', data: { key: f.key, until: until, title: f.title } }]);
        saveAndNote('Snoozed until ' + until + ' — recorded as an event, so it is auditable.');
        render();
      });
    });
    root.querySelectorAll('[data-dismiss]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = r.items[Number(b.getAttribute('data-dismiss'))];
        if (!window.confirm('Dismiss "' + f.title + '" until you unmute it? This is recorded as an event.')) return;
        emitSpecs([{ type: 'engine.dismiss', data: { key: f.key, title: f.title } }]);
        saveAndNote('Dismissed. Find it under "suppressed" below — unmute any time.');
        render();
      });
    });
    root.querySelectorAll('[data-unmute]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = r.muted[Number(b.getAttribute('data-unmute'))];
        emitSpecs([{ type: 'engine.unmute', data: { key: f.key } }]);
        saveAndNote('Unmuted — it re-enters the ranking now.');
        render();
      });
    });
  }

  /* ---------- ARRIVAL ---------- */
  function renderArrival(root) {
    var s = st(), a = EV().arrival(s, today());
    var html = '<div class="vhead"><h1>Arrival</h1><span class="sub">your first-90-days instrument</span></div>';
    if (FLASH) { html += '<div class="flash' + (FLASH.err ? ' err' : '') + '">' + esc(FLASH.msg) + '</div>'; FLASH = null; }
    if (!a.set) {
      html += '<p class="vsub">The three things newly appointed multi-team leaders get fired for missing: no written expectations from their boss, an unfinished listening tour before changes, and early wins that were announced but never verified. This view watches all three — from day one.</p>' +
        '<form id="appt" style="max-width:420px">' +
        '<label class="f"><span class="fl">The date you took over <span class="req">*</span></span><input type="date" name="startDate" required></label>' +
        '<label class="f"><span class="fl">Situation</span><select name="scope">' +
        '<option value="step-up">stepped up — now leading my former peers / other leads</option>' +
        '<option value="new-org">new to the organization</option>' +
        '<option value="first-time">first time leading leaders</option></select></label>' +
        '<label class="f"><span class="fl">Notes (boss, mandate, anything to remember)</span><textarea name="notes"></textarea></label>' +
        '<div class="errtxt" id="derr"></div><button class="btn" type="submit">' + ic('flag') + 'Start the clock</button></form>';
      root.innerHTML = html;
      document.getElementById('appt').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var fd = new FormData(this);
        var d = String(fd.get('startDate') || '');
        if (!d || isNaN(Date.parse(d))) { document.getElementById('derr').textContent = 'a real date is required'; return; }
        s.meta.appointment = { startDate: d, scope: String(fd.get('scope') || ''), notes: String(fd.get('notes') || '') };
        emitSpecs([{ type: 'appointment.started',
          data: { startDate: d, scope: s.meta.appointment.scope, notes: s.meta.appointment.notes } }]);
        saveAndNote('Clock started on ' + d + '. R9–R11 are now watching.');
        render();
      });
      return;
    }
    var r9Late = a.day != null && a.day >= EN().DOCTRINE.ARR_EXPECT_DAYS && a.expectationCount === 0;
    html += '<div style="display:flex;align-items:baseline;gap:18px;flex-wrap:wrap;margin:14px 0 4px">' +
      '<div class="daynum">' + (a.day == null ? '—' : a.day) + '<span class="du"> day' + (a.day === 1 ? '' : 's') + ' in role</span></div>' +
      '<div class="barmeta">since ' + esc(a.startDate) + (a.scope ? ' · ' + esc(a.scope) : '') + '<br>' +
      '<a class="lnk" data-act="rebase">re-baseline (new role / reset)</a></div></div>';

    /* expectations */
    html += '<div class="sect"><h2>Boss expectations</h2><span class="ss">gate: captured by day ' + EN().DOCTRINE.ARR_EXPECT_DAYS + ' · rule R9</span>';
    if (!a.expectationCount) {
      html += '<div class="callout"' + (r9Late ? ' style="border-left-color:var(--bad)"' : '') + '><span class="ct">' + (r9Late ? 'past the gate' : 'open') + '</span>' +
        'Zero expectations captured. Book 45 minutes with your boss and run the charter — it asks the five questions for you.</div>';
    } else {
      var lastEx = a.expectations[a.expectations.length - 1];
      html += '<div class="barmeta">' + a.expectationCount + ' captured · last: ' + String(lastEx.ts).slice(0, 10) + '</div>' +
        '<div class="basis" style="margin:8px 0">' + ((lastEx.data && lastEx.data.items) || []).map(function (it) {
          return '<div>' + esc(it) + '</div>'; }).join('') + '</div>';
    }
    html += '<div class="actions"><button class="btn mini" data-pb="charter">' + ic('shield') + 'Run the expectations charter</button>' +
      '<button class="btn mini ghost" data-cap="expectation.logged">' + ic('plus') + 'Quick capture</button></div></div>';

    /* listening tour */
    var t = a.tour;
    html += '<div class="sect"><h2>Listening tour</h2><span class="ss">gate: all direct leads by day ' + EN().DOCTRINE.ARR_TOUR_DAYS + ' · rule R10</span>';
    if (!t.directCount) {
      html += '<div class="barmeta">No direct leads on the roster yet — coverage has no denominator. <a class="lnk" href="#/roster">Add your leads →</a></div>';
    } else {
      var pct = t.coveragePct;
      html += '<div class="bar"><div class="fill" style="width:' + pct + '%"></div><div class="tick" style="left:100%"></div></div>' +
        '<div class="barmeta">' + t.visitedCount + '/' + t.directCount + ' direct leads (' + pct + '%) · day ' + a.day + ' of ' + EN().DOCTRINE.ARR_TOUR_DAYS +
        ' · skip-level visits: ' + t.skipCount + '</div>' +
        t.directs.map(function (p) {
          var seen = t.visitedIds[p.id];
          var lastV = seen ? t.visits.filter(function (v) { return v.personId === p.id; }).slice(-1)[0] : null;
          return '<div class="wire ' + (seen ? 'done' : 'miss') + '"><span class="wst">' + (seen ? 'visited' : 'missing') + '</span>' +
            '<span><a class="lnk" href="#/person/' + esc(p.id) + '">' + esc(p.name) + '</a></span>' +
            '<span class="wmeta">' + (lastV ? String(lastV.ts).slice(0, 10) : '—') + '</span></div>';
        }).join('') +
        '<div class="actions" style="margin-top:10px"><button class="btn mini" data-pb="tour">' + ic('tour') + 'Run a tour visit</button></div>';
    }
    html += '</div>';

    /* early wins */
    html += '<div class="sect"><h2>Early wins</h2><span class="ss">announced wins must be verified out loud · rule R11</span>';
    if (!a.wins.open.length && !a.wins.closed.length) html += '<div class="barmeta">No wins committed yet. Small, verifiable, fast — then hold yourself to the metric.</div>';
    html += a.wins.open.map(function (w) {
      var d = w.verifyDate ? EN().days(w.verifyDate, today()) : null;
      var stateTxt = d == null ? 'no verify date' : d > 0 ? d + 'd PAST verify date' : 'verify in ' + (-d) + 'd';
      return '<div class="wire ' + (d != null && d > 0 ? 'miss' : '') + '"><span class="wst">open</span>' +
        '<span>' + esc(w.title) + ' <span class="muted-note">· ' + esc(w.metric || 'no metric!') + '</span></span>' +
        '<span class="wmeta">' + stateTxt + ' <a class="lnk" data-verify="' + esc(w.id) + '">verify</a></span></div>';
    }).join('');
    html += a.wins.closed.map(function (w) {
      return '<div class="wire done"><span class="wst">' + esc(w.outcome || 'done') + '</span><span>' + esc(w.title) + '</span>' +
        '<span class="wmeta">verified</span></div>';
    }).join('');
    html += '<form id="winc" style="max-width:460px;margin-top:12px">' +
      '<div class="frow"><label class="f"><span class="fl">Commit a win <span class="req">*</span></span><input type="text" name="title"></label>' +
      '<label class="f"><span class="fl">Verify by <span class="req">*</span></span><input type="date" name="verifyDate"></label></div>' +
      '<label class="f"><span class="fl">Metric a skeptic would accept <span class="req">*</span></span><input type="text" name="metric"></label>' +
      '<label class="f"><span class="fl">Announced to (optional)</span><input type="text" name="announcedTo"></label>' +
      '<div class="errtxt" id="werr"></div><button class="btn mini" type="submit">' + ic('flag') + 'Commit win</button></form></div>';
    html += '<p class="footnote">This view is a projection: recompute from events on every read. Nothing here is stored state, so it cannot drift.</p>';
    root.innerHTML = html;

    root.querySelectorAll('[data-pb]').forEach(function (b) {
      b.addEventListener('click', function () { openPlaybook(b.getAttribute('data-pb'), {}); });
    });
    root.querySelectorAll('[data-cap]').forEach(function (b) {
      b.addEventListener('click', function () { openCapture(b.getAttribute('data-cap'), {}); });
    });
    root.querySelectorAll('[data-verify]').forEach(function (b) {
      b.addEventListener('click', function () {
        var w = a.wins.open.filter(function (x) { return x.id === b.getAttribute('data-verify'); })[0];
        openPlaybook('wincloser', { winId: w.id, title: w.title, metric: w.metric, verifyDate: w.verifyDate, announcedTo: w.announcedTo });
      });
    });
    var rb = root.querySelector('[data-act="rebase"]');
    if (rb) rb.addEventListener('click', function () {
      st().meta.appointment = null;
      S().save(); render();
    });
    var wf = document.getElementById('winc');
    if (wf) wf.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var fd = new FormData(this);
      var title = String(fd.get('title') || '').trim(), metric = String(fd.get('metric') || '').trim(),
        vd = String(fd.get('verifyDate') || '');
      if (!title || !metric || !vd) { document.getElementById('werr').textContent = 'win, metric and verify date are all required'; return; }
      emitSpecs([{ type: 'earlywin.committed', data: { title: title, metric: metric, verifyDate: vd,
        announcedTo: String(fd.get('announcedTo') || '').trim() || undefined } }]);
      saveAndNote('Win committed. Verify it out loud by ' + vd + '.');
      render();
    });
  }

  /* ---------- ROSTER + DOSSIER ---------- */
  function renderRoster(root) {
    var s = st();
    var html = '<div class="vhead"><h1>Roster</h1><span class="sub">people you lead, and their leads</span></div>';
    if (FLASH) { html += '<div class="flash' + (FLASH.err ? ' err' : '') + '">' + esc(FLASH.msg) + '</div>'; FLASH = null; }
    html += '<form id="addp" style="max-width:520px"><div class="frow">' +
      '<label class="f"><span class="fl">Name <span class="req">*</span></span><input type="text" name="name"></label>' +
      '<label class="f"><span class="fl">Role</span><input type="text" name="role" placeholder="Team lead — X"></label></div><div class="frow">' +
      '<label class="f"><span class="fl">1:1 cadence (days)</span><input type="number" name="cadenceDays" value="7" min="1"></label>' +
      '<label class="f"><span class="fl">Reports to</span><select name="reportsTo"><option value="me">me (direct lead)</option>' +
      (s.people || []).filter(function (p) { return p && !p.archived; }).map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.name) + ' (skip-level)</option>'; }).join('') + '</select></label></div>' +
      '<div class="errtxt" id="perr"></div><button class="btn mini" type="submit">' + ic('plus') + 'Add person</button></form>';
    html += '<table class="tbl"><thead><tr><th>Name</th><th class="m">cadence</th><th class="m">reports to</th><th class="m">last 1:1</th><th class="m">open del.</th><th class="m">tour</th><th></th></tr></thead><tbody>';
    var a = EV().arrival(s, today());
    (s.people || []).forEach(function (p) {
      if (!p) return;
      var last = EV().lastOneOnOne(s, p.id);
      var od = EV().openDelegations(s).filter(function (d) { return d.personId === p.id; }).length;
      var rt = p.reportsTo === 'me' || p.reportsTo === undefined ? 'me' : nameOf(p.reportsTo);
      html += '<tr class="frow' + (p.archived ? ' arch' : '') + '">' +
        '<td><a class="lnk" href="#/person/' + esc(p.id) + '"><b>' + esc(p.name) + '</b></a><br><span class="muted-note">' + esc(p.role || '—') + '</span></td>' +
        '<td class="m">' + esc(p.cadenceDays) + 'd</td><td class="m">' + esc(rt) + '</td>' +
        '<td class="m">' + (last ? String(last.ts).slice(0, 10) : 'never') + '</td>' +
        '<td class="m">' + od + '</td><td class="m">' + (a.tour.visitedIds[p.id] ? 'visited' : '—') + '</td>' +
        '<td class="m"><a class="lnk" data-arch="' + esc(p.id) + '">' + (p.archived ? 'unarchive' : 'archive') + '</a></td></tr>';
    });
    html += '</tbody></table><p class="footnote">reportsTo drives R8 skip-levels and R10 tour coverage. Archive preserves history; the engine stops watching archived people.</p>';
    root.innerHTML = html;
    document.getElementById('addp').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var fd = new FormData(this);
      var name = String(fd.get('name') || '').trim();
      if (!name) { document.getElementById('perr').textContent = 'name is required'; return; }
      EV().addPerson(st(), { name: name, role: String(fd.get('role') || ''),
        cadenceDays: fd.get('cadenceDays'), reportsTo: String(fd.get('reportsTo') || 'me') });
      saveAndNote(name + ' added — R1 starts counting from their cadence.');
      render();
    });
    root.querySelectorAll('[data-arch]').forEach(function (b2) {
      b2.addEventListener('click', function () {
        var p = personById(b2.getAttribute('data-arch'));
        EV().updatePerson(st(), p.id, { archived: !p.archived });
        saveAndNote(p.name + (p.archived ? ' unarchived.' : ' archived — history kept, engine stops watching.'));
        render();
      });
    });
  }

  function spark(vals) {
    if (!vals.length) return '<span class="muted-note">none</span>';
    var blocks = '▁▂▃▄▅▆▇█';
    return '<span class="spark">' + vals.map(function (v) {
      if (v == null) return '·';
      var i = Math.max(0, Math.min(7, Math.round((v - 1) / 9 * 7)));
      return blocks[i];
    }).join('') + '</span>';
  }
  function renderPerson(root, pid) {
    var s = st(), p = personById(pid);
    if (!p) { root.innerHTML = '<div class="empty">Person not found. <a class="lnk" href="#/roster">Back to roster →</a></div>'; return; }
    var t = today();
    var bal = EV().feedbackBalance(s, pid, 60, t);
    var puls = EV().pulsesMeasured(s, pid, 21, t);
    var est = EV().pulsesEstimatedCount(s, pid, 21, t);
    var sl = EV().latestSL(s, pid);
    var last = EV().lastOneOnOne(s, pid);
    var od = EV().openDelegations(s).filter(function (d) { return d.personId === pid; });
    var oc = EV().openConflicts(s).filter(function (c) { return c.personId === pid; });
    var goals = EV().openGoals(s).filter(function (g) { return g.ownerPersonId === pid; });
    var visits = EV().arrival(s, t).tour.visits.filter(function (v) { return v.personId === pid; });
    var findings = EN().ranked(s, t).items.filter(function (f) { return f.personId === pid; });
    var trav = EV().sorted(s.events.filter(function (e) { return e.personId === pid; })).slice(-12).reverse();
    var moods = puls.map(function (e) { return Number(e.data.mood); });
    var mSlope = EN().slope(moods);

    var html = '<div class="doshead"><h1>' + esc(p.name) + '</h1><span class="sub">' + esc(p.role || '—') + (p.archived ? ' · ARCHIVED' : '') + '</span>' +
      '<span class="spacer"></span><a class="btn mini ghost" href="#/roster">all people</a></div>';
    if (FLASH) { html += '<div class="flash' + (FLASH.err ? ' err' : '') + '">' + esc(FLASH.msg) + '</div>'; FLASH = null; }
    html += '<dl class="kv">' +
      '<dt>cadence</dt><dd>' + esc(p.cadenceDays) + 'd · last 1:1 ' + (last ? String(last.ts).slice(0, 10) : 'never') + '</dd>' +
      '<dt>reports to</dt><dd>' + esc(p.reportsTo === undefined ? 'me' : p.reportsTo === 'me' ? 'me' : nameOf(p.reportsTo)) + '</dd>' +
      '<dt>feedback 60d</dt><dd>' + bal.corrective + ' corrective / ' + bal.positive + ' positive</dd>' +
      '<dt>pulse 21d (mood)</dt><dd>' + spark(moods) + ' <span class="muted-note">' + puls.length + ' measured' +
        (mSlope != null ? ' · slope ' + mSlope.toFixed(2) : ' · no trend (need ≥3)') +
        (est ? ' · ' + est + ' estimated excluded' : '') + '</span></dd>' +
      '<dt>situational</dt><dd>' + (sl ? esc(String(sl.ts).slice(0, 10)) + ' · ' + esc(sl.data.task || '—') + ' → ' + esc(sl.data.style) + ' ' + esc(sl.data.styleName || '') : 'no assessment yet') + '</dd>' +
      '<dt>tour visits</dt><dd>' + (visits.length ? visits.map(function (v) { return String(v.ts).slice(0, 10); }).join(' · ') : 'none logged') + '</dd></dl>';

    if (findings.length) {
      html += '<div class="minihead">engine findings for ' + esc(p.name) + '</div>' +
        findings.map(function (f) {
          return '<div class="mutedrow"><span class="mk">' + esc(f.ruleId) + ' · ' + f.score + '</span><span style="flex:1">' + esc(f.title) + '</span></div>';
        }).join('');
    } else {
      html += '<div class="minihead">engine findings</div><p class="muted-note">None. Measured statement, not a compliment.</p>';
    }
    html += '<div class="minihead">open delegations (' + od.length + ')</div>' +
      (od.length ? od.map(function (d) { return '<div class="logrow">L' + esc(d.level || '?') + ' · ' + esc(d.label) + ' · since ' + String(d.ts).slice(0, 10) + '</div>'; }).join('') : '<p class="muted-note">none</p>');
    html += '<div class="minihead">open conflicts (' + oc.length + ')</div>' +
      (oc.length ? oc.map(function (c) { return '<div class="logrow">' + esc(c.label) + '</div>'; }).join('') : '<p class="muted-note">none</p>');
    html += '<div class="minihead">goals owned (' + goals.length + ')</div>' +
      (goals.length ? goals.map(function (g) { return '<div class="logrow">' + esc(g.label) + ' · last anchor ' + String(g.lastProgressTs).slice(0, 10) + '</div>'; }).join('') : '<p class="muted-note">none</p>');
    html += '<div class="minihead">recent stream</div>' +
      (trav.length ? trav.map(function (e) {
        return '<div class="logrow"><span class="lk">' + String(e.ts).slice(0, 10) + '</span>' + esc(e.type) +
          (e.data && e.data.note ? ' — ' + esc(String(e.data.note).slice(0, 80)) : '') + '</div>';
      }).join('') : '<p class="muted-note">no events yet</p>');
    html += '<div class="actions" style="margin-top:16px">' +
      '<button class="btn mini" data-pb="oneonone">' + ic('cal') + '1:1 run sheet</button>' +
      '<button class="btn mini ghost" data-pb="sbi">' + ic('chat') + 'SBI</button>' +
      '<button class="btn mini ghost" data-pb="sl">' + ic('grid') + 'Situational read</button>' +
      '<button class="btn mini ghost" data-pb="delegation">' + ic('hand') + 'Delegate</button>' +
      '<button class="btn mini ghost" data-pb="tour">' + ic('tour') + 'Tour visit</button></div>';
    root.innerHTML = html;
    root.querySelectorAll('[data-pb]').forEach(function (b) {
      b.addEventListener('click', function () { openPlaybook(b.getAttribute('data-pb'), { personId: pid }); });
    });
  }

  /* ---------- PLAYBOOKS INDEX ---------- */
  function renderPlaybooks(root) {
    var html = '<div class="vhead"><h1>Playbooks</h1><span class="sub">procedures, not advice</span></div>' +
      '<p class="vsub">Every playbook pre-fills from your live data and submits resolving events through the same layer as everything else. Guidance without a write path is a wiki; these are tools.</p><table class="tbl"><tbody>';
    PB().list().forEach(function (pb) {
      html += '<tr class="frow"><td style="width:36px">' + ic(pb.icon) + '</td><td><b>' + esc(pb.title) + '</b><br>' +
        '<span class="muted-note" style="font-family:var(--sans);font-size:11.5px">' + esc(pb.blurb) + '</span></td>' +
        '<td style="text-align:right"><button class="btn mini ghost" data-open="' + esc(pb.id) + '">Open</button></td></tr>';
    });
    html += '</tbody></table>';
    root.innerHTML = html;
    root.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { openPlaybook(b.getAttribute('data-open'), {}); });
    });
  }

  /* ---------- HEALTH: the wall counts itself ---------- */
  function cleanup(prefix) {
    var ks = [], i;
    for (i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) ks.push(k);
    }
    ks.forEach(function (k) { localStorage.removeItem(k); });
  }
  function storeTests() {
    var TK = 'leados:htest.' + Date.now().toString(36), T = [];
    function t(id, name, fn) {
      var r;
      try { r = fn(); } catch (e) { r = { pass: false, observed: 'THREW: ' + e.message }; }
      T.push({ id: id, name: name, pass: !!r.pass, observed: String(r.observed) });
    }
    var SM = S();
    t('T1', 'absent key → fresh v3 state, no writes', function () {
      var k = TK + '.t1', ms = SM._makeStore(k), r = ms.load();
      var s = ms.get();
      var ok = r.branch === 'absent' && s.meta.schemaVersion === 3 && s.meta.appointment === null &&
        localStorage.getItem(k) == null;
      cleanup(k); return { pass: ok, observed: 'branch=' + r.branch + ' schemaVersion=' + s.meta.schemaVersion };
    });
    t('T2', 'corrupt bytes → quarantined, booted clean, original preserved', function () {
      var k = TK + '.t2';
      localStorage.setItem(k, '{bad json');
      var ms = SM._makeStore(k), r = ms.load();
      var qk = null;
      for (var i = 0; i < localStorage.length; i++) {
        var kk = localStorage.key(i);
        if (kk && kk.indexOf(k + '.corrupt.') === 0) qk = kk;
      }
      var preserved = qk && localStorage.getItem(qk) === '{bad json';
      var ok = r.branch === 'corrupt' && preserved && localStorage.getItem(k) == null;
      cleanup(k); return { pass: ok, observed: 'branch=' + r.branch + ' quarantinePreserved=' + !!preserved };
    });
    t('T3', 'foreign lineage refused AND preserved', function () {
      var k = TK + '.t3';
      localStorage.setItem(k, JSON.stringify({ meta: { schemaVersion: 2, lineage: 'other' }, people: [], events: [], log: [] }));
      var ms = SM._makeStore(k), r = ms.load();
      var q = false;
      for (var i = 0; i < localStorage.length; i++) {
        var kk = localStorage.key(i);
        if (kk && kk.indexOf(k + '.foreign.') === 0) q = true;
      }
      cleanup(k); return { pass: r.branch === 'foreign' && q, observed: 'branch=' + r.branch + ' preserved=' + q };
    });
    t('T4', 'newer version refused (never migrates down)', function () {
      var k = TK + '.t4';
      localStorage.setItem(k, JSON.stringify({ meta: { schemaVersion: 99, lineage: 'mf' }, people: [], events: [], log: [] }));
      var ms = SM._makeStore(k), r = ms.load();
      cleanup(k); return { pass: r.branch === 'newer', observed: 'branch=' + r.branch };
    });
    t('T5', 'shape-valid JSON failing structure → malformed', function () {
      var k = TK + '.t5';
      localStorage.setItem(k, JSON.stringify({ meta: { schemaVersion: 3, lineage: 'mf' }, people: {}, events: [], log: [] }));
      var ms = SM._makeStore(k), r = ms.load();
      cleanup(k); return { pass: r.branch === 'malformed', observed: 'branch=' + r.branch };
    });
    t('T6', 'byte-exact v1 fixture climbs the full ladder 1→2→3', function () {
      var k = TK + '.t6';
      var v1 = { meta: { schemaVersion: 1, lineage: 'mf', seeded: true, createdAt: '2025-01-01T00:00:00.000Z', writeFailed: false },
        people: [{ id: 'p-1', name: 'V1 Person', role: 'lead', cadenceDays: 7 }],
        events: [{ id: 'e-1', ts: '2025-01-02T10:00:00.000Z', type: 'oneonone.logged', personId: 'p-1', data: {} }], log: [] };
      localStorage.setItem(k, JSON.stringify(v1));
      var ms = SM._makeStore(k), r = ms.load(), s = ms.get();
      var preM = false;
      for (var i = 0; i < localStorage.length; i++) {
        var kk = localStorage.key(i);
        if (kk && kk.indexOf(k + '.pre-migration.') === 0) preM = true;
      }
      var ok = r.branch === 'migrated' && s.meta.schemaVersion === 3 &&
        s.people[0].reportsTo === 'me' && s.meta.appointment === null &&
        s.meta.migrations.length === 2 && preM && s.events[0].id === 'e-1';
      cleanup(k);
      return { pass: ok, observed: 'branch=' + r.branch + ' →v' + s.meta.schemaVersion +
        ' migrations=' + s.meta.migrations.length + ' preMigrationBytes=' + preM };
    });
    t('T7', 'v2 fixture takes only the 2→3 step', function () {
      var k = TK + '.t7';
      var v2 = { meta: { schemaVersion: 2, lineage: 'mf', seeded: false, createdAt: '2025-06-01T00:00:00.000Z',
          writeFailed: false, migrations: [{ from: 1, to: 2, at: '2025-06-01T00:00:00.000Z' }] },
        people: [], events: [], log: [] };
      localStorage.setItem(k, JSON.stringify(v2));
      var ms = SM._makeStore(k), r = ms.load(), s = ms.get();
      var ok = r.branch === 'migrated' && s.meta.schemaVersion === 3 &&
        s.meta.migrations.length === 2 && s.meta.appointment === null;
      cleanup(k);
      return { pass: ok, observed: 'branch=' + r.branch + ' migrations=' + s.meta.migrations.length };
    });
    t('T8', 'normalization repairs, never drops (null row, dup id, bad ts)', function () {
      var k = TK + '.t8';
      var base = SM.fresh();
      base.events = [null, { id: 'x', ts: 'not-a-date', type: 'a' }, { id: 'x', ts: '2025-01-01T00:00:00.000Z', type: 'b' },
        { ts: '2025-01-01T00:00:00.000Z', type: 'pulse.logged', data: { mood: 5, load: 5 } }];
      localStorage.setItem(k, JSON.stringify(base));
      var ms = SM._makeStore(k), r = ms.load(), s = ms.get();
      var ids = {}, dup = false;
      s.events.forEach(function (e) { if (ids[e.id]) dup = true; ids[e.id] = true; });
      var allTs = s.events.every(function (e) { return !isNaN(Date.parse(e.ts)); });
      var allType = s.events.every(function (e) { return typeof e.type === 'string' && e.type; });
      var ok = r.branch === 'ok' && s.events.length === 4 && !dup && allTs && allType && (r.repairs || 0) >= 3;
      cleanup(k);
      return { pass: ok, observed: 'rows=' + s.events.length + ' (4 kept) repairs=' + r.repairs + ' dupIds=' + dup };
    });
    t('T9', 'quota failure caught: ok:false, writeFailed flag, no crash', function () {
      var k = TK + '.t9', ms = SM._makeStore(k);
      ms.load();
      var orig = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function () { var e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
      var r = ms.save();
      localStorage.setItem = orig;
      var ok = r.ok === false && r.quota === true && ms.get().meta.writeFailed === true;
      cleanup(k);
      return { pass: ok, observed: 'ok=' + r.ok + ' quota=' + !!r.quota + ' writeFailed=' + ms.get().meta.writeFailed };
    });
    t('T10', 'import: guards + merge re-mints ids and rewires references', function () {
      var kA = TK + '.t10a', kB = TK + '.t10b';
      var A = SM._makeStore(kA); A.load();
      var as = A.get();
      as.people.push({ id: 'p-A1', name: 'Imported Lead', role: 'x', cadenceDays: 7, reportsTo: 'me', createdAt: '2025-01-01T00:00:00.000Z', archived: false, seed: false });
      as.events.push({ id: 'e-D1', ts: '2025-01-05T00:00:00.000Z', type: 'decision.logged', personId: 'p-A1', data: { title: 'imported decision', reviewDate: '2025-02-01' }, seed: false });
      as.events.push({ id: 'e-O1', ts: '2025-02-02T00:00:00.000Z', type: 'decision.outcome', personId: null, data: { decisionId: 'e-D1', outcome: 'right' }, seed: false });
      A.save();
      var text = localStorage.getItem(kA);
      var B = SM._makeStore(kB); B.load();
      var bad = B.importJSON('{nope');
      var ident = B.importJSON(B.exportJSON());
      var foreign = B.importJSON(JSON.stringify({ meta: { schemaVersion: 3, lineage: 'zzz' }, people: [], events: [], log: [] }));
      var r = B.importJSON(text), bs = B.get();
      var impDec = bs.events.filter(function (e) { return e.type === 'decision.logged'; })[0];
      var impOut = bs.events.filter(function (e) { return e.type === 'decision.outcome'; })[0];
      var rewired = impDec && impOut && impDec.id !== 'e-D1' && impOut.data.decisionId === impDec.id;
      var personReminted = bs.people[0] && bs.people[0].id !== 'p-A1' && bs.people[0].name === 'Imported Lead';
      var ok = r.ok === true && rewired && personReminted && bad.ok === false &&
        ident.ok === false && foreign.ok === false;
      cleanup(kA); cleanup(kB);
      return { pass: ok, observed: 'merge=' + r.ok + ' rewiredFk=' + !!rewired + ' remintedPerson=' + !!personReminted +
        ' guards(bad/identical/foreign)=' + !bad.ok + '/' + !ident.ok + '/' + !foreign.ok };
    });
    t('T11', 'seed → purge → never reseeds (flag set before rows)', function () {
      var k = TK + '.t11', ms = SM._makeStore(k);
      ms.load();
      EV().seed(ms.get()); ms.save();
      var seededPeople = ms.get().people.length;
      EV().purgeSeeds(ms.get()); ms.save();
      var ms2 = SM._makeStore(k), r = ms2.load();
      var s2 = ms2.get();
      var reseed = EV().seed(s2);
      var ok = r.branch === 'ok' && seededPeople > 0 && s2.people.length === 0 &&
        s2.meta.seeded === true && reseed === false && s2.meta.appointment === null;
      cleanup(k);
      return { pass: ok, observed: 'seeded=' + seededPeople + ' afterPurge=' + s2.people.length +
        ' flagKept=' + s2.meta.seeded + ' reseedAttempt=' + reseed };
    });
    t('T12', 'two corrupt boots in the same ms → TWO quarantines', function () {
      var k = TK + '.t12';
      localStorage.setItem(k, '{bad1');
      SM._makeStore(k).load();
      localStorage.setItem(k, '{bad2');
      SM._makeStore(k).load();
      var n = 0;
      for (var i = 0; i < localStorage.length; i++) {
        var kk = localStorage.key(i);
        if (kk && kk.indexOf(k + '.corrupt.') === 0) n++;
      }
      cleanup(k);
      return { pass: n === 2, observed: 'quarantine keys=' + n + ' (nothing overwritten)' };
    });
    return T;
  }
  function renderHealth(root) {
    var Ts = storeTests();
    var Gs = EN().runGoldens();
    var tPass = Ts.filter(function (x) { return x.pass; }).length;
    var gPass = Gs.filter(function (x) { return x.pass; }).length;
    var html = '<div class="vhead"><h1>Health</h1><span class="sub">claims executed against production code paths · at render</span></div>';
    if (FLASH) { html += '<div class="flash' + (FLASH.err ? ' err' : '') + '">' + esc(FLASH.msg) + '</div>'; FLASH = null; }
    html += '<div class="hsum">store <b>' + tPass + '/' + Ts.length + '</b> · engine goldens <b>' + gPass + '/' + Gs.length + '</b> — executed ' +
      esc(new Date().toLocaleTimeString()) + ' · disposable keys cleaned' + (tPass === Ts.length && gPass === Gs.length ? '' : ' · <b>FAILURES PRESENT</b>') + '</div>';
    html += '<div class="minihead">storage spine (T1–T12)</div><table class="tbl"><tbody>';
    Ts.forEach(function (x) {
      html += '<tr><td class="rid">' + x.id + '</td><td>' + esc(x.name) + '<br><span class="muted-note">observed: ' + esc(x.observed) + '</span></td>' +
        '<td style="text-align:right"><span class="chip ' + (x.pass ? 'ok' : 'fail') + '">' + (x.pass ? 'pass' : 'FAIL') + '</span></td></tr>';
    });
    html += '</tbody></table><div class="minihead">engine golden fixtures (G1–G16)</div><table class="tbl"><tbody>';
    Gs.forEach(function (x) {
      html += '<tr><td class="rid">' + x.id + '</td><td>' + esc(x.name) + '<br><span class="muted-note">observed: ' + esc(x.observed) + '</span></td>' +
        '<td style="text-align:right"><span class="chip ' + (x.pass ? 'ok' : 'fail') + '">' + (x.pass ? 'ok' : 'FAIL') + '</span></td></tr>';
    });
    html += '</tbody></table><p class="footnote">What this proves: fixture-based assertions on the real code paths — storage, migration ladder, quota, import, every rule. What it does NOT prove: browser automation, fuzzing, or that this page itself renders correctly. The authority rule: if the README and this wall disagree, this wall wins.</p>';
    root.innerHTML = html;
  }

  /* ---------- DATA ---------- */
  function renderData(root) {
    var s = st();
    var exp = S().exportJSON();
    var keys = S().listKeys();
    var html = '<div class="vhead"><h1>Data</h1><span class="sub">one key · export · import · quarantine</span></div>';
    if (FLASH) { html += '<div class="flash' + (FLASH.err ? ' err' : '') + '">' + esc(FLASH.msg) + '</div>'; FLASH = null; }
    var hasSeeds = (s.people || []).some(function (p) { return p && p.seed; }) || s.events.some(function (e) { return e.seed; });
    html += '<div class="qbar">' +
      '<button class="qchip" data-act="export">' + ic('dl') + 'Download full JSON</button>' +
      '<button class="qchip" data-act="seed"' + (s.meta.seeded ? ' disabled style="opacity:.4;cursor:default"' : '') + '>' + ic('plus') + 'Load sample set</button>' +
      (hasSeeds ? '<button class="qchip" data-act="purge">' + ic('x') + 'Purge seeded rows</button>' : '') +
      '</div><p class="muted-note" style="margin-top:-8px">' +
      (s.meta.seeded ? 'seeded flag is SET — the sample set will never load twice (purge keeps the flag).' : 'no seed flag — the sample set has never been loaded.') + '</p>';

    html += '<div class="minihead">import (guards: unparseable / malformed / newer / foreign / identical → refused)</div>' +
      '<textarea id="imp" style="width:100%;min-height:90px;border:1px solid var(--line2);background:#fff;padding:8px 9px;font:11px/1.5 var(--mono)" placeholder="paste a LeadOS export here — merges with re-minted ids, never overwrites"></textarea>' +
      '<div class="actions" style="margin:8px 0 4px"><button class="btn mini" data-act="import">' + ic('arrow') + 'Run import pipeline</button></div>' +
      '<div class="errtxt" id="ierr"></div>';

    html += '<div class="minihead">keys under leados:data (' + keys.length + ')</div><table class="tbl"><thead><tr><th>key</th><th class="m">kind</th><th class="m">bytes</th><th></th></tr></thead><tbody>';
    keys.forEach(function (k) {
      html += '<tr><td class="m" style="word-break:break-all">' + esc(k.key) + '</td><td class="m">' + esc(k.kind) + '</td><td class="m">' + k.bytes + '</td>' +
        '<td class="m">' + (k.kind === 'live' ? '<span class="muted-note">live</span>' : '<a class="lnk" data-read="' + esc(k.key) + '">read</a>') + '</td></tr>';
    });
    html += '</tbody></table>';

    html += '<div class="minihead">audit log (last 30)</div>' +
      (s.log || []).slice(-30).reverse().map(function (l) {
        return '<div class="logrow"><span class="lk">' + esc(String(l.ts).slice(5, 16).replace('T', ' ')) + ' ' + esc(l.kind) + '</span>' + esc(l.msg) + '</div>';
      }).join('');
    html += '<p class="footnote">Quota doctrine: the ~5MB localStorage budget is an ASSUMPTION (real limits aren\'t JS-queryable) — labelled, not hidden. Every write goes through one trySetItem; a quota failure sets the red WRITE FAILED pill and leaves in-memory state intact: export immediately. Export size now: ' + exp.length + ' bytes. Quarantines are timestamped, never overwritten, read-only here.</p>';
    root.innerHTML = html;

    root.querySelector('[data-act="export"]').addEventListener('click', function () {
      var blob = new Blob([S().exportJSON()], { type: 'application/json' });
      var aEl = document.createElement('a');
      aEl.href = URL.createObjectURL(blob);
      aEl.download = 'leados-export-' + today() + '.json';
      aEl.click();
      setTimeout(function () { URL.revokeObjectURL(aEl.href); }, 500);
    });
    var seedBtn = root.querySelector('[data-act="seed"]');
    if (seedBtn && !seedBtn.disabled) seedBtn.addEventListener('click', function () {
      EV().seed(st());
      saveAndNote('Sample set loaded — every rule now has something to say. Purge removes the rows; the flag stays forever.');
      render();
    });
    var purgeBtn = root.querySelector('[data-act="purge"]');
    if (purgeBtn) purgeBtn.addEventListener('click', function () {
      EV().purgeSeeds(st());
      saveAndNote('Seeded rows purged. State stays empty forever — no reseed.');
      render();
    });
    root.querySelector('[data-act="import"]').addEventListener('click', function () {
      var txt = document.getElementById('imp').value;
      var r = S().importJSON(txt);
      if (!r.ok) { document.getElementById('ierr').textContent = 'refused: ' + r.reason; return; }
      saveAndNote('Import merged: +' + r.imported.people + ' people, +' + r.imported.events + ' events (ids re-minted, refs rewired).');
      render();
    });
    root.querySelectorAll('[data-read]').forEach(function (b) {
      b.addEventListener('click', function () {
        var raw = S().readKey(b.getAttribute('data-read'));
        var pretty = raw;
        try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch (e) { /* show raw */ }
        drawerShow(dhead('Quarantine · read-only', b.getAttribute('data-read')) +
          '<pre class="dump">' + esc(pretty.slice(0, 40000)) + '</pre>' +
          '<p class="muted-note">Preserved bytes are never modified or deleted by the app. Remove them yourself in DevTools if you want them gone — that is a decision we don\'t make for you.</p>');
      });
    });
  }

  /* ---------- router ---------- */
  var VIEWS = {
    today: renderToday, arrival: renderArrival, roster: renderRoster,
    playbooks: renderPlaybooks, health: renderHealth, data: renderData
  };
  function route() {
    var h = location.hash || '#/today';
    var m = /^#\/(\w+)(?:\/(.+))?$/.exec(h);
    return { name: m ? m[1] : 'today', param: m && m[2] ? decodeURIComponent(m[2]) : null };
  }
  function render() {
    var r = route();
    var root = document.getElementById('main');
    document.querySelectorAll('.navbtn').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-nav') === (r.name === 'person' ? 'roster' : r.name));
    });
    drawerClose();
    if (r.name === 'person') return renderPerson(root, r.param);
    (VIEWS[r.name] || renderToday)(root);
    pill();
  }

  function init() {
    var boot = S().boot();
    var msg = {
      absent: null,
      ok: null,
      corrupt: 'Stored data was corrupted — it was quarantined untouched and the app booted clean. Inspect it read-only at #/data.',
      foreign: 'Data from a different LeadOS lineage was found, refused, and preserved. Yours was not overwritten. See #/data.',
      newer: 'Data from a NEWER version was found and refused (we never migrate down). Booted clean; original preserved at #/data.',
      'migration-failed': 'A migration failed — original bytes preserved, booted clean. Details in the audit log at #/data.',
      malformed: 'Stored data failed shape validation — quarantined and booted clean. See #/data.'
    }[boot.branch];
    if (boot.branch === 'migrated') msg = 'Storage migrated v' + boot.from + ' → v3 (' + (boot.repairs || 0) + ' normalization repairs, none dropped). Pre-migration bytes preserved at #/data.';
    if (boot.branch === 'ok' && boot.repairs) msg = boot.repairs + ' event row(s) repaired at boot (never dropped). Details in the audit log.';
    if (msg) setFlash(msg, boot.branch !== 'migrated' && boot.branch !== 'ok');
    pill();
    document.querySelectorAll('.navbtn').forEach(function (b) {
      b.addEventListener('click', function () { location.hash = '#/' + b.getAttribute('data-nav'); });
    });
    document.getElementById('scrim').addEventListener('click', drawerClose);
    window.addEventListener('hashchange', render);
    if (!location.hash) location.hash = '#/today';
    render();
    var bootEl = document.getElementById('boot');
    if (bootEl) bootEl.style.display = 'none';
  }

  return { init: init };
})();
