/* LeadOS pt-3 · js/ui.js — the surface (the only non-pure module besides store).
   Views: Today (single ranked column, printed score math, quick capture) ·
   Roster + dossier (line editor with cycle refusal · pulse sparkline with
   measured/estimated honesty · growth plans with D-spine) · Playbooks (generic
   renderer over js/playbooks.js descriptors — a new playbook is data, not a
   screen) · Health (runs LEADOS.health.run() at render — the authority wall)
   · Data (export/import with verdicts · quarantine browser · mutes + unmute ·
   settings · seed/purge · audit tail).
   Whatever the README claims, #/health's observed rows outrank it. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.ui = 'js/ui.js';

LEADOS.ui = (function () {
  'use strict';

  var _route = { view: 'today', arg: null };
  var _playOpen = null; /* {playId, ctx, fromFinding} */
  var _qcType = 'oneonone.logged';

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fmtD(iso) { return iso ? String(iso).slice(0, 10) : '—'; }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function Pj() { return LEADOS.events.project(LEADOS.store.state()); }
  function chip(txt, cls) { return '<span class="chip ' + (cls || '') + '">' + esc(txt) + '</span>'; }
  function icon(name) {
    var p = {
      today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2"/>',
      roster: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S13.9 16 14.5 19"/><circle cx="16.5" cy="9" r="2.4"/><path d="M16 14.6c2.4.2 4 1.6 4.5 4"/>',
      play: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 0 4 21.5Z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5A1.5 1.5 0 0 1 20 21.5Z"/>',
      health: '<path d="M9 3h6M10 3v6.3L4.7 18a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 9.3V3"/><path d="M7.5 14h9"/>',
      data: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5V18.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5.5"/><path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
      warn: '<path d="M12 3 2.5 20h19Z"/><path d="M12 9v5M12 17v.5"/>',
      plus: '<path d="M12 5v14M5 12h14"/>'
    }[name] || '';
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('gone'); setTimeout(function () { t.remove(); }, 300); }, 3600);
  }
  function personOptions(P, selected, allowEmpty) {
    var out = allowEmpty ? '<option value="">— nobody —</option>' : '';
    var any = false;
    P.people.forEach(function (p) {
      if (p.archived) return;
      any = true;
      out += '<option value="' + esc(p.id) + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    });
    if (!any && !allowEmpty) out = '<option value="">— add people on the Roster first —</option>';
    return out;
  }

  /* ---------- banners ---------- */
  function bannersHTML() {
    var st = LEADOS.store, out = '';
    if (st.volatile()) out += '<div class="banner hot">' + icon('warn') + '<div><b>Storage unavailable.</b> localStorage is blocked or full at boot — LeadOS is running on a <b>session-memory vault</b>. Everything works; <b>nothing persists</b>. Quarantine copies die with this tab. Enable storage and reload to keep data.</div></div>';
    if (st.readOnly()) out += '<div class="banner hot">' + icon('warn') + '<div><b>Read-only boot.</b> ' + esc(st.readOnlyWhy() || '') + ' Your data is untouched; writes are hard-blocked. See #/data → quarantine.</div></div>';
    var bs = st.bootStatus();
    if (bs.quarantined && (bs.status === 'corrupt' || bs.status === 'malformed' || bs.status === 'foreign')) out += '<div class="banner">' + icon('warn') + '<div><b>Your saved store was unreadable</b> (' + esc(bs.status) + ') at boot. LeadOS started clean rather than guessing — the original bytes are preserved read-only in quarantine (key <code>' + esc(bs.quarantined) + '</code>) under #/data.</div></div>';
    if (bs.status === 'migrated') out += '<div class="banner ok"><div><b>Store migrated</b> through the ladder to schema v' + st.SCHEMA + '. A pre-migration snapshot sits in quarantine under #/data. Original bytes were never edited in place.</div></div>';
    var s = st.state();
    if (s && s.meta && s.meta.writeFailed) out += '<div class="banner hot">' + icon('warn') + '<div><b>WRITE FAILED.</b> The last save was refused by the browser (quota or blocked storage). Export a backup at #/data before doing anything else.</div></div>';
    return out;
  }

  /* ---------- Today ---------- */
  function findingHTML(f, i, P) {
    var playRef = LEADOS.playbooks.forFinding(f, P);
    var sevCls = f.sev >= 4 ? 'sevhot' : f.sev === 3 ? 'sevmid' : 'sevlow';
    var h = '<div class="fin ' + sevCls + '">';
    h += '<div class="fin-rank">' + String(i + 1).padStart(2, '0') + '</div>';
    h += '<div class="fin-body">';
    h += '<div class="fin-meta">' + chip(f.rule, 'rule') + chip('sev ' + f.sev, '') + chip('conf ' + f.conf, f.conf === 'high' ? 'ok' : f.conf === 'medium' ? 'mid' : 'low') + (f.play ? chip('playbook: ' + f.play, 'playchip') : chip('no playbook — see basis', 'mut')) + '</div>';
    h += '<div class="fin-title">' + esc(f.title) + '</div>';
    h += '<div class="fin-basis">' + f.basis.map(function (b) { return '<div>· ' + esc(b) + '</div>'; }).join('') + '</div>';
    h += '<div class="fin-conf">confidence ' + f.conf.toUpperCase() + ' — ' + esc(f.confWhy) + '</div>';
    h += '<div class="fin-score">' + esc(f.scoreMath) + '</div>';
    h += '<div class="fin-act">';
    if (playRef) h += '<button class="btn acc" data-act="play" data-key="' + esc(f.key) + '">Open playbook: ' + esc(playRef.playId) + '</button>';
    else if (f.rule === 'R9') h += '<a class="btn" href="#/roster">Fix the line on Roster</a>';
    else if (f.rule === 'ENG') h += '<a class="btn" href="#/health">Inspect at Health</a>';
    h += '<button class="btn ghost" data-act="snooze" data-key="' + esc(f.key) + '" data-title="' + esc(f.title) + '">Snooze 7d</button>';
    h += '<button class="btn ghost" data-act="dismiss" data-key="' + esc(f.key) + '" data-title="' + esc(f.title) + '">Dismiss</button>';
    h += '</div></div></div>';
    return h;
  }

  var QC_FORMS = {
    'oneonone.logged': { label: '1:1', fields: [['personId', 'person'], ['note', 'text']] },
    'skiplevel.logged': { label: 'skip-level', fields: [['personId', 'person'], ['note', 'text']] },
    'pulse.recorded': { label: 'pulse', fields: [['personId', 'person'], ['load', 'num010'], ['mood', 'num010'], ['measured', 'bool']] },
    'feedback.given': { label: 'feedback', fields: [['personId', 'person'], ['polarity', 'polarity'], ['note', 'text']] },
    'decision.logged': { label: 'decision', fields: [['title', 'text'], ['severity', 'sev15'], ['reviewDate', 'date']] },
    'decision.outcome': { label: 'decision outcome', fields: [['decisionId', 'opendecision'], ['result', 'text']] },
    'goal.set': { label: 'goal', fields: [['title', 'text'], ['ownerId', 'personOpt']] },
    'goal.progress': { label: 'goal progress', fields: [['goalId', 'opengoal'], ['note', 'text']] },
    'delegation.assigned': { label: 'delegation', fields: [['personId', 'person'], ['task', 'text'], ['level', 'lvl15'], ['checkInDate', 'date']] },
    'delegation.closed': { label: 'close delegation', fields: [['delegationId', 'opendelegation'], ['result', 'text']] },
    'conflict.logged': { label: 'conflict', fields: [['aId', 'personOpt'], ['bId', 'personOpt'], ['text', 'text'], ['intensity', 'int15']] },
    'conflict.resolved': { label: 'resolve conflict', fields: [['pairKey', 'openpair'], ['note', 'text']] },
    'note.added': { label: 'note', fields: [['note', 'text']] }
  };
  function qcFieldHTML(f, P) {
    var k = f[0], kind = f[1];
    if (kind === 'person') return '<label>' + k + '<select name="' + k + '">' + personOptions(P) + '</select></label>';
    if (kind === 'personOpt') return '<label>' + k + '<select name="' + k + '">' + personOptions(P, null, true) + '</select></label>';
    if (kind === 'text') return '<label>' + k + '<input name="' + k + '" type="text" autocomplete="off"></label>';
    if (kind === 'date') return '<label>' + k + '<input name="' + k + '" type="date"></label>';
    if (kind === 'num010') return '<label>' + k + '<input name="' + k + '" type="number" min="0" max="10" step="1"></label>';
    if (kind === 'bool') return '<label class="row"><input name="' + k + '" type="checkbox" checked> ' + k + ' (uncheck = estimated; R7 excludes those, by design)</label>';
    if (kind === 'polarity') return '<label>' + k + '<select name="' + k + '"><option>positive</option><option>corrective</option></select></label>';
    if (kind === 'sev15' || kind === 'int15' || kind === 'lvl15') return '<label>' + k + '<select name="' + k + '"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label>';
    if (kind === 'opendecision') return '<label>' + k + '<select name="' + k + '">' + P.openDecisions.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.title) + '</option>'; }).join('') + '</select></label>';
    if (kind === 'opengoal') return '<label>' + k + '<select name="' + k + '">' + P.openGoals.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.title) + '</option>'; }).join('') + '</select></label>';
    if (kind === 'opendelegation') {
      var opts = '';
      Object.keys(P.delegationById).forEach(function (id) { var d = P.delegationById[id]; opts += '<option value="' + esc(id) + '">' + esc(d.task) + ' · ' + esc((P.peopleById[d.personId] || {}).name || '?') + '</option>'; });
      return '<label>' + k + '<select name="' + k + '">' + opts + '</select></label>';
    }
    if (kind === 'openpair') return '<label>' + k + '<select name="' + k + '">' + P.openConflictPairs.map(function (c) { return '<option value="' + esc(c.pairKey) + '">' + esc(c.pairKey) + ' · ' + c.events.length + ' logged</option>'; }).join('') + '</select></label>';
    return '';
  }
  function todayView() {
    var P = Pj();
    var r = LEADOS.engine.run(P, new Date().toISOString());
    var st = LEADOS.store.state();
    var h = '<header class="vhead"><div class="kicker">LeadOS · today</div><h1>' + esc(new Date().toDateString()) + '</h1>';
    h += '<div class="subline">' + r.findings.length + ' active finding(s) · ' + r.suppressedCount + ' suppressed (<a href="#/data">audit + unmute at Data</a>) · ' + st.people.length + ' people · ' + st.events.length + ' events · schema v' + LEADOS.store.SCHEMA + '</div>';
    if (P.span) h += '<div class="spanline' + (P.span.over ? ' hot' : '') + '">span-load: ' + esc(P.span.math) + (P.span.over ? ' · OVER — pricing is arithmetic, not judgment; cut count or cut minutes in Settings' : ' · within stated capacity') + '</div>';
    h += '</header>';
    if (!st.people.length && !st.events.length) {
      h += '<div class="empty"><p><b>Nothing here yet — and that is the truth, not a bug.</b></p><p>LeadOS advises from what you log. With zero events it says zero, because anything else would be faking certainty. Two honest ways to start:</p><p><a class="btn acc" href="#/roster">Add your leads on the Roster</a> <button class="btn" data-act="seed">Load the sample set (engineered to make R1–R10 fire)</button></p><p class="mut">Where the engine cannot know (not logged, not measured), it stays silent — never guessed.</p></div>';
    }
    h += '<section class="feed">' + (r.findings.length ? r.findings.map(function (f, i) { return findingHTML(f, i, P); }).join('') : (st.events.length ? '<div class="empty"><p><b>No active findings.</b> Either things are genuinely in hand, or the data is thin — ' + st.people.length + ' people, ' + st.events.length + ' events on file. Thin data is the more common cause in week one.</p></div>' : '')) + '</section>';
    h += '<section class="qc"><h2>' + icon('plus') + ' Quick capture</h2><div class="qc-row"><select id="qc-type">';
    Object.keys(QC_FORMS).forEach(function (t) { h += '<option value="' + t + '"' + (t === _qcType ? ' selected' : '') + '>' + esc(QC_FORMS[t].label) + ' · ' + t + '</option>'; });
    h += '</select></div><form id="qc-form" class="qc-form" data-type="' + esc(_qcType) + '">';
    QC_FORMS[_qcType].fields.forEach(function (f) { h += qcFieldHTML(f, P); });
    h += '<button class="btn acc" type="submit">Append ' + esc(_qcType) + '</button></form></section>';
    return h;
  }
  function bindToday(root) {
    var sel = $('#qc-type', root);
    if (sel) sel.addEventListener('change', function () { _qcType = sel.value; render(); });
    var form = $('#qc-form', root);
    if (form) form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var type = form.getAttribute('data-type'), data = {}, bad = null;
      $all('[name]', form).forEach(function (el) {
        if (el.type === 'checkbox') { data[el.name] = el.checked; return; }
        var v = el.value;
        if (v === '') { data[el.name] = undefined; return; }
        if (['severity', 'intensity', 'level', 'load', 'mood'].indexOf(el.name) >= 0) { var n = +v; if (isNaN(n)) { bad = el.name + ': not a number'; return; } data[el.name] = n; return; }
        data[el.name] = v;
      });
      if (bad) { toast(bad, 'err'); return; }
      Object.keys(data).forEach(function (k) { if (data[k] === undefined) delete data[k]; });
      if (type === 'pulse.recorded' && (data.load == null || data.mood == null)) { toast('pulse needs load AND mood 0–10', 'err'); return; }
      if (type === 'conflict.logged' && !data.text && !data.aId) { toast('conflict needs text or at least a linked person', 'err'); return; }
      var r = LEADOS.events.append(type, data);
      if (r && r.error) toast(r.error, 'err');
      else toast('appended ' + type, 'ok');
    });
  }

  /* ---------- Roster + dossier ---------- */
  function sparkline(pulses) {
    if (!pulses || !pulses.length) return '<span class="mut">no pulses</span>';
    var pts = pulses.slice(-14);
    var measured = pts.filter(function (p) { return p.measured; }).length;
    var w = 132, hh = 30, out = '<svg class="spark" viewBox="0 0 ' + w + ' ' + hh + '" aria-hidden="true">';
    var step = pts.length > 1 ? (w - 8) / (pts.length - 1) : 0;
    var moodPts = [];
    pts.forEach(function (p, i) {
      var x = 4 + i * step;
      if (typeof p.load === 'number' && p.load >= 0 && p.load <= 10) {
        var bl = (p.load / 10) * (hh - 6);
        out += '<rect x="' + (x - 2.2) + '" y="' + (hh - 2 - bl) + '" width="4.4" height="' + bl + '" class="s-load' + (p.measured ? '' : ' est') + '"/>';
      }
      if (typeof p.mood === 'number' && p.mood >= 0 && p.mood <= 10) moodPts.push([x, (hh - 3) - (p.mood / 10) * (hh - 8), p.measured]);
    });
    if (moodPts.length > 1) out += '<polyline points="' + moodPts.map(function (m) { return m[0] + ',' + m[1]; }).join(' ') + '" class="s-line"/>';
    moodPts.forEach(function (m) { out += '<circle cx="' + m[0] + '" cy="' + m[1] + '" r="2.1" class="' + (m[2] ? 's-dot' : 's-dot est') + '"/>'; });
    out += '</svg><span class="mut spark-cap">bars load · line mood · hollow = estimated (excluded from R7) · ' + measured + '/' + pts.length + ' measured' + (measured < 3 ? ' · trend withheld: need ≥3 measured' : '') + '</span>';
    return out;
  }
  function dSpine(plan) {
    if (!plan.spine.length) return '<span class="mut">no read yet</span>';
    var lv = { D1: 4, D2: 3, D3: 2, D4: 1 };
    var w = Math.max(120, plan.spine.length * 34), hh = 34;
    var out = '<svg class="spark dspine" viewBox="0 0 ' + w + ' ' + hh + '" aria-hidden="true">';
    [1, 2, 3, 4].forEach(function (l) { var y = 4 + (l - 1) * 8; out += '<line x1="0" y1="' + y + '" x2="' + w + '" y2="' + y + '" class="s-grid"/>'; });
    var pts = plan.spine.map(function (s, i) {
      var x = 10 + i * ((w - 20) / Math.max(1, plan.spine.length - 1));
      var y = 4 + ((lv[s.d] || 0) * 8) - 4;
      return { x: isNaN(y) ? 2 : x, y: isNaN(y) ? hh - 4 : y, d: s.d, ts: s.ts };
    });
    if (pts.length > 1) out += '<polyline points="' + pts.map(function (p) { return p.x + ',' + p.y; }).join(' ') + '" class="s-line acc"/>';
    pts.forEach(function (p) { out += '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" class="s-dot acc"><title>' + esc((p.d || '?') + ' · ' + fmtD(p.ts)) + '</title></circle>'; });
    out += '</svg><span class="mut spark-cap">D-spine (bottom = D4 independent): ' + plan.spine.map(function (s) { return (s.d || '?') + '@' + fmtD(s.ts).slice(5); }).join(' → ') + '</span>';
    return out;
  }
  function rosterView() {
    var P = Pj();
    var h = '<header class="vhead"><div class="kicker">LeadOS · roster</div><h1>Roster</h1><div class="subline">' + P.directs.length + ' direct(s) · ' + P.skips.length + ' skip(s) · ' + P.lines.broken.length + ' broken line(s). Direct = reports to you (no lead set). Skip = exactly one lead below. Anything else is broken or outside the leads-of-leads model, and R9 says so.</div></header>';
    h += '<form class="addrow" id="add-person"><input name="name" placeholder="Name" required><input name="role" placeholder="Role — e.g. Team lead, Platform"><input name="cadenceDays" type="number" min="1" max="90" placeholder="1:1 cadence d (14 default)"><button class="btn acc" type="submit">Add person</button></form>';
    if (P.lines.broken.length) {
      h += '<div class="broken"><h3>' + icon('warn') + ' Broken lines (R9)</h3>' + P.lines.broken.map(function (b) { return '<div class="muted-row">· <b>' + esc(b.name) + '</b> — ' + esc(b.why) + '</div>'; }).join('') + '</div>';
    }
    h += '<div class="rows">';
    P.people.forEach(function (p) {
      var isDirect = P.directs.indexOf(p) >= 0, isSkip = P.skips.indexOf(p) >= 0;
      var last1 = P.oneononeLast[p.id], lastS = P.skiplevelLast[p.id];
      var plans = (P.plansByPerson[p.id] || []).filter(function (x) { return !x.closed; });
      h += '<div class="row' + (p.archived ? ' archived' : '') + '" data-pid="' + esc(p.id) + '">';
      h += '<div class="row-main"><a class="row-name" href="#/roster/' + esc(p.id) + '">' + esc(p.name) + '</a><span class="mut">' + esc(p.role || '') + '</span></div>';
      h += '<div class="row-meta">' + chip(isDirect ? 'direct' : isSkip ? 'skip' : p.archived ? 'archived' : 'line?', isDirect ? 'ok' : isSkip ? 'mid' : 'low')
        + '<span class="mut">1:1 ' + (last1 ? fmtD(last1.ts) : 'never') + ' · skip ' + (lastS ? fmtD(lastS.ts) : 'never') + '</span>'
        + (plans.length ? chip(plans.length + ' plan(s)', 'playchip') : '')
        + ' <a class="btn ghost sm" href="#/roster/' + esc(p.id) + '">dossier</a></div>';
      h += '</div>';
    });
    h += '</div>';
    return h;
  }
  function dossierView(pid) {
    var P = Pj(), p = P.peopleById[pid];
    if (!p) return '<header class="vhead"><h1>Unknown person</h1><div class="subline"><a href="#/roster">← roster</a></div></header>';
    var isDirect = P.directs.indexOf(p) >= 0, isSkip = P.skips.indexOf(p) >= 0;
    var h = '<header class="vhead"><div class="kicker"><a href="#/roster">← roster</a></div><h1>' + esc(p.name) + (p.archived ? ' <span class="mut">(archived)</span>' : '') + '</h1><div class="subline">' + esc(p.role || '') + ' · added ' + fmtD(p.createdAt) + ' · ' + (isDirect ? 'direct report' : isSkip ? 'skip-level (your lead: ' + esc((P.peopleById[p.reportsTo] || {}).name || '?') + ')' : 'not on a clean line — fix below') + '</div></header>';
    h += '<section class="block"><h2>Line & cadences</h2><form id="person-edit" class="editgrid" data-pid="' + esc(pid) + '">';
    h += '<label>reports to (empty = reports to you)<select name="reportsTo">' + personOptions(P, p.reportsTo, true) + '</select></label>';
    h += '<label>1:1 cadence days<input name="cadenceDays" type="number" min="1" max="90" value="' + (p.cadenceDays || '') + '" placeholder="14 (default)"></label>';
    h += '<label>skip cadence days<input name="skipCadenceDays" type="number" min="1" max="365" value="' + (p.skipCadenceDays || '') + '" placeholder="' + ((P.settings && P.settings.skipCadenceDefaultDays) || 60) + ' (default)"></label>';
    h += '<label class="row"><input name="archived" type="checkbox"' + (p.archived ? ' checked' : '') + '> archived</label>';
    h += '<button class="btn" type="submit">Save line & cadences</button><div class="formerr" id="person-err"></div></form></section>';
    h += '<section class="block"><h2>Load & mood</h2><div class="sparkwrap">' + sparkline(P.pulsesByPerson[pid]) + '</div></section>';
    var slH = P.slHistoryByPerson[pid] || [];
    h += '<section class="block"><h2>Situational reads</h2>' + (slH.length ? slH.map(function (s) { return '<div class="muted-row">· ' + fmtD(s.ts) + ' — ' + esc(s.d || '?') + ' → ' + esc(s.s || '?') + ' · comp ' + s.competence + '/5 · commit ' + s.commitment + '/5' + (s.note ? ' · ' + esc(s.note) : '') + '</div>'; }).join('') : '<div class="muted-row mut">no sl.assessed on file — run “Situational read” in Playbooks before your next delegation</div>') + '</section>';
    var plans = (P.plansByPerson[pid] || []);
    h += '<section class="block"><h2>Growth plans <button class="btn sm acc" data-act="new-plan" data-pid="' + esc(pid) + '">new growth plan</button></h2>';
    if (!plans.length) h += '<div class="muted-row mut">none yet — a plan is what turns a situational read into follow-through; R10 guards the review date</div>';
    plans.forEach(function (pl) {
      h += '<div class="plan' + (pl.closed ? ' archived' : '') + '">';
      h += '<div class="plan-head"><b>' + esc(pl.goal) + '</b> ' + chip((pl.d || 'D?') + ' → ' + (pl.s || 'S?'), 'mid') + chip(pl.closed ? 'closed: ' + (pl.result || '?') : 'open', pl.closed ? 'mut' : 'ok') + '</div>';
      h += '<div class="muted-row mut">created ' + fmtD(pl.ts) + (pl.task ? ' · practicing on: ' + esc(pl.task) : '') + ' · review by ' + (pl.reviewBy ? fmtD(pl.reviewBy) : '—') + ' · check-ins ' + pl.checkins + (pl.lastProgress != null ? ' · progress ' + pl.lastProgress + '/100' : '') + '</div>';
      if (pl.actions.length) h += '<div class="muted-row mut">actions: ' + pl.actions.map(esc).join(' · ') + '</div>';
      h += '<div class="sparkwrap">' + dSpine(pl) + '</div>';
      if (!pl.closed) h += '<button class="btn sm" data-act="review-plan" data-plan="' + esc(pl.id) + '">run growth review (R10 guards this)</button>';
      h += '</div>';
    });
    h += '</section>';
    var fb = (P.feedbackByPerson[pid] || []).slice(-6);
    h += '<section class="block"><h2>Recent feedback</h2>' + (fb.length ? fb.map(function (f) { return '<div class="muted-row">· ' + fmtD(f.ts) + ' — ' + esc(f.polarity || '?') + (f.sbi && (f.sbi.s || f.sbi.b || f.sbi.i) ? ' · S:' + esc(f.sbi.s || '—') + ' B:' + esc(f.sbi.b || '—') + ' I:' + esc(f.sbi.i || '—') : (f.note ? ' · ' + esc(f.note) : '')) + '</div>'; }).join('') : '<div class="muted-row mut">none logged</div>') + '</section>';
    var dels = P.delegationsOpenByPerson[pid] || [];
    h += '<section class="block"><h2>Open delegations</h2>' + (dels.length ? dels.map(function (d) { return '<div class="muted-row">· ' + esc(d.task) + ' — L' + (d.level || '—') + ' · check-in ' + (d.checkInDate ? fmtD(d.checkInDate) : 'unset') + '</div>'; }).join('') : '<div class="muted-row mut">none open</div>') + '</section>';
    var mine = LEADOS.store.state().events.filter(function (e) { return e.data && e.data.personId === pid; }).slice(-20);
    h += '<section class="block"><h2>Event trail (last ' + mine.length + ')</h2>' + (mine.length ? mine.map(function (e) { return '<div class="muted-row mono">· ' + fmtD(e.ts) + ' ' + esc(e.type) + ' <span class="mut">' + esc(e.id) + '</span></div>'; }).join('') : '<div class="muted-row mut">no events reference this person</div>') + '</section>';
    return h;
  }
  function bindRoster(root) {
    var add = $('#add-person', root);
    if (add) add.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = $('[name=name]', add).value.trim();
      if (!name) { toast('name required', 'err'); return; }
      var cad = $('[name=cadenceDays]', add).value;
      var r = LEADOS.store.peopleAdd({ name: name, role: $('[name=role]', add).value.trim(), cadenceDays: cad ? +cad : null });
      if (r && r.error) toast(r.error, 'err'); else { toast('added ' + name, 'ok'); render(); }
    });
    var edit = $('#person-edit', root);
    if (edit) edit.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var pid = edit.getAttribute('data-pid');
      var r = LEADOS.store.personUpdate(pid, {
        reportsTo: $('[name=reportsTo]', edit).value || null,
        cadenceDays: $('[name=cadenceDays]', edit).value || null,
        skipCadenceDays: $('[name=skipCadenceDays]', edit).value || null,
        archived: $('[name=archived]', edit).checked
      });
      if (r && r.error) { var e2 = $('#person-err', root); if (e2) e2.textContent = r.error; toast(r.error, 'err'); render(); }
      else { toast('saved', 'ok'); render(); }
    });
  }

  /* ---------- Playbooks ---------- */
  function playbooksView() {
    var P = Pj();
    var h = '<header class="vhead"><div class="kicker">LeadOS · playbooks</div><h1>Playbooks</h1><div class="subline">Structured help that pre-fills from your data and saves as events. Recommended text is labeled — none of it is presented as certainty.</div></header>';
    if (_playOpen) {
      var pl = LEADOS.playbooks.byId[_playOpen.playId];
      if (pl) {
        var pre = pl.prefill ? pl.prefill(_playOpen.ctx || {}, P) : { notes: [] };
        h += '<section class="block playbook-open"><h2>' + esc(pl.title) + '</h2>';
        if (_playOpen.fromFinding) h += '<div class="muted-row mut">opened from finding ' + esc(_playOpen.fromFinding) + ' — the data that triggered it pre-fills this form</div>';
        (pre.notes || []).forEach(function (n) { h += '<div class="pnote">' + esc(n) + '</div>'; });
        h += '<form id="play-form" class="editgrid" data-play="' + esc(pl.id) + '">';
        (pl.fields || []).forEach(function (f) {
          var v = pre.values && pre.values[f.k] !== undefined ? pre.values[f.k] : (f.value !== undefined ? f.value : '');
          h += '<div class="ffield"' + (f.showIf ? ' data-watch="' + esc(f.showIf.k) + '" data-watchv="' + esc(f.showIf.v) + '"' : '') + '>';
          h += '<label>' + esc(f.label);
          if (f.kind === 'textarea') h += '<textarea name="' + esc(f.k) + '" rows="3">' + esc(v) + '</textarea>';
          else if (f.kind === 'select') h += '<select name="' + esc(f.k) + '">' + f.options.map(function (o) { return '<option value="' + esc(o) + '"' + (String(v) === String(o) ? ' selected' : '') + '>' + esc(o === '' ? '—' : o) + '</option>'; }).join('') + '</select>';
          else if (f.kind === 'person') h += '<select name="' + esc(f.k) + '">' + personOptions(P, v || (_playOpen.ctx || {}).personId, !!f.allowEmpty) + '</select>';
          else if (f.kind === 'number') h += '<input name="' + esc(f.k) + '" type="number" value="' + esc(v) + '" step="1">';
          else if (f.kind === 'date') h += '<input name="' + esc(f.k) + '" type="date" value="' + esc(v) + '">';
          else h += '<input name="' + esc(f.k) + '" type="text" value="' + esc(v) + '" autocomplete="off">';
          h += '</label>';
          if (f.help) h += '<div class="fhelp">' + esc(f.help) + '</div>';
          h += '</div>';
        });
        if (pl.live) h += '<pre class="livebox" id="play-live"></pre>';
        h += '<div class="formerr" id="play-err"></div><div class="btnrow"><button class="btn acc" type="submit">Save as events</button><button class="btn ghost" type="button" data-act="close-play">Cancel</button></div></form></section>';
      }
    }
    h += '<div class="rows">';
    LEADOS.playbooks.PLAYS.forEach(function (pl) {
      h += '<div class="row"><div class="row-main"><span class="row-name">' + esc(pl.title) + '</span><span class="mut">' + esc(pl.forWhat || '') + '</span></div><div class="row-meta"><button class="btn sm" data-act="open-play" data-play="' + esc(pl.id) + '">open</button></div></div>';
    });
    h += '</div>';
    return h;
  }
  function playLiveUpdate(root) {
    var form = $('#play-form', root); if (!form) return;
    var pl = LEADOS.playbooks.byId[form.getAttribute('data-play')]; if (!pl || !pl.live) return;
    var v = {};
    $all('[name]', form).forEach(function (el) { v[el.name] = el.value; });
    var box = $('#play-live', root); if (box) box.textContent = pl.live(v);
    /* showIf watchers */
    $all('[data-watch]', form).forEach(function (f) {
      var w = $('[name="' + f.getAttribute('data-watch') + '"]', form);
      if (w) f.style.display = (w.value === f.getAttribute('data-watchv')) ? '' : 'none';
    });
  }
  function bindPlaybooks(root) {
    var form = $('#play-form', root);
    if (form) {
      playLiveUpdate(root);
      form.addEventListener('input', function () { playLiveUpdate(root); });
      form.addEventListener('change', function () { playLiveUpdate(root); });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = {};
        $all('[name]', form).forEach(function (el) { v[el.name] = el.value; });
        var r = LEADOS.playbooks.run(form.getAttribute('data-play'), _playOpen.ctx || {}, v);
        if (r && r.error) { var e = $('#play-err', root); if (e) e.textContent = r.error; toast(r.error, 'err'); return; }
        _playOpen = null;
        toast('saved as events (' + (r.n || 0) + ') + playbook.completed', 'ok');
        location.hash = '#/today';
      });
    }
  }

  /* ---------- Health ---------- */
  function healthView() {
    var r = LEADOS.health.run();
    var h = '<header class="vhead"><div class="kicker">LeadOS · health</div><h1>The authority wall</h1><div class="subline">' + r.pass + ' PASS · ' + r.fail + ' FAIL · ' + r.skip + ' SKIP of ' + r.total + ' — executed just now (' + esc(r.at.slice(11, 19)) + ') against the code paths production uses. Golden today: ' + esc(r.fixedToday.slice(0, 10)) + '. Where this wall and the README disagree, <b>this wall wins</b>. Disposable keys (leados:t*) were swept before and after.</div></header>';
    h += '<div class="hrows">';
    r.rows.forEach(function (t) {
      h += '<div class="hrow ' + (t.pass === true ? 'pass' : t.pass === 'skip' ? 'skip' : 'fail') + '">';
      h += '<div class="hrow-head">' + chip(t.id, 'rule') + chip(t.pass === true ? 'PASS' : t.pass === 'skip' ? 'SKIP' : 'FAIL', t.pass === true ? 'ok' : t.pass === 'skip' ? 'mid' : 'hotchip') + '<b>' + esc(t.name) + '</b></div>';
      h += '<div class="muted-row"><span class="mut">expected:</span> ' + esc(t.expected) + '</div>';
      h += '<div class="muted-row"><span class="mut">observed:</span> ' + esc(t.observed) + '</div>';
      (t.lines || []).forEach(function (l) { if (l) h += '<div class="muted-row mut mono">  ' + esc(l) + '</div>'; });
      h += '</div>';
    });
    h += '</div><p class="mut foot">These are fixture assertions on real code paths — not browser automation, not a fuzzer. UI rendering itself is not graded. T8 patches localStorage.setItem: engines that forbid it fail T8 visibly, by design.</p>';
    return h;
  }

  /* ---------- Data ---------- */
  function dataView() {
    var st = LEADOS.store, s = st.state(), P = Pj();
    var bytes = st.storageBytes();
    var h = '<header class="vhead"><div class="kicker">LeadOS · data</div><h1>Data & storage</h1><div class="subline">one key <code>' + esc(st.KEY) + '</code> · schema v' + st.SCHEMA + ' · lineage ' + esc(st.LINEAGE) + ' · ' + s.events.length + ' events · ' + s.people.length + ' people · ' + (bytes / 1024).toFixed(1) + ' KB of ~' + (st.ASSUMED_QUOTA_BYTES / 1024 / 1024) + ' MB assumed quota (labeled assumption — browsers vary)</div></header>';
    h += '<section class="block"><h2>Settings (engine reads these live)</h2><form id="settings-form" class="editgrid cols4">';
    [['weeklyOneOnOneCapacityMin', 'weekly 1:1 capacity (min)'], ['oneOnOneLengthMin', 'one 1:1 length (min)'], ['skipCadenceDefaultDays', 'skip cadence default (days)'], ['coachingReviewDefaultDays', 'growth review default (days)']].forEach(function (kv) {
      h += '<label>' + kv[1] + '<input name="' + kv[0] + '" type="number" min="1" value="' + esc(s.meta.settings[kv[0]]) + '"></label>';
    });
    h += '<button class="btn" type="submit">Save settings</button></form></section>';
    h += '<section class="block"><h2>Backup</h2><div class="btnrow"><button class="btn acc" data-act="export">Export JSON (full store)</button><label class="btn filebtn">Import JSON<input id="import-file" type="file" accept="application/json,.json"></label></div><div class="muted-row mut">Import refuses, in order: corrupt · malformed · foreign · newer · identical — then migrates older schemas through the ladder, snapshots your live bytes as pre-import, re-mints every id, rewires references. Same-named duplicate people on merge: possible, flagged, ranked as an accepted gap.</div><div id="import-verdict"></div></section>';
    h += '<section class="block"><h2>Sample set & danger zone</h2><div class="btnrow">';
    if (st.seededOnce()) h += '<button class="btn" disabled title="the once-ever flag never resets — a twice-seeded store lies about what is real">Load sample set (already used once — permanently)</button>';
    else h += '<button class="btn" data-act="seed">Load sample set (one use, ever)</button>';
    h += '<button class="btn hotbtn" data-act="purge">Purge all data</button></div><div class="muted-row mut">Purge destroys all people + events and keeps exactly one thing: the seeded-once flag. Export first if unsure.</div></section>';
    var qs = st.quarantines();
    h += '<section class="block"><h2>Quarantine (' + qs.length + ')</h2>' + (qs.length ? qs.map(function (q) { return '<div class="row"><div class="row-main"><span class="row-name mono">' + esc(q.kind) + '</span><span class="mut">' + esc(q.at.slice(0, 19)) + ' · ' + (q.bytes / 1024).toFixed(1) + ' KB · ' + esc(q.reason) + '</span></div><div class="row-meta"><button class="btn sm ghost" data-act="qview" data-qk="' + esc(q.key) + '">inspect</button></div></div>'; }).join('') : '<div class="muted-row mut">empty — nothing has ever needed quarantining on this device</div>') + '<pre id="qdetail" class="livebox" style="display:none"></pre></section>';
    var mutes = Object.keys(P.suppressed);
    h += '<section class="block"><h2>Muted findings (' + mutes.length + ')</h2>' + (mutes.length ? mutes.map(function (k) { var m = P.suppressed[k]; return '<div class="row"><div class="row-main"><span class="row-name">' + esc(m.title || k) + '</span><span class="mut">' + k + ' · ' + m.kind + (m.until ? ' until ' + fmtD(m.until) : '') + '</span></div><div class="row-meta"><button class="btn sm" data-act="unmute" data-key="' + esc(k) + '">unmute</button></div></div>'; }).join('') : '<div class="muted-row mut">nothing muted — suppression is an event, auditable and reversible</div>') + '</section>';
    var audit = s.meta.audit.slice(-30).reverse();
    h += '<section class="block"><h2>Audit tail (last ' + audit.length + ' of ' + s.meta.audit.length + ')</h2>' + audit.map(function (a) { return '<div class="muted-row mono">· #' + a.seq + ' ' + fmtD(a.ts) + ' ' + esc(a.action) + (a.ref ? ' <span class="mut">' + esc(String(a.ref).slice(0, 90)) + '</span>' : '') + '</div>'; }).join('') + '</section>';
    return h;
  }
  function bindData(root) {
    var sf = $('#settings-form', root);
    if (sf) sf.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var patch = {};
      $all('[name]', sf).forEach(function (el) { patch[el.name] = el.value; });
      var r = LEADOS.store.saveSettings(patch);
      if (r.error) toast(r.error, 'err'); else toast('settings saved — engine re-reads them next render', 'ok');
    });
    var imp = $('#import-file', root);
    if (imp) imp.addEventListener('change', function () {
      var f = imp.files && imp.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var r = LEADOS.store.importJson(String(rd.result || ''));
        var box = $('#import-verdict', root);
        var msg = r.refused
          ? 'REFUSED — ' + r.refused + ': ' + r.reason
          : 'MERGED — ' + r.peopleAdded + ' people, ' + r.eventsAdded + ' events · ' + r.refsRewired + ' refs rewired · ' + r.refsNulled + ' unresolvable → nulled' + (r.dupNames && r.dupNames.length ? ' · possible duplicate people: ' + r.dupNames.join('; ') : '') + (r.migratedFrom != null ? ' · migrated v' + r.migratedFrom + '→v' + LEADOS.store.SCHEMA + ' first' : '');
        if (box) { box.className = 'muted-row ' + (r.refused ? 'errtxt' : 'oktxt'); box.textContent = msg; }
        toast(msg, r.refused ? 'err' : 'ok');
        render();
      };
      rd.readAsText(f);
    });
  }

  /* ---------- router / render ---------- */
  function parseRoute() {
    var hsh = location.hash || '#/today';
    var m = hsh.match(/^#\/([a-z]+)(?:\/(.+))?$/);
    if (!m) return { view: 'today', arg: null };
    var v = m[1];
    if (['today', 'roster', 'playbooks', 'health', 'data'].indexOf(v) < 0) v = 'today';
    return { view: v, arg: m[2] ? decodeURIComponent(m[2]) : null };
  }
  function render() {
    var main = $('#main');
    if (!main) return;
    if (!LEADOS.store.state()) { main.innerHTML = '<div class="banner hot">store not booted</div>'; return; }
    _route = parseRoute();
    if (_route.view !== 'playbooks') _playOpen = null;
    var html = bannersHTML();
    if (_route.view === 'today') html += todayView();
    else if (_route.view === 'roster') html += _route.arg ? dossierView(_route.arg) : rosterView();
    else if (_route.view === 'playbooks') html += playbooksView();
    else if (_route.view === 'health') html += healthView();
    else if (_route.view === 'data') html += dataView();
    main.innerHTML = html;
    $all('#rail a').forEach(function (a) {
      var v = (a.getAttribute('href') || '').replace('#/', '');
      a.classList.toggle('on', v === _route.view);
    });
    var top = $('#top-meta');
    if (top) top.textContent = 'schema v' + LEADOS.store.SCHEMA + ' · lineage ' + LEADOS.store.LINEAGE + ' · ' + (LEADOS.store.volatile() ? 'VOLATILE — nothing persists' : 'offline · one key · zero network') + ' · ' + todayStr();
    bindToday(main); bindRoster(main); bindPlaybooks(main); bindData(main);
    bindGlobal(main);
    window.scrollTo(0, 0);
  }
  function bindGlobal(root) {
    $all('[data-act]', root).forEach(function (el) {
      el.addEventListener('click', function (ev) {
        var act = el.getAttribute('data-act');
        if (act === 'snooze' || act === 'dismiss') {
          var type = act === 'snooze' ? 'engine.snoozed' : 'engine.dismissed';
          var data = { key: el.getAttribute('data-key'), title: el.getAttribute('data-title') };
          if (act === 'snooze') data.until = LEADOS.events.inDaysIso(7);
          var r = LEADOS.events.append(type, data);
          if (r.error) toast(r.error, 'err'); else toast(act === 'snooze' ? 'snoozed 7d — it resurfaces after, by design' : 'dismissed — reversible at Data → mutes', 'ok');
        } else if (act === 'play') {
          var P = Pj();
          var key = el.getAttribute('data-key');
          var fins = LEADOS.engine.run(P, new Date().toISOString()).findings;
          var f = null;
          for (var i = 0; i < fins.length; i++) if (fins[i].key === key) f = fins[i];
          if (!f) { toast('finding no longer active — the data changed under it (that is the point)', 'err'); return; }
          var ref = LEADOS.playbooks.forFinding(f, P);
          if (!ref) { toast('no playbook for this finding — see its basis lines', 'err'); return; }
          _playOpen = { playId: ref.playId, ctx: ref.ctx, fromFinding: f.key };
          location.hash = '#/playbooks';
        } else if (act === 'open-play') {
          _playOpen = { playId: el.getAttribute('data-play'), ctx: {} };
          render();
        } else if (act === 'close-play') {
          _playOpen = null; render();
        } else if (act === 'new-plan') {
          _playOpen = { playId: 'growth-plan', ctx: { personId: el.getAttribute('data-pid') } };
          location.hash = '#/playbooks';
        } else if (act === 'review-plan') {
          _playOpen = { playId: 'growth-review', ctx: { planId: el.getAttribute('data-plan') } };
          location.hash = '#/playbooks';
        } else if (act === 'seed') {
          var sr = LEADOS.store.seed();
          if (sr.error) toast(sr.error, 'err'); else { toast('sample set loaded — watch Today fill up, then check #/health T12', 'ok'); location.hash = '#/today'; render(); }
        } else if (act === 'purge') {
          if (el.getAttribute('data-armed')) {
            var pr = LEADOS.store.purge();
            if (pr.error) toast(pr.error, 'err'); else { toast('purged — seeded-once flag kept', 'ok'); location.hash = '#/today'; render(); }
          } else {
            el.setAttribute('data-armed', '1');
            el.textContent = 'Really purge everything? Click again to confirm.';
            setTimeout(function () { el.removeAttribute('data-armed'); el.textContent = 'Purge all data'; }, 4000);
          }
        } else if (act === 'export') {
          var text = LEADOS.store.exportText();
          var blob = new Blob([text], { type: 'application/json' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'leados-export-v' + LEADOS.store.SCHEMA + '-' + todayStr().replace(/-/g, '') + '.json';
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
          toast('exported ' + (text.length / 1024).toFixed(1) + ' KB', 'ok');
        } else if (act === 'qview') {
          var pre = $('#qdetail', root);
          var raw = LEADOS.store.readQuarantine(el.getAttribute('data-qk')) || '';
          if (pre) {
            pre.style.display = pre.style.display === 'none' ? '' : 'none';
            try { pre.textContent = JSON.stringify(JSON.parse(raw), null, 2).slice(0, 4000); } catch (e2) { pre.textContent = raw.slice(0, 4000); }
          }
        } else if (act === 'unmute') {
          var ur = LEADOS.events.append('engine.unmuted', { key: el.getAttribute('data-key') });
          if (ur.error) toast(ur.error, 'err'); else toast('unmuted — it will re-fire if the data still says so', 'ok');
        }
        ev.preventDefault();
      });
    });
  }

  function refresh() { render(); }
  function boot() {
    LEADOS.store.boot();
    render();
    window.addEventListener('hashchange', render);
  }

  return { boot: boot, refresh: refresh, toast: toast };
})();
