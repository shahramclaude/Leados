/* LeadOS mf-2 · js/ui.js — views, drawer, health wall, data & backup.
   mf-1's ui.js template literals were not readable through the Session-6 audit
   channel (verified stripped in two fetch modes), so this is a clean re-authoring
   of the same surface on the mf-2 spine. ONE write path: every capture/playbook
   submit goes through LEADOS.events.emit* → DB.save() → render() — after every
   write the engine re-derives from events; there is no cache to go stale. */
(function () {
  'use strict';
  var S = LEADOS.store, EV = LEADOS.events, EN = LEADOS.engine, PB = LEADOS.playbooks;
  var DB = S.makeStore('leados:data');
  var TEST_PREFIX = 'leados:t:';
  var ui = { route: 'today', lastRun: null, drawer: null, importResult: null };
  var flash = null;

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function saveState() {
    var r = DB.save();
    if (r && r.quota) flash = { msg: 'WRITE FAILED — localStorage quota exceeded. In-memory state intact; export a backup at #/data before closing this tab.', err: true };
    return r;
  }
  function fmtDate(d) { return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }

  var ICONS = {
    today: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    ppl: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    diamond: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    dl: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    ul: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    go: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    spark: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>'
  };
  var RULE_ICON = { R1: 'cal', R2: 'diamond', R3: 'flag', R4: 'scale', R5: 'layers', R6: 'bolt', R7: 'pulse', R8: 'user' };
  function ic(n, size) { return '<svg class="svgl" width="' + (size || 13) + '" height="' + (size || 13) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }

  function flashHtml() {
    if (!flash) return '';
    var h = '<div class="flash' + (flash.err ? ' err' : '') + '">' + esc(flash.msg) + '</div>';
    flash = null;
    return h;
  }
  function chip(c) {
    var cls = c.level === 'high' ? 'hi' : c.level === 'medium' ? 'med' : 'lo';
    return '<span class="chip ' + cls + '">' + esc(c.level) + ' confidence</span>';
  }

  /* ---------- capture spec (every engine-consumed type is writable) ---------- */
  var CAPTURE = {
    'oneonone.logged':    { label: '1:1 held',          person: 1, fields: [['date', 'Date', 'date', 1], ['note', 'Covered (one line)', 'text', 0]] },
    'pulse.logged':       { label: 'Pulse reading',     person: 1, fields: [['date', 'Date', 'date', 1], ['mood', 'Mood (1–10)', 'num10', 1], ['load', 'Load (1–10)', 'num10', 1], ['estimated', 'Estimated, not measured', 'check', 0], ['note', 'Note', 'text', 0]] },
    'feedback.logged':    { label: 'Feedback',          person: 1, fields: [['date', 'Date', 'date', 1], ['polarity', 'Polarity', 'polarity', 1], ['note', 'Note (SBI when ready)', 'text', 0]] },
    'delegation.assigned':{ label: 'Delegate work',     person: 1, fields: [['title', 'Delegated item', 'text', 1], ['date', 'Date', 'date', 1], ['level', 'Level', 'level', 1]] },
    'delegation.closed':  { label: 'Close delegation',  link: 'openDelegations', fields: [['date', 'Date', 'date', 1], ['note', 'Note', 'text', 0]] },
    'conflict.registered':{ label: 'Register conflict', person: 1, fields: [['counterpart', 'Counterpart', 'text', 1], ['severity', 'Severity (1–5)', 'sev', 1], ['date', 'Date', 'date', 1], ['note', 'What is it about', 'text', 0]] },
    'conflict.resolved':  { label: 'Resolve conflict',  link: 'openConflicts', fields: [['date', 'Date', 'date', 1], ['note', 'How it resolved', 'text', 0]] },
    'decision.logged':    { label: 'Log decision',      fields: [['title', 'Decision', 'text', 1], ['severity', 'Blast radius (1–5)', 'sev', 1], ['date', 'Decided on', 'date', 1], ['reviewDate', 'Review date', 'date', 1], ['rationale', 'Rationale', 'text', 0]] },
    'decision.outcome':   { label: 'Decision outcome',  link: 'openDecisions', fields: [['date', 'Date', 'date', 1], ['outcome', 'Outcome', 'outcome', 1], ['note', 'Why', 'text', 0]] },
    'goal.set':           { label: 'Set goal',          fields: [['title', 'Goal', 'text', 1], ['date', 'Set on', 'date', 1], ['ownerPersonId', 'Owner', 'owner', 0]] },
    'goal.assign':        { label: 'Assign goal owner', link: 'openGoals', fields: [['ownerPersonId', 'Owner', 'owner', 1], ['date', 'Date', 'date', 1]] },
    'goal.progress':      { label: 'Goal progress',     link: 'openGoals', fields: [['date', 'Date', 'date', 1], ['note', 'Progress (one line)', 'text', 1]] }
  };
  var LINK_ID_FIELD = { 'delegation.closed': 'delegationId', 'conflict.resolved': 'conflictId', 'decision.outcome': 'decisionId', 'goal.assign': 'goalId', 'goal.progress': 'goalId' };

  function activePeople() { return DB.get().people.filter(function (p) { return p && !p.archived; }); }

  /* ---------- generic field renderer (capture + playbooks share it) ---------- */
  function fieldHtml(f, values) {
    values = values || {};
    var name = f[0], label = f[1], kind = f[2], req = f[3], pv = values[name];
    if (pv == null) pv = f[4] != null ? f[4] : '';
    var h = '<label class="f"><span class="fl">' + esc(label) + (req ? ' <b class="req">*</b>' : '') + '</span>';
    if (kind === 'date') h += '<input type="date" name="' + name + '" value="' + esc(pv) + '">';
    else if (kind === 'area') h += '<textarea name="' + name + '">' + esc(pv) + '</textarea>';
    else if (kind === 'check') h += '<span class="f check"><input type="checkbox" name="' + name + '"' + (pv ? ' checked' : '') + '></span>';
    else if (kind === 'num' || kind === 'num10' || kind === 'sev') {
      var max = kind === 'sev' ? 5 : kind === 'num10' ? 10 : 999;
      h += '<input type="number" name="' + name + '" min="1" max="' + max + '" value="' + esc(pv) + '">';
    } else if (kind === 'polarity' || kind === 'outcome' || kind === 'select') {
      var opts = kind === 'polarity' ? [{ v: 'corrective', l: 'corrective' }, { v: 'positive', l: 'positive' }]
        : kind === 'outcome' ? [{ v: 'as expected', l: 'as expected' }, { v: 'better', l: 'better' }, { v: 'worse', l: 'worse' }, { v: 'reversed', l: 'reversed' }, { v: 'superseded', l: 'superseded' }]
        : (f[5] || []);
      h += '<select name="' + name + '"' + (f.pbmark ? ' data-change="pb-field"' : '') + '>' +
        (String(pv) === '' ? '<option value="">—</option>' : '') + opts.map(function (o) {
        return '<option value="' + esc(o.v) + '"' + (String(pv) === String(o.v) ? ' selected' : '') + '>' + esc(o.l) + '</option>';
      }).join('') + '</select>';
    } else if (kind === 'level') {
      h += '<select name="' + name + '" data-change="lv">' + PB.LEVELS.map(function (l, i) {
        return '<option value="' + (i + 1) + '"' + (String(pv) === String(i + 1) ? ' selected' : '') + '>' + esc(l) + '</option>';
      }).join('') + '</select>';
    } else if (kind === 'person' || kind === 'owner') {
      h += '<select name="' + name + '"><option value="">—</option>' + activePeople().map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (pv === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('') + '</select>';
    } else h += '<input type="text" name="' + name + '" value="' + esc(pv) + '"' + (f[6] ? ' placeholder="' + esc(f[6]) + '"' : '') + '>';
    if (f.hint) h += '<span class="fh">' + esc(f.hint) + '</span>';
    h += '</label>';
    return h;
  }
  function pbFieldHtml(f) { /* playbook FieldSpec → tuple form; hint + preview-marker ride along */
    var t = [f.key, f.label, f.kind, f.required, f.value, f.options];
    if (f.hint) t.hint = f.hint;
    if (f.kind === 'select') t.pbmark = 1;
    return fieldHtml(t, {});
  }

  /* ---------- drawer ---------- */
  function openDrawer(html) { $('drawer').innerHTML = html; $('drawer').classList.add('on'); $('scrim').classList.add('on'); ui.drawer = ui.drawer || {}; }
  function closeDrawer() { $('drawer').classList.remove('on'); $('scrim').classList.remove('on'); ui.drawer = null; }

  function guideHtml(blocks) {
    return '<div class="guide">' + blocks.map(function (b) {
      var h = '<div class="gh">' + esc(b.h) + '</div>';
      if (b.warn) h += '<div class="warnline">' + ic('warn') + esc(b.warn) + '</div>';
      if (b.lines) h += '<ul>' + b.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
      return h;
    }).join('') + '</div>';
  }

  function pbCtx(prefill) {
    var state = DB.get(), ppl = {};
    state.people.forEach(function (p) { if (p) ppl[p.id] = p; });
    return { state: state, today: todayISO(), prefill: prefill || {},
      person: prefill && prefill.personId ? ppl[prefill.personId] : null,
      nameOf: function (pid) { return ppl[pid] ? ppl[pid].name : null; } };
  }
  function openPlaybook(pbId, prefill) {
    var pb = PB.PBS[pbId];
    if (!pb) return;
    ui.drawer = { kind: 'pb', pbId: pbId, prefill: prefill || {} };
    var ctx = pbCtx(prefill);
    var fields = pb.fields(ctx, prefill);
    var h = '<div class="dhead"><div><h2>' + ic(pb.icon) + ' ' + esc(pb.title) + '</h2><span class="sub">' +
      (prefill && prefill.ruleKey ? 'opened from finding ' + esc(prefill.ruleKey) : pb.blurb) + '</span></div>' +
      '<button class="xbtn" data-act="drawer-close" aria-label="Close">' + ic('x') + '</button></div>';
    h += guideHtml(pb.guide(ctx, prefill));
    h += '<form id="form-pb" data-pb="' + esc(pbId) + '">';
    var blockers = [];
    fields.forEach(function (f) {
      if (f.kind === 'person' && !activePeople().length) blockers.push('roster is empty — add a person at #/roster first');
      if (f.kind === 'decision' && !EV.openDecisions(DB.get()).length) blockers.push('no open decisions — log one first (Record → Log decision)');
      if (f.kind === 'goal' && !EV.openGoals(DB.get()).length) blockers.push('no goals on record — set one first (Record → Set goal)');
    });
    fields.forEach(function (f) {
      if (f.kind === 'decision') {
        f = { key: f.key, label: f.label, kind: 'select', required: 1, value: f.value,
          options: EV.openDecisions(DB.get()).map(function (d) { return { v: d.id, l: d.label + ' · ' + String(d.ts).slice(0, 10) }; }) };
      } else if (f.kind === 'goal') {
        f = { key: f.key, label: f.label, kind: 'select', required: 1, value: f.value,
          options: EV.openGoals(DB.get()).map(function (g) { return { v: g.id, l: g.label + (g.ownerPersonId ? '' : ' · NO OWNER') }; }) };
      }
      h += pbFieldHtml(f);
    });
    if (blockers.length) h += '<div class="flash err">' + ic('warn') + esc(blockers.join(' · ')) + '</div>';
    h += '<div id="pb-preview"></div>';
    h += '<div class="actions"><button class="btn" type="submit">' + ic('check') + 'Record</button></div></form>';
    h += '<p class="muted-note">Submitting writes the resolving event(s) through the shared event layer. Every module — Today, dossiers, the engine — recomputes from it. Nothing is cached.</p>';
    openDrawer(h);
    updatePreview();
    if (blockers.length) { var btn = document.querySelector('#form-pb button[type=submit]'); if (btn) btn.disabled = true; }
  }
  function updatePreview() {
    var box = $('pb-preview'), form = document.getElementById('form-pb');
    if (!box || !form || !ui.drawer || ui.drawer.kind !== 'pb') return;
    var pb = PB.PBS[ui.drawer.pbId];
    if (!pb || !pb.compose) { box.innerHTML = ''; return; }
    var v = formValues(form);
    var ctx = pbCtx(ui.drawer.prefill);
    var txt = '';
    try { txt = pb.compose(v, ctx); } catch (e) { txt = ''; }
    box.innerHTML = txt ? '<div class="preview">' + esc(txt) + '</div>' : '';
  }
  function formValues(form) {
    var out = {}, i, el;
    for (i = 0; i < form.elements.length; i++) {
      el = form.elements[i];
      if (!el.name) continue;
      out[el.name] = el.type === 'checkbox' ? (el.checked ? true : '') : el.value;
    }
    return out;
  }

  /* ---------- person dossier ---------- */
  function sparkline(pulses) {
    var p = pulses.slice(-12);
    if (!p.length) return '<div class="muted-note">no pulse data — readings land here once logged</div>';
    var w = 240, hh = 46, pad = 6, i, x, y;
    var pts = [], circles = [];
    var measured = p.filter(function (e) { return !(e.data && e.data.estimated); });
    for (i = 0; i < p.length; i++) {
      var e = p[i], est = e.data && e.data.estimated;
      var mood = Number(e.data && e.data.mood);
      if (!isFinite(mood)) continue;
      x = pad + (w - 2 * pad) * (p.length === 1 ? 0.5 : i / (p.length - 1));
      y = hh - pad - (hh - 2 * pad) * (Math.max(1, Math.min(10, mood)) - 1) / 9;
      if (!est) pts.push(x.toFixed(1) + ',' + y.toFixed(1));
      circles.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="' + (est ? 'none' : 'var(--ink)') + '" stroke="' + (est ? 'var(--accent)' : 'var(--ink)') + '" stroke-width="1.5" stroke-dasharray="' + (est ? '2 2' : '0') + '"><title>' + esc(String(e.ts).slice(0, 10)) + ' · mood ' + mood + (est ? ' (estimated)' : '') + '</title></circle>');
    }
    var line = pts.length >= 2 ? '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--ink)" stroke-width="1.5"/>' : '';
    var sl = measured.length >= EN.DOCTRINE.MIN_POINTS ? EN._slope(measured.map(function (e) { return Number(e.data.mood); })) : null;
    var cap = sl == null ? 'trend withheld — needs ≥3 measured readings (estimated excluded)'
      : 'measured trend: ' + (sl < -0.2 ? 'declining' : sl > 0.2 ? 'rising' : 'flat') + ' (' + sl.toFixed(2) + '/reading, n=' + measured.length + ')';
    return '<svg class="spark" width="' + w + '" height="' + hh + '" role="img" aria-label="mood sparkline">' + line + circles.join('') + '</svg><div class="muted-note">' + esc(cap) + ' · hollow = estimated</div>';
  }
  function openDossier(pid) {
    var st = DB.get(), p = null;
    st.people.forEach(function (x) { if (x && x.id === pid) p = x; });
    if (!p) return;
    ui.drawer = { kind: 'person', pid: pid };
    var ppl = EV.peopleById(st);
    var last = EV.lastOneOnOne(st, pid);
    var pulses = EV.sorted(EV.byType(st, 'pulse.logged')).filter(function (e) { return e.personId === pid; });
    var bal = EV.feedbackBalance(st, pid, 60, todayISO());
    var dels = EV.openDelegations(st).filter(function (d) { return d.personId === pid; });
    var goals = EV.openGoals(st).filter(function (g) { return g.ownerPersonId === pid; });
    var cfs = EV.openConflicts(st).filter(function (c) { return c.personId === pid; });
    var sl = EV.latestSL(st, pid);
    var events = EV.sorted(st.events.filter(function (e) { return e.personId === pid; })).slice(-15).reverse();
    var line = p.reportsTo === 'me' || p.reportsTo === undefined ? 'you'
      : ppl[p.reportsTo] ? ppl[p.reportsTo].name : 'unknown (broken line)';

    var h = '<div class="dhead"><div><h2>' + esc(p.name) + '</h2><span class="sub">' + esc(p.role || '—') + ' · reports to ' + esc(line) + ' · cadence ' + p.cadenceDays + 'd</span></div>' +
      '<button class="xbtn" data-act="drawer-close">' + ic('x') + '</button></div>';
    h += '<section class="blk"><h3>Facts</h3><dl class="kv">' +
      '<dt>last 1:1</dt><dd>' + (last ? esc(String(last.ts).slice(0, 10)) : 'never logged') + '</dd>' +
      '<dt>open delegations</dt><dd>' + dels.length + (dels.length ? ' — ' + esc(dels.map(function (d) { return 'L' + (d.level || '?'); }).join(' ')) : '') + '</dd>' +
      '<dt>goals owned</dt><dd>' + goals.length + '</dd>' +
      '<dt>open conflicts</dt><dd>' + cfs.length + '</dd></dl></section>';
    h += '<section class="blk"><h3>Pulse — mood, measured vs estimated</h3>' + sparkline(pulses) + '</section>';
    var tot = Math.max(1, bal.total);
    h += '<section class="blk"><h3>Feedback balance · 60d</h3><div class="bal">' +
      '<span class="bc" style="width:' + Math.round(100 * bal.corrective / tot) + '%"></span>' +
      '<span class="bp" style="width:' + Math.round(100 * bal.positive / tot) + '%"></span></div>' +
      '<div class="balcap"><span>' + bal.corrective + ' corrective</span><span>' + bal.positive + ' positive</span></div></section>';
    if (sl) h += '<section class="blk"><h3>Situational diagnosis · ' + esc(String(sl.ts).slice(0, 10)) + '</h3><dl class="kv">' +
      '<dt>task</dt><dd>' + esc(sl.data.task) + '</dd><dt>reads</dt><dd>' + esc(sl.data.development) + ' → ' + esc(sl.data.style) + '</dd>' +
      (sl.data.note ? '<dt>evidence</dt><dd>' + esc(sl.data.note) + '</dd>' : '') + '</dl></section>';
    h += '<section class="blk"><h3>Open delegations</h3>' + (dels.length ? dels.map(function (d) {
      return '<div class="logline">L' + esc(d.level || '?') + ' · ' + esc(d.label) + ' · since ' + esc(String(d.ts).slice(0, 10)) + '</div>';
    }).join('') : '<div class="muted-note">none open</div>') + '</section>';
    if (goals.length) h += '<section class="blk"><h3>Goals owned</h3>' + goals.map(function (g) {
      return '<div class="logline">' + esc(g.label) + ' · last signal ' + esc(String(g.lastProgressTs).slice(0, 10)) + '</div>';
    }).join('') + '</section>';
    if (cfs.length) h += '<section class="blk"><h3>Open conflicts</h3>' + cfs.map(function (c) {
      return '<div class="logline">' + esc(c.label) + '</div>';
    }).join('') + '</section>';
    h += '<section class="blk"><h3>Recent events · ' + events.length + '</h3>' + (events.length ? events.map(function (e) {
      return '<div class="logline">' + esc(String(e.ts).slice(0, 10)) + ' · ' + esc(e.type) + (e.data && e.data.note ? ' · ' + esc(e.data.note) : '') + '</div>';
    }).join('') : '<div class="muted-note">nothing logged for this person yet</div>') + '</section>';
    h += '<div class="actions">' +
      '<button class="btn ghost" data-act="pb-direct" data-pb="oneonone" data-pid="' + esc(pid) + '">' + ic('cal') + '1:1</button>' +
      '<button class="btn ghost" data-act="pb-direct" data-pb="sbi" data-pid="' + esc(pid) + '">' + ic('scale') + 'SBI</button>' +
      '<button class="btn ghost" data-act="pb-direct" data-pb="delegation" data-pid="' + esc(pid) + '">' + ic('layers') + 'Delegate</button>' +
      '<button class="btn ghost" data-act="pb-direct" data-pb="situational" data-pid="' + esc(pid) + '">' + ic('diamond') + 'Situational</button>' +
      '</div>';
    openDrawer(h);
  }

  /* ---------- capture sheet ---------- */
  function captureHtml(prefill) {
    prefill = prefill || {};
    var type = prefill.type || 'oneonone.logged';
    var spec = CAPTURE[type];
    var h = '<form id="form-capture" class="blk"><div class="gh">Record · shared event layer</div>';
    h += '<label class="f"><span class="fl">Event type</span><select name="_type" data-change="cap-type">';
    Object.keys(CAPTURE).forEach(function (k) { h += '<option value="' + k + '"' + (k === type ? ' selected' : '') + '>' + CAPTURE[k].label + '</option>'; });
    h += '</select></label>';
    var blockers = [];
    if (spec.person) {
      if (!activePeople().length) blockers.push('no one on the roster yet — add a person at #/roster');
      h += '<label class="f"><span class="fl">Person <b class="req">*</b></span><select name="personId"><option value="">—</option>' +
        activePeople().map(function (p) { return '<option value="' + esc(p.id) + '"' + (prefill.personId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></label>';
    }
    if (spec.link) {
      var items = EV[spec.link](DB.get());
      if (!items.length) blockers.push('nothing open to link — record the base event first');
      h += '<label class="f"><span class="fl">' + (spec.link === 'openDecisions' ? 'Decision' : spec.link === 'openGoals' ? 'Goal' : spec.link === 'openDelegations' ? 'Delegation' : 'Conflict') + ' <b class="req">*</b></span><select name="_link"><option value="">—</option>' +
        items.map(function (it) { return '<option value="' + esc(it.id) + '"' + (prefill.link === it.id ? ' selected' : '') + '>' + esc(it.label) + '</option>'; }).join('') + '</select></label>';
    }
    spec.fields.forEach(function (f) {
      var fv = {};
      if (f[0] === 'date') fv[f[0]] = todayISO();
      if (f[0] === 'level') fv[f[0]] = '3';
      h += fieldHtml(f, fv);
    });
    if (blockers.length) h += '<div class="flash err">' + ic('warn') + esc(blockers.join(' · ')) + '</div>';
    h += '<div class="actions"><button class="btn" type="submit">' + ic('check') + 'Record</button>' +
      '<button class="btn ghost" type="button" data-act="cap-close">' + ic('x') + 'Close</button></div></form>';
    return h;
  }

  /* ---------- views ---------- */
  function vToday() {
    var st = DB.get();
    var res = EN.run(st);
    ui.lastRun = res;
    var fs = res.findings;
    var h = '<div class="vhead"><h1>Today</h1><span class="sub">' + esc(fmtDate(new Date())) + ' · ' + fs.length + ' open finding' + (fs.length === 1 ? '' : 's') +
      (res.snoozed.length ? ' · ' + res.snoozed.length + ' snoozed' : '') + (res.muted.length ? ' · ' + res.muted.length + ' muted' : '') + '</span></div>';
    h += '<div class="vsub">Ranked by transparent math — each row shows its derivation. Every basis line quotes your own logged data; confidence labels mean what they say.</div>';
    h += flashHtml();
    h += '<div class="qbar">' +
      '<button class="btn" data-act="cap-open">' + ic('plus') + 'Record event</button>' +
      '<button class="btn ghost" data-act="go-roster">' + ic('ppl') + 'Roster</button>' +
      '<button class="btn ghost" data-act="go-playbooks">' + ic('book') + 'Playbooks</button></div>';
    if (ui.capOpen) h += captureHtml(ui.capPrefill);
    if (!fs.length) {
      h += '<div class="empty"><b>Nothing is currently overdue.</b> Either a genuinely clean week, or too little data — the engine only sees what is logged. ' +
        (st.events.length === 0 ? 'The store is empty: Record events above, or load the sample set from #/data to watch every rule fire. ' : '') +
        (res.snoozed.length + res.muted.length ? 'Some findings are parked below. ' : '') + 'The engine never invents work to look useful.</div>';
    }
    h += '<ol class="rank">';
    fs.forEach(function (f, i) {
      var tier = f.score >= 80 ? 'p1' : f.score >= 50 ? 'p2' : 'p3';
      var pbv = PB.forFinding(f);
      var byid = {};
      (f.meta.evidenceIds || []).forEach(function (id) { var e = st.events.filter(function (x) { return x.id === id; })[0]; if (e) byid[id] = e; });
      h += '<li class="row ' + tier + '"><span class="no">' + pad2(i + 1) + '</span><span class="stripe"></span><div>' +
        '<span class="rtag">' + ic(RULE_ICON[f.ruleId] || 'spark') + esc(f.ruleId) + ' · ' + esc(EN.RULE_TAGS[f.ruleId] || '') + ' ' + chip(f.confidence) + '</span>' +
        '<p class="rt">' + esc(f.title) + '</p><p class="ra">' + esc(f.action) + '</p>' +
        '<div class="basis">' + f.basis.map(function (b) { return '<div>' + esc(b) + '</div>'; }).join('') +
        '<div class="bwhy">why ' + esc(f.confidence.level) + ': ' + esc(f.confidence.why) + '</div></div>' +
        '<div class="scoreline">rank = ' + esc(f.breakdown) + ' · key ' + esc(f.key) + '</div>';
      if (Object.keys(byid).length) {
        h += '<details class="ev"><summary>source events (' + Object.keys(byid).length + ')</summary><div class="evlist">' +
          Object.keys(byid).map(function (id) {
            var e = byid[id];
            return '<div>' + esc(String(e.ts).slice(0, 10)) + ' · ' + esc(e.type) + ' · ' + esc(JSON.stringify(e.data)) + '</div>';
          }).join('') + '</div></details>';
      }
      h += '<div class="actions">' +
        (pbv ? '<button class="btn mini" data-act="finding-pb" data-fi="' + i + '">' + ic('go') + 'Open playbook</button>' : '') +
        '<button class="btn mini ghost" data-act="snooze" data-fi="' + i + '" title="Park for ' + EN.DOCTRINE.SNOOZE_DAYS + 'd — logged, lapses on its own">' + ic('clock') + 'Snooze ' + EN.DOCTRINE.SNOOZE_DAYS + 'd</button>' +
        '<button class="btn mini ghost" data-act="dismiss" data-fi="' + i + '" title="Mute with a logged reason — reversible">' + ic('ban') + 'Dismiss</button>' +
        '</div></div></li>';
    });
    fs.length === 0 && (h = h.replace('<ol class="rank">', '<ol class="rank" hidden>'));
    h += '</ol>';
    if (res.snoozed.length) h += '<section class="blk"><h3>' + ic('clock') + ' Snoozed — returns on its own date</h3>' + res.snoozed.map(function (f) {
      return '<div class="logline">until ' + esc(f.snoozedUntil) + ' · ' + esc(f.title) + '</div>'; }).join('') + '</section>';
    if (res.muted.length) h += '<section class="blk"><h3>' + ic('ban') + ' Dismissed — with your logged reason</h3>' + res.muted.map(function (f) {
      return '<div class="logline">' + esc(f.title) + (f.mutedReason ? ' · reason: ' + esc(f.mutedReason) : '') +
        ' <button class="btn mini ghost" data-act="unmute" data-key="' + esc(f.key) + '">Unmute</button></div>'; }).join('') + '</section>';
    h += '<footer class="status"><span>' + Object.keys(res.byRule).length + ' rules evaluated</span><span>' + st.events.length + ' events read</span><span>recomputed at ' + new Date().toISOString().slice(11, 19) + 'Z</span><span>schema v' + st.meta.schemaVersion + '</span></footer>';
    return h;
  }

  function vRoster() {
    var st = DB.get();
    var act = st.people.filter(function (p) { return p && !p.archived; });
    var arch = st.people.filter(function (p) { return p && p.archived; });
    var ppl = EV.peopleById(st);
    var h = '<div class="vhead"><h1>Roster</h1><span class="sub">' + act.length + ' active · ' + arch.length + ' archived</span></div>';
    h += '<div class="vsub">People the engine watches. Reports-to builds your org line — that is what powers skip-level (R8). Archiving never deletes history.</div>' + flashHtml();
    h += '<section class="blk"><h3>Add a person</h3><form id="form-roster-add">' +
      '<label class="f"><span class="fl">Name <b class="req">*</b></span><input type="text" name="name" required></label>' +
      '<label class="f"><span class="fl">Role</span><input type="text" name="role" placeholder="Team lead — …"></label>' +
      '<label class="f"><span class="fl">1:1 cadence (days)</span><input type="number" name="cadenceDays" min="1" max="90" value="7"></label>' +
      '<label class="f"><span class="fl">Reports to</span><select name="reportsTo"><option value="me">me (direct report)</option>' +
      act.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('') + '</select>' +
      '<span class="fh">Pick a lead here and this person becomes your skip-level report — R8 watches the cadence.</span></label>' +
      '<button class="btn" type="submit">' + ic('plus') + 'Add</button></form></section>';
    function row(p, archived) {
      var last = EV.lastOneOnOne(st, p.id);
      var openD = EV.openDelegations(st).filter(function (d) { return d.personId === p.id; }).length;
      var pulses = EV.forPerson(EV.byType(st, 'pulse.logged'), p.id).length;
      var line = p.reportsTo === 'me' || p.reportsTo === undefined ? 'you' : ppl[p.reportsTo] ? ppl[p.reportsTo].name : 'broken line';
      return '<tr' + (archived ? '' : ' class="clickable" data-act="dossier" data-pid="' + esc(p.id) + '"') + '><td><b>' + esc(p.name) + '</b>' + (p.seed ? '<span class="tagchip seed">sample</span>' : '') + '<br><span class="muted-note">' + esc(p.role || '') + '</span></td>' +
        '<td class="num">' + esc(line) + '</td>' +
        '<td class="num">' + (archived ? esc(String(p.cadenceDays)) : '<input type="number" min="1" max="90" value="' + esc(String(p.cadenceDays)) + '" data-change="cadence" data-pid="' + esc(p.id) + '" style="width:52px">') + '</td>' +
        '<td class="num">' + (last ? esc(String(last.ts).slice(0, 10)) : 'never') + '</td>' +
        '<td class="num">' + openD + '</td><td class="num">' + pulses + '</td>' +
        '<td class="num">' + (archived
          ? '<button class="btn mini ghost" data-act="restore" data-pid="' + esc(p.id) + '">Restore</button>'
          : '<button class="btn mini ghost" data-act="archive" data-pid="' + esc(p.id) + '">Archive</button>') + '</td></tr>';
    }
    h += '<section class="blk"><h3>Active</h3><table class="t"><tr><th>Name</th><th>Line</th><th>Cad d</th><th>Last 1:1</th><th>Del.</th><th>Pulses</th><th></th></tr>';
    h += act.length ? act.map(function (p) { return row(p, false); }).join('') : '<tr><td colspan="7" class="muted-note">Roster is empty — add your first lead above, or load the sample set at #/data.</td></tr>';
    h += '</table></section>';
    if (arch.length) h += '<section class="blk"><h3>Archived — history preserved, engine ignores</h3><table class="t"><tr><th>Name</th><th>Line</th><th>Cad</th><th>Last 1:1</th><th>Del.</th><th>Pulses</th><th></th></tr>' +
      arch.map(function (p) { return row(p, true); }).join('') + '</table></section>';
    return h;
  }

  function vPlaybooks() {
    var h = '<div class="vhead"><h1>Playbooks</h1><span class="sub">the mentor layer</span></div>';
    h += '<div class="vsub">Procedures, not a wiki. Open one with a person in mind, or let a finding pre-fill it from Today. Submitting writes resolving events through the shared layer — everything recomputes.</div>' + flashHtml();
    Object.keys(PB.PBS).forEach(function (k) {
      var pb = PB.PBS[k];
      h += '<div class="pbrow" data-act="pb-open" data-pb="' + esc(k) + '"><span>' + ic(pb.icon, 18) + '</span><div><h4>' + esc(pb.title) + '</h4><p>' + esc(pb.blurb) + '</p></div><span>' + ic('go') + '</span></div>';
    });
    return h;
  }

  /* ---------- health: live-path tests + golden wall ---------- */
  function keysMatching(sub) {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(sub) === 0) out.push(k); }
    return out;
  }
  function cleanupTest() { keysMatching(TEST_PREFIX).forEach(function (k) { localStorage.removeItem(k); }); }

  function runLiveTests() {
    var rows = [];
    function T(id, name, fn) {
      var pass = false, detail = '';
      try { var r = fn(); pass = !!r.pass; detail = r.detail || ''; }
      catch (e) { detail = 'threw: ' + String(e && e.message || e); }
      finally { cleanupTest(); }
      rows.push({ id: id, name: name, pass: pass, detail: detail });
    }

    T('T1', 'cold boot: absent key boots fresh, persists valid mf-2 shape', function () {
      localStorage.removeItem(TEST_PREFIX);
      var s = S.makeStore(TEST_PREFIX), b = s.load(); s.save();
      return { pass: b.branch === 'absent' && S.isShape(JSON.parse(localStorage.getItem(TEST_PREFIX))), detail: 'branch=' + b.branch };
    });
    T('T2', 'corrupted storage quarantined byte-exact; live key removed, never overwritten', function () {
      var a = S.makeStore(TEST_PREFIX); a.load(); a.save();
      a._rawSet(TEST_PREFIX, '{bad');
      var b = S.makeStore(TEST_PREFIX), r = b.load();
      var qk = keysMatching(TEST_PREFIX + '.corrupt.');
      var exact = qk.length === 1 && localStorage.getItem(qk[0]) === '{bad';
      return { pass: r.branch === 'corrupt' && exact && localStorage.getItem(TEST_PREFIX) == null,
        detail: 'branch=' + r.branch + ', quarantine=' + qk.length + ', byteExact=' + exact };
    });
    T('T3', 'quota failure caught in the production write path, in-memory state preserved', function () {
      var orig = Storage.prototype.setItem, r2, s;
      try {
        Storage.prototype.setItem = function () { var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
        s = S.makeStore(TEST_PREFIX); s.load(); r2 = s.save();
      } finally { Storage.prototype.setItem = orig; }
      return { pass: r2 && r2.ok === false && r2.quota === true && s.get().meta.writeFailed === true,
        detail: 'ok=' + (r2 && r2.ok) + ', quota=' + (r2 && r2.quota) };
    });
    T('T4', 'second-run reseed impossible: wipe after seed, reload stays empty, flag permanent', function () {
      var s = S.makeStore(TEST_PREFIX); s.load();
      EV.seed(s.get()); s.save(); EV.purgeSeeds(s.get()); s.save();
      var b = S.makeStore(TEST_PREFIX); b.load();
      var st = b.get();
      return { pass: st.people.length === 0 && st.events.length === 0 && st.meta.seeded === true,
        detail: 'people=' + st.people.length + ', events=' + st.events.length + ', seeded=' + st.meta.seeded };
    });
    T('T5', 'end-to-end through real storage: backdated 1:1 → engine reads R1 overdue 3d', function () {
      var a = S.makeStore(TEST_PREFIX); a.load();
      var p = EV.addPerson(a.get(), { name: 'T5 Person', role: 'x', cadenceDays: 7 });
      EV.emit(a.get(), 'oneonone.logged', { personId: p.id, ts: new Date(Date.now() - 10 * 86400000).toISOString() });
      a.save();
      var b = S.makeStore(TEST_PREFIX); b.load();
      var hit = EN.run(b.get()).findings.filter(function (f) { return f.ruleId === 'R1' && f.personId === p.id; })[0];
      return { pass: !!hit && hit.meta.overdue === 3, detail: hit ? 'overdue=' + hit.meta.overdue + 'd · ' + hit.breakdown : 'no R1 finding' };
    });
    T('T6', 'newer-version and foreign-lineage stores quarantined with bytes preserved', function () {
      var s = S.makeStore(TEST_PREFIX); s.load();
      s._rawSet(TEST_PREFIX, JSON.stringify({ meta: { schemaVersion: 9, lineage: 'mf' }, marker: 't6n', people: [], events: [], log: [] }));
      var r1 = S.makeStore(TEST_PREFIX).load();
      var k1 = keysMatching(TEST_PREFIX + '.newer.');
      var kept1 = k1.length === 1 && localStorage.getItem(k1[0]).indexOf('t6n') >= 0;
      s._rawSet(TEST_PREFIX, JSON.stringify({ meta: { schemaVersion: 3, lineage: 'mono' }, marker: 't6f', people: [], events: [], log: [] }));
      var r2 = S.makeStore(TEST_PREFIX).load();
      var k2 = keysMatching(TEST_PREFIX + '.foreign.');
      var kept2 = k2.length === 1 && localStorage.getItem(k2[0]).indexOf('t6f') >= 0;
      return { pass: r1.branch === 'newer' && kept1 && r2.branch === 'foreign' && kept2,
        detail: 'newer=' + r1.branch + '/' + kept1 + ', foreign=' + r2.branch + '/' + kept2 };
    });
    T('T7', 'import refuses byte-identical-to-live and unparseable payloads', function () {
      var s = S.makeStore(TEST_PREFIX); s.load(); s.save();
      var raw = localStorage.getItem(TEST_PREFIX);
      var r1 = s.importText(raw, { mode: 'replace' }), r2 = s.importText('{nope', { mode: 'replace' });
      return { pass: r1.status === 'refuse-identical' && r2.status === 'unparseable', detail: 'identical→' + r1.status + ', garbage→' + r2.status };
    });
    T('T8', 'integrity audit: dup id re-minted, dangling FK nulled, bad ts/data repaired — rows never dropped', function () {
      var s = S.makeStore(TEST_PREFIX); s.load();
      s.get().events.push({ id: 'te-1', ts: '2026-01-01T00:00:00.000Z', type: 'x.a', personId: 'ghost', data: {} });
      s.get().events.push({ id: 'te-1', ts: 'not-a-date', type: 'x.b', personId: null, data: null });
      var repairs = s.audit(), e1 = s.get().events[0], e2 = s.get().events[1];
      return { pass: repairs >= 4 && e1.personId === null && e1.id !== e2.id && s.get().events.length === 2 && S.validTs(e2.ts) && typeof e2.data === 'object' && e2.data,
        detail: 'repairs=' + repairs + ', rows=' + s.get().events.length };
    });
    T('T9', 'import merge re-mints ids, rewires FKs, repairs malformed rows without dropping them', function () {
      var s = S.makeStore(TEST_PREFIX); s.load();
      EV.addPerson(s.get(), { name: 'Existing', role: 'x' }); s.save();
      var inc = S.fresh(); inc.meta.seeded = true;
      inc.people.push({ id: 'imp-p1', name: 'Imported', role: 'x', cadenceDays: 7, reportsTo: 'me', createdAt: S.nowISO(), archived: false, seed: false });
      inc.events.push({ id: 'imp-g1', ts: S.nowISO(), type: 'goal.set', personId: null, data: { title: 'imp-goal', ownerPersonId: 'imp-p1' }, seed: false });
      inc.events.push({ id: 'imp-e1', ts: S.nowISO(), type: 'goal.progress', personId: null, data: { goalId: 'imp-g1', note: 'hi' }, seed: false });
      inc.events.push({ ts: S.nowISO(), type: 'pulse.logged', personId: 'imp-p1', data: { mood: 5, load: 5 }, seed: false }); /* no id → repair */
      var r = s.importText(JSON.stringify(inc), { mode: 'merge' });
      var st = s.get();
      var goal = st.events.filter(function (e) { return e.type === 'goal.set' && e.data.title === 'imp-goal'; })[0];
      var prog = st.events.filter(function (e) { return e.type === 'goal.progress' && e.data.note === 'hi'; })[0];
      var noIdFixed = st.events.every(function (e) { return typeof e.id === 'string' && e.id; });
      var pass = r.status === 'imported' && st.people.length === 2 &&
        st.people.filter(function (p) { return p.id === 'imp-p1'; }).length === 0 &&
        goal && prog && prog.data.goalId === goal.id && noIdFixed;
      return { pass: !!pass, detail: 'status=' + r.status + ', people=' + st.people.length + ', rewired=' + (prog && goal ? prog.data.goalId === goal.id : 'n/a') + ', repairs=' + r.repairs };
    });
    T('T10', 'migration 1→2 on the live path: byte-exact v1 store upgrades, reportsTo backfilled, pre-migration bytes kept', function () {
      var iso = '2026-02-01T00:00:00.000Z';
      var v1 = { meta: { schemaVersion: 1, lineage: 'mf', seeded: true, createdAt: iso, writeFailed: false },
        people: [{ id: 'p1v1', name: 'Legacy Lead', role: 'x', cadenceDays: 7, createdAt: iso, archived: false, seed: false }],
        events: [{ id: 'e1v1', ts: iso, type: 'oneonone.logged', personId: 'p1v1', data: {}, seed: false }], log: [] };
      localStorage.setItem(TEST_PREFIX, JSON.stringify(v1));
      var s = S.makeStore(TEST_PREFIX), r = s.load(), st = s.get();
      var qk = keysMatching(TEST_PREFIX + '.pre-migration.');
      var pass = r.branch === 'migrated' && st.meta.schemaVersion === 2 && st.people[0].reportsTo === 'me' &&
        qk.length === 1 && localStorage.getItem(qk[0]).indexOf('p1v1') >= 0;
      return { pass: pass, detail: 'branch=' + r.branch + ', schema=' + st.meta.schemaVersion + ', reportsTo=' + st.people[0].reportsTo + ', bytesKept=' + (qk.length === 1) };
    });
    return rows;
  }

  function vHealth() {
    var Tv = runLiveTests(), G = EN.runGolden();
    var tPass = Tv.filter(function (r) { return r.pass; }).length, gPass = G.filter(function (r) { return r.pass; }).length;
    var h = '<div class="vhead"><h1>Health</h1><span class="sub">T ' + tPass + '/' + Tv.length + ' · G ' + gPass + '/' + G.length + ' · executed ' + new Date().toISOString().slice(11, 19) + 'Z</span></div>';
    h += '<div class="vsub">Every row executes now, in this browser, against production code paths. Test keys (' + TEST_PREFIX + '*) are cleaned after each run; live data is never touched. This wall is the authority over any README.</div>' + flashHtml();
    h += '<section class="blk"><h3>Live-path tests — storage, migration, quota, audit, end-to-end</h3>' +
      Tv.map(function (r) { return '<div class="trow"><span class="tid">' + r.id + '</span><div><div class="tnm">' + esc(r.name) + '</div><div class="tdt">' + esc(r.detail) + '</div></div><span class="res ' + (r.pass ? 'pass' : 'fail') + '">' + (r.pass ? 'PASS' : 'FAIL') + '</span></div>'; }).join('') + '</section>';
    h += '<section class="blk"><h3>Golden engine fixtures — events in, expected finding out · fixed today ' + '2026-03-01' + '</h3>' +
      G.map(function (r) { return '<div class="trow"><span class="tid">' + r.id + '</span><div><div class="tnm">' + esc(r.name) + '</div><div class="tdt">' + esc(r.detail) + '</div></div><span class="res ' + (r.pass ? 'pass' : 'fail') + '">' + (r.pass ? 'PASS' : 'FAIL') + '</span></div>'; }).join('') + '</section>';
    h += '<section class="blk"><h3>Engine doctrine (the constants the rules obey)</h3><dl class="kv">' +
      Object.keys(EN.DOCTRINE).map(function (k) { return '<dt>' + esc(k) + '</dt><dd>' + esc(String(EN.DOCTRINE[k])) + '</dd>'; }).join('') +
      '<dt>confidence factors</dt><dd>high 1.0 · medium 0.8 · low 0.6 — multiplied into every printed score</dd></dl></section>';
    h += '<p class="muted-note">Non-claims, stated: fixture-based self-assertions on real code paths — not browser automation, not a fuzzer. T/E coverage spans storage, migration, quota, import, and all eight rules incl. boundaries and malformed input; it does not cover UI rendering itself.</p>';
    return h;
  }

  /* ---------- data & backup ---------- */
  function keyKind(k) {
    if (k === 'leados:data') return 'LIVE';
    if (k.indexOf(TEST_PREFIX) === 0) return 'test';
    var m = k.match(/^leados:data\.([a-z-]+)\./);
    return m ? m[1] : 'other';
  }
  function vData() {
    var st = DB.get(), u = DB.usage();
    var budget = 5 * 1024 * 1024 / 2; /* UTF-16 units — the ~5MB assumption, labeled as such */
    var pct = Math.min(100, Math.round(100 * u.bytes / budget));
    var h = '<div class="vhead"><h1>Data</h1><span class="sub">localStorage only · no network</span></div>' + flashHtml();
    h += '<div class="vsub">Everything lives under one key. Quarantines and foreign bytes are kept, browsable here, never silently overwritten or deleted by the app.</div>';
    h += '<section class="blk"><h3>Storage</h3><dl class="kv">' +
      '<dt>live key</dt><dd>leados:data · ' + u.bytes + ' B (UTF-16 units)</dd>' +
      '<dt>schema</dt><dd>v' + st.meta.schemaVersion + ' · lineage ' + esc(st.meta.lineage) + (st.meta.migrations && st.meta.migrations.length ? ' · migrated ' + st.meta.migrations.map(function (m) { return m.from + '→' + m.to; }).join(', ') : '') + '</dd>' +
      '<dt>contents</dt><dd>' + u.people + ' people · ' + u.events + ' events · ' + u.log + ' log rows</dd>' +
      '<dt>seeded</dt><dd>' + st.meta.seeded + ' (permanent — wiping rows never reseeds)</dd>' +
      '<dt>write failed</dt><dd>' + st.meta.writeFailed + '</dd></dl>' +
      '<div class="barline"><span class="muted-note">~' + pct + '%</span><div class="bar"><i style="width:' + pct + '%"></i></div><span class="muted-note">of a ~5MB assumption (real quota is not JS-queryable — labeled assumption)</span></div></section>';
    h += '<section class="blk"><h3>Export backup</h3><div class="actions">' +
      '<button class="btn" data-act="export">' + ic('dl') + 'Download JSON</button></div>' +
      '<label class="f"><span class="fl">Full state (also copyable)</span><textarea id="export-box" readonly rows="6">' + esc(DB.exportText()) + '</textarea></label></section>';
    h += '<section class="blk"><h3>Import backup</h3>' +
      '<label class="f"><span class="fl">From file</span><input type="file" accept=".json,application/json" data-change="import-file"></label>' +
      '<label class="f"><span class="fl">Mode</span><select name="_imode" id="import-mode"><option value="replace">replace (live state quarantined first)</option><option value="merge">merge (ids re-minted, foreign keys rewired)</option></select></label>' +
      '<label class="f"><span class="fl">Paste JSON</span><textarea id="import-box" rows="5" placeholder="{...}"></textarea></label>' +
      '<div class="actions"><button class="btn" data-act="import-run">' + ic('ul') + 'Run import</button></div>' +
      (ui.importResult ? '<div class="flash' + (ui.importResult.ok ? '' : ' err') + '">' + esc(ui.importResult.status) + (ui.importResult.note ? ' — ' + esc(ui.importResult.note) : '') + (ui.importResult.repairs != null ? ' · repairs: ' + ui.importResult.repairs : '') + '</div>' : '') +
      '<p class="muted-note">Refusals by doctrine: unparseable · malformed shape · newer schema · foreign lineage (bytes preserved read-only; no migration is ever invented) · byte-identical to live. Same-lineage older versions migrate through the documented ladder.</p></section>';
    h += '<section class="blk"><h3>Sample data</h3><div class="actions">' +
      '<button class="btn ghost" data-act="seed">Load sample set</button>' +
      '<button class="btn ghost" data-act="purge">Purge samples</button></div>' +
      '<p class="muted-note">Four people + events chosen to fire every rule incl. skip-level. Purging removes only seed:true rows and can never trigger a reseed.</p></section>';
    h += '<section class="blk"><h3>Storage keys</h3><table class="t"><tr><th>Key</th><th>Kind</th><th>Bytes</th><th></th></tr>';
    var ks = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('leados') === 0) ks.push(k); }
    ks.sort();
    if (!ks.length) h += '<tr><td colspan="4" class="muted-note">no LeadOS keys</td></tr>';
    ks.forEach(function (k) {
      var kind = keyKind(k), v = localStorage.getItem(k) || '';
      h += '<tr><td><span class="mono">' + esc(k) + '</span>' + (kind !== 'LIVE' && kind !== 'test' && v ? '<div class="tdt">' + esc(v.slice(0, 160)) + (v.length > 160 ? '…' : '') + '</div>' : '') + '</td>' +
        '<td><span class="tagchip">' + esc(kind) + '</span></td><td class="num">' + v.length + '</td>' +
        '<td class="num">' + (kind === 'LIVE' ? '—' : '<button class="btn mini danger" data-act="keydel" data-key="' + esc(k) + '">Delete</button>') + '</td></tr>';
    });
    h += '</table><p class="muted-note">Quarantine and foreign keys are preserved bytes, read-only. Only you delete keys; the app never does.</p></section>';
    h += '<section class="blk"><h3>Integrity & event log · latest 30</h3>' +
      (st.log.length ? st.log.slice(-30).reverse().map(function (l) {
        return '<div class="logline">' + esc(String(l.ts).slice(0, 19).replace('T', ' ')) + ' · ' + esc(l.kind) + ' · ' + esc(l.msg) + '</div>'; }).join('')
        : '<div class="muted-note">log is empty</div>') + '</section>';
    h += '<section class="blk"><h3>Danger</h3><button class="btn danger" data-act="reset">' + ic('warn') + 'Factory reset</button>' +
      '<p class="muted-note">Double-confirmed. Live state is quarantined to a pre-import key before a fresh store is written — nothing is destroyed silently.</p></section>';
    return h;
  }

  var VIEWS = { today: vToday, roster: vRoster, playbooks: vPlaybooks, health: vHealth, data: vData };

  function render() {
    Object.keys(VIEWS).forEach(function (r) {
      document.querySelectorAll('[data-route="' + r + '"]').forEach(function (a) { a.classList.toggle('on', r === ui.route); });
    });
    var st = DB.get();
    $('pill').hidden = !(st && st.meta.writeFailed);
    $('view').innerHTML = (VIEWS[ui.route] || vToday)();
  }
  function route() {
    var h = (location.hash || '#/today').replace(/^#\//, '');
    if (VIEWS[h]) { ui.route = h; ui.capOpen = h === 'today' ? ui.capOpen : false; }
    else ui.route = 'today';
    window.scrollTo(0, 0);
    render();
  }

  /* ---------- actions ---------- */
  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'dossier' && e.target.closest('input, select, textarea, button')) return; /* cadence editor inside a row must not open the dossier */
    var pid = t.getAttribute('data-pid'), fi = t.getAttribute('data-fi');
    var st = DB.get();
    if (act === 'drawer-close') closeDrawer();
    else if (act === 'go-roster') location.hash = '#/roster';
    else if (act === 'go-playbooks') location.hash = '#/playbooks';
    else if (act === 'cap-open') { ui.capOpen = true; ui.capPrefill = null; render(); }
    else if (act === 'cap-close') { ui.capOpen = false; render(); }
    else if (act === 'dossier' && pid) openDossier(pid);
    else if (act === 'pb-open') openPlaybook(t.getAttribute('data-pb'), { personId: pid || undefined });
    else if (act === 'pb-direct') openPlaybook(t.getAttribute('data-pb'), { personId: pid || undefined });
    else if (act === 'finding-pb' && fi != null) {
      var f = ui.lastRun && ui.lastRun.findings[+fi];
      if (!f) return;
      var map = PB.forFinding(f);
      if (map) openPlaybook(map.pb, map.prefill);
    }
    else if (act === 'snooze' && fi != null) {
      var f2 = ui.lastRun && ui.lastRun.findings[+fi]; if (!f2) return;
      var until = new Date(Date.now() + EN.DOCTRINE.SNOOZE_DAYS * 86400000).toISOString().slice(0, 10);
      EV.emit(st, 'engine.snooze', { data: { ruleId: f2.ruleId, key: f2.key, until: until } });
      saveState(); flash = { msg: 'Snoozed until ' + until + '. It returns on its own — logged as an event, exportable like everything else.' };
      render();
    }
    else if (act === 'dismiss' && fi != null) {
      var f3 = ui.lastRun && ui.lastRun.findings[+fi]; if (!f3) return;
      var reason = window.prompt('Dismiss "' + f3.title + '"\n\nYour reason is logged as an event (auditable, reversible via Unmute):');
      if (reason == null) return;
      EV.emit(st, 'engine.dismiss', { data: { ruleId: f3.ruleId, key: f3.key, reason: reason || '(no reason given)' } });
      saveState(); flash = { msg: 'Dismissed and muted. Your reason is in the event log; the item stays listed under Dismissed with an Unmute button.' };
      render();
    }
    else if (act === 'unmute') {
      var key = t.getAttribute('data-key');
      EV.emit(st, 'engine.unmute', { data: { key: key } });
      saveState(); flash = { msg: 'Unmuted. If the underlying data still triggers the rule, it is back in the ranking above.' };
      render();
    }
    else if (act === 'archive' && pid) {
      st.people.forEach(function (p) { if (p.id === pid) p.archived = true; });
      EV.emit(st, 'person.archived', { personId: pid });
      saveState(); render();
    }
    else if (act === 'restore' && pid) {
      st.people.forEach(function (p) { if (p.id === pid) p.archived = false; });
      EV.emit(st, 'person.restored', { personId: pid });
      saveState(); render();
    }
    else if (act === 'seed') {
      var did = EV.seed(st);
      saveState();
      flash = { msg: did ? 'Sample set written — watch Today recompute: every rule should have something to say.' : 'Already seeded once (the flag is permanent). Purge samples first if you want a clean slate.' };
      render();
    }
    else if (act === 'purge') {
      EV.purgeSeeds(st); saveState();
      flash = { msg: 'Seed rows purged; meta.seeded stays true — no reseed will occur.' };
      render();
    }
    else if (act === 'export') {
      var blob = new Blob([DB.exportText()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'leados-export-' + todayISO() + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      flash = { msg: 'Export downloaded. It also lives in the copyable box above — backups work offline by design.' };
      render();
    }
    else if (act === 'import-run') {
      var text = $('import-box') ? $('import-box').value : '';
      var mode = $('import-mode') ? $('import-mode').value : 'replace';
      ui.importResult = DB.importText(text, { mode: mode });
      flash = { msg: ui.importResult.ok ? 'Import applied (' + ui.importResult.status + ').' : 'Import refused: ' + ui.importResult.status + (ui.importResult.note ? ' — ' + ui.importResult.note : ''), err: !ui.importResult.ok };
      render();
    }
    else if (act === 'keydel') {
      var k = t.getAttribute('data-key');
      if (k && k !== 'leados:data' && window.confirm('Delete ' + k + '? Its preserved bytes are gone for good.')) {
        localStorage.removeItem(k);
        flash = { msg: k + ' deleted at your request.' };
        render();
      }
    }
    else if (act === 'reset') {
      if (window.confirm('Factory reset? Live state is quarantined to a pre-import key first.') &&
          window.confirm('Second confirm: roster, events and log are replaced by a fresh store. Proceed?')) {
        ui.importResult = DB.importText(JSON.stringify(S.fresh()), { mode: 'replace' });
        flash = { msg: 'Reset complete; prior state is preserved under a leados:data.pre-import.* key — see the key browser above.' };
        render();
      }
    }
  }

  function onChange(e) {
    var t = e.target.closest ? e.target.closest('[data-change]') : null;
    if (!t) return;
    var kind = t.getAttribute('data-change');
    if (kind === 'cap-type') { ui.capPrefill = { type: t.value }; render(); }
    else if (kind === 'cadence') {
      var pid = t.getAttribute('data-pid');
      var v = Math.max(1, Math.min(90, parseInt(t.value, 10) || 7));
      var st = DB.get();
      st.people.forEach(function (p) {
        if (p.id === pid && p.cadenceDays !== v) {
          var from = p.cadenceDays; p.cadenceDays = v;
          EV.emit(st, 'person.cadence', { personId: pid, data: { from: from, to: v } });
        }
      });
      saveState(); render();
    }
    else if (kind === 'import-file') {
      var file = t.files && t.files[0];
      if (!file) return;
      var rd = new FileReader();
      rd.onload = function () { var box = $('import-box'); if (box) box.value = String(rd.result || ''); };
      rd.readAsText(file);
    }
    else if (ui.drawer && ui.drawer.kind === 'pb' && t.closest && t.closest('#form-pb')) updatePreview();
  }
  function onInput(e) { if (ui.drawer && ui.drawer.kind === 'pb' && e.target.closest && e.target.closest('#form-pb')) updatePreview(); }

  function onSubmit(e) {
    var form = e.target;
    if (form.id === 'form-roster-add') {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      if (!name) { flash = { msg: 'A name is required.', err: true }; render(); return; }
      var p = EV.addPerson(DB.get(), {
        name: name, role: form.elements.role.value,
        cadenceDays: form.elements.cadenceDays.value, reportsTo: form.elements.reportsTo.value });
      saveState();
      flash = { msg: p.name + ' added (' + (p.reportsTo === 'me' ? 'direct report' : 'skip-level line') + '). The engine is watching from this render.' };
      render();
    }
    else if (form.id === 'form-capture') {
      e.preventDefault();
      var v = formValues(form), type = form.elements._type.value, spec = CAPTURE[type];
      var missing = [];
      if (spec.person && !v.personId) missing.push('Person');
      if (spec.link && !v._link) missing.push('linked record');
      spec.fields.forEach(function (f) { if (f[3] && f[2] !== 'check' && !String(v[f[0]] || '').trim()) missing.push(f[1]); });
      if (missing.length) { flash = { msg: 'missing: ' + missing.join(', '), err: true }; render(); return; }
      var data = {};
      spec.fields.forEach(function (f) {
        var name = f[0], kind = f[2], val = v[name];
        if (kind === 'check') { if (val === true) data[name] = true; return; }
        if (val !== '' && val != null) {
          if (kind === 'num10' || kind === 'sev' || kind === 'level' || kind === 'num') data[name] = parseInt(val, 10);
          else if (kind === 'owner') data[name] = val || null;
          else data[name] = val;
        } else if (kind === 'owner') data[name] = null;
      });
      if (spec.link) data[LINK_ID_FIELD[type]] = v._link;
      var ts = v.date ? v.date + 'T00:00:00.000Z' : undefined;
      var saved = EV.emit(DB.get(), type, { ts: ts, personId: spec.person ? v.personId : null, data: data });
      saveState();
      ui.capOpen = false;
      flash = { msg: 'Recorded ' + saved.type + ' (' + saved.id + '). All modules recomputed from the event stream — no cache to invalidate.' };
      render();
    }
    else if (form.id === 'form-pb' && ui.drawer && ui.drawer.kind === 'pb') {
      e.preventDefault();
      var pb = PB.PBS[form.getAttribute('data-pb')];
      if (!pb) return;
      var vals = formValues(form);
      var fields = pb.fields(pbCtx(ui.drawer.prefill), ui.drawer.prefill), miss = [];
      fields.forEach(function (f) { if (f.required && f.kind !== 'check' && !String(vals[f.key] || '').trim()) miss.push(f.label); });
      if (miss.length) { flash = { msg: 'missing: ' + miss.join(', '), err: true }; closeDrawer(); render(); return; }
      var out;
      try { out = pb.submit(vals, pbCtx(ui.drawer.prefill)); }
      catch (err) { flash = { msg: 'playbook submit failed: ' + String(err && err.message), err: true }; closeDrawer(); render(); return; }
      var em = EV.emitMany(DB.get(), (out.events || []).map(function (d) { d.ts = d.ts || out.ts; return d; }));
      EV.emit(DB.get(), 'playbook.completed', { personId: vals.personId || null,
        data: { playbook: pb.id, ruleKey: ui.drawer.prefill.ruleKey || null, emitted: em.map(function (x) { return x.id; }) } });
      saveState();
      closeDrawer();
      flash = { msg: pb.title + ' recorded (' + em.map(function (x) { return x.type; }).join(' + ') + '). ' + (ui.drawer === null ? '' : '') + 'Engine recomputed — check Today.' };
      render();
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    var res = DB.load();
    var repairs = DB.audit();
    DB.save();
    var msgs = [];
    if (res.branch === 'migrated') msgs.push('your store was upgraded schema 1→2 (documented migration; pre-migration bytes preserved under a leados:data.pre-migration.* key — #/data).');
    if (res.branch === 'corrupt' || res.branch === 'malformed' || res.branch === 'newer') msgs.push('storage branch "' + res.branch + '" — original bytes quarantined (visible read-only at #/data), booted clean on a fresh store.');
    if (res.branch === 'foreign') msgs.push('a store from another LeadOS lineage was found and preserved read-only. No migration was invented for it — that is policy, not a bug.');
    if (repairs) msgs.push(repairs + ' integrity repair(s) applied at boot — details in #/data.');
    if (msgs.length) flash = { msg: msgs.join(' ') };
    $('boot').hidden = true;
    $('app').hidden = false;
    window.addEventListener('hashchange', route);
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ui.drawer) closeDrawer(); });
    $('scrim').addEventListener('click', closeDrawer);
    if (!location.hash) location.hash = '#/today';
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
