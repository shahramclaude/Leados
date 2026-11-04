/**
 * app/views/envoy.js — the Federated Envoy (`#/envoy`, ADR-0087).
 *
 * Five panels, five genuinely different questions:
 *   Desk        "What does the altitude above me need, in the form it may hold?"
 *   Packets     "What has this workspace sent, received, verified or refused?"
 *   Carriage    "Which spans are actually connected, and what have they attested?"
 *   Divergence  "Where do two workspaces disagree — and who is answering that?"
 *   Certificate "What can I hand to a board without exposing one person?"
 *
 * A declared seat sees its own subtree's carriage; the receiving altitude
 * decides how much detail travels, and the desk says so before anything is
 * built. Nothing on this screen is a rating of a person.
 */

import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { LEADER_ID } from '../core/domain/chain.js';
import { altitudeByKey } from '../core/domain/chainRegistry.js';
import {
  ENVOY_CLASSES,
  ENVOY_CLASS_LABELS,
  ENVOY_COVERAGE_WINDOW_DAYS,
  ENVOY_KIND_LABELS,
  ENVOY_FAILURE_LABELS,
  ENVOY_STATUS_LABELS,
  classForReceivingRank,
} from '../core/domain/envoyRegistry.js';

const PANELS = [
  { key: 'desk', label: 'Desk' },
  { key: 'packets', label: 'Packets' },
  { key: 'carriage', label: 'Carriage' },
  { key: 'divergence', label: 'Divergence' },
  { key: 'certificate', label: 'Certificate' },
];

/**
 * `table` expects per-column render functions; these panels build positional
 * rows, so one labelled shim keeps the tables honest without repeating a
 * render closure six times.
 */
function tableOf({ caption = '', labels = [], rows = [], emptyMessage = 'Nothing here yet.' }) {
  return table({
    caption,
    columns: labels.map((label, index) => ({ label, render: (row) => row[index] })),
    rows,
    emptyMessage,
  });
}

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return PANELS.some((x) => x.key === p) ? p : 'desk';
};
const go = (ctx, panel, extra = '') => ctx.navigate(`#/envoy?panel=${panel}${extra}`);
const short = (hex) => (typeof hex === 'string' && hex.length > 8 ? `${hex.slice(0, 8)}…` : (hex || '—'));
const pctText = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'refused' : `${v}%`);

function statusBadge(row) {
  const tone = row.status === 'ingested' ? 'good' : row.status === 'refused' ? 'bad' : row.status === 'verified' ? 'warn' : 'neutral';
  return badge(row.status, tone, ENVOY_STATUS_LABELS[row.status] || row.status);
}

function classBadge(cls) {
  const tone = cls === 'aggregate' ? 'good' : cls === 'unit' ? 'neutral' : 'warn';
  return badge(cls, tone, ENVOY_CLASS_LABELS[cls] || cls);
}

function copyToClipboard(ctx, text, label) {
  if (downloadText({ filename: `leados-envoy-${Date.now()}.json`, text, mime: 'application/json' })) {
    toast(`${label} downloaded as JSON`, 'good');
    return;
  }
  openModal({
    title: `Copy ${label}`,
    description: 'The packet is a plain JSON document. Copy it into the receiving workspace (or your hand-over channel).',
    body: h('textarea', { rows: 18, readOnly: true, class: 'input', 'aria-label': `${label} JSON` }, text),
    footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
  });
}

/* --------------------------------------------------------------------- desk */

function deskPanel(ctx, report) {
  const seats = [
    { id: LEADER_ID, label: 'Workspace leader (root of this tree)', rank: 5 },
    ...(report.coverage || []).map((row) => ({ id: row.seatId, label: `${row.label} · rank ${row.rank}`, rank: row.rank })),
  ];
  const defaultRecipient = (report.coverage || []).find((row) => row.current === false)?.seatId || seats[1]?.id || LEADER_ID;
  const select = h('select', { class: 'input', id: 'envoy-recipient', 'aria-label': 'Receiving seat' },
    ...seats.map((seat) => h('option', { value: seat.id, ...(seat.id === defaultRecipient ? { selected: true } : {}) }, seat.label)));
  const purpose = h('input', {
    class: 'input', id: 'envoy-purpose', type: 'text', maxlength: '240',
    placeholder: 'e.g. “Week 45 close-up: open criticals and the two decisions I need you on.”',
    'aria-label': 'What this packet is for',
  });
  const preview = h('div', { class: 'stack', role: 'region', 'aria-live': 'polite', 'aria-label': 'Packet preview' });

  const renderPreview = () => {
    const res = ctx.api.envoyPreview({ recipientSeatId: select.value, purpose: purpose.value });
    preview.replaceChildren();
    if (!res || res.ok === false) {
      preview.appendChild(h('p', { class: 'muted' }, (res && res.error) || 'Nothing to preview.'));
      return;
    }
    const alt = altitudeByKey(res.recipientAltitudeKey);
    preview.append(
      h('div', { class: 'stat-grid' },
        stat({ label: 'Receiving altitude', value: alt ? alt.label : res.recipientAltitudeKey, hint: `${alt ? alt.horizonDays : '—'}-day horizon` }),
        stat({ label: 'Disclosure class', value: res.recipientClass, hint: ENVOY_CLASS_LABELS[res.recipientClass] || '' }),
        stat({ label: 'Items that travel', value: String(res.itemCount), hint: `${res.withheld.length} withheld at the source` }),
        stat({ label: 'Signature', value: res.keyed ? 'Keyed (HMAC)' : 'Plain hash', tone: res.keyed ? 'good' : 'warn', hint: res.keyed ? 'unlock state: vault key present' : 'unlock the vault to sign keyed' }),
      ),
      h('p', { class: 'muted' },
        `Attested exposure: ${res.attestation.items} artefact(s), ${res.attestation.openCritical} recorded open and critical, oldest open ${res.attestation.oldestOpenDays === null ? 'not measurable' : `${res.attestation.oldestOpenDays} day(s)`}.`),
      res.withheld.length
        ? h('div', { class: 'stack' },
            h('p', null, h('strong', null, 'Withheld at the source — not hidden in the file:')),
            ...res.withheld.slice(0, 8).map((row) => h('p', { class: 'muted' },
              `— ${ENVOY_KIND_LABELS[row.kind] || row.kind} ${short(row.originId)} needs “${row.need}”; this altitude may hold “${res.recipientClass}”.`)))
        : h('p', { class: 'muted' }, 'Nothing is withheld: every carried record fits the receiving altitude’s class.'),
    );
  };

  select.addEventListener('change', renderPreview);
  purpose.addEventListener('input', renderPreview);
  renderPreview();

  const compose = h('button', {
    class: 'btn btn-primary', type: 'button', 'data-testid': 'envoy-compose',
    onClick: () => {
      const res = ctx.api.envoyCompose({ recipientSeatId: select.value, purpose: purpose.value });
      if (!res.ok) {
        toast(res.error || 'The packet could not be built.', 'bad');
        return;
      }
      toast(`Packet built: ${res.itemCount} item(s), ${res.withheldCount} withheld, ${res.keyed ? 'keyed' : 'plain'} signature.`, 'good');
      copyToClipboard(ctx, res.text, 'the sealed packet');
      ctx.refresh();
      go(ctx, 'packets', `&packet=${encodeURIComponent(res.recordId)}`);
    },
  }, 'Build and export the packet');

  return card({
    title: 'Outbound desk — what this span owes the altitude above it',
    subtitle: 'The packet is built from records this workspace already holds. Detail is projected at the receiving altitude before anything is written: a higher altitude receives counts and statuses, a lower one may receive titles.',
    body: h('div', { class: 'stack' },
      h('label', { class: 'field' }, h('span', null, 'Addressed to'), select),
      h('label', { class: 'field' }, h('span', null, 'Purpose (travels with the packet)'), purpose),
      preview,
      h('div', { class: 'row' }, compose),
      h('p', { class: 'muted' },
        'A packet proves the integrity and provenance of this document. It does not prove who ran this browser, and it is not encrypted: the local seat is a declaration, and every packet says so in its own limits.'),
    ),
  });
}

/* ------------------------------------------------------------------ packets */

function manifestTable(row) {
  return tableOf({
    caption: `Manifest of packet ${row.packetId}`,
    labels: ['Kind', 'Origin record', 'Class', 'Content hash'],
    rows: (row.items || []).map((item) => [
      ENVOY_KIND_LABELS[item.kind] || item.kind,
      short(item.originId),
      classBadge(item.cls),
      short(item.contentHash),
    ]),
    emptyMessage: 'This packet carries no items — only its attestation travelled.',
  });
}

function packetsPanel(ctx, report) {
  const selectedId = ctx.query?.get?.('packet') || null;
  const selected = (report.packets || []).find((row) => row.id === selectedId) || null;
  const paste = h('textarea', {
    class: 'input', rows: 8, id: 'envoy-paste', 'aria-label': 'Paste a packet as JSON',
    placeholder: '{ "format": "leados.envoy.packet", … }',
  });
  const resultRegion = h('div', { class: 'stack', role: 'region', 'aria-live': 'polite', 'aria-label': 'Verification result' });

  const showVerdict = (res, action) => {
    resultRegion.replaceChildren();
    if (res.ok) {
      resultRegion.append(banner({
        tone: 'good',
        title: `${action === 'ingest' ? 'Ingested' : 'Verified'} — packet ${String(res.packetId || res.packet?.packetId || '').slice(0, 12)}…`,
        body: action === 'ingest'
          ? `${res.counts.imported} attested cop${res.counts.imported === 1 ? 'y' : 'ies'} imported, ${res.counts.duplicates} identical item(s) collapsed, ${res.counts.diverged} divergence(s) recorded. A divergence is never overwritten: it opens one governed reconciliation decision.`
          : `${res.counts.items} item(s) recomputed cleanly. Ingestion is a separate, confirmed step.`,
      }));
      ctx.refresh();
      return;
    }
    resultRegion.append(banner({
      tone: 'bad',
      title: 'Refused — nothing was written',
      body: (res.error || 'The packet did not verify.') + (res.failures?.length ? ` (${res.failures.length} typed failure(s))` : ''),
    }));
    if (res.failures?.length) {
      resultRegion.append(tableOf({
        caption: 'Typed verification failures',
        labels: ['Code', 'Meaning', 'Detail'],
        rows: res.failures.slice(0, 12).map((f) => [f.code, ENVOY_FAILURE_LABELS[f.code] || f.code, f.detail || '—']),
      }));
    }
    ctx.refresh();
  };

  const verify = h('button', {
    class: 'btn', type: 'button', 'data-testid': 'envoy-verify',
    onClick: () => showVerdict(ctx.api.envoyVerify(paste.value), 'verify'),
  }, 'Verify only');
  const ingest = h('button', {
    class: 'btn btn-primary', type: 'button', 'data-testid': 'envoy-ingest',
    onClick: () => showVerdict(ctx.api.envoyIngest(paste.value), 'ingest'),
  }, 'Verify and ingest');

  const rows = (report.packets || []).map((row) => [
    h('a', { href: `#/envoy?panel=packets&packet=${encodeURIComponent(row.id)}` }, short(row.packetId)),
    row.direction,
    row.recipientAltitudeKey,
    classBadge(row.recipientClass),
    statusBadge(row),
    String(row.itemCount),
    String(row.withheldCount),
    row.signatureKeyed ? badge('keyed', 'good') : badge('plain', 'warn'),
    String(row.receivedAt || row.createdAt || '').slice(0, 10),
  ]);

  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'Packets are documents, not messages',
      body: `A packet is a JSON file. It can travel by email, by a shared drive or by hand — this workspace never calls a network. Everything a receiver needs to distrust it is inside it: a content hash per item, a Merkle root, a packet identity and a signature mode. ${report.conventions.envoyRequireKeyedSignature ? 'This workspace requires a key-signed packet and refuses an unkeyed one.' : 'This workspace accepts unkeyed packets; each one says which mode it is in.'}`,
    }),
    card({
      title: 'Receive a packet',
      subtitle: 'Verification recomputes every item hash, the Merkle root, the packet identity and the signature before a single field is stored. Ingestion is a second, deliberate step.',
      body: h('div', { class: 'stack' },
        h('label', { class: 'field' }, h('span', null, 'Packet JSON'), paste),
        h('div', { class: 'row' }, verify, ingest),
        resultRegion,
      ),
    }),
    card({
      title: 'Packet ledger in this workspace',
      subtitle: `${report.packets.length} packet(s): built, verified, ingested or refused. A refused packet is kept as a refusal, with its typed failures, so a failed exchange cannot look like an empty one.`,
      body: tableOf({
        caption: 'Packet ledger',
        labels: ['Packet', 'Direction', 'To altitude', 'Class', 'Status', 'Items', 'Withheld', 'Signature', 'On'],
        rows,
        emptyMessage: 'No packet has been built or received yet. Start on the Desk, or paste one above.',
      }),
    }),
    selected
      ? card({
          title: `Manifest — ${short(selected.packetId)}`,
          subtitle: `${selected.direction} · ${selected.recipientAltitudeKey} · ${ENVOY_STATUS_LABELS[selected.status] || selected.status}${selected.purpose ? ` · “${selected.purpose}”` : ''}`,
          body: h('div', { class: 'stack' },
            h('div', { class: 'stat-grid' },
              stat({ label: 'Merkle root', value: short(selected.merkleRoot), hint: 'binary tree, last-leaf duplicated' }),
              stat({ label: 'Signature', value: selected.signatureAlg, hint: selected.signatureKeyed ? 'keyed with the vault session key' : 'plain SHA-256 — integrity only' }),
              stat({ label: 'Attested items', value: String(selected.attestation?.items ?? 0), hint: `${selected.attestation?.openCritical ?? 0} recorded open and critical` }),
              stat({ label: 'Verification', value: selected.verification?.ok ? 'PASS' : (selected.status === 'refused' ? 'REFUSED' : 'not yet'), hint: selected.verification?.failures?.length ? selected.verification.failures.map((f) => f.code).join(', ') : 'no typed failure recorded' }),
            ),
            manifestTable(selected),
            h('div', { class: 'row' },
              h('button', {
                class: 'btn btn-ghost', type: 'button',
                onClick: () => {
                  const res = ctx.api.envoyPacketText(selected.id);
                  if (res.ok) copyToClipboard(ctx, res.text, 'this packet');
                  else toast(res.error || 'Packet unavailable', 'bad');
                },
              }, 'Export this packet as JSON')),
          ),
        })
      : null,
  );
}

/* ----------------------------------------------------------------- carriage */

function carriagePanel(ctx, report) {
  const s = report.stats;
  return h('div', { class: 'stack' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Spans connected', value: `${s.spansCovered} / ${s.spans}`, hint: `a verified packet in the last ${ENVOY_COVERAGE_WINDOW_DAYS} days` }),
      stat({
        label: 'Coverage share',
        value: pctText(s.coveragePct),
        tone: s.coveragePct === null ? 'warn' : s.coveragePct >= 80 ? 'good' : 'bad',
        hint: s.coveragePct === null ? s.coverageRefusal : `Wilson 95%: ${s.coverageWilson.lo}–${s.coverageWilson.hi}%`,
      }),
      stat({ label: 'Keyed share', value: pctText(s.keyedShare), hint: 'ingested packets signed with a vault key' }),
      stat({ label: 'Attested artefacts', value: String(report.attested.items), hint: `${report.attested.openCritical} recorded open and critical` }),
      stat({ label: 'Open divergences', value: String(s.divergences), tone: s.divergences ? 'bad' : 'good', hint: 'each one is a governed decision, never an overwrite' }),
      stat({ label: 'Refused packets', value: String(s.refused), tone: s.refused ? 'warn' : 'good', hint: 'integrity, signature or altitude refusal' }),
    ),
    card({
      title: 'Cross-altitude carriage',
      subtitle: 'Every ingested packet writes one typed `carries` edge to the receiving span and every ancestor of it in the same transaction, so the altitude above reads the packet in the form it may hold — and nobody re-types it.',
      body: report.coverage.length
        ? tableOf({
            caption: 'Span carriage',
            labels: ['Span', 'Rank', 'Altitude', 'Packets', 'Last received', 'Current'],
            rows: report.coverage.map((row) => [
              row.label,
              String(row.rank),
              row.altitudeKey,
              String(row.packets),
              row.lastPacketOn || '—',
              row.current ? badge('current', 'good') : badge(row.packets ? 'stale' : 'none', row.packets ? 'warn' : 'neutral'),
            ]),
          })
        : emptyState({
            title: 'No leadership spans to connect yet',
            body: 'Add a second person with a reporting line, declare an operating seat, and the carriage table appears: the workspace will show which span owes the altitude above a packet and which one has never sent one.',
          }),
    }),
    card({
      title: 'What the packets attest',
      subtitle: 'These are the sending spans’ own counts, not this workspace’s measurement. They are never pooled across currencies and never attributed to a person.',
      body: h('div', { class: 'stack' },
        h('p', null, `${report.attested.packets} ingested packet(s) attest ${report.attested.items} artefact(s). Recorded as open and critical by the sending record: ${report.attested.openCritical}${report.attested.riskSharePct === null ? ' (share refused below the floor)' : ` (${report.attested.riskSharePct}%)`}.`),
        report.attested.valueAtStake.length
          ? tableOf({
              caption: 'Value at stake, by currency',
              labels: ['Currency', 'Attested value at stake'],
              rows: report.attested.valueAtStake.map((row) => [row.currency, row.amount.toLocaleString('en-US')]),
            })
          : h('p', { class: 'muted' }, 'No packet has declared a value at stake yet. An unpriced artefact is reported as unpriced, never as zero.'),
      ),
    }),
  );
}

/* --------------------------------------------------------------- divergence */

function divergencePanel(ctx, report) {
  return h('div', { class: 'stack' },
    banner({
      tone: report.divergences.length ? 'bad' : 'good',
      title: report.divergences.length
        ? `${report.divergences.length} divergent record(s) — the local copy was never overwritten`
        : 'No divergence recorded',
      body: 'Two workspaces holding different content for the same record is information, not corruption. RULE-ENV-02 opens exactly one governed reconciliation decision per divergent record per ISO week and names both hashes; the local record is left exactly as this workspace wrote it.',
      actions: [h('button', {
        class: 'btn', type: 'button', 'data-testid': 'envoy-scan',
        onClick: () => {
          const res = ctx.api.envoyScan();
          toast(res.ok ? 'Envoy reconciliation re-run: carriage, divergence and attested exposure re-checked.' : (res.error || 'Scan refused'), res.ok ? 'good' : 'bad');
          ctx.refresh();
        },
      }, 'Re-run reconciliation')],
    }),
    card({
      title: 'Divergent artefacts',
      body: report.divergences.length
        ? tableOf({
            caption: 'Divergent attested artefacts',
            labels: ['Kind', 'Origin record', 'Inbound hash', 'Received', 'Packet'],
            rows: report.divergences.map((row) => [
              ENVOY_KIND_LABELS[row.kind] || row.kind,
              short(row.originId),
              short(row.contentHash),
              row.ingestedOn || '—',
              short(row.packetId),
            ]),
          })
        : emptyState({
            title: 'The two records agree',
            body: 'Every ingested artefact either matched an attested copy this workspace already held, or arrived cleanly. Nothing needs a human.',
          }),
    }),
  );
}

/* -------------------------------------------------------------- certificate */

function certificatePanel(ctx, report) {
  const conv = report.conventions;
  const maxItems = h('input', { class: 'input', type: 'number', min: '1', max: '200', value: String(conv.envoyMaxItems), 'aria-label': 'Item cap per packet' });
  const keyed = h('input', { type: 'checkbox', ...(conv.envoyRequireKeyedSignature ? { checked: true } : {}), 'aria-label': 'Require a key-signed packet' });
  const reviewDays = h('input', { class: 'input', type: 'number', min: '3', max: '60', value: String(conv.envoyDivergenceReviewDays), 'aria-label': 'Reconciliation review days' });
  const floor = h('input', { class: 'input', type: 'number', min: '0', max: '100', value: String(conv.envoyAttestationRiskFloorPct), 'aria-label': 'Attested open-critical floor percentage' });
  const auto = h('input', { type: 'checkbox', ...(conv.envoyAutoPropagate ? { checked: true } : {}), 'aria-label': 'Automate carriage and reconciliation' });

  const save = () => {
    const res = ctx.api.envoySetConventions({
      envoyMaxItems: Number(maxItems.value),
      envoyRequireKeyedSignature: keyed.checked,
      envoyDivergenceReviewDays: Number(reviewDays.value),
      envoyAttestationRiskFloorPct: Number(floor.value),
      envoyAutoPropagate: auto.checked,
    });
    toast(res.ok ? 'Envoy conventions saved.' : (res.error || 'Not saved'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  const brief = (ctx.api.envoyBriefText() || {}).text || '';

  return h('div', { class: 'stack' },
    card({
      title: 'Identity-free exchange certificate',
      subtitle: 'Counts, coverage, verification modes and typed refusals. No person, span name, title, origin id or purpose line survives this view — it is the same text whether the board reads it or the workspace does.',
      actions: [
        h('button', {
          class: 'btn', type: 'button',
          onClick: () => {
            const text = (ctx.api.envoyBriefText() || {}).text || '';
            if (!downloadText({ filename: `leados-envoy-certificate-${report.today}.txt`, text, mime: 'text/plain' })) toast('Download not available', 'bad');
            else toast('Certificate downloaded', 'good');
          },
        }, 'Download certificate'),
        h('button', {
          class: 'btn btn-ghost', type: 'button',
          onClick: () => {
            const res = ctx.api.envoyCsvRows();
            if (!res.ok) { toast(res.error || 'Export failed', 'bad'); return; }
            const header = Object.keys(res.rows[0] || { row_kind: '' }).join(',');
            const body = res.rows.map((row) => Object.values(row).map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
            if (downloadText({ filename: `leados-envoy-${report.today}.csv`, text: `${header}\n${body}\n`, mime: 'text/csv' })) toast('Aggregate-only CSV downloaded', 'good');
            else toast('Download not available', 'bad');
          },
        }, 'Download CSV #80'),
      ],
      body: h('pre', { class: 'mono', 'aria-label': 'Exchange certificate' }, brief || 'No packet has been exchanged yet. The certificate prints what is true: nothing.'),
    }),
    card({
      title: 'Declared conventions',
      subtitle: 'Every bound is clamped on save. A refusal (a blank figure) is a first-class result: it says the evidence floor was not met, never that the number was zero.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid-2' },
          h('label', { class: 'field' }, h('span', null, 'Item cap per packet (1–200)'), maxItems),
          h('label', { class: 'field' }, h('span', null, `Reconciliation review window (3–60 days)`), reviewDays),
          h('label', { class: 'field' }, h('span', null, 'Attested open-critical floor (%)'), floor),
          h('label', { class: 'field row' }, keyed, h('span', null, 'Require a key-signed packet (refuse an unkeyed one)')),
          h('label', { class: 'field row' }, auto, h('span', null, 'Automate carriage, reconciliation and attested review')),
        ),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', type: 'button', onClick: save }, 'Save conventions')),
      ),
    }),
    card({
      title: 'What this terminal refuses to claim',
      body: h('div', { class: 'stack' },
        ...report.limits.map((line) => h('p', { class: 'muted' }, `— ${line}`)),
        h('p', { class: 'muted' },
          `Disclosure ladder in force: ${ENVOY_CLASSES.map((cls, i) => `${cls} (rank ${5 - i}${i === ENVOY_CLASSES.length - 1 ? '' : ''})`).join(' → ')}. A packet addressed to rank ${5} carries ${classForReceivingRank(5)}; addressed to rank 1 it may carry ${classForReceivingRank(1)}.`),
      ),
    }),
  );
}

/* -------------------------------------------------------------------- mount */

export function renderEnvoy(ctx) {
  const panel = panelFor(ctx.query);
  const report = ctx.api.envoyRead();
  const stats = report.stats;
  const attention = stats.divergences + stats.refused;

  const body = panel === 'desk'
    ? deskPanel(ctx, report)
    : panel === 'packets'
      ? packetsPanel(ctx, report)
      : panel === 'carriage'
        ? carriagePanel(ctx, report)
        : panel === 'divergence'
          ? divergencePanel(ctx, report)
          : certificatePanel(ctx, report);

  return h('div', { class: 'stack' },
    pageHeader({
      eyebrow: 'Federation',
      title: 'Sealed exchange',
      subtitle: 'Each span runs its own workspace; the altitude above is owed a summary. A packet is that summary with its own proof attached — disclosure-scoped and recomputable by the receiver, with no server and no shared database.',
      actions: [
        h('span', { class: 'badge badge-neutral', title: 'Packets held in this workspace' }, `${stats.packets} packet(s)`),
        attention ? badge(`${attention} need a human`, 'warn', 'Divergences and refusals') : badge('no refusals', 'good'),
      ],
      meta: h('p', { class: 'muted' }, `Workspace identity ${report.workspaceId} — derived from this workspace’s creation stamp; printed so a receiving span can compare it, never a legal entity id.`),
    }),
    tabs({
      items: PANELS.map((p) => ({ key: p.key, label: p.label })),
      active: panel,
      onSelect: (key) => go(ctx, key),
      ariaLabel: 'Envoy panels',
    }),
    body,
  );
}
