/**
 * app/views/eventArchive.js — operator-governed external event-retention
 * capsules for the Sealed Spine (ADR-0205). The verifier returns aggregate
 * proof metadata only; no archive event rows are imported into the workspace.
 */

import { h, toast, openModal } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { banner, card, stat } from '../ui/components.js';
import { EVENT_ARCHIVE_LIMITS } from '../core/domain/eventArchiveRegistry.js';

const DAY_MS = 86_400_000;
const dayOf = (value) => value instanceof Date && Number.isFinite(value.getTime())
  ? value.toISOString().slice(0, 10)
  : new Date().toISOString().slice(0, 10);
const dayAfter = (day, count) => new Date(Date.parse(`${day}T00:00:00.000Z`) + count * DAY_MS).toISOString().slice(0, 10);
const shortIso = (value) => typeof value === 'string' ? `${value.slice(0, 10)} ${value.slice(11, 19)}Z` : '—';

function readFileWithReader(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The selected file could not be read.'));
    reader.readAsText(file);
  });
}

function retentionStatus(status) {
  const pressureLabel = status.pressure === 'at-cap'
    ? 'At the 600-event cap'
    : status.pressure === 'approaching-cap' ? 'Approaching the 600-event cap' : 'Below the warning threshold';
  const pressureTone = status.pressure === 'at-cap' ? 'bad' : status.pressure === 'approaching-cap' ? 'warn' : 'good';
  return card({
    title: 'Live event-log retention',
    subtitle: 'The ordinary event suffix is capped at 600 and evicts its oldest rows first. Seals remain, but evicted block contents cannot be recomputed.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Ordinary retained events', value: `${status.ordinaryEventsN} / ${status.eventCap}`, tone: pressureTone, hint: pressureLabel }),
        stat({ label: 'Retained seal events', value: String(status.sealsN) }),
        stat({ label: 'Complete retained blocks', value: String(status.contentCompleteBlocksN) })),
      h('p', { class: 'muted small' }, `Oldest retained ordinary event: ${shortIso(status.oldestRetainedEventAt)} · newest: ${shortIso(status.newestRetainedEventAt)}.`),
      status.eventLogShape === 'readable'
        ? null
        : banner({ tone: 'bad', title: 'Archive source refused', body: status.eventLogReason || 'The retained event log cannot be parsed into sealed blocks.' }),
      !status.canCreate
        ? banner({ tone: 'warn', title: 'Creation is unavailable in this view', body: status.createRefusal || 'Return to the writable full-access operator view.' })
        : null,
      h('p', { class: 'muted small' }, 'This status is a count-only read from the current workspace; it exposes no event summaries, person names or IDs.'),
    ),
  });
}

function reportCard(report) {
  const expired = report.verdict === 'expired';
  const coverage = report.targetCoverage || { verdict: 'not-requested', reason: 'No comparison window was requested.' };
  return card({
    title: expired ? 'Capsule verified, but expired — use refused' : 'Capsule verified — read-only',
    subtitle: `Archive ${report.archiveId}`,
    body: h('div', { class: 'stack' },
      banner({
        tone: expired ? 'bad' : 'good',
        title: expired ? 'Retention date passed' : 'Cryptographic and coverage checks passed',
        body: `Purpose: ${report.purpose}. Declared window: ${report.window.fromDay} through ${report.window.throughDay} UTC. Retain until ${report.retainUntil.slice(0, 10)}.`,
      }),
      h('div', { class: 'stat-grid' },
        stat({ label: 'Complete sealed blocks', value: String(report.blocksN) }),
        stat({ label: 'Events in archived blocks', value: String(report.eventsN) }),
        stat({ label: 'Events inside window', value: String(report.windowEventsN) }),
        stat({ label: 'Boundary events', value: String(report.boundaryEventsN) }),
        stat({ label: 'Anchor-chain seals', value: String(report.anchorProof.sealsN) }),
        stat({ label: 'Closing revision', value: String(report.sourceRevision) })),
      h('p', null, `Start anchor: ${report.anchorProof.verdict}. ${report.anchorProof.contentNote}`),
      h('p', null, `Window segment: ${report.segmentProof}. Manifest: ${report.manifestProof}.`),
      h('p', null, `Coverage comparison: ${coverage.verdict} — ${coverage.reason}`),
      h('p', { class: 'muted small' }, `Time basis: ${report.timestampBasis}. ${report.expiryEnforced}.`),
      h('p', { class: 'muted small' }, 'Read-only result: no event rows returned and nothing restored to the live workspace.'),
    ),
  });
}

function creationCard(ctx, status) {
  const today = dayOf(ctx.now instanceof Date ? ctx.now : new Date());
  const latestClosedDay = dayAfter(today, -1);
  const defaultRetentionDay = dayAfter(today, 365);
  const maximumRetentionDay = dayAfter(today, EVENT_ARCHIVE_LIMITS.maxRetentionDays);
  const allowed = status.canCreate && status.eventLogShape === 'readable';

  const fromInput = h('input', {
    id: 'event-archive-from', name: 'fromDay', type: 'date', required: true,
    max: latestClosedDay, class: 'input', 'data-testid': 'event-archive-from',
  });
  const throughInput = h('input', {
    id: 'event-archive-through', name: 'throughDay', type: 'date', required: true,
    max: latestClosedDay, class: 'input', 'data-testid': 'event-archive-through',
  });
  const purposeInput = h('textarea', {
    id: 'event-archive-purpose', name: 'purpose', required: true, minLength: EVENT_ARCHIVE_LIMITS.purposeMin,
    maxLength: EVENT_ARCHIVE_LIMITS.purposeMax, rows: 3, class: 'input',
    'aria-describedby': 'event-archive-purpose-help', 'data-testid': 'event-archive-purpose',
  });
  const retainInput = h('input', {
    id: 'event-archive-retain-until', name: 'retainUntilDay', type: 'date', required: true,
    min: dayAfter(today, 1), max: maximumRetentionDay, value: defaultRetentionDay, class: 'input',
    'data-testid': 'event-archive-retain-until',
  });
  const passphraseInput = h('input', {
    id: 'event-archive-passphrase', name: 'passphrase', type: 'password', required: true,
    minLength: 12, maxLength: 1024, autocomplete: 'new-password', class: 'input',
    'aria-describedby': 'event-archive-passphrase-help', 'data-testid': 'event-archive-passphrase',
  });
  const confirmInput = h('input', {
    id: 'event-archive-confirm', name: 'confirmPassphrase', type: 'password', required: true,
    minLength: 12, maxLength: 1024, autocomplete: 'new-password', class: 'input',
    'data-testid': 'event-archive-confirm',
  });
  const createButton = h('button', {
    class: 'btn btn-primary', type: 'submit', disabled: !allowed, 'data-testid': 'event-archive-create',
  }, 'Encrypt and record capsule');
  const createStatus = h('p', { class: 'field-help small', role: 'status', 'aria-live': 'polite' });

  const form = h('form', {
    class: 'form',
    onSubmit: async (event) => {
      event.preventDefault();
      createStatus.className = 'field-help small';
      createStatus.textContent = 'Verifying the sealed window and encrypting the external capsule…';
      createButton.disabled = true;
      createButton.setAttribute('aria-busy', 'true');
      const result = await ctx.api.sealArchiveCreate({
        fromDay: fromInput.value,
        throughDay: throughInput.value,
        purpose: purposeInput.value,
        retainUntilDay: retainInput.value,
        passphrase: passphraseInput.value,
        confirmPassphrase: confirmInput.value,
      });
      createButton.disabled = !allowed;
      createButton.removeAttribute('aria-busy');
      passphraseInput.value = '';
      confirmInput.value = '';
      if (!result.ok) {
        createStatus.className = 'field-error';
        createStatus.textContent = result.error || 'The archive was refused. No file was issued.';
        toast(result.error || 'Archive creation refused', 'bad');
        return;
      }

      const filename = `leados-provenance-archive-${result.summary.fromDay}-${result.summary.throughDay}.json`;
      const downloaded = downloadText({ filename, text: result.json, mime: 'application/json;charset=utf-8' });
      const audit = `Audit revision ${result.audit.revision} is saved and sealed; ${result.summary.blocksN} block(s), ${result.summary.windowEventsN} event(s) in the declared window; retain until ${result.summary.retainUntil.slice(0, 10)}.`;
      createStatus.className = 'field-help small';
      createStatus.textContent = `${audit} ${downloaded ? 'A download was offered; confirm the file is saved and keep its passphrase separately.' : 'The browser blocked the download; the encrypted file text is available to copy below.'}`;
      toast(downloaded ? 'Encrypted archive download offered; keep its passphrase separately' : 'Copy the encrypted archive file from the open dialog', downloaded ? 'good' : 'warn');
      if (!downloaded) {
        openModal({
          title: 'Save the encrypted archive capsule',
          body: h('div', { class: 'stack' },
            h('p', null, 'The browser did not offer a download. Copy the ciphertext below into a .json file. It contains the capsule only in encrypted form; this text is not saved in workspace state.'),
            h('textarea', { rows: 18, readOnly: true, class: 'input', 'aria-label': 'Encrypted archive file contents' }, result.json)),
        });
      }
      ctx.refresh();
    },
  },
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'event-archive-from' }, 'Window starts (UTC)'), fromInput,
      h('p', { class: 'field-help' }, 'Choose a closed reporting window. The capsule includes the verified seal before this date and every full sealed block through a later closing seal.')),
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'event-archive-through' }, 'Window ends (UTC, inclusive)'), throughInput),
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'event-archive-purpose' }, 'Declared purpose'), purposeInput,
      h('p', { class: 'field-help', id: 'event-archive-purpose-help' }, `Required, ${EVENT_ARCHIVE_LIMITS.purposeMin}–${EVENT_ARCHIVE_LIMITS.purposeMax} characters. This purpose is encrypted inside the capsule and is not copied into the live event log.`)),
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'event-archive-retain-until' }, 'Retain until (UTC)'), retainInput,
      h('p', { class: 'field-help' }, `Required finite horizon: after today and no more than ${EVENT_ARCHIVE_LIMITS.maxRetentionDays} days. The verifier refuses use after this date; external deletion is not enforced.`)),
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'event-archive-passphrase' }, 'Archive passphrase'), passphraseInput,
      h('p', { class: 'field-help', id: 'event-archive-passphrase-help' }, 'Use a new passphrase of at least 12 characters and at least four different characters. This is separate from the workspace passphrase; there is no recovery.'),
      h('label', { class: 'field-label', for: 'event-archive-confirm' }, 'Confirm archive passphrase'), confirmInput),
    h('div', { class: 'row-gap' }, createButton), createStatus,
  );

  return card({
    title: 'Create an external capsule',
    subtitle: 'A local full-access operator act. The capsule is encrypted before export, and a separate live audit event is saved and sealed before any file is released.',
    body: h('div', { class: 'stack' },
      allowed
        ? form
        : banner({
          tone: 'warn',
          title: status.eventLogShape === 'readable' ? 'Operator action unavailable' : 'Source log is not readable',
          body: status.eventLogShape !== 'readable'
            ? status.eventLogReason || 'The event log must parse before a capsule can be created.'
            : status.createRefusal || 'Return to the writable full-access operator view.',
        }),
      h('p', { class: 'muted small' }, 'The archive records a bounded source-seal proof and complete sealed blocks only. It is a separate encrypted file, not a workspace backup; verification never restores its event rows.'),
    ),
  });
}

function verificationCard(ctx) {
  const fileInput = h('input', {
    id: 'event-archive-file', type: 'file', accept: 'application/json,.json', class: 'sr-only',
    'aria-describedby': 'event-archive-file-help', 'data-testid': 'event-archive-file',
  });
  const passphraseInput = h('input', {
    id: 'event-archive-verify-passphrase', type: 'password', required: true, maxLength: 1024,
    autocomplete: 'current-password', class: 'input', 'data-testid': 'event-archive-verify-passphrase',
  });
  const coverageFrom = h('input', { id: 'event-archive-coverage-from', type: 'date', class: 'input', 'data-testid': 'event-archive-coverage-from' });
  const coverageThrough = h('input', { id: 'event-archive-coverage-through', type: 'date', class: 'input', 'data-testid': 'event-archive-coverage-through' });
  const fileStatus = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' }, 'No file selected.');
  const verifyStatus = h('p', { class: 'field-help small', role: 'status', 'aria-live': 'polite' });
  const results = h('div', { class: 'stack', 'data-testid': 'event-archive-verification-result' });
  const verifyButton = h('button', { class: 'btn', type: 'submit', disabled: true, 'data-testid': 'event-archive-verify' }, 'Verify without importing');
  let selectedText = null;
  let selectedName = '';

  fileInput.addEventListener('change', async () => {
    selectedText = null;
    selectedName = '';
    results.replaceChildren();
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      fileStatus.textContent = 'No file selected.';
      verifyButton.disabled = true;
      return;
    }
    if (file.size > EVENT_ARCHIVE_LIMITS.maxFileChars) {
      fileStatus.className = 'field-error';
      fileStatus.textContent = `The selected file is larger than ${EVENT_ARCHIVE_LIMITS.maxFileChars.toLocaleString()} bytes.`;
      verifyButton.disabled = true;
      return;
    }
    fileStatus.className = 'muted small';
    fileStatus.textContent = 'Reading encrypted file…';
    try {
      selectedText = typeof file.text === 'function' ? await file.text() : await readFileWithReader(file);
    } catch (error) {
      fileStatus.className = 'field-error';
      fileStatus.textContent = error?.message || 'The selected file could not be read.';
      verifyButton.disabled = true;
      return;
    }
    if (selectedText.length > EVENT_ARCHIVE_LIMITS.maxFileChars) {
      selectedText = null;
      fileStatus.className = 'field-error';
      fileStatus.textContent = `The selected file is larger than ${EVENT_ARCHIVE_LIMITS.maxFileChars.toLocaleString()} characters.`;
      verifyButton.disabled = true;
      return;
    }
    selectedName = String(file.name || 'selected archive');
    fileStatus.className = 'muted small';
    fileStatus.textContent = `Selected ${selectedName} (${selectedText.length} characters). File contents are held in this tab only; no workspace state was changed.`;
    verifyButton.disabled = false;
  });

  const form = h('form', {
    class: 'form',
    onSubmit: async (event) => {
      event.preventDefault();
      if (!selectedText) {
        verifyStatus.className = 'field-error';
        verifyStatus.textContent = 'Choose an encrypted archive file first.';
        return;
      }
      if (Boolean(coverageFrom.value) !== Boolean(coverageThrough.value)) {
        verifyStatus.className = 'field-error';
        verifyStatus.textContent = 'For a coverage comparison, choose both UTC dates or leave both blank.';
        return;
      }
      verifyButton.disabled = true;
      verifyButton.setAttribute('aria-busy', 'true');
      verifyStatus.className = 'field-help small';
      verifyStatus.textContent = `Decrypting and verifying ${selectedName}; no event rows will be imported…`;
      const result = await ctx.api.sealArchiveVerify({
        text: selectedText,
        passphrase: passphraseInput.value,
        coverageFromDay: coverageFrom.value || null,
        coverageThroughDay: coverageThrough.value || null,
      });
      verifyButton.disabled = !selectedText;
      verifyButton.removeAttribute('aria-busy');
      passphraseInput.value = '';
      if (!result.ok) {
        verifyStatus.className = 'field-error';
        verifyStatus.textContent = result.error || 'The archive did not verify.';
        results.replaceChildren();
        toast(result.error || 'Archive verification refused', 'bad');
        return;
      }
      verifyStatus.className = 'field-help small';
      verifyStatus.textContent = result.report.verdict === 'expired'
        ? 'Cryptographic checks completed, but the declared retention date has passed; use is refused.'
        : 'Verification completed. No event rows were returned or imported.';
      results.replaceChildren(reportCard(result.report));
      toast(result.report.verdict === 'expired' ? 'Archive expired; use refused' : 'Archive verified read-only', result.report.verdict === 'expired' ? 'warn' : 'good');
    },
  },
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Encrypted archive file'),
      h('label', { class: 'btn btn-ghost', for: 'event-archive-file' }, 'Choose archive file…'),
      fileInput,
      h('p', { class: 'field-help', id: 'event-archive-file-help' }, `Encrypted JSON only; maximum ${EVENT_ARCHIVE_LIMITS.maxFileChars.toLocaleString()} characters. Nothing is copied into workspace state.`),
      fileStatus),
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'event-archive-verify-passphrase' }, 'Archive passphrase'), passphraseInput),
    h('fieldset', { class: 'form' },
      h('legend', { class: 'field-label' }, 'Optional coverage comparison'),
      h('p', { class: 'field-help' }, 'Choose both UTC dates to check whether the verified archive interval encloses another window.'),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'event-archive-coverage-from' }, 'Comparison starts'), coverageFrom),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'event-archive-coverage-through' }, 'Comparison ends'), coverageThrough)),
    h('div', { class: 'row-gap' }, verifyButton), verifyStatus, results,
  );

  return card({
    title: 'Verify an external capsule',
    subtitle: 'Verification is an aggregate-only read. It checks the source anchor proof, full sealed blocks, later closing seal, commitment, encryption purpose, retention and optional interval coverage.',
    body: h('div', { class: 'stack' }, form,
      banner({ tone: 'info', title: 'Never restores events', body: 'This verifier does not import, replay or append archived event rows. It returns only proof metadata and coverage counts. HMAC-sealed source history requires the source workspace key; external deletion and trusted timestamps remain outside this browser.' })),
  });
}

export function renderEventArchivePanel(ctx) {
  const status = ctx.api.sealArchiveStatus();
  if (!status?.ok || !status.report) {
    return card({ title: 'Archive capsules', body: banner({ tone: 'bad', title: 'Status unavailable', body: status?.error || 'The archive status could not be read.' }) });
  }
  return h('div', { class: 'stack' },
    retentionStatus(status.report),
    creationCard(ctx, status.report),
    verificationCard(ctx),
    h('p', { class: 'muted small' }, 'Retention is a declaration in the encrypted file, not an external policy engine. The app refuses verifier use after expiry but cannot locate or delete downloaded copies.'),
  );
}
