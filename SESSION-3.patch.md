# SESSION 3 — anchored patches for `index.html` (apply in order, verify each anchor)

Channel note, stated once: the raw file (251,817 bytes) could not be moved through this
environment whole. These patches are written against contracts documented in the session
log (function names, field gates, listener topology), not against a live source read.
**Rule: if an anchor's neighborhood doesn't match the description, STOP. Do not
fuzzy-apply. Paste the anchor region into the next session and it becomes a full-file edit.**

Replace nothing blindly. Every patch is additive or flag-gated; legacy stores, seed data,
and pre-pulse mood entries must score byte-identically to before.

---

## PATCH A — fabricated pulse telemetry (watchlist #7)

**Failure mode named before the fix:** `oo-finish` reads four sliders unconditionally.
Close a 1:1 without touching them and the defaults (or the last pulse's prefill) are
written as if measured. That is fabricated telemetry feeding an 8-driver flight model —
the exact class of bug Session 2 fixed by building the pulse, now re-entering through
the write path. Class: *instrument trust violation*.

**Doctrine:** flag at write, filter at read, never rewrite stored entries. Absence of
the flag means measured — this keeps every legacy and seed entry lean and unchanged.

### A1 — interaction tracking (view layer)

**Anchor:** the single delegated `input` listener on `#modalroot` added in Session 2
(the one routing `sb-s` / `sb-b` / `sb-i` to `updSbiLive()`).

**Add** inside that handler, after the existing routing:

```js
// Session 3: pulse sliders are telemetry — record that a human touched them.
const plsT = e.target.closest && e.target.closest('.pls-range');
if (plsT) {
  const mo = plsT.closest('.modal') || document.getElementById('modalroot');
  if (mo) mo.dataset.plsTouched = '1';
}
```

**And** in the session-finish modal markup where the four pulse sliders render
(overall · energy · load · support), ensure each carries the hook class:

```html
<input type="range" class="pls-range" ...>
```

### A2 — the write path

**Anchor:** `Actions['oo-finish']`, at the statement that pushes the mood/pulse entry
(Session-2 shape: `{ t, v, en, ld, sp, ... }`, blend gated on `en != null`).

**Change** the push to stamp untouched pulses:

```js
const mr = document.querySelector('#modalroot .modal') || document.getElementById('modalroot');
const touched = mr && mr.dataset.plsTouched === '1';
// ... build entry exactly as before ...
if (!touched) entry.estimated = true;   // omit the flag on measured entries, always
// after the push, before the modal closes:
if (mr) delete mr.dataset.plsTouched;
```

Never write `estimated: false` — absence is the measured state.

### A3 — the read path (slope consumers)

**Anchor:** the `mood slope` mentor rule and the person-page flight/slope computation —
both call sites of `FW.moodSlope(...)`.

**Wrap** the argument; do not edit the model:

```js
const measured = (p.mood || []).filter(x => !x.estimated);
const mSlope = FW.moodSlope(measured);
if (mSlope == null) {
  // copy: "Not enough measured pulses yet — estimates excluded."
  // rule: skip this person this scan; view: render the note, not a line.
}
```

`FW.moodVal` is **not** changed: an estimated entry may still display a value, but only
with the chip from A4. Estimates never move a slope, never move the flight driver's
mood term, never trigger or clear an advisory.

### A4 — the honesty chip

**Anchor:** person page, where each mood/pulse entry renders (chips row / sparkline list).

```html
${m.estimated ? '<span class="chip chip-dim" title="Slider defaults at 1:1 close — not a measured pulse">est.</span>' : ''}
```

### Verify A

1. Open the seeded store. Close a 1:1 untouched → entry carries `estimated:true`, no chip
   value moves any slope, `mood slope` advisory state unchanged.
2. Close another with one slider touched → no flag, slope includes it.
3. Integrity audit: still 20 classes, all green. No new write class was added
   (the flag is a field on an existing audited record), so no audit diff is owed —
   stated here because the standing rule demands the check be made, not skipped silently.

---

## PATCH B — instrument-boundary annotation (watchlist #6)

**Failure mode named before the fix:** person-page mood/flight history mixes legacy
scalar entries with blended pulse values. At the boundary the sparkline can step, and a
step reads as *the person got worse* when what changed is the instrument. Class:
*tooling improvement masquerading as a human regression* — the most dangerous lie a
mentor app can tell, because it gets a real person managed harder.

**Decision, recorded so it doesn't get re-litigated:** annotate, never normalize.
Normalizing history to the new blend retroactively rewrites a person's past to make a
chart pretty. The boundary is metadata; render it as metadata.

### B1 — boundary tick

**Anchor:** the person-page sparkline builder (inline SVG, entries → polyline; the same
renderer Session 2 reads the blend into).

**Add** after point coordinates are computed:

```js
// Session 3: mark where the 4-question pulse instrument begins.
const bIdx = (entries || []).findIndex(x => x.en != null);
if (bIdx > 0) {                       // 0 = always-pulse, no boundary to mark
  const bx = xAt(bIdx);               // use the renderer's own x-scale fn/var
  svg += `<line x1="${bx}" y1="0" x2="${bx}" y2="${H}"
    stroke="var(--faint)" stroke-dasharray="2 3" opacity=".6">
    <title>Pulse instrument begins here — display continuity, not a person change</title>
  </line>`;
}
```

If the builder uses a different helper name than `xAt`/`H`, use its own — the point is
the tick uses the chart's real scale, never a recomputed one.

### B2 — legend line under the sparkline, only when a boundary exists

```html
${bIdx > 0 ? '<div class="fine" style="color:var(--faint)">dashed line = pulse instrument begins; readings before it are single-question</div>' : ''}
```

### Verify B

1. Seeded person with pre-pulse history + at least one pulse → one dashed tick, legend
   visible, values unchanged.
2. Person created after Session 2 (all entries have `en`) → no tick, no legend.
3. Person with only legacy scalars → no tick (nothing to bound).

---

## Rollback

Both patches are additive behind gates (`estimated`, `en != null`, `bIdx > 0`). Revert by
deleting the added blocks; no stored data needs migration in either direction.
