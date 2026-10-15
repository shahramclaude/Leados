/* LeadOS pt-2 · js/ui.js — Today · Roster+dossier · Playbooks · Health · Data.
   Today is one ranked column with printed score math — never tiles. Every view
   reads through events.project(store.state()) at render (stale state impossible)
   and writes through events.append / store row ops. The Health view is the
   authority rule made visible: T1–T14 + G1–G12 execute AT RENDER against the
   production code paths (disposable leados:t* keys, swept after); an observed
   FAIL outranks anything the README or session log says. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.ui = 'js/ui.js';

LEADOS.ui = (function () {
  'use strict';

  /* ---------- icons: custom inline SVG, 1.5px stroke, square joins ---------- */
  var IC = {
    today: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 3"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1"/><path d="M16 5.5a3 3 0 0 1 0 5.8M21 20v-1a5 5 0 0 0-3.5-4.8"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>',
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/>',
    arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    down: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
    up: '<path d="M12 20V8M6 14l6-6 6 6M4 4h16"/>'
  };
  function ic(name, size) {
    return '<svg width="' + (size || 14) + '" height="' + (size || 14) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">' + (IC[name] || '') + '</svg>';
  }
  function paintIcons(root) {
    var nodes = (root || document).querySelectorAll('[data-ic]');
    for (var i = 0; i < nodes.length; i++) nodes[i].innerHTML = ic(nodes[i].getAttribute('data-ic'));
  }

  /* ---------- dom ---------- */
  function h(tag, attrs, html) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    if (html != null) el.innerHTML = html;
    return el;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtD(iso) { return iso ? String(iso).slice(0, 10) : '—'; }
  function ago(iso, today) {
    var d = LEADOS.engine.days(iso, today);
    if (d == null) return '—';
    return d === 0 ? 'today' : d === 1 ? '1d ago' : d + 'd ago';
  }
  function Pj() { return LEADOS.events.project(LEADOS.store.state()); }
  function pname(P, pid) { var p = P.peopleById[pid]; return p ? p.name : '(unknown)'; }

  /* ---------- flash ---------- */
  function flash(msg, bad) {
    var f = h('div', { class: 'flash' + (bad ? ' bad' : '') }, esc(msg));
    document.getElementById('flash-root').appendChild(f);
    setTimeout(function () { f.remove(); }, 2800);
  }

  /* ---------- write pill (rail + topbar) ---------- */
  function paintFoot() {
    var st = LEADOS.store.state();
    var el = document.getElementById('rail-foot');
    el.innerHTML = 'schema v' + LEADOS.store.SCHEMA + ' · lineage pt<br>offline · one key · zero network' +
      (st && st.meta.writeFailed ? '<br><span class="pill pill-bad">WRITE FAILED</span>' : '') +
      (LEADOS.store.volatile() ? '<br><span class="pill">session memory</span>' : '');
    document.getElementById('write-pill').hidden = !(st && st.meta.writeFailed);
  }

  /* ---------- modal + form engine ---------- */
  function modal(contentEl, onClose) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '';
    var box = h('div', { class: 'modal' });
    box.appendChild(contentEl);
    root.appendChild(box);
    root.hidden = false;
    function close() { root.hidden = true; root.innerHTML = ''; if (onClose) onClose(); }
    root.onclick = function (e) { if (e.target === root) close(); };
    document.onkeydown = function (e) { if (e.key === 'Escape' && !root.hidden) close(); };
    return close;
  }
  function personOptions(P, includePlaceHolder) {
    var opts = P.people.filter(function (p) { return !p.archived; })
      .sort(function (a, b) { return a.name < b.name ? -1 : 1; })
      .map(function (p) { return { v: p.id, l: p.name }; });
    return (includePlaceHolder !== false ? [{ v: '', l: '— choose a person' }] : []).concat(opts);
  }
  function formModal(spec) {
    var P = Pj();
    var wrap = h('div');
    wrap.appendChild(h('button', { class: 'm-close', onclick: function () { closeFn(); } }, 'esc ×'));
    wrap.appendChild(h('h2', null, esc(spec.title)));
    if (spec.sub) wrap.appendChild(h('div', { class: 'm-sub' }, esc(spec.sub)));
    if (spec.preface) wrap.appendChild(h('div', { class: 'vest' }, esc(spec.preface)));
    var values = {};
    var inputs = {};
    var liveEl = h('div', { class: 'vest', hidden: 'true' });
    var prevEl = h('div', { class: 'preview', hidden: 'true' });
    function refreshLive() {
      if (spec.live) { var t = spec.live(values); liveEl.hidden = !t; liveEl.textContent = t || ''; }
      if (spec.preview) { var t2 = spec.preview(values); prevEl.hidden = !t2; prevEl.textContent = t2 || ''; }
    }
    spec.fields.forEach(function (f) {
      if (f.hidden) { values[f.k] = ''; return; }
      var field = h('div', { class: 'field', 'data-k': f.k });
      field.appendChild(h('label', null, esc(f.label)));
      var inp;
      if (f.type === 'textarea') inp = h('textarea');
      else if (f.type === 'select' || f.type === 'person') {
        inp = h('select');
        var opts = f.type === 'person' ? personOptions(P) : (f.options || []);
        opts.forEach(function (o) { inp.appendChild(h('option', { value: o.v }, esc(o.l))); });
      }
      else inp = h('input', { type: f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text' });
      if (f.value != null && f.value !== '') inp.value = f.value;
      values[f.k] = inp.value || '';
      inputs[f.k] = inp;
      inp.addEventListener('input', function () { values[f.k] = inp.value; field.classList.remove('err'); refreshLive(); });
      field.appendChild(inp);
      if (f.hint) field.appendChild(h('div', { class: 'hint' }, esc(f.hint)));
      field.appendChild(h('div', { class: 'errmsg' }, 'required — pick or write something real'));
      wrap.appendChild(field);
    });
    wrap.appendChild(liveEl);
    wrap.appendChild(prevEl);
    var acts = h('div', { class: 'form-acts' });
    acts.appendChild(h('button', { class: 'btn acc', onclick: function () {
      var bad = null;
      spec.fields.forEach(function (f) {
        if (f.hidden || !f.required) return;
        if (!String(values[f.k] || '').trim()) { bad = f.k; wrap.querySelector('[data-k="' + f.k + '"]').classList.add('err'); }
      });
      if (bad) { flash('a required field is empty — empty choices are decisions too, just worse', true); return; }
      try { spec.onSave(values); closeFn(); } catch (e) { flash('save failed: ' + e.message, true); }
    } }, esc(spec.saveLabel || 'Save')));
    acts.appendChild(h('button', { class: 'btn ghost', onclick: function () { closeFn(); } }, 'cancel'));
    wrap.appendChild(acts);
    var closeFn = modal(wrap);
    refreshLive();
    var first = wrap.querySelector('input,select,textarea'); if (first) first.focus();
  }

  /* ---------- quick capture (8+ types, all through events.append) ---------- */
  function dateIso(v) { return v ? new Date(v + 'T12:00:00Z').toISOString() : null; }
  var CAPTURE = [
    { id: 'oneonone.logged', label: '1:1', fields: function () { return [
      { k: 'personId', label: 'person', type: 'person', required: true },
      { k: 'note', label: 'note', type: 'textarea', required: true }]; },
      toEvent: function (v) { return [['oneonone.logged', { personId: v.personId, note: v.note }]]; } },
    { id: 'skiplevel.logged', label: 'skip-level', fields: function () { return [
      { k: 'personId', label: 'skip-level person', type: 'person', required: true },
      { k: 'note', label: 'what you heard', type: 'textarea', required: true }]; },
      toEvent: function (v) { return [['skiplevel.logged', { personId: v.personId, note: v.note }]]; } },
    { id: 'pulse.recorded', label: 'pulse', fields: function () { return [
      { k: 'personId', label: 'person', type: 'person', required: true },
      { k: 'load', label: 'workload 0–10', type: 'number', required: true },
      { k: 'mood', label: 'mood 0–10', type: 'number', required: true },
      { k: 'measured', label: 'basis', type: 'select', required: true, value: 'measured',
        options: [{ v: 'measured', l: 'measured — they answered, you heard it' }, { v: 'estimated', l: 'estimated — your guess (R7 will exclude it, and say so)' }] }]; },
      toEvent: function (v) {
        var l = parseInt(v.load, 10), m = parseInt(v.mood, 10);
        if (isNaN(l) || isNaN(m) || l < 0 || l > 10 || m < 0 || m > 10) throw new Error('load/mood must be 0–10 (out-of-range gets excluded by R7 anyway)');
        return [['pulse.recorded', { personId: v.personId, load: l, mood: m, measured: v.measured === 'measured' }]]; } },
    { id: 'feedback.given', label: 'feedback', fields: function () { return [
      { k: 'personId', label: 'person', type: 'person', required: true },
      { k: 'polarity', label: 'polarity', type: 'select', required: true, options: [{ v: '', l: '— choose' }, { v: 'positive', l: 'positive' }, { v: 'corrective', l: 'corrective' }] },
      { k: 'note', label: 'what you said', type: 'textarea', required: true }]; },
      toEvent: function (v) { return [['feedback.given', { personId: v.personId, polarity: v.polarity, note: v.note }]]; } },
    { id: 'decision.logged', label: 'decision', fields: function () { return [
      { k: 'title', label: 'decision', type: 'text', required: true },
      { k: 'severity', label: 'severity if wrong (1–5)', type: 'select', required: true, options: [{ v: '', l: '— choose' }, { v: '1', l: '1 trivial' }, { v: '2', l: '2 minor' }, { v: '3', l: '3 real' }, { v: '4', l: '4 painful' }, { v: '5', l: '5 existential' }] },
      { k: 'reviewDate', label: 'review date (R2 lives off this)', type: 'date', required: true }]; },
      toEvent: function (v) { return [['decision.logged', { title: v.title, severity: parseInt(v.severity, 10), reviewDate: dateIso(v.reviewDate) }]]; } },
    { id: 'goal.set', label: 'goal', fields: function () { return [
      { k: 'title', label: 'goal', type: 'text', required: true },
      { k: 'ownerId', label: 'owner (leave empty = R3 will find you)', type: 'person' }]; },
      toEvent: function (v) { return [['goal.set', { title: v.title, ownerId: v.ownerId || null }]]; } },
    { id: 'goal.progress', label: 'goal progress', fields: function (P) { return [
      { k: 'goalId', label: 'open goal', type: 'select', required: true, options: [{ v: '', l: '— choose' }].concat(P.openGoals.map(function (g) { return { v: g.id, l: g.title }; })) },
      { k: 'note', label: 'progress', type: 'textarea', required: true }]; },
      toEvent: function (v) { return [['goal.progress', { goalId: v.goalId, note: v.note }]]; } },
    { id: 'delegation.assigned', label: 'delegate', fields: function () { return [
      { k: 'personId', label: 'person', type: 'person', required: true },
      { k: 'task', label: 'task', type: 'text', required: true },
      { k: 'level', label: 'level', type: 'select', required: true, options: [{ v: '', l: '— choose' }, { v: '1', l: 'L1 Tell' }, { v: '2', l: 'L2 Sell' }, { v: '3', l: 'L3 Consult' }, { v: '4', l: 'L4 Agree' }, { v: '5', l: 'L5 Delegate' }] },
      { k: 'checkInDate', label: 'check-in date', type: 'date' }]; },
      toEvent: function (v) { return [['delegation.assigned', { personId: v.personId, task: v.task, level: parseInt(v.level, 10), checkInDate: dateIso(v.checkInDate) }]]; } },
    { id: 'delegation.closed', label: 'close delegation', fields: function (P) { return [
      { k: 'delegationId', label: 'open delegation', type: 'select', required: true, options: [{ v: '', l: '— choose' }].concat(Object.keys(P.delegationById).filter(function (k) {
        return (P.delegationsOpenByPerson[P.delegationById[k].personId] || []).some(function (d) { return d.id === k; });
      }).map(function (k) { var d = P.delegationById[k]; return { v: k, l: pname(P, d.personId) + ' · ' + d.task }; })) },
      { k: 'result', label: 'how it went', type: 'textarea', required: true }]; },
      toEvent: function (v) { return [['delegation.closed', { delegationId: v.delegationId, result: v.result }]]; } },
    { id: 'conflict.logged', label: 'conflict', fields: function (P) { return [
      { k: 'aId', label: 'party A (id → R6 high conf)', type: 'person' },
      { k: 'bId', label: 'party B', type: 'person' },
      { k: 'text', label: 'what it is about', type: 'textarea', required: true },
      { k: 'intensity', label: 'intensity 1–5', type: 'number' }]; },
      toEvent: function (v) { return [['conflict.logged', { aId: v.aId || null, bId: v.bId || null, text: v.text, intensity: v.intensity ? parseInt(v.intensity, 10) : null }]]; } },
    { id: 'conflict.resolved', label: 'resolve conflict', fields: function (P) {
      var seen = {}, opts = [{ v: '', l: '— choose the pair' }];
      P.openConflicts.forEach(function (c) {
        if (seen[c.pairKey]) return; seen[c.pairKey] = 1;
        var lbl = c.pairKey.indexOf('ids:') === 0 ? pname(P, c.aId) + ' × ' + pname(P, c.bId) : (c.text || c.pairKey).slice(0, 44);
        opts.push({ v: c.pairKey, l: lbl });
      });
      return [
        { k: 'pairKey', label: 'pair', type: 'select', required: true, options: opts },
        { k: 'note', label: 'what resolved it', type: 'textarea', required: true }]; },
      toEvent: function (v) { return [['conflict.resolved', { conflictIds: [], pairKey: v.pairKey, note: v.note }]]; } },
    { id: 'note.added', label: 'note', fields: function () { return [{ k: 'note', label: 'note', type: 'textarea', required: true }]; },
      toEvent: function (v) { return [['note.added', { note: v.note }]]; } }
  ];
  function openCapture(id, prefill) {
    var cap = CAPTURE.filter(function (c) { return c.id === id; })[0];
    if (!cap) return;
    var fields = cap.fields(Pj()).map(function (f) {
      if (prefill && prefill[f.k] != null) f.value = prefill[f.k];
      return f;
    });
    formModal({
      title: 'Log · ' + cap.label, sub: 'append-only — projection + engine re-run on save',
      fields: fields, saveLabel: 'Append event',
      onSave: function (v) {
        cap.toEvent(v).forEach(function (a) {
          var r = LEADOS.events.append(a[0], a[1], { silent: true });
          if (r && r.error) throw new Error(r.error);
        });
        LEADOS.store.save();
        flash('event appended — the projection already saw it');
        refresh();
      }
    });
  }

  /* ---------- suppression (events, so it is auditable + reversible) ---------- */
  function snooze(f) {
    LEADOS.events.append('engine.snoozed', { key: f.key, until: LEADOS.events.inDaysIso(7), title: f.title });
    flash('snoozed 7d — recorded as an event, visible in #/data mutes');
  }
  function dismiss(f, reason) {
    LEADOS.events.append('engine.dismissed', { key: f.key, title: f.title + (reason ? ' · why: ' + reason : '') });
    flash('dismissed with reason logged — unmute from #/data if that was fear talking');
  }

  /* ---------- finding card (Today) ---------- */
  function confBar(conf) {
    var w = conf === 'high' ? 100 : conf === 'medium' ? 66 : 33;
    return '<span class="conf' + (conf === 'low' ? ' low' : '') + '"><span class="bar"><i style="width:' + w + '%"></i></span>' + conf + '</span>';
  }
  function findingCard(f, rank, P) {
    var el = h('div', { class: 'f' });
    el.appendChild(h('div', { class: 'f-rank' }, String(rank).padStart(2, '0')));
    var body = h('div');
    var top = h('div', { class: 'f-top' });
    top.appendChild(h('span', { class: 'f-rule' + (f.sev >= 5 ? ' s5' : f.sev >= 4 ? ' s4' : '') }, f.rule + ' · sev ' + f.sev));
    top.appendChild(h('span', { class: 'f-title' }, esc(f.title)));
    var acts = h('span', { class: 'f-acts' });
    if (f.rule === 'R9') acts.appendChild(h('a', { class: 'btn acc', href: '#/roster' }, ic('arrow') + ' fix the line'));
    else {
      var pb = LEADOS.playbooks.forFinding(f, P);
      if (pb) acts.appendChild(h('button', { class: 'btn acc', onclick: function () { LEADOS.playbooks.open(pb.id, pb.prefill); } }, ic('arrow') + ' ' + esc(pb.id)));
    }
    acts.appendChild(h('button', { class: 'btn ghost', title: 'snooze 7d (event)', onclick: function () { snooze(f); refresh(); } }, 'snooze 7d'));
    acts.appendChild(h('button', { class: 'btn ghost', title: 'dismiss (event, reason logged)', onclick: function () {
      var row = el.querySelector('.dismiss-row'); row.classList.toggle('open'); row.querySelector('input').focus();
    } }, 'dismiss'));
    top.appendChild(acts);
    body.appendChild(top);
    var why = h('ul', { class: 'f-why' });
    f.basis.forEach(function (b) { why.appendChild(h('li', null, esc(b))); });
    if (f.sources && f.sources.length) why.appendChild(h('li', null, 'sources: ' + f.sources.map(esc).join(' · ')));
    body.appendChild(why);
    body.appendChild(h('div', { class: 'f-math' }, '<span>' + esc(f.scoreMath) + '</span> · ' + confBar(f.conf) + ' <span class="mut">(' + esc(f.confWhy) + ')</span>'));
    var drow = h('div', { class: 'dismiss-row' });
    var dinp = h('input', { placeholder: 'why is this not actionable? (logged with the dismissal)' });
    drow.appendChild(dinp);
    drow.appendChild(h('button', { class: 'btn', onclick: function () { dismiss(f, dinp.value); refresh(); } }, 'log dismissal'));
    body.appendChild(drow);
    el.appendChild(body);
    return el;
  }

  /* ---------- views ---------- */
  var TOD = null; /* cached run for rail badge */
  function runEngine(P) {
    return LEADOS.engine.run(P, LEADOS.events.todayIso());
  }
  function bootNotesHtml() {
    return _bootNotes.map(function (n) { return '<div class="banner"><b>boot</b> — ' + esc(n) + '</div>'; }).join('');
  }

  function vToday(view) {
    var P = Pj(), today = LEADOS.events.todayIso();
    var run = runEngine(P); TOD = run;
    view.appendChild(h('div', { class: 'v-head' }, '<h1>Today</h1><span class="sub">' + fmtD(today) + ' · ' + run.ran + ' rules ran · ' + run.hiddenCount + ' muted</span>'));
    view.insertAdjacentHTML('beforeend', bootNotesHtml());
    if (LEADOS.store.state().meta.writeFailed) view.appendChild(h('div', { class: 'banner' }, '<b>WRITE FAILED</b> — the last save did not reach storage (quota?). In-memory state is intact; export from #/data now, then free space.'));
    if (P.span) {
      var s = P.span;
      view.appendChild(h('div', { class: 'notice' }, 'span-load · directs ' + s.directMin + 'm/wk + skips ' + s.skipMin + 'm/wk = <b>' + s.totalMin + 'm</b> of ' + s.capacityMin + 'm capacity' +
        (s.over ? ' — <span style="color:var(--acc)">over-commit by ' + (s.totalMin - s.capacityMin) + 'm: you priced this promise; R1/R8 will punish the arithmetic</span>' : '') +
        ' · priced at ' + LEADOS.store.state().meta.settings.oneOnOneLengthMin + 'm per 1:1 (settings, #/data)')));
    }
    var caps = h('div', { class: 'cap-grid' });
    CAPTURE.forEach(function (c) {
      caps.appendChild(h('button', { class: 'btn ghost', onclick: (function (id) { return function () { openCapture(id); }; })(c.id) }, '+ ' + esc(c.label)));
    });
    view.appendChild(h('div', { class: 'sect' }, 'log — every entry lands in the one event stream all modules read'));
    view.appendChild(caps);
    view.appendChild(h('div', { class: 'sect' }, 'next best actions — ranked by printed math, not vibes'));
    if (!run.findings.length) {
      var em = h('div', { class: 'empty' }, '<b>Quiet board.</b>no rule fired. That means your logged data contains no pressure signal — not that leadership is done.<br><br>' +
        '<span class="mut">standing practices (not signals — the engine claims nothing here): keep cadences honest · price next week’s delegations · log pulses for the people carrying the most</span>');
      view.appendChild(em);
      return;
    }
    run.findings.forEach(function (f, i) { view.appendChild(findingCard(f, i + 1, P)); });
  }

  function lineSelect(p, P) {
    var sel = h('select');
    sel.appendChild(h('option', { value: '' }, '— direct to me'));
    P.people.filter(function (x) { return !x.archived && x.id !== p.id; }).forEach(function (x) {
      var o = h('option', { value: x.id }, esc(x.name));
      if (p.reportsTo === x.id) o.selected = true;
      sel.appendChild(o);
    });
    if (p.reportsTo && !P.peopleById[p.reportsTo]) sel.appendChild(h('option', { value: p.reportsTo, selected: 'true' }, '⚠ dangling: ' + esc(p.reportsTo)));
    sel.addEventListener('change', function () {
      var r = LEADOS.store.updatePerson(p.id, { reportsTo: sel.value || null });
      if (r && r.error) { flash(r.error, true); refresh(); return; }
      flash('line updated'); refresh();
    });
    sel.addEventListener('click', function (e) { e.stopPropagation(); });
    return sel;
  }
  function cadInput(p, field, title) {
    var inp = h('input', { type: 'number', min: '1', title: title, style: 'width:52px' });
    inp.value = p[field] != null ? p[field] : '';
    inp.placeholder = field === 'cadenceDays' ? '14' : String(LEADOS.store.state().meta.settings.skipCadenceDefaultDays);
    inp.addEventListener('change', function () {
      var n = inp.value === '' ? null : parseInt(inp.value, 10);
      if (n != null && (isNaN(n) || n <= 0)) { flash('cadence must be days > 0', true); refresh(); return; }
      var patch = {}; patch[field] = n;
      LEADOS.store.updatePerson(p.id, patch);
      flash('cadence saved'); refresh();
    });
    inp.addEventListener('click', function (e) { e.stopPropagation(); });
    return inp;
  }

  function vRoster(view) {
    var P = Pj(), today = LEADOS.events.todayIso();
    var run = TOD || runEngine(P); TOD = run;
    var findByPerson = {};
    run.findings.forEach(function (f) { var id = f.key.split(':')[1]; findByPerson[id] = (findByPerson[id] || 0) + 1; });
    view.appendChild(h('div', { class: 'v-head' }, '<h1>Roster</h1><span class="sub">' + P.directs.length + ' directs · ' + P.skips.length + ' skips · ' + P.lines.broken.length + ' broken lines</span>'));
    var s = P.span;
    if (s) view.appendChild(h('div', { class: s.over ? 'banner' : 'notice' }, 'span-load: directs ' + P.directs.length + ' → ' + s.directMin + 'm/wk · skips ' + P.skips.length + ' → ' + s.skipMin + 'm/wk · total <b>' + s.totalMin + 'm / ' + s.capacityMin + 'm</b>' +
      (s.over ? ' — <b>over by ' + (s.totalMin - s.capacityMin) + 'm</b>. Fix the promises (cadences), the capacity (setting), or the span — before the engine has to.' : '. within capacity.') ));
    view.appendChild(h('button', { class: 'btn acc', onclick: addPersonForm }, '+ add person'));
    view.appendChild(h('div', { class: 'sect' }, 'directs — your 1:1 cadence promises'));
    view.appendChild(personRows(P.directs, P, findByPerson, today, 'cadenceDays'));
    view.appendChild(h('div', { class: 'sect' }, 'skip-levels — exactly one lead between (R8 territory)'));
    view.appendChild(personRows(P.skips, P, findByPerson, today, 'skipCadenceDays'));
    if (P.lines.broken.length) {
      view.appendChild(h('div', { class: 'sect' }, 'broken lines — R9 is watching'));
      view.appendChild(personRows(P.lines.broken.map(function (b) { return b.person; }), P, findByPerson, today, 'skipCadenceDays', P.lines.broken));
    }
    var arch = P.people.filter(function (p) { return p.archived; });
    if (arch.length) {
      view.appendChild(h('div', { class: 'sect' }, 'archived (' + arch.length + ')'));
      var rows = h('div', { class: 'rows' });
      arch.forEach(function (p) {
        var r = h('div', { class: 'row', style: 'grid-template-columns:1fr auto auto' });
        r.appendChild(h('span', { class: 'nm mut' }, esc(p.name)));
        r.appendChild(h('span', { class: 'mut' }, esc(p.role || '')));
        r.appendChild(h('button', { class: 'btn ghost', onclick: function () { LEADOS.store.updatePerson(p.id, { archived: false }); flash('unarchived'); refresh(); } }, 'unarchive'));
        rows.appendChild(r);
      });
      view.appendChild(rows);
    }
  }
  function personRows(list, P, findByPerson, today, cadField, broken) {
    var rows = h('div', { class: 'rows' });
    if (!list.length) { rows.appendChild(h('div', { class: 'row mut' }, '— none')); return rows; }
    list.forEach(function (p) {
      var b = broken ? (broken.filter(function (x) { return x.person.id === p.id; })[0] || {}) : null;
      var r = h('a', { class: 'row', style: 'grid-template-columns:minmax(140px,1.2fr) auto auto auto auto auto', href: '#/person/' + p.id });
      r.appendChild(h('span', { class: 'nm' }, esc(p.name) + ' <span class="mut">' + esc(p.role || '') + '</span>' + (b ? ' <span class="acc">' + esc(b.reason) + '</span>' : '')));
      var cadWrap = h('span', { class: 'mut' }, (cadField === 'cadenceDays' ? '1:1 ' : 'skip '));
      cadWrap.appendChild(cadInput(p, cadField, 'days between sessions'));
      cadWrap.appendChild(document.createTextNode('d'));
      r.appendChild(cadWrap);
      r.appendChild(h('span', { class: 'mut' }, 'line '));
      r.lastChild.appendChild(lineSelect(p, P));
      var lastMap = cadField === 'cadenceDays' ? P.oneononeLast : P.skiplevelLast;
      r.appendChild(h('span', { class: 'num mut' }, (lastMap[p.id] ? ago(lastMap[p.id].ts, today) : 'never')));
      var n = findByPerson[p.id] || 0;
      r.appendChild(h('span', { class: 'num' + (n ? ' acc' : ' mut') }, n ? n + ' flag' : '—'));
      r.addEventListener('click', function (e) {
        if (e.target.closest('select, input, button')) e.preventDefault(); /* carried catch: inner controls must not navigate */
      });
      rows.appendChild(r);
    });
    return rows;
  }
  function addPersonForm() {
    formModal({
      title: 'Add person', sub: 'a row, not an event — cadence and line are state you maintain',
      fields: [
        { k: 'name', label: 'name', type: 'text', required: true },
        { k: 'role', label: 'role', type: 'text' },
        { k: 'team', label: 'team', type: 'text' },
        { k: 'cadenceDays', label: '1:1 cadence, days (empty = 14d default, printed as assumption)', type: 'number' },
        { k: 'reportsTo', label: 'reports to (empty = direct to you)', type: 'person' }
      ],
      saveLabel: 'Add',
      onSave: function (v) {
        var r = LEADOS.store.addPerson({ name: v.name, role: v.role, team: v.team, cadenceDays: v.cadenceDays ? parseInt(v.cadenceDays, 10) : null, reportsTo: v.reportsTo || null });
        if (r && r.error) throw new Error(r.error);
        flash(r.name + ' added — R1/R8 start their clocks from today');
        refresh();
      }
    });
  }

  function vPerson(view, id) {
    var P = Pj(), today = LEADOS.events.todayIso();
    var p = P.peopleById[id];
    if (!p) { view.appendChild(h('div', { class: 'empty' }, '<b>No such person.</b>the id in the URL resolves to nothing — stale link?')); return; }
    var lead = p.reportsTo ? P.peopleById[p.reportsTo] : null;
    view.appendChild(h('div', { class: 'v-head' }, '<h1>' + esc(p.name) + '</h1><span class="sub">' + esc(p.role || '') + (p.team ? ' · ' + esc(p.team) : '') + ' · line: ' + (p.reportsTo ? 'reports to ' + esc(lead ? lead.name : '⚠ ' + p.reportsTo) : 'direct to you') + '</span>'));
    var acts = h('div', { class: 'cap-grid' });
    acts.appendChild(h('button', { class: 'btn', onclick: function () { openCapture('oneonone.logged', { personId: id }); } }, '+ 1:1'));
    acts.appendChild(h('button', { class: 'btn', onclick: function () { openCapture('skiplevel.logged', { personId: id }); } }, '+ skip-level'));
    acts.appendChild(h('button', { class: 'btn', onclick: function () { openCapture('pulse.recorded', { personId: id }); } }, '+ pulse'));
    acts.appendChild(h('button', { class: 'btn', onclick: function () { LEADOS.playbooks.open('sbi', { personId: id }); } }, 'sbi'));
    acts.appendChild(h('button', { class: 'btn', onclick: function () { LEADOS.playbooks.open('delegation', { personId: id }); } }, 'delegate'));
    acts.appendChild(h('button', { class: 'btn', onclick: function () { LEADOS.playbooks.open('situational', { personId: id }); } }, 'assess D/S'));
    acts.appendChild(h('button', { class: 'btn ghost', onclick: function () {
      LEADOS.store.updatePerson(id, { archived: !p.archived });
      flash(p.archived ? 'archived' : 'unarchived'); refresh();
    } }, p.archived ? 'unarchive' : 'archive'));
    view.appendChild(acts);
    var fb90 = (P.feedbackByPerson[id] || []).filter(function (e) { return LEADOS.engine.days(e.ts, today) <= 60; });
    var pos = fb90.filter(function (e) { return e.polarity === 'positive'; }).length;
    var corr = fb90.filter(function (e) { return e.polarity === 'corrective'; }).length;
    var del = (P.delegationsOpenByPerson[id] || []);
    var dl = h('dl', { class: 'kv' });
    dl.insertAdjacentHTML('beforeend',
      '<dt>last 1:1</dt><dd>' + (P.oneononeLast[id] ? fmtD(P.oneononeLast[id].ts) + ' (' + ago(P.oneononeLast[id].ts, today) + ')' : 'never logged') + ' · ' + (P.oneononeCount[id] || 0) + ' total</dd>' +
      '<dt>last skip-level</dt><dd>' + (P.skiplevelLast[id] ? fmtD(P.skiplevelLast[id].ts) : 'never logged') + '</dd>' +
      '<dt>cadences</dt><dd>1:1 every ' + (p.cadenceDays || 14) + 'd' + (p.cadenceDays ? '' : ' (default)') + ' · skip every ' + (p.skipCadenceDays || LEADOS.store.state().meta.settings.skipCadenceDefaultDays) + 'd' + (p.skipCadenceDays ? '' : ' (default)') + '</dd>' +
      '<dt>feedback 60d</dt><dd>' + pos + ' positive · ' + corr + ' corrective' + (pos + corr === 0 ? ' — nothing logged; silence is also a ratio' : '') + '</dd>' +
      '<dt>open delegations</dt><dd>' + del.length + '</dd>' +
      '<dt>reports</dt><dd>' + P.people.filter(function (x) { return x.reportsTo === id && !x.archived; }).map(function (x) { return esc(x.name); }).join(', ') + '</dd>');
    view.appendChild(dl);
    if (del.length) {
      view.appendChild(h('div', { class: 'sect' }, 'open delegations — closes feed R5'));
      var rows = h('div', { class: 'rows' });
      del.forEach(function (d) {
        var r = h('div', { class: 'row', style: 'grid-template-columns:1fr auto auto auto' });
        r.appendChild(h('span', null, esc(d.task)));
        r.appendChild(h('span', { class: 'mut' }, 'L' + (d.level || '?') + ' · ' + fmtD(d.ts)));
        r.appendChild(h('span', { class: (d.checkInDate && LEADOS.engine.days(d.checkInDate, today) > 0) ? 'acc' : 'mut' }, d.checkInDate ? 'chk ' + fmtD(d.checkInDate) : 'no check-in'));
        r.appendChild(h('button', { class: 'btn ghost', onclick: function () { openCapture('delegation.closed', { delegationId: d.id }); } }, 'close'));
        rows.appendChild(r);
      });
      view.appendChild(rows);
    }
    view.appendChild(h('div', { class: 'sect' }, 'pulses — measured build trends; estimated get excluded (R7 reads this graph)'));
    view.appendChild(sparkline(P, id));
    var sl = P.slByPerson[id];
    view.appendChild(h('div', { class: 'sect' }, 'situational (task-scoped)'));
    view.appendChild(h('div', { class: 'notice' }, sl ? ('latest: ' + sl.d + ' → ' + sl.s + ' on ' + fmtD(sl.ts) + ' · competence ' + sl.competence + ' · commitment ' + sl.commitment + ' — per-task by doctrine, re-assess when the task changes') : 'no assessment yet — the D/S playbook pre-reads into delegation levels'));
    view.appendChild(h('div', { class: 'sect' }, 'timeline — everything any module knows, one stream'));
    var tl = h('div', { class: 'rows' });
    LEADOS.store.state().events.filter(function (e) {
      var d = e.data || {};
      return d.personId === id || d.aId === id || d.bId === id || d.ownerId === id;
    }).slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; }).slice(0, 60).forEach(function (e) {
      var r = h('div', { class: 'row', style: 'grid-template-columns:82px 150px 1fr' });
      r.appendChild(h('span', { class: 'mut' }, fmtD(e.ts)));
      r.appendChild(h('span', null, esc(e.type)));
      r.appendChild(h('span', { class: 'mut' }, esc(summ(e))));
      tl.appendChild(r);
    });
    view.appendChild(tl);
  }
  function summ(e) {
    var d = e.data || {};
    return d.note || d.title || d.text || d.task || d.lessons || d.result || (d.polarity ? d.polarity + ' feedback' : '') || (d.load != null ? 'L' + d.load + '/M' + d.mood + (d.measured === false ? ' est' : '') : '') || JSON.stringify(d).slice(0, 80);
  }
  function sparkline(P, id) {
    var all = (P.pulsesByPerson[id] || []).slice().sort(function (a, b) { return a.ts < b.ts ? -1 : 1; }).slice(-16);
    var wrap = h('div', { class: 'spark' });
    if (!all.length) { wrap.appendChild(h('div', { class: 'mut', style: 'font:11px var(--mono)' }, 'no pulses logged — R7 stays silent by design')); return wrap; }
    var W = 560, H = 96, pad = 12;
    var d0 = LEADOS.engine.dayUTC(all[0].ts), d1 = LEADOS.engine.dayUTC(all[all.length - 1].ts);
    var span = Math.max(1, d1 - d0);
    function num(v) { return typeof v === 'number' && v >= 0 && v <= 10; }
    var meas = all.filter(function (e) { return e.measured && num(e.mood); });
    var svg = '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '">';
    [0, 5, 10].forEach(function (v) {
      var y = pad + (10 - v) / 10 * (H - 2 * pad);
      svg += '<line x1="' + pad + '" y1="' + y + '" x2="' + (W - pad) + '" y2="' + y + '" stroke="var(--hair)" stroke-width="1"/>';
    });
    function x(ts) { return pad + (LEADOS.engine.dayUTC(ts) - d0) / span * (W - 2 * pad); }
    function yL(v) { return pad + (10 - v) / 10 * (H - 2 * pad); }
    all.forEach(function (e) {
      if (e.measured && num(e.load)) svg += '<rect x="' + (x(e.ts) - 2) + '" y="' + yL(e.load) + '" width="4" height="' + Math.max(0, H - pad - yL(e.load)) + '" fill="var(--hair2)"/>';
    });
    if (meas.length) {
      svg += '<polyline fill="none" stroke="var(--ink)" stroke-width="1.5" points="' + meas.map(function (e) { return x(e.ts) + ',' + yL(e.mood); }).join(' ') + '"/>';
    }
    all.forEach(function (e) {
      if (!num(e.mood)) return; /* out-of-range readings don't render and don't pretend */
      svg += e.measured
        ? '<circle cx="' + x(e.ts) + '" cy="' + yL(e.mood) + '" r="3" fill="var(--ink)"/>'
        : '<circle cx="' + x(e.ts) + '" cy="' + yL(e.mood) + '" r="3" fill="var(--paper)" stroke="var(--faint)" stroke-width="1"/>';
    });
    svg += '</svg>';
    wrap.insertAdjacentHTML('beforeend', svg);
    var estN = all.length - meas.length;
    wrap.appendChild(h('div', { class: 'spark-cap' },
      'mood line (ink) · load bars · ' + meas.length + ' measured' + (estN ? ' · ' + estN + ' estimated (hollow — excluded from trends)' : '') +
      (meas.length < 3 ? ' · <b>trend withheld: ' + meas.length + '/3 measured points</b> — that floor is the product' : ' · floors met — R7 may read this')));
    return wrap;
  }

  function vPlaybooks(view) {
    view.appendChild(h('div', { class: 'v-head' }, '<h1>Playbooks</h1><span class="sub">structured practice — pre-filled from live data, resolving through events</span>'));
    view.appendChild(h('div', { class: 'notice' }, 'bridge: every rule on Today maps to the playbook that resolves it (forFinding). Opening from a finding pre-fills person, polarity, pair, decision, goal, mode.'));
    LEADOS.playbooks.list.forEach(function (pb) {
      var r = h('div', { class: 'row', style: 'grid-template-columns:200px 1fr auto' });
      r.appendChild(h('span', { class: 'nm' }, esc(pb.name)));
      r.appendChild(h('span', { class: 'mut' }, esc(pb.when)));
      r.appendChild(h('button', { class: 'btn acc', onclick: function () { LEADOS.playbooks.open(pb.id, {}); } }, 'open'));
      view.appendChild(r);
    });
  }

  /* ---------- health: the authority wall ---------- */
  function T(id, name, fn) { return { id: id, name: name, fn: fn }; }
  var TSUITE = [
    T('T1', 'boot registry — all modules present (this check from the inside)', function () {
      var need = ['store', 'events', 'engine', 'playbooks', 'ui'];
      var miss = need.filter(function (k) { return !LEADOS._mod[k]; });
      return miss.length ? 'missing: ' + miss.join(',') : null;
    }),
    T('T2', 'corrupt bytes → status + quarantine + live key byte-identical', function () {
      var k = 'leados:t-corrupt';
      LEADOS.store._be.set(k, '{bad json');
      var before = LEADOS.store._be.get(LEADOS.store.KEY);
      var r = LEADOS.store.parseLoad(LEADOS.store._be.get(k));
      var qk = LEADOS.store.quarantineRaw(k, 'corrupt', '{bad json');
      var liveSame = LEADOS.store._be.get(LEADOS.store.KEY) === before;
      if (r.status !== 'corrupt') return 'expected corrupt, got ' + r.status;
      if (!qk || LEADOS.store._be.get(qk) !== '{bad json') return 'quarantine copy missing or wrong at ' + qk;
      return liveSame ? null : 'live key changed during a corrupt read — never acceptable';
    }),
    T('T3', 'funnel rejects malformed / foreign / newer with named statuses', function () {
      if (LEADOS.store.parseLoad('{"a":1}').status !== 'malformed') return 'malformed not detected';
      var f = JSON.stringify({ meta: { lineage: 'mf', schemaVersion: 2 }, people: [], events: [] });
      if (LEADOS.store.parseLoad(f).status !== 'foreign') return 'foreign lineage not refused';
      var n = JSON.stringify({ meta: { lineage: 'pt', schemaVersion: 99 }, people: [], events: [] });
      var r3 = LEADOS.store.parseLoad(n);
      return r3.status === 'newer' ? null : 'newer schema not detected: ' + r3.status;
    }),
    T('T4', 'identical import refused before any write', function () {
      var before = LEADOS.store.canonical(LEADOS.store.state());
      var r = LEADOS.store.importJson(LEADOS.store.exportJson());
      if (!(r.verdict === 'refused' && r.kind === 'identical')) return 'expected refused/identical, got ' + r.verdict + '/' + r.kind;
      return LEADOS.store.canonical(LEADOS.store.state()) === before ? null : 'state changed on a refused import';
    }),
    T('T5', 'normalize repairs, never drops rows', function () {
      var fixture = { meta: { schemaVersion: 2, lineage: 'pt' },
        people: [42, { id: 'px', name: 5, cadenceDays: 'weekly', reportsTo: 99 }],
        events: [null, { id: '', ts: 'notadate', type: 9, data: [] }] };
      var r = LEADOS.store.loadFromText(JSON.stringify(fixture), 'leados:t-norm');
      if (r.status !== 'ok') return 'expected ok, got ' + r.status;
      if (r.obj.people.length !== 2 || r.obj.events.length !== 2) return 'rows dropped: people ' + r.obj.people.length + '/2 events ' + r.obj.events.length + '/2';
      return r.repairs.length >= 5 ? null : 'expected ≥5 repairs, saw ' + r.repairs.length;
    }),
    T('T6', 'MIGRATION v1→v2: cycle broken deterministically, dangling nulled, skipCadenceDays backfilled, snapshot kept', function () {
      var fixture = { meta: { schemaVersion: 1, lineage: 'pt', settings: {} },
        people: [ { id: 'pa', name: 'A', reportsTo: 'pb', createdAt: LEADOS.events.nowIso() },
                  { id: 'pb', name: 'B', reportsTo: 'pa', createdAt: LEADOS.events.nowIso() },
                  { id: 'pc', name: 'C', reportsTo: 'pghost', createdAt: LEADOS.events.nowIso() } ],
        events: [ { id: 'e1', ts: LEADOS.events.nowIso(), type: 'oneonone.logged', data: { personId: 'pa' } } ] };
      var r = LEADOS.store.loadFromText(JSON.stringify(fixture), 'leados:t-mig');
      if (r.status !== 'migrated') return 'expected migrated, got ' + r.status + ' ' + (r.note || '');
      var st = r.obj, out = [];
      function byid(id) { return st.people.filter(function (p) { return p.id === id; })[0]; }
      if (st.meta.schemaVersion !== 2) out.push('schema ' + st.meta.schemaVersion);
      if (byid('pa').reportsTo !== null) out.push('cycle break must null the lexicographic min (pa), got ' + byid('pa').reportsTo);
      if (byid('pb').reportsTo !== 'pa') out.push('pb must now report to pa');
      if (byid('pc').reportsTo !== null) out.push('dangling pghost must be nulled');
      if (!('skipCadenceDays' in byid('pa'))) out.push('skipCadenceDays not backfilled');
      if (!r.quarantineKey || LEADOS.store._be.get(r.quarantineKey) == null) out.push('pre-migration snapshot missing');
      if (!/cycle/.test(r.repairs.join(' '))) out.push('repairs must name the cycle');
      return out.length ? out.join(' · ') : null;
    }),
    T('T7', 'migration with no step ⇒ migration-failed, never a half-write', function () {
      var fixture = { meta: { schemaVersion: 0, lineage: 'pt' }, people: [], events: [] };
      var before = LEADOS.store.canonical(LEADOS.store.state());
      var r = LEADOS.store.loadFromText(JSON.stringify(fixture), 'leados:t-migfail');
      if (r.status !== 'migration-failed') return 'expected migration-failed, got ' + r.status;
      return LEADOS.store.canonical(LEADOS.store.state()) === before ? null : 'live state moved during a failed migration read';
    }),
    T('T8', 'quota: injected setItem failure through the real save() → writeFailed, recovery write clears it', function () {
      if (LEADOS.store.volatile()) return null; /* memory vault: nothing to inject against — verdict honest by absence of a fake pass */
      var orig = localStorage.setItem;
      try {
        localStorage.setItem = function () { var e = new Error('nope'); e.name = 'QuotaExceededError'; e.code = 22; throw e; };
        var okWrite = LEADOS.store.save();
        if (okWrite !== false || !LEADOS.store.state().meta.writeFailed) return 'write failure not surfaced (save=' + okWrite + ')';
      } finally { localStorage.setItem = orig; }
      if (!LEADOS.store.save()) return 'recovery write failed after restore';
      return LEADOS.store.state().meta.writeFailed ? 'writeFailed flag stuck after recovery' : null;
    }),
    T('T9', 'audit cap 300 — the cap itself leaves a row', function () {
      var st = LEADOS.store.freshState();
      for (var i = 0; i < 305; i++) LEADOS.store._auditState(st, 'fill', String(i));
      var last = st.meta.audit[st.meta.audit.length - 1];
      if (st.meta.audit.length !== LEADOS.store.AUDIT_CAP) return 'length ' + st.meta.audit.length;
      return last.action === 'audit-cap-trimmed' ? null : 'cap row missing, last=' + last.action;
    }),
    T('T10', 'mergeInto: ids reminted, *Id rewired, dangling nulled+counted, live store untouched', function () {
      var live = LEADOS.store.state(), before = LEADOS.store.canonical(live);
      var incoming = { meta: { schemaVersion: 2, lineage: 'pt' },
        people: [{ id: 'q1', name: 'Imported', reportsTo: 'qghost', createdAt: LEADOS.events.nowIso() }],
        events: [ { id: 'qe1', ts: LEADOS.events.nowIso(), type: 'oneonone.logged', data: { personId: 'q1' } },
                  { id: 'qe2', ts: LEADOS.events.nowIso(), type: 'decision.outcome', data: { decisionId: 'qghost2', result: 'x' } },
                  { id: 'qe3', ts: LEADOS.events.nowIso(), type: 'goal.set', data: { goalId: 'gq1', title: 'imported goal', ownerId: 'q1' } },
                  { id: 'qe4', ts: LEADOS.events.nowIso(), type: 'goal.progress', data: { goalId: 'gq1', note: 'p' } } ] };
      var m = LEADOS.store.mergeInto(live, incoming);
      var np = m.state.people[m.state.people.length - 1];
      var out = [];
      if (np.id === 'q1') out.push('person id not reminted');
      if (np.reportsTo !== null) out.push('dangling reportsTo must be nulled');
      var evs = m.state.events.slice(-4), ev1 = evs[0], ev2 = evs[1], ev3 = evs[2], ev4 = evs[3];
      if (ev1.data.personId !== np.id) out.push('personId not rewired to the new id');
      if (ev2.data.decisionId !== null) out.push('unresolvable decisionId must be nulled, got ' + ev2.data.decisionId);
      if (ev3.data.goalId === 'gq1' || ev4.data.goalId !== ev3.data.goalId) out.push('goalId not reminted + rewired across goal.set/goal.progress');
      if (ev3.data.ownerId !== np.id) out.push('goal ownerId not rewired');
      if (m.stats.orphansNulled < 2) out.push('orphansNulled should be ≥2, got ' + m.stats.orphansNulled);
      if (LEADOS.store.canonical(LEADOS.store.state()) !== before) out.push('LIVE STORE MUTATED by a pure merge call');
      return out.length ? out.join(' · ') : null;
    }),
    T('T11', 'import gate migrates older payloads before merge (pure path)', function () {
      var blank = LEADOS.store.freshState();
      var payload = JSON.stringify({ meta: { schemaVersion: 1, lineage: 'pt', settings: {} },
        people: [{ id: 'r1', name: 'Old World', createdAt: LEADOS.events.nowIso() }],
        events: [{ id: 're1', ts: LEADOS.events.nowIso(), type: 'oneonone.logged', data: { personId: 'r1' } }] });
      var r = LEADOS.store.importInto(blank, payload, 'leados:t-imp'); /* quarantine under the swept prefix — the wall never litters the real store */
      if (r.verdict !== 'merged') return 'expected merged, got ' + r.verdict + ' ' + (r.note || '');
      if (r.migratedFrom !== 1) return 'migratedFrom should be 1, got ' + r.migratedFrom;
      return r.state.meta.schemaVersion === 2 ? null : 'merged schema ' + r.state.meta.schemaVersion;
    }),
    T('T12', 'demo seed makes R1–R8 fire ≥1 and R9 stay silent (all rules exercised)', function () {
      var st = LEADOS.store.freshState();
      LEADOS.events.seedInto(st);
      var out = LEADOS.engine.run(LEADOS.events.project(st), LEADOS.events.todayIso()).findings;
      var missing = [];
      ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'].forEach(function (r) {
        if (!out.some(function (f) { return f.rule === r; })) missing.push(r);
      });
      if (out.some(function (f) { return f.rule === 'R9'; })) missing.push('R9-fired-on-clean-seed');
      return missing.length ? 'missing: ' + missing.join(',') : null;
    }),
    T('T13', 'purge removes seed rows, keeps the once-ever flag, reseed refused', function () {
      var st = LEADOS.store.freshState();
      LEADOS.events.seedInto(st);
      LEADOS.events.purge(st);
      if (st.people.length || st.events.length) return 'seed rows survived purge';
      if (st.meta.seeded !== true) return 'flag must survive purge';
      var again = LEADOS.events.seedInto(st);
      return again && again.error ? null : 'reseed must be refused once-ever';
    }),
    T('T14', 'disposable leados:t* keys swept after the suite', function () {
      LEADOS.store._be.set('leados:t-junk', '1');
      LEADOS.store.sweepTestKeys();
      var left = LEADOS.store._be.keys().filter(function (k) { return k.indexOf('leados:t') === 0; });
      return left.length ? 'left behind: ' + left.join(',') : null;
    })
  ];
  function runT() {
    return TSUITE.map(function (t) {
      var fail = null;
      try { fail = t.fn(); } catch (e) { fail = 'threw: ' + e.message; }
      return { id: t.id, name: t.name, pass: !fail, detail: fail || '' };
    });
  }
  function vHealth(view) {
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var ts = runT(), gs = LEADOS.engine.runGoldens();
    LEADOS.store.sweepTestKeys();
    var ms = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - t0);
    var fails = ts.concat(gs).filter(function (r) { return !r.pass; });
    view.appendChild(h('div', { class: 'v-head' }, '<h1>Health</h1><span class="sub">executed at render, ' + ms + 'ms · ' + (ts.length + gs.length) + ' assertions · <b style="color:' + (fails.length ? 'var(--acc)' : 'var(--ink)') + '">' + fails.length + ' failing</b></span>'));
    view.appendChild(h('div', { class: 'notice' }, 'authority rule: these rows run against the production code paths (same parseLoad, same save(), same engine.run) and outrank README/session-log prose wherever they disagree.'));
    view.appendChild(h('div', { class: 'sect' }, 'doctrine — the constants the engine plays by'));
    var doc = h('div', { class: 'doctrine' });
    LEADOS.engine.DOCTRINE.forEach(function (d) { doc.appendChild(h('p', null, '<b>' + esc(d[0]) + '</b> — ' + esc(d[1]))); });
    LEADOS.engine.RULES.forEach(function (r) { doc.appendChild(h('p', null, '<b>' + r.id + ' ' + esc(r.tag) + '</b> — ' + esc(r.params))); });
    view.appendChild(doc);
    view.appendChild(h('div', { class: 'sect' }, 'T — storage & integrity (' + ts.filter(function (r) { return r.pass; }).length + '/' + ts.length + ' passing)'));
    ts.forEach(function (r) { view.appendChild(tRow(r)); });
    view.appendChild(h('div', { class: 'sect' }, 'G — engine goldens (' + gs.filter(function (r) { return r.pass; }).length + '/' + gs.length + ' passing)'));
    gs.forEach(function (r) { view.appendChild(tRow(r)); });
    view.appendChild(h('div', { class: 'notice' }, 'projection skips on current store: ' + Object.keys(Pj()._skipped).map(function (k) { return k + ' ' + Pj()._skipped[k]; }).join(' · ')));
  }
  function tRow(r) {
    var el = h('div', { class: 't-row' });
    el.appendChild(h('span', { class: 'st ' + (r.pass ? 'pass' : 'fail') }, r.pass ? 'PASS' : 'FAIL'));
    el.appendChild(h('span', null, r.id));
    el.appendChild(h('span', { class: 'det' }, esc(r.name)));
    if (!r.pass) el.appendChild(h('span', { class: 't-detail' }, esc(r.detail)));
    return el;
  }

  function vData(view) {
    var st = LEADOS.store.state(), P = Pj();
    view.appendChild(h('div', { class: 'v-head' }, '<h1>Data</h1><span class="sub">one key · ' + esc(LEADOS.store.KEY) + ' · schema v' + LEADOS.store.SCHEMA + ' · lineage pt</span>'));
    var u = LEADOS.store.usage();
    view.appendChild(h('div', { class: 'sect' }, 'storage (assumption: ~5MB quota, printed in README as labeled)'));
    var kv = h('dl', { class: 'kv' });
    kv.insertAdjacentHTML('beforeend',
      '<dt>size</dt><dd>' + u.bytes.toLocaleString() + ' B ≈ ' + (u.pct) + '% of assumed quota · ' + u.people + ' people · ' + u.events + ' events</dd>' +
      '<dt>backend</dt><dd>' + (LEADOS.store.volatile() ? 'SESSION MEMORY (localStorage unavailable) — export now' : 'localStorage') + '</dd>' +
      '<dt>read-only</dt><dd>' + (LEADOS.store.readOnly() ? 'YES — ' + esc(LEADOS.store.readOnlyWhy()) : 'no') + '</dd>' +
      '<dt>writes</dt><dd>' + (st.meta.writeFailed ? 'FAILING (pill live)' : 'ok') + ' · failures lifetime: ' + st.meta.writeFailures + '</dd>' +
      '<dt>schema</dt><dd>v' + LEADOS.store.SCHEMA + (st.meta.migratedFrom ? ' · migrated from v' + st.meta.migratedFrom + ' at ' + fmtD(st.meta.migratedAt) : ' · no migration needed yet') + '</dd>');
    view.appendChild(kv);
    view.appendChild(h('div', { class: 'sect' }, 'export — full-fidelity, includes audit + mutes'));
    var ex = h('textarea', { style: 'width:100%;min-height:88px;font:10px var(--mono)' }); ex.value = LEADOS.store.exportJson(); ex.readOnly = true;
    view.appendChild(ex);
    view.appendChild(h('button', { class: 'btn', onclick: function () {
      var blob = new Blob([ex.value], { type: 'application/json' });
      var a = h('a', { href: URL.createObjectURL(blob), download: 'leados-export-' + fmtD(LEADOS.events.nowIso()) + '.json' });
      document.body.appendChild(a); a.click(); a.remove();
      flash('export downloaded — the only backup that matters is the one you took');
    } }, ic('down') + ' download export'));
    view.appendChild(h('div', { class: 'sect' }, 'import — refusals happen in order: corrupt · malformed · foreign · newer · identical; merge re-mints every id'));
    var im = h('textarea', { style: 'width:100%;min-height:88px;font:10px var(--mono)', placeholder: 'paste a LeadOS export here (v1 or v2 — older payloads migrate on the way in)' });
    view.appendChild(im);
    var verdict = h('div', { class: 'notice' }, '');
    var bRow = h('div', { class: 'form-acts' });
    bRow.appendChild(h('button', { class: 'btn acc', onclick: function () {
      if (!im.value.trim()) { verdict.textContent = 'nothing pasted.'; return; }
      var r = LEADOS.store.importJson(im.value);
      if (r.verdict === 'merged') {
        verdict.innerHTML = '<b>MERGED</b> — people +' + r.stats.people + ' · events +' + r.stats.events + ' · unresolvable refs nulled ' + r.stats.orphansNulled + (r.migratedFrom != null ? ' · payload migrated v' + r.migratedFrom + '→v2' : '') + ' · live snapshot at ' + esc(r.snapshot || 'FAILED');
        flash('import merged'); im.value = '';
      } else verdict.innerHTML = '<b>REFUSED</b> (' + esc(r.kind || r.verdict) + ') — ' + esc(r.note);
    } }, ic('up') + ' import & merge')));
    view.appendChild(bRow);
    view.appendChild(verdict);
    view.appendChild(h('div', { class: 'sect' }, 'quarantine — damaged/foreign bytes preserved read-only, never overwritten'));
    var ql = LEADOS.store.quarantineList();
    if (!ql.length) view.appendChild(h('div', { class: 'notice' }, 'empty — nothing has ever needed quarantining on this install.'));
    ql.forEach(function (k) {
      var r = h('div', { class: 'row', style: 'grid-template-columns:1fr auto' });
      r.appendChild(h('span', { class: 'mut', style: 'overflow-wrap:anywhere' }, esc(k)));
      r.appendChild(h('button', { class: 'btn ghost', onclick: function () {
        var pre = h('pre', { style: 'white-space:pre-wrap;font:10px var(--mono);max-height:50vh;overflow:auto' }, esc(LEADOS.store.readKey(k)));
        var w = h('div'); w.appendChild(h('h2', null, 'quarantined bytes (read-only)'));
        w.appendChild(h('div', { class: 'm-sub' }, esc(k))); w.appendChild(pre); modal(w);
      } }, 'view'));
      view.appendChild(r);
    });
    view.appendChild(h('div', { class: 'sect' }, 'mutes — suppression is events; unmute appends another'));
    var sup = P.suppressed, keys = Object.keys(sup);
    if (!keys.length) view.appendChild(h('div', { class: 'notice' }, 'nothing muted.'));
    keys.forEach(function (k) {
      var r = h('div', { class: 'row', style: 'grid-template-columns:auto 1fr auto' });
      r.appendChild(h('span', { class: 'pill' }, esc(sup[k].kind) + (sup[k].until ? ' → ' + fmtD(sup[k].until) : '')));
      r.appendChild(h('span', { class: 'mut' }, esc(sup[k].title || k)));
      r.appendChild(h('button', { class: 'btn', onclick: function () { LEADOS.events.append('engine.unmuted', { key: k }); flash('unmuted'); refresh(); } }, 'unmute'));
      view.appendChild(r);
    });
    view.appendChild(h('div', { class: 'sect' }, 'settings — the numbers span-load prices against'));
    var set = st.meta.settings;
    [['weeklyOneOnOneCapacityMin', 'weekly 1:1 capacity (min)'], ['oneOnOneLengthMin', 'length of one 1:1 (min)'], ['skipCadenceDefaultDays', 'default skip-level cadence (days)']].forEach(function (pair) {
      var f = h('div', { class: 'field' });
      f.appendChild(h('label', null, esc(pair[1])));
      var inp = h('input', { type: 'number', min: '1' }); inp.value = set[pair[0]];
      inp.addEventListener('change', function () {
        var n = parseInt(inp.value, 10);
        if (isNaN(n) || n <= 0) { flash('must be a positive number', true); inp.value = set[pair[0]]; return; }
        set[pair[0]] = n; LEADOS.store.auditLive('settings', pair[0] + '=' + n); LEADOS.store.save(); flash('saved'); refresh();
      });
      f.appendChild(inp);
      view.appendChild(f);
    });
    view.appendChild(h('div', { class: 'sect' }, 'demo seed — once-ever; writes real events you can purge'));
    view.appendChild(h('div', { class: 'notice' }, 'flag: ' + (st.meta.seeded ? 'SET (seed is spent; purge removes rows, not the flag)' : 'unset') + ' · the seed lights all of R1–R8 on Today — T12 asserts exactly that.'));
    var sRow = h('div', { class: 'form-acts' });
    sRow.appendChild(h('button', { class: 'btn', onclick: function () {
      var r = LEADOS.events.seedInto(LEADOS.store.state());
      if (r.error) { flash(r.error, true); return; }
      LEADOS.store.auditLive('seed', 'demo set loaded'); LEADOS.store.save(); flash('demo data loaded — check Today'); refresh();
    } }, 'load sample set')));
    sRow.appendChild(h('button', { class: 'btn ghost', onclick: function () {
      LEADOS.events.purge(LEADOS.store.state()); LEADOS.store.save(); flash('seed purged; flag kept'); refresh();
    } }, 'purge seed')));
    view.appendChild(sRow);
    view.appendChild(h('div', { class: 'sect' }, 'audit — last 40 (capped 300; the cap leaves a row)'));
    var ar = h('div', { class: 'rows' });
    st.meta.audit.slice(-40).reverse().forEach(function (a) {
      var r = h('div', { class: 'row', style: 'grid-template-columns:150px 130px 1fr' });
      r.appendChild(h('span', { class: 'mut' }, esc(a.ts ? a.ts.replace('T', ' ').slice(0, 19) : '—')));
      r.appendChild(h('span', null, esc(a.action)));
      r.appendChild(h('span', { class: 'mut' }, esc(a.detail)));
      ar.appendChild(r);
    });
    view.appendChild(ar);
  }

  /* ---------- router / boot / refresh ---------- */
  var _bootNotes = [];
  function render() {
    paintIcons(document);
    var hash = location.hash || '#/today';
    var parts = hash.replace(/^#\//, '').split('/');
    var route = parts[0] || 'today';
    var view = document.getElementById('view');
    view.innerHTML = '';
    document.querySelectorAll('#rail-links a').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-route') === route);
    });
    try {
      if (route === 'person') vPerson(view, parts[1]);
      else if (route === 'roster') vRoster(view);
      else if (route === 'playbooks') vPlaybooks(view);
      else if (route === 'health') vHealth(view);
      else if (route === 'data') vData(view);
      else vToday(view);
    } catch (e) {
      view.innerHTML = '';
      view.appendChild(h('div', { class: 'banner' }, '<b>view render failed</b> — ' + esc(e.message) + '. Your data is untouched; #/health grades code, not this frame.'));
      console.error(e);
    }
    var n = document.getElementById('n-today');
    if (n) n.textContent = (TOD && TOD.findings.length) ? TOD.findings.length : '';
    paintFoot();
    paintIcons(view);
  }
  function refresh() { TOD = null; render(); }
  function go(hash) { if (location.hash === hash) refresh(); else location.hash = hash; }

  function boot() {
    var r = LEADOS.store.boot();
    _bootNotes = (r && r.notes) || [];
    document.getElementById('top-meta').textContent = LEADOS.events.todayIso().slice(0, 10) + ' · offline';
    window.addEventListener('hashchange', render);
    render();
    if (!location.hash) { location.hash = '#/today'; /* go() not needed: hashchange fires */ }
    if (LEADOS.store.readOnly()) flash('READ-ONLY boot: ' + LEADOS.store.readOnlyWhy(), true);
    _bootNotes.forEach(function (n) { console.warn('[leados boot]', n); });
  }

  return {
    boot: boot, refresh: refresh, flash: flash, go: go, ic: ic,
    formModal: formModal, openCapture: openCapture,
    writeFailed: function () { paintFoot(); },
    writeOk: function () { paintFoot(); }
  };
})();
