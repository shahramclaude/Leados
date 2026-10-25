/**
 * app/ui/export-dialogs.js — Pre-export Data Minimisation, Retention (HIRE-08)
 * & Contextual-Integrity Disclosure Dialogs.
 *
 * Ensures that exporting workspace JSON or sensitive CSV tables surfaces:
 *  - overdue candidate retention records (`HIRE-08`),
 *  - confidential interpersonal conflict records, and
 *  - candid Mendelow/Tsebelis stakeholder stances & veto-player notes,
 * while offering live, non-destructive redaction options on the exported copy.
 */

import { h, mount, openModal } from './dom.js';
import { badge } from './components.js';
import { inspectExportGovernance } from '../core/domain/export-governance.js';

const SEVERITY_BADGE = {
  high: ['high sensitivity', 'bad'],
  caution: ['review scope', 'caution'],
  info: ['note', 'neutral'],
};

/**
 * Open a modal disclosing active retention/sensitivity findings before an
 * export proceeds, with live redaction toggles. Resolves to:
 *  `{ confirmed: false }` on cancel/Escape, or
 *  `{ confirmed: true, redactions, governance }` on confirm.
 */
export function openExportDisclosureDialog(
  ctx,
  {
    format = 'json-full',
    csvScope = null,
    csvLabel = '',
    mode = 'download',
    initialRedactions = {},
  } = {},
) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const redactions = {
      redactConflicts: format === 'json-operational' ? true : Boolean(initialRedactions.redactConflicts),
      pruneOverdueCandidates: Boolean(initialRedactions.pruneOverdueCandidates),
      redactStakeholderStances: Boolean(initialRedactions.redactStakeholderStances),
    };

    const initialGov = inspectExportGovernance(ctx.state, {
      format,
      csvScope,
      ...redactions,
      now: ctx.now,
    });

    const isConflictCsv = format === 'csv' && csvScope === 'conflicts';
    const isHiringCsv = format === 'csv' && csvScope === 'hiring';
    const isJson = format !== 'csv';

    const title = isConflictCsv
      ? 'Export confidential conflict records to CSV?'
      : isHiringCsv
        ? 'Export candidate & hiring records to CSV?'
        : format === 'json-full'
          ? 'Review retention & sensitive records before exporting'
          : format === 'json-operational'
            ? 'Review remaining sensitive records in operational copy'
            : `Review sensitive records in ${csvLabel || csvScope} CSV`;

    const summaryMount = h('div', { class: 'stack-sm', 'aria-live': 'polite' });
    const controlsList = h('div', { class: 'stack-xs export-redact-controls' });

    const renderSummary = () => {
      const gov = inspectExportGovernance(ctx.state, {
        format,
        csvScope,
        ...redactions,
        now: ctx.now,
      });
      mount(
        summaryMount,
        gov.findings.length
          ? h(
              'ul',
              { class: 'disclosure-list stack-xs' },
              ...gov.findings.map((f) => {
                const [bLabel, bTone] = SEVERITY_BADGE[f.severity] || ['note', 'neutral'];
                return h(
                  'li',
                  { class: 'disclosure-item' },
                  h(
                    'div',
                    { class: 'row-between row-wrap' },
                    h('strong', { class: 'small' }, f.title),
                    badge(bLabel, bTone),
                  ),
                  h('p', { class: 'muted tiny' }, f.detail),
                  f.route
                    ? h(
                        'button',
                        {
                          type: 'button',
                          class: 'btn btn-tiny btn-ghost',
                          onClick: () => {
                            finish({ confirmed: false, navigated: f.route });
                            modal.close();
                            ctx.navigate(f.route);
                          },
                        },
                        f.code.startsWith('EXPORT-RET') || f.code === 'EXPORT-HIR-01'
                          ? 'Review candidates in Hiring'
                          : f.category === 'conflicts'
                            ? 'Open Conflicts'
                            : 'Review stakeholder records',
                      )
                    : null,
                );
              }),
            )
          : h(
              'p',
              { class: 'good-text small' },
              'All flagged retention and political-stance items will be omitted or scrubbed in this exported copy. Your live workspace in this browser stays untouched.',
            ),
      );
    };

    const addToggle = ({ key, label, hint, disabled = false }) => {
      const id = `exp-redact-${key}`;
      const input = h('input', {
        id,
        type: 'checkbox',
        name: key,
        checked: redactions[key] ? 'checked' : null,
        disabled: disabled ? 'disabled' : null,
        onChange: (e) => {
          redactions[key] = Boolean(e.target.checked);
          renderSummary();
        },
      });
      controlsList.appendChild(
        h(
          'label',
          { class: 'checkbox-row export-redact-option', for: id },
          input,
          h(
            'span',
            { class: 'stack-2xs' },
            h('strong', { class: 'small' }, label),
            hint ? h('span', { class: 'muted tiny' }, hint) : null,
          ),
        ),
      );
    };

    if (isJson && initialGov.counts.conflicts > 0) {
      addToggle({
        key: 'redactConflicts',
        label: 'Leave out confidential conflict records (operational copy)',
        hint: `Omits ${initialGov.counts.conflicts} conflict record(s) and ${initialGov.counts.conflictEvents} event-log trace(s) from the exported file.`,
        disabled: format === 'json-operational',
      });
    }

    if ((isJson || isHiringCsv) && initialGov.counts.candidatesOverdue > 0) {
      addToggle({
        key: 'pruneOverdueCandidates',
        label: `Leave out ${initialGov.counts.candidatesOverdue} overdue candidate record${initialGov.counts.candidatesOverdue === 1 ? '' : 's'} past the ${initialGov.retention.windowDays}-day retention window (HIRE-08)`,
        hint: 'Keeps active applicants and explicit “keep in touch” exemptions; omits expired evaluations from the exported file.',
      });
    }

    if (
      (isJson || (format === 'csv' && (csvScope === 'cases' || csvScope === 'changes'))) &&
      (initialGov.counts.stakeholdersAdverseStance > 0 || initialGov.counts.vetoPlayersUnaligned > 0)
    ) {
      addToggle({
        key: 'redactStakeholderStances',
        label: 'Scrub candid stakeholder stances & veto notes to neutral in exported copy',
        hint: 'Resets skeptical/blocker stances to neutral, clears veto-player flags, and removes private briefing notes in the exported file only.',
      });
    }

    renderSummary();

    const confirmBtnLabel = isConflictCsv
      ? (mode === 'preview' ? 'Preview confidential CSV' : 'Download confidential CSV')
      : isHiringCsv
        ? (mode === 'preview' ? 'Preview hiring CSV' : 'Download hiring CSV')
        : format === 'csv'
          ? (mode === 'preview' ? 'Preview CSV' : 'Download CSV')
          : 'Export JSON';

    const body = h(
      'div',
      { class: 'stack', 'data-testid': 'export-disclosure-dialog' },
      isConflictCsv
        ? h(
            'p',
            { class: 'small' },
            'This CSV contains private mediation perspectives, underlying interests, and sharing boundaries in plain text. Spreadsheet tools store unencrypted copies on disk and in cloud sync folders. Export only when genuinely needed.',
          )
        : h(
            'p',
            { class: 'muted small' },
            'LeadOS checked this export for expired candidate evaluations (HIRE-08), confidential conflict records, and candid stakeholder stance notes. Redactions below affect only the exported file — nothing in your browser workspace is deleted.',
          ),
      summaryMount,
      controlsList.childNodes.length
        ? h(
            'fieldset',
            { class: 'export-redact-fieldset' },
            h('legend', { class: 'eyebrow' }, 'Optional privacy-minimising redactions for this file'),
            controlsList,
          )
        : null,
      h(
        'div',
        { class: 'modal-foot' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-ghost',
            onClick: () => {
              finish({ confirmed: false });
              modal.close();
            },
          },
          'Cancel',
        ),
        h(
          'button',
          {
            type: 'button',
            class: isConflictCsv ? 'btn btn-danger' : 'btn btn-primary',
            onClick: () => {
              const finalGov = inspectExportGovernance(ctx.state, {
                format,
                csvScope,
                ...redactions,
                now: ctx.now,
              });
              if (ctx.api?.recordExportDisclosure && !ctx.isLocked) {
                ctx.api.recordExportDisclosure({
                  format,
                  scope: csvScope,
                  findingCodes: initialGov.findings.map((f) => f.code),
                  redactions: { ...redactions },
                });
              }
              finish({
                confirmed: true,
                redactions: { ...redactions },
                governance: finalGov,
                initialGovernance: initialGov,
              });
              modal.close();
            },
          },
          confirmBtnLabel,
        ),
      ),
    );

    const modal = openModal({
      title,
      body,
      width: '600px',
      onClose: () => finish({ confirmed: false }),
    });
  });
}
