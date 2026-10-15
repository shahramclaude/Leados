/* LeadOS mf-4 · js/ui.js — chrome. Playbooks own content; ui owns rendering.
   Views: Today (single ranked column + quick capture) · Arrival instrument ·
   Roster + dossier · Playbooks (drawer) · Health (T1–T12 + G1–G18, executed
   at render against disposable keys — the wall counts itself) · Data (export /
   import / key browser with read-only quarantines / audit log / seed·purge).
   mf-2's and mf-3's ui.js were unreadable from the authoring environment
   (both sessions reported fetch truncation) — this file is re-authored; the
   storage/engine/playbook contracts it renders against WERE verified. */
(function () {
  'use strict';
  var S = LEADOS.store;
  function EV() { return LEADOS.events; }
  function EN() { return LEADOS.engine; }
  function PB() { return LEADOS.playbooks; }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function today() { return S.todayISO(); }
  function state() { return S.state(); }
  function save() { S.save(); pill(); }
  function pill() {
    var st = state();
    document.getElementById('writefail').hidden = !(st && st.meta && st.meta.writeFailed);
  }
  function dt(iso) { return iso ? String(iso).slice(0, 10) : '—'; }
  function agoStr(iso) {
    if (!iso) return '—';
    var d = EN().days(iso, today());
    if (d == null) return '—';
    return d === 0 ? 'today' : d + 'd ago';
  }
  var GLYPHS = '▁▂▃▄▅▆▇▉';
  function spark(vals, cap) {
    return vals.slice(-16).map(function (v) {
      if (v == null) return '·';
      var i = Math.max(0, Math.min(GLYPHS.length - 1, Math.round(((v - 1) / (cap || 10)) * (GLYPHS.length - 1))));
      return GLYPHS[i];
    }).join('');
  }

  var ICONS = {
    today: '<path d="M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0M12 7v5l3 3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    arrival: '<path d="M5 21V4m0 1h12l-2.5 4L17 13H5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    roster: '<circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 19c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5M16 5.2a3.2 3.2 0 0 1 0 6M17.5 14.5c2 .6 3.2 2.1 3.7 4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    playbooks: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 8h6M9 12h6" stroke="currentColor" stroke-width="1.6"/>',
    health: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    data: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 5.5V18.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5.5M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    cal: '<rect x="4" y="5" width="16" height="15" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6"/>',
    msg: '<path d="M4 5h16v11H8l-4 4V5z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    link: '<circle cx="7" cy="7" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="17" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 9.5l5 5" stroke="currentColor" stroke-width="1.6"/>',
    ladder: '<path d="M7 21V3M17 21V3M7 7h10M7 12h10M7 17h10" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    compass: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    scale: '<path d="M12 4v16M5 7h14M12 4l-5 3 5-3 5 3M5 7l-2.5 6a3.5 3.5 0 0 0 5 0L5 7zm14 0l-2.5 6a3.5 3.5 0 0 0 5 0L19 7z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    target: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    flag: '<path d="M6 21V4c4-2.5 8 2.5 12 0v9c-4 2.5-8-2.5-12 0" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    ear: '<path d="M6 10a6 6 0 0 1 12 0c0 4-3.5 4.5-3.5 8a2.5 2.5 0 0 1-5 0" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 10a2.5 2.5 0 0 1 5 0c0 2-2 2.3-2 4" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    check2: '<path d="M4 12.5l4.2 4.5a1.5 1.5 0 0 0 2.2.1L20 7.5M4 6.5l4 4L13 5.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    x: '<path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="1.8" fill="none"/>'
  };
  function icon(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" aria-hidden="true">' + (ICONS[name] || ICONS.msg) + '</svg>';
  }

  /* ---------- routing ---------- */
  var NAV = [
    ['#/today', 'today', 'Today'], ['#/arrival', 'arrival', 'Arrival'],
    ['#/roster', 'roster', 'Roster'], ['#/playbooks', 'playbooks', 'Playbooks'],
    ['#/health', 'health', 'Health'], ['#/data', 'data', 'Data']
  ];
  function route() {
    var h = location.hash || '#/today';
    var m, view = document.getElementById('view');
    pill();
    renderRail(h);
    if ((m = h.match(/^#\/person\/(.+)$/))) return renderPerson(view, decodeURIComponent(m[1]));
    if (h.indexOf('#/arrival') === 0) return renderArrival(view);
    if (h.indexOf('#/roster') === 0) return renderRoster(view);
    if (h.indexOf('#/playbooks') === 0) return renderPlaybooks(view);
    if (h.indexOf('#/health') === 0) return renderHealth(view);
    if (h.indexOf('#/data') === 0) return renderData(view);
    return renderToday(view);
  }
  function renderRail(hash) {
    var findingsCount = 0;
    try { findingsCount = EN().evaluate(state(), today()).findings.length; } catch (e) { /* rail must never break */ }
    document.getElementById('rail-links').innerHTML = NAV.map(function (n) {
      var on = (hash || '#/today').indexOf(n[0]) === 0 || (n[0] === '#/roster' && hash.indexOf('#/person') === 0);
      return '<a class="rail-link' + (on ? ' on' : '') + '" href="' + n[0] + '">' + icon(n[1]) +
        '<span class="lbl">' + n[2] + '</span>' + (n[0] === '#/today' && findingsCount ? '<span class="badge">' + findingsCount + '</span>' : '') + '</a>';
    }).join('');
  }

  /* ---------- capture bar (the shared-layer entry point) ---------- */
  var CAPTURE = {
    'oneonone': { label: '1:1 held', fields: [['personId', 'person', 1], ['date', 'date', 1], ['note', 'text', 0, 'What mattered']],
      make: function (v) { return [{ type: 'oneonone.logged', personId: v.personId, ts: withTime(v.date), data: { note: v.note || undefined } }]; } },
    'pulse': { label: 'Pulse (they said it)', fields: [['personId', 'person', 1], ['mood', 'num', 1, 'Mood 1–10'], ['load', 'num', 1, 'Load 1–10'], ['estimated', 'check', 0, 'I estimated this (not their words)']],
      make: function (v) { return [{ type: 'pulse.logged', personId: v.personId, data: { mood: Number(v.mood), load: Number(v.load), estimated: !!v.estimated } }]; } },
    'feedback': { label: 'Feedback given', fields: [['personId', 'person', 1], ['polarity', 'select:positive|corrective', 1], ['summary', 'text', 1, 'One-line summary']],
      make: function (v) { return [{ type: 'feedback.logged', personId: v.personId, data: { polarity: v.polarity, summary: v.summary, delivered: true } }]; } },
    'decision': { label: 'Decision logged', fields: [['title', 'text', 1], ['reviewDate', 'date', 1], ['severity', 'num', 0, 'Blast radius 1–5']],
      make: function (v) { return [{ type: 'decision.logged', personId: null, data: { title: v.title, reviewDate: v.reviewDate, severity: Number(v.severity) || undefined } }]; } },
    'goal': { label: 'Goal set', fields: [['title', 'text', 1], ['ownerPersonId', 'person:me', 1]],
      make: function (v) { return [{ type: 'goal.set', personId: v.ownerPersonId === 'me' ? null : v.ownerPersonId, data: { title: v.title, ownerPersonId: v.ownerPersonId } }]; } },
    'delegation': { label: 'Delegation assigned', fields: [['personId', 'person', 1], ['title', 'text', 1], ['level', 'select:1|2|3|4|5', 1]],
      make: function (v) { return [{ type: 'delegation.assigned', personId: v.personId, data: { title: v.title, level: Number(v.level) } }]; } },
    'conflict': { label: 'Conflict registered', fields: [['personId', 'person', 1], ['counterpartPersonId', 'person:opt', 0, 'Party B · roster'], ['counterpart', 'text', 0, 'Party B · name (if not on roster)'], ['summary', 'text', 1, 'What is it about']],
      make: function (v) { return [{ type: 'conflict.registered', personId: v.personId,
        data: { summary: v.summary, counterpartPersonId: v.counterpartPersonId || undefined, counterpart: v.counterpart || undefined } }]; } },
    'incident': { label: 'Incident registered', fields: [['title', 'text', 1], ['severity', 'select:1|2|3|4|5', 1], ['personId', 'person:opt', 0]],
      make: function (v) { return [{ type: 'incident.registered', personId: v.personId || null, data: { title: v.title, severity: Number(v.severity) } }]; } }
  };
  function withTime(date) { return date ? date + 'T12:00:00' : undefined; }
  function personOptions(mode, val) {
    var st = state(), out = '';
    if (mode === 'me') out += '<option value="me"' + (val === 'me' ? ' selected' : '') + '>me (myself)</option>';
    if (mode === 'opt') out += '<option value="">— not on roster / skip —</option>';
    if (!mode || mode === 'me') { /* full list */ }
    st.people.forEach(function (p) {
      if (p && !p.archived) out += '<option value="' + esc(p.id) + '"' + (val === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    });
    if (!out) out = '<option value="">— add people in Roster first —</option>';
    return out;
  }
  function captureField(f, values) {
    var key = f[0], spec = f[1], req = f[2], label = f[3] || (key.charAt(0).toUpperCase() + key.slice(1));
    if (spec === 'hidden') return '<input type="hidden" name="' + key + '" value="' + esc(values[key] || f[4] || '') + '">';
    var v = values[key] !== undefined ? values[key] : '';
    var h = '<div><label for="cf-' + key + '">' + esc(label) + (req ? ' *' : '') + '</label>';
    if (spec.indexOf('person') === 0) h += '<select id="cf-' + key + '" name="' + key + '">' + personOptions(spec.split(':')[1], v) + '</select>';
    else if (spec.indexOf('select') === 0) h += '<select id="cf-' + key + '" name="' + key + '">' + spec.split(':')[1].split('|').map(function (o) {
      return '<option value="' + o + '"' + (String(v) === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>';
    else if (spec === 'check') h = '<div><label style="text-transform:none;letter-spacing:0;display:flex;gap:6px;align-items:center"><input type="checkbox" id="cf-' + key + '" name="' + key + '"' + (v ? ' checked' : '') + ' style="width:auto"> ' + esc(label) + '</label>';
    else if (spec === 'area') h += '<textarea id="cf-' + key + '" name="' + key + '">' + esc(v) + '</textarea>';
    else h += '<input id="cf-' + key + '" name="' + key + '" type="' + spec + '" value="' + esc(v) + '">';
    return h + '</div>';
  }

  /* ---------- TODAY ---------- */
  function renderToday(view) {
    var st = state(), res = EN().evaluate(st, today());
    var fs = res.findings, sup = res.suppressed;
    var kind = view.dataset.capKind || 'oneonone';
    var h = '<div class="view-head"><span class="kicker">today</span><h1>' +
      new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + '</h1>' +
      '<span class="spacer"></span><span class="sub mono">' + fs.length + ' open loop' + (fs.length === 1 ? '' : 's') + (sup.length ? ' · ' + sup.length + ' suppressed' : '') + '</span></div>';
    h += '<div class="today-meta mono"><span>ranked by sev × confidence — math printed on every row</span><span>engine: ' + EN()._rulesCount + ' rules over ' + st.events.length + ' events</span></div>';

    /* capture bar */
    var cap = CAPTURE[kind];
    h += '<div class="capture' + (view.dataset.capOpen === '1' ? ' open' : '') + '"><div class="capture-bar"><select id="cap-kind">' +
      Object.keys(CAPTURE).map(function (k) { return '<option value="' + k + '"' + (k === kind ? ' selected' : '') + '>' + CAPTURE[k].label + '</option>'; }).join('') +
      '</select><button class="btn sm" data-action="cap-toggle">register</button>' +
      '<span class="legend">every registration is an event — all modules consume the same stream</span></div>';
    h += '<div class="capture-form"><div class="form-grid">' + cap.fields.map(function (f) { return captureField(f, {}); }).join('') + '</div>' +
      '<div class="form-actions"><button class="btn acc sm" data-action="cap-submit">write event</button><span class="err" id="cap-err"></span></div></div></div>';

    /* findings column */
    if (!fs.length) {
      h += '<div class="empty"><span class="serif">Nothing is calling for you.</span>' +
        (st.people.length ? 'The engine reads ' + st.events.length + ' events and finds nothing past a threshold. Register a 1:1, a pulse, a decision — the column wakes up.' :
        'Start at <a href="#/roster">Roster</a> — add your leads — or load the sample set at <a href="#/data">Data</a> to see the instrument in motion.') + '</div>';
    }
    fs.forEach(function (f, i) { h += findingRow(f, i); });
    if (sup.length) {
      h += '<div class="suppressed"><div class="rule-head">suppressed — audible, reversible, still counted</div>';
      sup.forEach(function (f) {
        h += '<div class="row mono"><span class="chip">' + esc(f.ruleId) + '</span><span>' + esc(f.title) + '</span><span>' + esc(f.suppressed) + '</span>' +
          '<button class="btn sm ghost" data-action="unmute" data-key="' + esc(f.key) + '">unmute</button></div>';
      });
      h += '</div>';
    }
    h += foot('today is one prioritized column — by design, no widgets');
    view.innerHTML = h;
  }
  function findingRow(f, i) {
    var h = '<div class="finding' + (f.ruleId === 'ENG' ? ' f-engine' : '') + '"><div class="f-rank' + (i === 0 ? ' top' : '') + '">' + (i + 1) + '</div><div>';
    h += '<div class="f-head"><span class="f-tag">' + esc(f.tag) + '</span><span class="f-title">' + esc(f.title) + '</span></div>';
    h += '<div class="f-action">' + esc(f.action) + '</div>';
    h += '<div class="f-why">' + f.basis.map(function (b) {
      return String(b).split('\n').map(function (line) { return '<div class="bl">' + esc(line) + '</div>'; }).join('');
    }).join('') + '</div>';
    h += '<div class="f-foot"><span class="f-conf" data-c="' + f.confidence.level + '"><b>' + f.confidence.level + '</b> confidence</span>' +
      '<span class="f-score">' + esc(f.breakdown) + '</span>';
    if (f.playbook) h += '<button class="btn sm acc" data-action="open-pb" data-pb="' + f.playbook + '" data-key="' + esc(f.key) + '">open ' + esc(PB().get(f.playbook).title) + '</button>';
    h += '<button class="btn sm ghost" data-action="snooze" data-key="' + esc(f.key) + '">snooze 7d</button>' +
      '<button class="btn sm ghost" data-action="dismiss" data-key="' + esc(f.key) + '">dismiss</button></div>';
    h += '<div class="f-confwhy">why this confidence: ' + esc(f.confidence.why) + '</div>';
    if (f.meta && f.meta.evidenceIds && f.meta.evidenceIds.length)
      h += '<div class="f-eids" title="source event ids — the audit trail">src: ' + f.meta.evidenceIds.map(esc).join(' · ') + '</div>';
    return h + '</div></div>';
  }

  /* ---------- ARRIVAL ---------- */
  function renderArrival(view) {
    var st = state(), a = EV().arrival(st, today());
    var h = '<div class="view-head"><span class="kicker">arrival instrument</span><h1>The first 90 have three cliffs</h1></div>';
    h += '<div class="note" style="margin:8px 0 4px">New leaders of leads rarely fail at 1:1s. They fail by optimizing toward <em>guessed</em> expectations, changing systems before finishing the listening tour, and trading on announced-but-unverified wins. This instrument watches all three — and stays silent until you tell it when you started.</div>';
    if (!a.set) {
      h += '<div class="capture open"><div class="section-h">When did you start leading these teams?</div>' +
        '<div class="assume">null is a real value: until you say, R9–R11 stay silent rather than guess.</div>' +
        '<div class="form-grid" style="max-width:320px"><div><label for="appt-date">Start date</label><input type="date" id="appt-date" value="' + today() + '"></div></div>' +
        '<div class="form-actions"><button class="btn acc sm" data-action="set-appointment">start the clock</button></div></div>' + foot('arrival projection: recomputed per read');
      view.innerHTML = h; return;
    }
    h += '<div class="instr" style="margin-top:16px"><div><div class="day-n">' + a.dayN + '<small> / 90 days in</small></div>' +
      '<div class="mono" style="color:var(--muted)">started ' + esc(a.startDate) + '</div></div><div>';
    h += statRow('boss expectations captured', a.expectations ? a.expectations + ' logged' : 'ZERO — day ' + a.dayN + ', gate is 14', !a.expectations && a.dayN >= 14);
    h += statRow('listening tour', a.tourDone + ' of ' + a.tourTotal + ' visited (gate: day 45)', a.tourDone < a.tourTotal && a.dayN >= 45);
    var openWins = a.wins.filter(function (w) { return !w.verified; });
    h += statRow('early wins', a.wins.length + ' committed · ' + (a.wins.length - openWins.length) + ' verified', false);
    h += '</div></div>';
    h += '<div class="section-h">Listening tour <span class="mono">' + a.tourDone + '/' + a.tourTotal + '</span></div>';
    h += '<div class="meter"><i style="width:' + (a.tourTotal ? Math.round(a.tourDone / a.tourTotal * 100) : 0) + '%"></i></div>';
    if (a.unvisited.length) h += '<div class="note">still owed: ' + a.unvisited.map(function (p) { return esc(p.name); }).join(', ') + ' — <a href="#/playbooks">run a tour visit</a></div>';
    else h += '<div class="note">coverage complete against today\'s roster. <span class="assume">people who join later re-open this line.</span></div>';
    h += '<div class="section-h">Win ledger</div><div class="rows">';
    if (!a.wins.length) h += '<div class="trow"><span class="cell">no wins committed yet — don\'t promise one without a verify date</span></div>';
    a.wins.forEach(function (w) {
      h += '<div class="trow" style="grid-template-columns:1fr auto auto"><span class="' + (w.verified ? 'cell' : 'tname') + '">' + esc(w.label) + '</span>' +
        '<span class="cell mono">verify ' + esc(w.verifyDate || 'unset') + '</span><span class="chip' + (w.verified ? '' : ' acc') + '">' + (w.verified ? 'verified' : 'OPEN') + '</span></div>';
    });
    h += '</div>';
    h += '<div class="rule-head">the three cliffs, watched by the engine</div>' +
      '<div class="note">R9 expectations by day 14 · R10 tour complete by day 45 · R11 every win verified past its date. All three fire on <a href="#/today">Today</a> with basis + confidence printed.</div>';
    h += foot('arrival projection: single source of truth');
    view.innerHTML = h;
  }
  function statRow(label, st, warn) {
    return '<div class="stat-row' + (warn ? ' warn' : '') + '"><span>' + esc(label) + '</span><span class="st">' + esc(st) + '</span></div>';
  }

  /* ---------- ROSTER + DOSSIER ---------- */
  function renderRoster(view) {
    var st = state();
    var people = st.people.filter(function (p) { return p && !p.archived; });
    var h = '<div class="view-head"><span class="kicker">roster</span><h1>' + people.length + ' people</h1><span class="sub mono">reporting line: you → your leads → their teams</span></div>';
    h += '<div class="rows">';
    people.forEach(function (p) {
      var last = EV().lastOneOnOne(st, p.id);
      var open = EV().openDelegations(st).filter(function (d) { return d.personId === p.id; }).length;
      var conflicts = EV().openConflicts(st).filter(function (c) { return c.personId === p.id || c.counterpartPersonId === p.id; }).length;
      var rt = p.reportsTo === 'me' || p.reportsTo === undefined ? 'direct' : (function () { var x = st.people.filter(function (q) { return q.id === p.reportsTo; })[0]; return x ? 'via ' + x.name : 'BROKEN LINE'; })();
      h += '<div class="trow" style="grid-template-columns:1.4fr 1fr .6fr .6fr auto"><a href="#/person/' + encodeURIComponent(p.id) + '"><span class="tname">' + esc(p.name) + '</span></a>' +
        '<span class="cell">' + esc(p.role || '—') + ' · ' + line + '</span><span class="cell mono">1:1 ' + agoStr(last && last.ts) + '</span>' +
        '<span class="cell mono">del ' + open + ' · conf ' + conflicts + '</span><span class="chip">every ' + p.cadenceDays + 'd</span></div>';
    });
    if (!people.length) h += '<div class="trow"><span class="cell">empty roster — add your first lead below, or load the sample set at <a href="#/data">Data</a></span></div>';
    h += '</div>';
    h += '<div class="section-h">Add a person</div><div class="form-grid" style="max-width:560px">' +
      '<div><label for="np-name">Name</label><input id="np-name"></div><div><label for="np-role">Role</label><input id="np-role" placeholder="lead · platform team"></div>' +
      '<div><label for="np-cad">1:1 cadence (days)</label><input id="np-cad" type="num" value="7"></div>' +
      '<div><label for="np-rt">Reports to</label><select id="np-rt"><option value="me">me (direct report)</option>' +
      people.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="form-actions"><button class="btn sm acc" data-action="add-person">add to roster</button><span class="err" id="np-err"></span></div>';
    h += foot('people are rows; everything else is events about them');
    view.innerHTML = h;
  }

  function renderPerson(view, id) {
    var st = state(), p = st.people.filter(function (x) { return x && x.id === id; })[0];
    if (!p) { view.innerHTML = '<div class="view-head"><h1>Person not found</h1></div><div class="note">The id in the URL resolves to nobody — archived or never existed. <a href="#/roster">Back to roster.</a></div>'; return; }
    var meas = EV().pulsesMeasured(st, p.id, 90, today());
    var est = EV().pulsesEstimatedCount(st, p.id, 90, today());
    var bal = EV().feedbackBalance(st, p.id, 60, today());
    var dels = EV().openDelegations(st).filter(function (d) { return d.personId === p.id; });
    var conflicts = EV().openConflicts(st).filter(function (c) { return c.personId === p.id || c.counterpartPersonId === p.id; });
    var incidents = EV().openIncidents(st).filter(function (x) { return x.personId === p.id; });
    var goals = EV().openGoals(st).filter(function (g) { return g.ownerPersonId === p.id; });
    var sl = EV().latestSL(st, p.id);
    var last = EV().lastOneOnOne(st, p.id);
    var h = '<div class="dossier-head"><span class="kicker">dossier</span><h1>' + esc(p.name) + '</h1>' +
      '<div class="facts mono"><span>' + esc(p.role || '—') + '</span><span>cadence ' + p.cadenceDays + 'd</span><span>last 1:1 ' + agoStr(last && last.ts) + '</span>' +
      '<span>' + (p.reportsTo === 'me' || p.reportsTo === undefined ? 'direct report' : 'skip-level') + '</span>' +
      '<a href="#/roster" style="margin-left:auto">← roster</a></div></div>';

    h += '<div class="rule-head">load &amp; mood — measured only (' + meas.length + ' readings · ' + est + ' estimated excluded)</div>';
    h += '<div class="spark">' + (meas.length ? spark(meas.map(function (e) { return e.data.load; })) : 'no data') + ' <span class="legend">load</span></div>';
    h += '<div class="spark">' + (meas.length ? spark(meas.map(function (e) { return e.data.mood; })) : 'no data') + ' <span class="legend">mood</span></div>';
    h += '<div class="legend">trend honesty: the engine needs ≥3 measured points before R7 says a word — fewer and it stays silent rather than fake a trend.</div>';

    h += '<div class="rule-head">feedback balance · 60d</div><div class="note">' + bal.corrective + ' corrective / ' + bal.positive + ' positive' +
      (bal.total >= 3 && (bal.corrective === 0 || bal.positive === 0) ? ' — <b>one-sided</b>, see Today' : ' — within doctrine balance') + '</div>';

    if (sl) h += '<div class="rule-head">situational read (latest)</div><div class="note">"' + esc(sl.data.task) + '" → ' + esc(sl.data.development) + ' · lead with ' + esc(sl.data.style) + ' ' + esc(sl.data.styleName) + ' <span class="mono" style="color:var(--muted)">(' + dt(sl.ts) + ' · comp ' + sl.data.competence + ' / comm ' + sl.data.commitment + ')</span></div>';

    h += '<div class="rule-head">open delegations (' + dels.length + ')</div><div class="rows">';
    if (!dels.length) h += '<div class="trow"><span class="cell">none open</span></div>';
    dels.forEach(function (d) {
      h += '<div class="trow" style="grid-template-columns:1fr auto auto auto"><span>' + esc(d.label) + '</span><span class="cell mono">L' + (d.level || '?') + '</span><span class="cell mono">' + dt(d.ts) + '</span>' +
        '<button class="btn sm ghost" data-action="close-delegation" data-id="' + esc(d.id) + '">close</button></div>';
    });
    h += '</div>';

    h += '<div class="rule-head">open conflicts (' + conflicts.length + ')</div><div class="rows">';
    if (!conflicts.length) h += '<div class="trow"><span class="cell">none open</span></div>';
    conflicts.forEach(function (c) {
      h += '<div class="trow" style="grid-template-columns:1fr auto auto"><span><span class="pair">' + esc(EV().pairLabel(st, c)) + '</span> — ' + esc(c.summary || 'no summary') + '</span>' +
        '<span class="cell mono">' + dt(c.ts) + '</span><button class="btn sm ghost" data-action="resolve-conflict" data-id="' + esc(c.id) + '">resolve</button></div>';
    });
    h += '</div>';

    h += '<div class="rule-head">goals owned (' + goals.length + ') · open incidents (' + incidents.length + ')</div><div class="rows">';
    goals.forEach(function (g) { h += '<div class="trow" style="grid-template-columns:1fr auto"><span>' + esc(g.label) + '</span><span class="cell mono">signal ' + agoStr(g.lastProgressTs) + '</span></div>'; });
    incidents.forEach(function (x) {
      h += '<div class="trow" style="grid-template-columns:1fr auto auto auto"><span>incident: ' + esc(x.label) + '</span><span class="cell mono">sev ' + (x.severity || '?') + '</span><span class="cell mono">quiet ' + agoStr(x.updatedTs) + '</span>' +
        '<button class="btn sm ghost" data-action="resolve-incident" data-id="' + esc(x.id) + '">resolve</button></div>';
    });
    if (!goals.length && !incidents.length) h += '<div class="trow"><span class="cell">no goals owned, no incidents open</span></div>';
    h += '</div>';

    h += '<div class="form-actions" style="margin-top:18px"><button class="btn sm acc" data-action="open-pb" data-pb="oneonone" data-person="' + esc(p.id) + '">open 1:1 run sheet</button>' +
      '<button class="btn sm" data-action="open-pb" data-pb="sl" data-person="' + esc(p.id) + '">situational read</button>' +
      '<button class="btn sm ghost" data-action="archive-person" data-id="' + esc(p.id) + '">archive</button></div>';
    h += foot('a dossier is a projection — nothing here is stored, everything is recomputed');
    view.innerHTML = h;
  }

  /* ---------- PLAYBOOKS (list + drawer) ---------- */
  function renderPlaybooks(view) {
    var h = '<div class="view-head"><span class="kicker">playbooks</span><h1>Procedures, not advice</h1></div>' +
      '<div class="note" style="margin:8px 0">Each one pre-fills from your live data and writes resolving events through the shared layer — Today, dossiers and the engine all see the result instantly. Nothing here is a wiki page.</div><div class="pb-list">';
    PB().list().forEach(function (pb) {
      h += '<a class="pb" href="#/playbooks" data-action="open-pb" data-pb="' + pb.id + '"><span class="pb-ic">' + icon(pb.icon) + '</span>' +
        '<span><h3>' + esc(pb.title) + '</h3><p>' + esc(pb.blurb) + '</p></span></a>';
    });
    h += '</div>' + foot('the mentor layer');
    view.innerHTML = h;
  }
  var pbCtx = { id: null, prefill: {} };
  function prefillFor(pbId, key) {
    var st = state(), out = {};
    if (key) {
      var f = null;
      try { f = EN().evaluate(st, today()).findings.filter(function (x) { return x.key === key; })[0]; } catch (e) {}
      if (f) {
        if (f.personId) out.personId = f.personId;
        if (f.ruleId === 'R6') {
          out.counterpartPersonId = f.meta.persons && f.meta.persons[1];
          out.conflictIds = f.meta.evidenceIds || [];
          out.conflicts = EV().openConflicts(st).filter(function (c) { return out.conflictIds.indexOf(c.id) >= 0; });
        }
        if (f.ruleId === 'R13') out.intent = 'nexus';
        if (f.ruleId === 'R7') out.intent = 'load';
        if (f.ruleId === 'R8') { out.skip = true; out.via = f.meta.via; }
        if (f.meta && f.meta.decisionId) out.decisionId = f.meta.decisionId;
        if (f.meta && f.meta.goalId) out.goalId = f.meta.goalId;
        if (f.meta && f.meta.winId) out.winId = f.meta.winId;
        if (f.meta && f.meta.incidentId) out.incidentId = f.meta.incidentId;
      }
    }
    return out;
  }
  function openPlaybook(id, prefill) {
    var pb = PB().get(id);
    if (!pb) return;
    pbCtx = { id: id, prefill: prefill || {} };
    var st = state();
    var ctx = { state: st, today: today(), person: pbCtx.prefill.personId ? EV().person(st, pbCtx.prefill.personId) : null };
    var drawer = document.getElementById('drawer');
    document.getElementById('drawer-title').textContent = pb.title;
    var h = '<div id="pb-guide">';
    pb.guide(ctx, pbCtx.prefill).forEach(function (b) {
      h += '<div class="g-block"><h4>' + esc(b.h) + '</h4>';
      if (b.lines) h += '<ul>' + b.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
      if (b.warn) h += '<div class="warn">' + esc(b.warn) + '</div>';
      if (b.script) h += '<div class="script">' + esc(b.script) + '</div>';
      h += '</div>';
    });
    h += '</div><div class="rule-head">log it — writes events through the shared layer</div><form id="pb-form" onsubmit="return false">';
    var fields = pb.fields(ctx, pbCtx.prefill);
    h += fields.map(function (f) { return pbField(f); }).join('');
    h += '<div class="form-actions"><button class="btn acc" data-action="pb-submit">write events</button><span class="err" id="pb-err"></span><span class="mono" style="color:var(--muted)" id="pb-ok"></span></div></form>';
    document.getElementById('drawer-body').innerHTML = h;
    drawer.hidden = false;
  }
  function pbField(f) {
    if (f.kind === 'hidden') return '<input type="hidden" name="' + f.key + '" value="' + esc(f.value || '') + '">';
    var st = state();
    var v = f.value !== undefined && f.value !== null ? f.value : '';
    var h = '<div><label>' + esc(f.label) + (f.required ? ' *' : '') + '</label>';
    if (f.kind === 'person') h += '<select name="' + f.key + '"><option value="">—</option>' +
      st.people.filter(function (p) { return p && !p.archived; }).map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (v === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>';
    else if (f.kind === 'select') h += '<select name="' + f.key + '">' + (f.options || []).map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (String(v) === String(o.v) ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select>';
    else if (f.kind === 'multicheck') h += (f.options || []).map(function (o) {
      var on = Array.isArray(v) && v.indexOf(o.v) >= 0;
      return '<label style="text-transform:none;letter-spacing:0;display:flex;gap:6px;align-items:center"><input type="checkbox" name="' + f.key + '" value="' + esc(o.v) + '"' + (on ? ' checked' : '') + ' style="width:auto"> ' + esc(o.l) + '</label>'; }).join('');
    else if (f.kind === 'check') h = '<div><label style="text-transform:none;letter-spacing:0;display:flex;gap:6px;align-items:center"><input type="checkbox" name="' + f.key + '"' + (v ? ' checked' : '') + ' style="width:auto"> ' + esc(f.label) + '</label>';
    else if (f.kind === 'area') h += '<textarea name="' + f.key + '">' + esc(v) + '</textarea>';
    else h += '<input name="' + f.key + '" type="' + (f.kind === 'num' ? 'number' : f.kind) + '" value="' + esc(v) + '">';
    if (f.hint) h += '<div class="legend">' + esc(f.hint) + '</div>';
    return h + '</div>';
  }
  function readForm(form) {
    var v = {}, els = form.querySelectorAll('[name]'), i;
    for (i = 0; i < els.length; i++) {
      var e = els[i], k = e.name;
      if (e.type === 'checkbox' && e.value && e.value !== 'on') {
        v[k] = v[k] || []; if (e.checked) v[k].push(e.value);
      } else if (e.type === 'checkbox') v[k] = e.checked;
      else v[k] = e.value;
    }
    return v;
  }

  /* ---------- HEALTH (T1–T12 + G1–G18 — executed at render) ---------- */
  var TESTS = [
    { id: 'T1', name: 'fresh boot yields schema v3 with appointment field', run: function (s) {
      var st = s.load(); return { pass: EN() && s.isShape(st), note: 'schemaVersion=' + st.meta.schemaVersion + ' appointment in meta=' + ('appointment' in st.meta) }; } },
    { id: 'T2', name: 'unparseable live bytes quarantined "corrupt", boot still clean', run: function (s) {
      localStorage.setItem(s.KEY, '{bad');
      var st = s.load();
      var q = s.browse().filter(function (k) { return k.kind === 'corrupt'; });
      return { pass: s.isShape(st) && q.length === 1 && q[0].preview === '{bad', note: 'quarantines: ' + q.length + ' · bytes preserved verbatim=' + (q[0] && q[0].preview === '{bad') }; } },
    { id: 'T3', name: 'parseable but shapeless payload quarantined "malformed"', run: function (s) {
      localStorage.setItem(s.KEY, '{"a":1}'); var st = s.load();
      var q = s.browse().filter(function (k) { return k.kind === 'malformed'; });
      return { pass: s.isShape(st) && q.length === 1, note: 'malformed keys: ' + q.length }; } },
    { id: 'T4', name: 'right shape, wrong lineage quarantined "foreign"', run: function (s) {
      var f = S.fresh(); f.meta.lineage = 'someone-else';
      localStorage.setItem(s.KEY, JSON.stringify(f)); var st = s.load();
      var q = s.browse().filter(function (k) { return k.kind === 'foreign'; });
      return { pass: s.isShape(st) && st.meta.lineage === 'mf' && q.length === 1, note: 'foreign keys: ' + q.length + ' · lineage kept=' + (st.meta.lineage === 'mf') }; } },
    { id: 'T5', name: 'schema from the future (v99) quarantined "newer", never downgraded', run: function (s) {
      var f = S.fresh(); f.meta.schemaVersion = 99;
      localStorage.setItem(s.KEY, JSON.stringify(f)); var st = s.load();
      var q = s.browse().filter(function (k) { return k.kind === 'newer'; });
      return { pass: st.meta.schemaVersion === 3 && q.length === 1, note: 'running v' + st.meta.schemaVersion + ' · newer keys: ' + q.length }; } },
    { id: 'T6', name: 'migration 1→3: reportsTo backfilled, appointment nulled, pre-migration bytes kept', run: function (s) {
      var f = S.fresh(); f.meta.schemaVersion = 1; delete f.meta.appointment;
      f.people.push({ id: 'p-a', name: 'Ana', role: '', cadenceDays: 7, createdAt: S.nowISO(), archived: false, seed: false });
      var bytes = JSON.stringify(f);
      localStorage.setItem(s.KEY, bytes); var st = s.load();
      var q = s.browse().filter(function (k) { return k.kind === 'pre-migration'; });
      return { pass: st.meta.schemaVersion === 3 && st.people[0].reportsTo === 'me' && ('appointment' in st.meta) && q.length === 1 && q[0].preview.indexOf('"schemaVersion":1') >= 0,
        note: 'v' + st.meta.schemaVersion + ' · reportsTo=' + st.people[0].reportsTo + ' · pre-migration key: ' + q.length }; } },
    { id: 'T7', name: 'write path: quota throw flips writeFailed pill, in-memory state kept', run: function (s) {
      s.load();
      var real = localStorage.setItem, r;
      localStorage.setItem = function () { var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
      try { r = s.trySetItem(s.KEY, '{}'); } finally { localStorage.setItem = real; }
      var st = s.state();
      return { pass: r && r.ok === false && r.quota === true && st.meta.writeFailed === true,
        note: 'trySetItem → ok=' + (r && r.ok) + ' quota=' + (r && r.quota) + ' writeFailed=' + st.meta.writeFailed }; } },
    { id: 'T8', name: 'identical import refused', run: function (s) {
      var st = s.load(); st.people.push({ id: 'p-a', name: 'Ana', role: '', cadenceDays: 7, reportsTo: 'me', createdAt: S.nowISO(), archived: false, seed: false }); s.save();
      var r = s.importData(s.exportText());
      return { pass: r.ok === false && /identical/.test(r.reason), note: r.reason || 'imported (wrong)' }; } },
    { id: 'T9', name: 'same-lineage older export (v2) is migrated at the import gate, then merged', run: function (s) {
      s.load();
      var f = S.fresh(); f.meta.schemaVersion = 2; delete f.meta.appointment;
      f.people.push({ id: 'p-b', name: 'Bo', role: '', cadenceDays: 7, reportsTo: 'me', createdAt: S.nowISO(), archived: false, seed: false });
      var r = s.importData(JSON.stringify(f));
      var st = s.state();
      return { pass: r.ok === true && st.people.length === 1 && st.meta.schemaVersion === 3,
        note: 'merged people=' + r.mergedPeople + ' · live v' + st.meta.schemaVersion }; } },
    { id: 'T10', name: 'two-pass merge: every id re-minted, every *Id reference rewired (goal keeps its owner)', run: function (s) {
      s.load();
      var f = S.fresh();
      f.people.push({ id: 'p-c', name: 'Cy', role: '', cadenceDays: 7, reportsTo: 'me', createdAt: S.nowISO(), archived: false, seed: false });
      f.events.push({ id: 'e-c', ts: S.nowISO(), type: 'goal.set', personId: null, data: { title: 'g', ownerPersonId: 'p-c' }, seed: false });
      var r = s.importData(JSON.stringify(f));
      var st = s.state();
      var goal = st.events.filter(function (e) { return e.type === 'goal.set'; })[0];
      var owner = st.people.filter(function (p) { return p.id === (goal && goal.data.ownerPersonId); })[0];
      return { pass: r.ok && goal && owner && owner.name === 'Cy' && owner.id !== 'p-c' && goal.id !== 'e-c',
        note: 'ids reminted=' + r.reminted + ' · owner rewired=' + (owner ? owner.name + ' @' + owner.id.slice(0, 12) + '…' : 'LOST') }; } },
    { id: 'T11', name: 'purge kills seed rows; meta.seeded stays true; reseed is a no-op', run: function (s) {
      var st = s.load();
      var n1 = EV().seed(st); s.save();
      var seededEvents = st.events.length;
      EV().purge(st); s.save();
      var after = s.load();
      var n2 = EV().seed(after);
      return { pass: n1 > 0 && after.events.filter(function (e) { return e.seed; }).length === 0 && after.meta.seeded === true && n2 === 0,
        note: 'seeded ' + n1 + ' · post-purge seed rows ' + after.events.filter(function (e) { return e.seed; }).length + ' · reseed returned ' + n2 }; } },
    { id: 'T12', name: 'normalization repairs, never drops: broken import rows all survive, repairs logged', run: function (s) {
      s.load();
      var f = S.fresh();
      f.events.push('garbage-row', { id: 'dup', ts: 'not-a-date', type: '', personId: 42, data: null }, { id: 'dup', ts: S.nowISO(), type: 'note', data: {} });
      var r = s.importData(JSON.stringify(f));
      var st = s.state();
      var repaired = st.log.filter(function (l) { return l.kind === 'normalize' || l.kind === 'repair' || l.kind === 'import'; }).length;
      return { pass: r.ok === true && st.events.length === 3 && repaired > 0,
        note: 'rows in=' + 3 + ' rows live=' + st.events.length + ' · repair/import log lines=' + repaired }; } }
  ];
  function runHealth() {
    var out = { tests: [], goldens: [], cleaned: 0 };
    var pre = 'leados:t-' + Date.now().toString(36) + '-';
    var seq = 0;
    TESTS.forEach(function (t) {
      var key = pre + (++seq), s = S.makeStore(key);
      try { var r = t.run(s); out.tests.push({ id: t.id, name: t.name, pass: !!r.pass, note: r.note }); }
      catch (e) { out.tests.push({ id: t.id, name: t.name, pass: false, note: 'threw: ' + (e && e.message || e) }); }
    });
    out.goldens = EN().runGoldens();
    out.cleaned = S.dropTestKeys('leados:t-');
    return out;
  }
  function renderHealth(view) {
    var res = runHealth();
    var tp = res.tests.filter(function (t) { return t.pass; }).length;
    var gp = res.goldens.filter(function (g) { return g.pass; }).length;
    var h = '<div class="view-head"><span class="kicker">health</span><h1>The wall counts itself</h1></div>';
    h += '<div class="note" style="margin:8px 0">Every assertion below just executed against the code paths production uses — disposable keys, cleaned after (' + res.cleaned + ' removed). Where any doc disagrees with this wall, this wall wins.</div>';
    h += '<div class="hw-sum">storage ' + tp + '/' + res.tests.length + ' · engine goldens ' + gp + '/' + res.goldens.length + '</div>';
    h += '<div class="rule-head">storage spine T1–T12</div>';
    res.tests.forEach(function (t) {
      h += '<div class="hw-row ' + (t.pass ? 'pass' : 'fail') + '"><span class="id">' + t.id + '</span><span>' + esc(t.name) + '<div class="obs">observed — ' + esc(t.note) + '</div></span><span class="st">' + (t.pass ? 'pass' : 'FAIL') + '</span></div>';
    });
    h += '<div class="rule-head">engine goldens G1–G18 (fixed today 2026-02-16 · pure, zero storage I/O)</div>';
    res.goldens.forEach(function (g) {
      h += '<div class="hw-row ' + (g.pass ? 'pass' : 'fail') + '"><span class="id">' + g.id + '</span><span>' + esc(g.name) + '<div class="obs">observed — ' + esc(g.note) + '</div></span><span class="st">' + (g.pass ? 'pass' : 'FAIL') + '</span></div>';
    });
    h += foot('fixture-based assertions on real code paths — not a fuzzer, and it does not cover UI rendering itself');
    view.innerHTML = h;
  }

  /* ---------- DATA ---------- */
  function renderData(view) {
    var st = state();
    var keys = S.browse();
    var h = '<div class="view-head"><span class="kicker">data</span><h1>One key, everything in it</h1></div>';
    h += '<div class="kv"><span class="k">live key</span><span class="mono">leados:data (' + JSON.stringify(st).length + ' bytes)</span>' +
      '<span class="k">schema</span><span class="mono">v' + st.meta.schemaVersion + ' · lineage "' + st.meta.lineage + '" · seeded=' + st.meta.seeded + '</span>' +
      '<span class="k">rows</span><span class="mono">' + st.people.length + ' people · ' + st.events.length + ' events · ' + st.log.length + ' log lines</span>' +
      '<span class="k">quota</span><span class="mono" style="color:' + (st.meta.writeFailed ? 'var(--accent)' : 'var(--muted)') + '">' + (st.meta.writeFailed ? 'WRITE FAILED at least once — export now' : 'writes healthy') + ' · ~5MB budget is an assumption (real limits aren\'t JS-queryable)</span></div>';

    h += '<div class="section-h">Export</div><div class="form-actions"><button class="btn sm" data-action="export">download .json</button>' +
      '<button class="btn sm ghost" data-action="export-view">show inline</button></div><div id="export-slot"></div>';

    h += '<div class="section-h">Import</div>' +
      '<div class="assume">refuses unparseable · malformed · foreign · newer · identical-to-live. Migrates same-lineage older. Merges with every id re-minted and every reference rewired. Live bytes preserved as .pre-import. first.</div>' +
      '<textarea class="import" id="import-text" placeholder=\'paste a LeadOS export here\'></textarea>' +
      '<div class="form-actions"><button class="btn sm acc" data-action="import">validate &amp; merge</button><span id="import-out" class="mono" style="color:var(--muted)"></span></div>';

    h += '<div class="section-h">Key browser <span class="mono">quarantines are read-only</span></div><div class="rows">';
    keys.forEach(function (k) {
      h += '<div class="keyrow"><span class="k">' + esc(k.key) + '</span><span class="chip' + (k.kind === 'live' ? ' me' : k.kind === 'other' ? '' : ' acc') + '">' + esc(k.kind) + '</span><span class="cell mono">' + k.bytes + ' B</span></div>' +
        (k.readonly ? '<div class="keyrow"><pre>' + esc(k.preview) + (k.preview.length >= 280 ? ' …' : '') + '</pre></div>' : '');
    });
    h += '</div>';

    h += '<div class="section-h">Sample set</div><div class="note">A mid-flight arrival (day 26: expectations missing, tour 1/4, a win past its gate) plus material for every rule — including the Dana×Priya pair and Marcus\'s nexus. Seeded rows are tagged <span class="mono">seed:true</span> and one-click purgeable.</div>' +
      '<div class="form-actions"><button class="btn sm" data-action="seed"' + (st.meta.seeded ? ' disabled style="opacity:.4;pointer-events:none"' : '') + '>load sample set</button>' +
      '<button class="btn sm ghost" data-action="purge">purge seeded rows</button><span class="mono" style="color:var(--muted)" id="seed-out"></span></div>';

    h += '<div class="section-h">Audit log <span class="mono">newest first · capped at 500</span></div>';
    st.log.slice().reverse().slice(0, 80).forEach(function (l) {
      h += '<div class="logrow"><span class="ts">' + esc(String(l.ts).slice(5, 19).replace('T', ' ')) + '</span><span class="kind">' + esc(l.kind) + '</span><span class="msg">' + esc(l.msg) + '</span></div>';
    });
    h += foot('backup = export · restore = import · forensics = quarantine keys + this log');
    view.innerHTML = h;
  }

  function foot(t) { return '<footer class="foot mono"><span>LeadOS mf-4</span><span>' + esc(t) + '</span><span style="margin-left:auto">offline · no network</span></footer>'; }

  /* ---------- global events ---------- */
  function onClick(e) {
    var t = e.target.closest('[data-action],[data-close-drawer]');
    if (!t) return;
    if (t.hasAttribute('data-close-drawer')) { document.getElementById('drawer').hidden = true; return; }
    var a = t.getAttribute('data-action'), st = state();
    if (a === 'cap-toggle') { var v = document.getElementById('view'); v.dataset.capOpen = v.dataset.capOpen === '1' ? '0' : '1'; route(); }
    else if (a === 'cap-submit') {
      var kind = document.getElementById('cap-kind').value, cap = CAPTURE[kind];
      var form = t.closest('.capture'), vals = readForm(form), err = '';
      cap.fields.forEach(function (f) { if (f[2] && !String(vals[f[0]] || '').trim()) err = (f[3] || f[0]) + ' is required'; });
      if (err) { document.getElementById('cap-err').textContent = err; return; }
      var made = cap.make(vals);
      EV().emitMany(st, made); save();
      delete document.getElementById('view').dataset.capOpen;
      route();
    }
    else if (a === 'snooze') { EV().emit(st, 'engine.snooze', { data: { key: t.getAttribute('data-key'), until: addDays(today(), 7) } }); save(); route(); }
    else if (a === 'dismiss') { EV().emit(st, 'engine.dismiss', { data: { key: t.getAttribute('data-key') } }); save(); route(); }
    else if (a === 'unmute') { EV().emit(st, 'engine.unmute', { data: { key: t.getAttribute('data-key') } }); save(); route(); }
    else if (a === 'open-pb') {
      e.preventDefault();
      var pre = t.getAttribute('data-person') ? { personId: t.getAttribute('data-person') } : prefillFor(t.getAttribute('data-pb'), t.getAttribute('data-key'));
      openPlaybook(t.getAttribute('data-pb'), pre);
    }
    else if (a === 'pb-submit') {
      var pb = PB().get(pbCtx.id), form2 = t.closest('form'), vals2 = readForm(form2);
      var fields = pb.fields({ state: st, today: today(), person: pbCtx.prefill.personId ? EV().person(st, pbCtx.prefill.personId) : null }, pbCtx.prefill);
      var miss = '';
      fields.forEach(function (f) { if (f.required && !String(vals2[f.key] || '').trim()) miss = f.label + ' is required'; });
      if (miss) { document.getElementById('pb-err').textContent = miss; return; }
      var evs = pb.submit(vals2, { state: st, today: today() }) || [];
      if (!evs.length) { document.getElementById('pb-err').textContent = 'nothing to write (e.g. all lines empty)'; return; }
      EV().emitMany(st, evs); save();
      document.getElementById('drawer').hidden = true;
      route();
    }
    else if (a === 'add-person') {
      var name = document.getElementById('np-name').value.trim();
      if (!name) { document.getElementById('np-err').textContent = 'name is required'; return; }
      EV().addPerson(st, { name: name, role: document.getElementById('np-role').value,
        cadenceDays: document.getElementById('np-cad').value, reportsTo: document.getElementById('np-rt').value });
      save(); route();
    }
    else if (a === 'archive-person') { EV().updatePerson(st, t.getAttribute('data-id'), { archived: true }); save(); location.hash = '#/roster'; }
    else if (a === 'close-delegation') { EV().emit(st, 'delegation.closed', { data: { delegationId: t.getAttribute('data-id'), how: 'closed from dossier' } }); save(); route(); }
    else if (a === 'resolve-conflict') { EV().emit(st, 'conflict.resolved', { data: { conflictId: t.getAttribute('data-id'), how: 'resolved from dossier' } }); save(); route(); }
    else if (a === 'resolve-incident') { EV().emit(st, 'incident.resolved', { data: { incidentId: t.getAttribute('data-id'), how: 'resolved from dossier' } }); save(); route(); }
    else if (a === 'set-appointment') {
      var d0 = document.getElementById('appt-date').value;
      if (!d0) return;
      st.meta.appointment = { startDate: d0 };
      EV().emit(st, 'appointment.started', { data: { startDate: d0 } });
      save(); route();
    }
    else if (a === 'seed') { var n = EV().seed(st); save(); route(); }
    else if (a === 'purge') { EV().purge(st); save(); route(); }
    else if (a === 'export') {
      var blob = new Blob([S.exportText()], { type: 'application/json' });
      var atag = document.createElement('a');
      atag.href = URL.createObjectURL(blob);
      atag.download = 'leados-export-' + today() + '.json';
      document.body.appendChild(atag); atag.click(); atag.remove();
    }
    else if (a === 'export-view') { document.getElementById('export-slot').innerHTML = '<pre style="margin-top:8px;font-family:var(--mono);font-size:10px;background:#fff;border:1px solid var(--hair);padding:8px;max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-all">' + esc(S.exportText().slice(0, 4000)) + '</pre>'; }
    else if (a === 'import') {
      var r = S.importData(document.getElementById('import-text').value);
      var out = document.getElementById('import-out');
      if (r.ok) { out.textContent = 'merged ' + r.mergedEvents + ' events · ' + r.mergedPeople + ' people · ' + r.reminted + ' ids re-minted' + (r.writeOk ? '' : ' · WRITE FAILED'); setTimeout(route, 600); }
      else out.textContent = 'refused — ' + r.reason;
    }
  }
  function onChange(e) {
    if (e.target && e.target.id === 'cap-kind') {
      var v = document.getElementById('view');
      v.dataset.capKind = e.target.value; v.dataset.capOpen = '1';
      route();
    }
  }
  function addDays(iso, n) { return new Date(Date.parse(iso + 'T12:00:00') + n * 86400000).toISOString().slice(0, 10); }

  /* ---------- boot ---------- */
  function boot() {
    S.load();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    window.addEventListener('hashchange', route);
    route();
    setTimeout(function () { document.getElementById('splash').classList.add('gone'); }, 120);
    setTimeout(function () { var s = document.getElementById('splash'); if (s) s.remove(); }, 320);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
