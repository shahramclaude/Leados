/**
 * app/views/identity.js — the Attested Commit surface (ADR-0089, `#/identity`).
 *
 * One screen that answers, for every altitude: WHO wrote this? It shows the
 * authorship boundary (enabled / enforced / session state), the attestation
 * ledger with honest three-valued verdicts (verified · FAILED · digest-verified
 * but key unavailable), the per-span integrity posture rolled up the chain of
 * command (a frontline credential gap surfaces at the director, VP and chief
 * spans — scoped so no seat sees another span's detail), the rung-3 checkpoint
 * anchor (export a document kept OUTSIDE the workspace; compare it later to
 * detect tail truncation a hash chain cannot see), and an identity-free
 * attestation certificate for download.
 *
 * Everything is re-derived from the event log on render — nothing here can
 * drift from the record it describes. Passphrases are read from the form at
 * click time and never stored, logged or echoed.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState } from '../ui/components.js';
import { buildSeats, activeSeat } from '../core/domain/seat.js';
import { scopeIdentitySpans } from '../core/domain/identity.js';
import { identityAttentionCount } from '../core/domain/identity.js';
import { IDENTITY_LIMITS } from '../core/domain/identityRegistry.js';

const formatDateTime = (iso) => {
  if (!iso) return '—';
  const d = String(iso);
  return `${d.slice(0, 10)} ${d.slice(11, 16)}Z`;
};

const PANELS = [
  { key: 'session', label: 'Session & boundary' },
  { key: 'ledger', label: 'Attestation ledger' },
  { key: 'rollup', label: 'Span posture' },
  { key: 'checkpoint', label: 'Checkpoint anchor' },
  { key: 'brief', label: 'Certificate' },
];

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return PANELS.some((x) => x.key === p) ? p : 'session';
};

const go = (ctx, panel) => ctx.navigate(`#/identity?panel=${panel}`);

function verdictBadge(verdict) {
  if (verdict === 'verified') return badge('verified', 'good', 'The MAC recomputes under an unlocked seat credential.');
  if (verdict === 'FAILED') return badge('FAILED', 'bad', 'The MAC does not recompute — forged or tampered. Investigate before trusting anything derived from this revision.');
  if (verdict === 'EVICTED') return badge('evicted', 'warn', 'The events this attestation signed were dropped by the retention cap. Content can no longer be recomputed — counted, never hidden.');
  if (verdict === 'malformed') return badge('malformed', 'bad', 'The attestation event itself does not parse.');
  return badge('digest-verified · key unavailable', 'warn', 'The structure and digest recompute, but no unlocked credential could confirm who wrote it. This is NOT verified authorship.');
}

function boundaryBanner(report) {
  if (!report.enabled) {
    return banner({
      tone: 'info',
      title: 'Attestation is not on',
      body: 'This workspace has no seat credentials enrolled. Enroll one below (your passphrase is used once to derive a key and then dropped — there is no recovery). Until then, every commit is a declared label, exactly as before.',
    });
  }
  if (report.enforced && !report.session.active) {
    return banner({
      tone: 'warn',
      title: 'Enforcement is ON and no credential is unlocked',
      body: 'Writes through the app are refused until a seat credential session is unlocked — the refusal is the boundary doing its job. Writes that reach the store another way are logged as unattributed and escalated up the chain of command.',
    });
  }
  if (report.verification.counts.failed > 0) {
    return banner({
      tone: 'bad',
      title: `${report.verification.counts.failed} FAILED attestation(s) on record`,
      body: 'A recorded MAC does not recompute under the credential named on it. Either the attested events were tampered with, or the credential was replaced without rotating. Investigate before trusting figures derived from those revisions.',
    });
  }
  if (report.session.active) {
    return banner({
      tone: 'good',
      title: `Commits are attested by seat “${report.session.seatId}” (credential ${report.session.keyId})`,
      body: `The derived key is memory-only and expires after ${report.idleMins} idle minutes. Every operational commit appends one signed attestation; the seal (if enabled) covers the attestation itself.`,
    });
  }
  return banner({
    tone: 'neutral',
    title: 'Identity enabled — session locked',
    body: `${report.enrollments.length} credential(s) enrolled, ${report.attestedTx} attested transaction(s) on record. Unlock a credential to attest new commits and to MAC-verify old ones.`,
  });
}

function sessionPanel(ctx, report) {
  const settings = ctx.state.settings || {};
  const built = buildSeats(ctx.state, { settings });
  const seat = activeSeat(built);
  const ownSeatOnly = !seat.fullAccess;
  const seatOptions = [...built.byId.values()]
    .filter((s) => !ownSeatOnly || s.id === seat.id || (seat.scope && seat.scope.has(s.id)))
    .map((s) => h('option', { value: s.id, selected: s.id === (settings.activeSeatId || seat.id) }, `${s.label} (rank ${s.rank})`));
  if (seat.fullAccess) {
    seatOptions.push(h('option', { value: '__operator__' }, 'Workspace operator (undeclared view)'));
  }

  const seatSelect = h('select', { id: 'idn-seat', class: 'input', 'aria-label': 'Seat to enroll or unlock' }, ...seatOptions);
  const passInput = h('input', {
    id: 'idn-pass', class: 'input', type: 'password', autocomplete: 'new-password',
    'aria-describedby': 'idn-pass-hint', placeholder: 'seat passphrase (min 12 characters)',
  });

  const handle = (promise, okMessage) => {
    promise.then((res) => {
      toast(res.ok ? okMessage : (res.error || 'Refused.'), res.ok ? 'good' : 'bad');
      if (res.ok) ctx.refresh();
    }).catch(() => toast('The credential operation failed to run.', 'bad'));
  };

  const authCard = report.session.active
    ? card({
      title: 'Unlocked seat session',
      subtitle: `seat ${report.session.seatId} · credential ${report.session.keyId} · idle expiry ${report.idleMins} min`,
      actions: [
        h('button', {
          class: 'btn', type: 'button', 'data-testid': 'idn-lock',
          onClick: () => { const res = ctx.api.identityLock(); toast(res.ok ? 'Session locked. New writes are unattested until unlock.' : (res.error || 'Refused'), res.ok ? 'neutral' : 'bad'); ctx.refresh(); },
        }, 'Lock session now'),
      ],
      body: h('div', { class: 'stack-tight' },
        h('p', { class: 'muted' }, 'While unlocked, every operational commit this tab makes is signed with a key derived from your passphrase and held only in memory — cleared on lock, vault lock, import and reload.'),
        h('p', { class: 'muted' }, 'To change the passphrase, enroll again with a new one below (rotation: new salt, new verifier, new fingerprint — past attestations keep their original keyId and read “key unavailable” for the retired key).')),
    })
    : card({
      title: report.enrollments.length ? 'Unlock or enroll a seat credential' : 'Enroll the first seat credential',
      subtitle: 'The passphrase is used once to derive the key (PBKDF2, 600k iterations) and then dropped. There is no recovery — a lost passphrase means enrolling a new credential, and old attestations verify as “key unavailable”.',
      body: h('div', { class: 'stack' },
        h('label', { class: 'field' }, h('span', null, 'Seat'), seatSelect),
        h('label', { class: 'field' }, h('span', null, 'Seat passphrase'), passInput),
        h('p', { id: 'idn-pass-hint', class: 'muted' }, `At least 12 characters, ${IDENTITY_LIMITS.unlockAttemptCap} unlock attempts per ${IDENTITY_LIMITS.unlockWindowMins} minutes — the workspace will not grind guesses.`),
        h('div', { class: 'row' },
          h('button', {
            class: 'btn btn-primary', type: 'button', 'data-testid': 'idn-unlock',
            onClick: () => handle(ctx.api.identityUnlock({ seatId: seatSelect.value, passphrase: passInput.value }), 'Seat credential unlocked — commits are now attested.'),
          }, 'Unlock'),
          h('button', {
            class: 'btn', type: 'button', 'data-testid': 'idn-enroll',
            onClick: () => handle(ctx.api.identityEnroll({ seatId: seatSelect.value, passphrase: passInput.value }), 'Credential enrolled and unlocked — the enrollment commit is the first attested act.'),
          }, 'Enroll / rotate'))),
    });

  const boundaryCard = card({
    title: 'The authorship boundary',
    subtitle: 'Enforcement is a claim the workspace makes about itself. Turn it on when every writing seat has a credential.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Identity enabled', value: report.enabled ? 'yes' : 'no', hint: 'opt-in, like the seal' }),
        stat({ label: 'Enforcement', value: report.enforced ? 'ON' : 'off', tone: report.enforced ? 'good' : 'neutral', hint: report.enforced ? 'unattributed writes refused + escalated' : 'advisory' }),
        stat({ label: 'Session', value: report.session.active ? `unlocked (${report.session.keyId})` : 'locked', tone: report.session.active ? 'good' : 'neutral' }),
        stat({ label: 'Enrolled credentials', value: String(report.enrollments.length) }),
        stat({ label: 'Attested transactions', value: String(report.attestedTx) }),
        stat({ label: 'Unattributed on record', value: String(report.unattributed), tone: report.unattributed ? 'bad' : 'good' })),
      h('div', { class: 'row' },
        h('button', {
          class: 'btn btn-ghost', type: 'button', 'data-testid': 'idn-toggle-enforced',
          onClick: () => {
            const res = ctx.api.identitySetSettings({ identityEnforced: !report.enforced });
            toast(res.ok ? (res.settings.identityEnforced ? 'Enforcement ON — the workspace now refuses unattributed writes.' : 'Enforcement off — advisory mode.') : (res.error || 'Refused'), res.ok ? 'good' : 'bad');
            ctx.refresh();
          },
        }, report.enforced ? 'Turn enforcement OFF' : 'Turn enforcement ON'),
        h('button', {
          class: 'btn btn-ghost', type: 'button', 'data-testid': 'idn-toggle-auto',
          onClick: () => {
            const res = ctx.api.identitySetSettings({ identityAutoPropagate: !report.autoPropagate });
            toast(res.ok ? (res.settings.identityAutoPropagate ? 'Breach escalation resumed.' : 'Breach escalation paused (attestation itself is never paused).') : (res.error || 'Refused'), res.ok ? 'neutral' : 'bad');
            ctx.refresh();
          },
        }, report.autoPropagate ? 'Pause breach escalation' : 'Resume breach escalation')),
      h('p', { class: 'muted' }, 'Idle expiry is a declared convention (currently ' + String(report.idleMins) + ' minutes). Attestation itself is deliberately NOT pausable: a workspace that claims enforcement cannot silently stop signing.'),
    ),
  });

  return h('div', { class: 'stack' }, boundaryBanner(report), authCard, boundaryCard);
}

function ledgerPanel(ctx, report) {
  const v = report.verification;
  const rows = [...(v.rows || [])].reverse();
  const built = buildSeats(ctx.state, { settings: ctx.state.settings || {} });
  const seat = activeSeat(built);
  const mask = (seatId) => {
    if (!seatId) return '—';
    if (seat.fullAccess || !ctx.state.settings?.activeSeatId) return seatId;
    if (seatId === seat.id || (seat.scope && seat.scope.has(seatId))) return seatId;
    return 'other span';
  };
  return h('div', { class: 'stack' },
    card({
      title: 'Attestation verdicts',
      subtitle: 'Three-valued and honest: “key unavailable” is never upgraded to verified, and never punished as failed.',
      actions: [
        h('button', {
          class: 'btn', type: 'button', 'data-testid': 'idn-verify',
          onClick: () => {
            const res = ctx.api.identityVerify();
            const c = res.verification.counts;
            toast(`Verification: ${c.verified} verified · ${c.digestOnly} digest-only · ${c.failed} failed · ${c.mismatch} mismatch · ${c.evicted} evicted`, c.failed + c.mismatch ? 'bad' : 'good');
            ctx.refresh();
          },
        }, 'Verify now'),
        h('button', {
          class: 'btn btn-ghost', type: 'button', 'data-testid': 'idn-scan',
          onClick: () => {
            const res = ctx.api.identityScan();
            toast(res.ok ? `Scan recorded in the same log it verifies (${res.verification.counts.total} attestation(s) checked).` : (res.error || 'Scan refused'), res.ok ? 'good' : 'bad');
            ctx.refresh();
          },
        }, 'Record a verification scan'),
      ],
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Verified', value: String(v.counts.verified), tone: 'good' }),
        stat({ label: 'Digest-verified (key unavailable)', value: String(v.counts.digestOnly), tone: 'neutral', hint: 'not verified authorship' }),
        stat({ label: 'FAILED', value: String(v.counts.failed), tone: v.counts.failed ? 'bad' : 'good' }),
        stat({ label: 'Content mismatch', value: String(v.counts.mismatch), tone: v.counts.mismatch ? 'bad' : 'good' }),
        stat({ label: 'Evicted', value: String(v.counts.evicted), tone: v.counts.evicted ? 'warn' : 'good' }),
        stat({ label: 'Attested transactions', value: String(v.counts.total) })),
    }),
    rows.length
      ? card({
        title: `Attestation ledger (latest ${rows.length})`,
        subtitle: 'One row per attested transaction. MAC = HMAC-SHA256(seatKey, seat|keyId|revision|digest) — the digest covers every event the transaction appended before the attestation.',
        body: h('table', { class: 'table', 'aria-label': 'Attestation ledger' },
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, 'Rev'), h('th', { scope: 'col' }, 'Attested at'),
            h('th', { scope: 'col' }, 'Seat'), h('th', { scope: 'col' }, 'Credential'),
            h('th', { scope: 'col' }, 'Events'), h('th', { scope: 'col' }, 'MAC'), h('th', { scope: 'col' }, 'Verdict'))),
          h('tbody', null, ...rows.map((r) => h('tr', { key: String(r.index) },
            h('td', { class: 'num' }, r.rev == null ? '—' : String(r.rev)),
            h('td', null, formatDateTime(r.ts)),
            h('td', null, mask(r.seatId)),
            h('td', null, r.keyId ? h('code', null, r.keyId) : '—'),
            h('td', { class: 'num' }, String(r.evCount)),
            h('td', null, r.mac ? h('code', null, String(r.mac).slice(0, 12) + '…') : '—'),
            h('td', null, verdictBadge(r.verdict)))))),
      })
      : card({ title: 'Attestation ledger', body: emptyState({ title: 'No attestations yet', body: 'Enroll a seat credential and commit any operational change; the signed attestation appears here in the same transaction.' }) }));
}

function rollupPanel(ctx, report) {
  const scoped = scopeIdentitySpans(report.spans, ctx.state, { settings: ctx.state.settings || {} });
  const spans = scoped.spans || [];
  return card({
    title: scoped.scoped ? `Span integrity posture — scoped to ${scoped.seatLabel}` : 'Span integrity posture — all spans',
    subtitle: 'A seat’s posture counts at its own span AND every leadership ancestor above it — the same tree the seat roll-up uses, so a frontline credential gap reaches the director, VP and chief with zero re-entry. Out-of-subtree spans collapse to one aggregate row under a declared seat.',
    body: spans.length
      ? h('table', { class: 'table', 'aria-label': 'Span integrity posture' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Span'), h('th', { scope: 'col' }, 'Altitude'),
          h('th', { scope: 'col' }, 'Enrolled'), h('th', { scope: 'col' }, 'Attested (own)'),
          h('th', { scope: 'col' }, 'Unattributed'), h('th', { scope: 'col' }, 'Verified'),
          h('th', { scope: 'col' }, 'Failed'), h('th', { scope: 'col' }, 'Last attestation'))),
        h('tbody', null, ...spans.map((s) => h('tr', { key: s.seatId },
          h('td', null, s.aggregate ? s.label : h('span', null, s.label, ' ', badge(s.altitudeLabel, 'neutral'))),
          h('td', null, s.altitudeLabel),
          h('td', null, s.aggregate ? '—' : (s.enrolled ? badge('yes', 'good', s.keyId ? `credential ${s.keyId}` : '') : badge('no', s.unattributedN ? 'bad' : 'warn', 'No credential enrolled for this seat'))),
          h('td', { class: 'num' }, `${s.attestedTx}${s.ownAttestedTx != null && s.ownAttestedTx !== s.attestedTx ? ` (${s.ownAttestedTx} own)` : ''}`),
          h('td', { class: 'num' }, String(s.unattributedN)),
          h('td', { class: 'num' }, String(s.verifiedN)),
          h('td', { class: 'num' }, String(s.failedN)),
          h('td', null, formatDateTime(s.lastAttestAt))))))
      : emptyState({ title: 'No posture to show yet', body: 'Enroll a credential and commit; per-span posture rolls up the chain of command in the same transaction.' }),
  });
}

function checkpointPanel(ctx, report) {
  const certArea = h('textarea', {
    id: 'idn-cert', class: 'input', rows: '8', placeholder: 'Paste a previously exported checkpoint document here…',
    'aria-label': 'Checkpoint document to compare',
  });
  const resultBox = h('div', { class: 'stack-tight', 'data-testid': 'idn-checkpoint-result' });
  return h('div', { class: 'stack' },
    card({
      title: 'Checkpoint anchor (assurance rung 3)',
      subtitle: 'A hash chain cannot see its own tail being cut off. A checkpoint document kept OUTSIDE the workspace can.',
      actions: [h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'idn-checkpoint-export',
        onClick: () => {
          const res = ctx.api.identityCheckpoint();
          if (!res.ok) { toast(res.error || 'Checkpoint refused', 'bad'); return; }
          const ok = downloadText({
            filename: `leados-attested-checkpoint-rev${res.revision}.md`,
            text: res.text,
            mime: 'text/markdown;charset=utf-8',
          });
          toast(ok
            ? `Checkpoint exported (${res.signed ? `signed by ${res.keyId}` : 'UNSIGNED — unlock a credential to sign'}) — keep it outside this workspace.`
            : 'Download blocked — open the console output and copy the checkpoint text manually.', ok ? 'good' : 'warn');
          if (!ok) { resultBox.textContent = res.text; }
          ctx.refresh();
        },
      }, 'Export signed checkpoint')],
      body: h('div', { class: 'stack-tight' },
        h('p', null, `Current anchor: revision ${report.verification.lastAttestation?.rev ?? '—'} · ${report.attestedTx} attested transaction(s) · chain head ${report.sealHead ? `${report.sealHead.slice(0, 16)}…` : 'no seal (enable the Sealed Spine for rung 1)'}.`),
        h('p', { class: 'muted' }, 'Export regularly (say, weekly), and keep the file somewhere else — another device, a printed page, an email to yourself. The MAC at the bottom proves which credential produced it; an UNSIGNED checkpoint still anchors honest counts but anyone can write one.')),
    }),
    card({
      title: 'Compare a checkpoint',
      subtitle: 'Paste a checkpoint document. Fewer events or a lower revision than the anchor means the tail was truncated — the attack rung 1 cannot see.',
      body: h('div', { class: 'stack' },
        certArea,
        h('button', {
          class: 'btn', type: 'button', 'data-testid': 'idn-checkpoint-compare',
          onClick: () => {
            const res = ctx.api.identityCompareCheckpoint(certArea.value);
            if (!res.ok) {
              toast(res.detail || 'That document does not look like a LeadOS checkpoint.', 'bad');
              resultBox.textContent = res.detail || '';
              return;
            }
            const tone = ['TRUNCATED', 'REWOUND', 'REWRITTEN'].includes(res.verdict) ? 'bad'
              : res.macVerdict === 'FAILED' ? 'bad' : res.macVerdict === 'key unavailable' ? 'warn' : 'good';
            toast(`Checkpoint verdict: ${res.verdict} · MAC ${res.macVerdict}`, tone);
            resultBox.textContent = `${res.verdict} — ${res.detail} (MAC: ${res.macVerdict}; anchored ${res.anchored.eventCount} events at revision ${res.anchored.revision}; now ${res.current.eventCount} events at revision ${res.current.revision}.)`;
          },
        }, 'Compare checkpoint'),
        resultBox),
    }));
}

function briefPanel(ctx) {
  const brief = ctx.api.identityBriefText();
  const text = brief.ok ? brief.text : (brief.error || 'Certificate unavailable at this seat.');
  return card({
    title: 'Attestation certificate',
    subtitle: 'Identity-free Markdown: counts, verdicts, assurance-ladder claims and their limits — no person ids, no seat labels, no key material. Safe to attach to a board pack or an auditor.',
    actions: [
      h('button', {
        class: 'btn', type: 'button', 'data-testid': 'idn-download-brief',
        onClick: () => {
          const res = ctx.api.identityBriefText();
          if (!res.ok) { toast(res.error || 'Could not build the certificate', 'bad'); return; }
          const ok = downloadText({ filename: `leados-attestation-certificate-${new Date().toISOString().slice(0, 10)}.md`, text: res.text, mime: 'text/markdown;charset=utf-8' });
          toast(ok ? 'Attestation certificate downloaded' : 'Download not available — copy the text below', ok ? 'good' : 'warn');
        },
      }, 'Download certificate'),
      h('button', {
        class: 'btn btn-ghost', type: 'button', 'data-testid': 'idn-download-csv',
        onClick: () => {
          try {
            const res = ctx.exportCSV('seat-attestation');
            if (res.ok && res.csv) {
              const ok = downloadText({ filename: res.filename, text: res.csv, mime: 'text/csv;charset=utf-8' });
              toast(ok ? 'Aggregate-only CSV downloaded' : 'Download not available', ok ? 'good' : 'bad');
            } else toast(res.error || 'Export failed', 'bad');
          } catch (err) {
            toast(err?.message || 'Full-workspace export is not available from a declared seat.', 'warn');
          }
        },
      }, 'Export aggregate CSV'),
    ],
    body: h('pre', { class: 'code-block', 'data-testid': 'idn-brief-text', tabindex: '0', 'aria-label': 'Attestation certificate text' }, text),
  });
}

export function renderIdentity(ctx) {
  const read = ctx.api.identityRead();
  if (!read.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Integrity', title: 'Attested commits', subtitle: 'Seat-credential authorship over every commit' }),
      banner({ tone: 'bad', title: 'Unavailable at this seat', body: read.error || 'The identity read is not available for the declared operating seat.' }));
  }
  const report = read.report;
  const panel = panelFor(ctx.query);
  const panels = {
    session: sessionPanel(ctx, report),
    ledger: ledgerPanel(ctx, report),
    rollup: rollupPanel(ctx, report),
    checkpoint: checkpointPanel(ctx, report),
    brief: briefPanel(ctx, report),
  };
  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Integrity',
      title: 'Attested commits',
      subtitle: 'Who wrote this: every commit signed by a passphrase-derived seat credential held only in memory — verified on demand, escalated up the chain of command when nobody would sign.',
      actions: [h('button', {
        class: 'btn btn-ghost', type: 'button', 'data-testid': 'idn-scan-top',
        onClick: () => { ctx.api.identityScan(); ctx.refresh(); },
      }, 'Verify + record scan')],
    }),
    tabs({ items: PANELS.map((p) => ({ key: p.key, label: p.label, href: `#/identity?panel=${p.key}` })), active: panel, onSelect: (k) => go(ctx, k), ariaLabel: 'Attestation sections' }),
    panels[panel],
    h('p', { class: 'muted' },
      `Nav badge counts failed attestations and unattributed writes (currently ${identityAttentionCount(ctx.state, { settings: ctx.state.settings })}). Honest scope: a MAC is symmetric — this is tamper-evident authorship inside one organization, not third-party non-repudiation, not authentication of a human being, and no boundary against an attacker who controls this browser while it is unlocked. A row reading “digest-verified, key unavailable” is NOT verified authorship.`));
}
