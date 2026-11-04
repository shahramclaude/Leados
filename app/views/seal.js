/**
 * app/views/seal.js — the Integrity & Seals surface (ADR-0081, `#/seal`).
 *
 * One screen that answers, for every altitude: has anything in this workspace's
 * append-only event log been altered since it was committed? It shows the
 * chain status (keyed HMAC vs plain hash — printed honestly), the per-span
 * attestation roll-up (sealed transactions counted at every leadership ancestor
 * of the owning span, scoped to the acting seat: out-of-subtree spans collapse
 * to one aggregate row), the recent sealed blocks, an explicit verify action,
 * and an identity-free integrity certificate for download.
 *
 * Everything is re-derived from the event log on render — nothing here can
 * drift from the record it describes.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { formatDate } from '../core/time.js';

const formatDateTime = (iso) => {
  if (!iso) return '—';
  const d = String(iso);
  return `${d.slice(0, 10)} ${d.slice(11, 16)}Z`;
};
import { sealAttentionCount } from '../core/domain/sealChain.js';

const PANELS = [
  { key: 'chain', label: 'Chain' },
  { key: 'spans', label: 'Span attestations' },
  { key: 'blocks', label: 'Sealed blocks' },
  { key: 'certificate', label: 'Certificate' },
];

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return PANELS.some((x) => x.key === p) ? p : 'chain';
};

const go = (ctx, panel) => ctx.navigate(`#/seal?panel=${panel}`);

function modeBadge(report) {
  const v = report.verification;
  if (v.mode === 'hmac' && report.keyed) {
    return badge('Keyed HMAC-SHA256', 'good', 'Seals are keyed with the passphrase-derived session key: they cannot be forged without the passphrase while the workspace is locked.');
  }
  if (v.mode === 'hmac' && !report.keyed) {
    return badge('HMAC blocks, no session key', 'warn', 'The chain contains HMAC-sealed blocks but this session has no key (workspace locked or key not derived): those blocks cannot be verified here.');
  }
  return badge('Plain SHA-256 chain', 'warn', 'Tamper-evident against corruption and honest error. Anyone with write access to the log can recompute a plain hash chain — it is integrity, not forgery-proofing. Unlock the encrypted vault for keyed mode.');
}

function verdictBanner(report) {
  const v = report.verification;
  if (!v.blocks) {
    return banner({
      tone: 'info',
      title: 'Nothing sealed yet',
      body: 'The event log is append-only but not yet hash-chained. Enable the Sealed Spine (below) or run an explicit verification scan; the first sealed transaction starts the chain at genesis.',
    });
  }
  if (v.chainValid && v.contentValid) {
    return banner({
      tone: 'good',
      title: `Chain VALID from genesis — ${v.blocks} sealed block(s), ${v.sealedEvents} event(s) covered`,
      body: `Verified at ${v.verifiedAt || 'render time'}. Every sealed block rehashes to its recorded digest and every seal follows from its predecessor.${v.evictedBlocks ? ` ${v.evictedBlocks} block(s) were evicted by the event-log retention cap: still chain-verified, content no longer recomputable — counted, not hidden.` : ''}${v.leadingUnsealedEvents ? ` ${v.leadingUnsealedEvents} leading event(s) predate the first seal (unsealed history).` : ''}`,
    });
  }
  const first = v.breaks[0];
  return banner({
    tone: 'bad',
    title: `Chain BROKEN — first break at block #${first?.index ?? '?'} (${first?.reason || 'unknown'})`,
    body: first?.detail || 'The log does not replay cleanly from genesis. Do not trust figures derived from events at or after that block until a human explains the break.',
  });
}

function chainPanel(ctx, report) {
  const v = report.verification;
  const stats = [
    stat({ label: 'Seal mode', value: report.activeMode, hint: report.keyed ? 'keyed (HMAC)' : 'plain hash' }),
    stat({ label: 'Sealed blocks', value: String(v.blocks), hint: `${v.sealedEvents} events covered` }),
    stat({ label: 'Chain verdict', value: v.chainValid ? 'VALID' : 'BROKEN', tone: v.chainValid ? 'good' : 'bad' }),
    stat({ label: 'Content verdict', value: v.contentValid ? 'VALID' : 'BROKEN', tone: v.contentValid ? 'good' : 'bad', hint: v.evictedBlocks ? `${v.evictedBlocks} evicted block(s)` : 'all blocks recompute' }),
    stat({ label: 'Chain head', value: `${v.chainHead.slice(0, 12)}…`, hint: 'latest seal' }),
    stat({ label: 'Last sealed at', value: v.lastSealAt ? formatDateTime(v.lastSealAt) : '—' }),
  ];
  const controls = [
    h('button', {
      class: 'btn', type: 'button', 'data-testid': 'seal-verify',
      onClick: () => {
        const res = ctx.api.sealVerify();
        const vv = res.verification;
        toast(vv.chainValid && vv.contentValid
          ? `Chain VALID — ${vv.blocks} blocks, ${vv.sealedEvents} events`
          : `Chain BROKEN — first break: ${vv.breaks[0]?.reason} at block ${vv.breaks[0]?.index}`,
        vv.chainValid && vv.contentValid ? 'good' : 'bad');
        ctx.refresh();
      },
    }, 'Verify chain now'),
    h('button', {
      class: 'btn btn-ghost', type: 'button', 'data-testid': 'seal-scan',
      onClick: () => {
        const res = ctx.api.sealScan();
        toast(res.ok
          ? (res.verification.chainValid ? 'Scan sealed + verified: chain VALID' : 'Scan sealed; verification reports a break — see Chain panel')
          : (res.error || 'Scan refused'),
        res.ok && res.verification.chainValid ? 'good' : 'warn');
        ctx.refresh();
      },
    }, 'Seal + verify this transaction'),
  ];
  if (!report.enabled) {
    controls.push(h('button', {
      class: 'btn btn-primary', type: 'button', 'data-testid': 'seal-enable',
      onClick: () => {
        const res = ctx.api.enableSealing();
        toast(res.ok ? 'Sealed Spine enabled — every operational commit now appends one audit.seal event' : (res.error || 'Refused'), res.ok ? 'good' : 'bad');
        ctx.refresh();
      },
    }, 'Enable sealing'));
  } else {
    controls.push(h('button', {
      class: 'btn btn-ghost', type: 'button', 'data-testid': 'seal-disable',
      onClick: () => {
        const res = ctx.api.disableSealing();
        toast(res.ok ? 'Automatic sealing paused; existing seals remain and still verify' : (res.error || 'Refused'), res.ok ? 'neutral' : 'bad');
        ctx.refresh();
      },
    }, 'Pause automatic sealing'));
    controls.push(h('button', {
      class: 'btn btn-ghost', type: 'button', 'data-testid': 'seal-toggle-auto',
      onClick: () => {
        const res = ctx.api.setSealAutoPropagate(!report.autoPropagate);
        toast(res.ok ? `Automatic pass ${res.sealAutoPropagate ? 'resumed' : 'paused'}` : (res.error || 'Refused'), res.ok ? 'neutral' : 'bad');
        ctx.refresh();
      },
    }, report.autoPropagate ? 'Pause automatic pass' : 'Resume automatic pass'));
  }
  return card({
    title: 'Audit chain status',
    subtitle: `Engine ${report.engineVersion} · sealing ${report.enabled ? 'enabled' : 'not enabled'} · automatic pass ${report.autoPropagate ? 'on' : 'paused'}`,
    actions: controls,
    body: h('div', { class: 'stack' },
      verdictBanner(report),
      h('div', { class: 'stat-grid' }, ...stats),
      h('div', { class: 'stack-tight' },
        h('p', { class: 'muted' }, 'One seal per committed transaction, covering every event that transaction appended — the action entry plus every other rule’s derived events across all modules. The seal event carries the 64-hex seal in its id field and the chain fields in its summary; schema v87 needed no new collection.'),
        modeBadge(report)),
    ),
  });
}

function spansPanel(ctx, report) {
  const spans = report.spans || [];
  const rows = spans.map((s) => h('tr', { key: s.seatId },
    h('td', null, s.aggregate ? s.label : h('span', null, s.label, ' ', badge(`${s.altitudeLabel}`, 'neutral'))),
    h('td', null, s.rank ?? '—'),
    h('td', { class: 'num' }, String(s.openWork)),
    h('td', { class: 'num' }, String(s.sealedTx)),
    h('td', null, s.lastSealedAt ? formatDateTime(s.lastSealedAt) : '—')));
  return card({
    title: report.scoped ? `Span attestations — scoped to ${report.seatLabel}` : 'Span attestations — all spans',
    subtitle: 'Every sealed transaction is counted at the owning span AND at every leadership ancestor above it — the same tree the seat roll-up uses. Out-of-subtree spans collapse to one aggregate row under a declared seat.',
    body: spans.length
      ? h('table', { class: 'table' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Span'), h('th', { scope: 'col' }, 'Rank'),
          h('th', { scope: 'col' }, 'Open work'), h('th', { scope: 'col' }, 'Sealed transactions'), h('th', { scope: 'col' }, 'Last seal'))),
        h('tbody', null, ...rows))
      : emptyState({ title: 'No sealed transactions yet', body: 'Enable sealing and commit any operational change; the span roll-up appears here in the same transaction.' }),
  });
}

function blocksPanel(ctx, report) {
  const blocks = report.verification.blockList || [];
  if (!blocks.length) return card({ title: 'Sealed blocks', body: emptyState({ title: 'No sealed blocks', body: 'The chain starts at genesis with the first sealed transaction.' }) });
  const rows = [...blocks].reverse().map((b) => h('tr', { key: `${b.index}` },
    h('td', { class: 'num' }, String(b.rev)),
    h('td', null, b.ts ? formatDateTime(b.ts) : '—'),
    h('td', null, badge(b.mode, b.mode === 'hmac' ? 'good' : 'neutral')),
    h('td', { class: 'num' }, String(b.evCount)),
    h('td', null, h('code', null, b.seal.slice(0, 12) + '…')),
    h('td', null, h('code', null, b.prev.slice(0, 12) + '…')),
    h('td', null, b.chainOk && b.contentOk ? badge('valid', 'good') : badge('CHECK', 'bad', b.contentComplete ? 'content mismatch' : 'content evicted by retention cap')),
    h('td', null, b.root || '—')));
  return card({
    title: `Sealed blocks (latest ${blocks.length})`,
    subtitle: 'One row per sealed transaction. rev = workspace revision, ev = events covered, root = the transaction’s root record.',
    body: h('table', { class: 'table' },
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, 'Rev'), h('th', { scope: 'col' }, 'Sealed at'), h('th', { scope: 'col' }, 'Mode'),
        h('th', { scope: 'col' }, 'Events'), h('th', { scope: 'col' }, 'Seal'), h('th', { scope: 'col' }, 'Prev'),
        h('th', { scope: 'col' }, 'Check'), h('th', { scope: 'col' }, 'Root'))),
      h('tbody', null, ...rows)),
  });
}

function certificatePanel(ctx, report) {
  return card({
    title: 'Integrity certificate',
    subtitle: 'Identity-free Markdown: chain statistics, seal prefixes and the verdict — no person ids, no record content. Safe to attach to a board pack or an auditor.',
    actions: [h('button', {
      class: 'btn', type: 'button', 'data-testid': 'seal-download-cert',
      onClick: () => {
        const res = ctx.api.sealBriefText();
        if (!res.ok) { toast(res.error || 'Could not build the certificate', 'bad'); return; }
        downloadText({ filename: `leados-integrity-certificate-${(report.verification.verifiedAt || 'now').slice(0, 10)}.md`, text: res.text, mime: 'text/markdown' });
        toast('Integrity certificate downloaded', 'good');
      },
    }, 'Download certificate')],
    body: h('div', { class: 'stack-tight' },
      h('p', null, `Current verdict: ${report.verification.chainValid && report.verification.contentValid ? 'VALID from genesis' : 'BROKEN'} · mode ${report.verification.mode}${report.keyed ? ' (keyed)' : ''} · ${report.verification.blocks} block(s) · head ${report.verification.chainHead.slice(0, 16)}…`),
      h('p', { class: 'muted' }, 'Limitations travel with the certificate: plain-hash mode does not resist an attacker who rewrites the whole log; sealing is a local workspace property, not authentication; retention-cap-evicted blocks stay chain-verified but cannot be recomputed.'),
    ),
  });
}

export function renderSeal(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const read = ctx.api.sealRead();
  if (!read.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Integrity', title: 'Integrity & seals', subtitle: 'Tamper-evident audit chain over the append-only event log' }),
      banner({ tone: 'bad', title: 'Unavailable at this seat', body: read.error || 'The sealed-chain read is not available for the declared operating seat.' }));
  }
  const report = read.report;
  const panel = panelFor(ctx.query);
  const panels = {
    chain: chainPanel(ctx, report),
    spans: spansPanel(ctx, report),
    blocks: blocksPanel(ctx, report),
    certificate: certificatePanel(ctx, report),
  };
  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Integrity',
      title: 'Integrity & seals',
      subtitle: 'A hash-chained, tamper-evident seal over every committed transaction — verified from genesis, rolled up the chain of command, keyed by your vault passphrase when unlocked.',
      actions: [h('button', {
        class: 'btn btn-ghost', type: 'button', 'data-testid': 'seal-verify-top',
        onClick: () => { ctx.api.sealScan(); ctx.refresh(); },
      }, 'Seal + verify now')],
    }),
    tabs({ items: PANELS.map((p) => ({ key: p.key, label: p.label, href: `#/seal?panel=${p.key}` })), active: panel, onSelect: (k) => go(ctx, k), ariaLabel: 'Integrity sections' }),
    panels[panel],
    h('p', { class: 'muted' },
      `Nav badge counts chain breaks only (currently ${sealAttentionCount(ctx.state)}). Sealing is a local workspace property — not authentication and not a multi-user boundary. One browser, one store, one log; the chain proves it has not been altered since each block was sealed, under the printed mode.`));
}
