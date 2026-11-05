/**
 * app/views/publicationPanel.js — the shared "Publication register" panel
 * (Session 136, ADR-0096).
 *
 * ADR-0092 made the RELEASE the unit of disclosure: every published aggregate
 * becomes a dated row in the differencing register and the whole series is
 * audited as one integer system. But five terminals — escalation, measurement,
 * cadence, concordance, survival — still applied their own per-table floor
 * directly and never entered the register, so a series of their printed tables
 * was never audited across days, seats or altitudes.
 *
 * This panel is mounted on each of those terminals. It offers the two reads the
 * register owns — PLAN (what would publishing this module's aggregate right now
 * determine, against every release already registered?) and PUBLISH (write the
 * dated release, refused when no suppression pattern makes it safe) — and shows
 * whether this module was already published today from the operating seat.
 *
 * The panel is a pure view: it calls only ctx.api actions, never storage.
 */
import { h, toast } from '../ui/dom.js';
import { card, stat, badge, banner } from '../ui/components.js';
import { dayKey } from '../core/time.js';
import { manifestFor } from '../core/domain/disclosureManifests.js';

const VERDICT_TONE = { safe: 'good', protected: 'caution', refused: 'bad' };

export function publicationPanel(ctx, route, { blurb } = {}) {
  const manifest = manifestFor(route);
  const label = manifest?.label || route;
  const today = dayKey(ctx.now instanceof Date ? ctx.now : new Date());

  const report = ctx.api.differencesRead ? ctx.api.differencesRead() : null;
  const routes = Array.isArray(report?.routes) ? report.routes : [];
  const own = routes.find((row) => row && row.route === route) || null;
  const publishedToday = own ? String(own.lastReleasedOn || '').slice(0, 10) === today : false;

  const planBox = h('div', { class: 'stack', 'aria-live': 'polite', 'data-testid': `publication-plan-${route}` });

  const renderPlan = () => {
    planBox.replaceChildren();
    const plan = ctx.api.differencesPlan({ route });
    if (!plan || !plan.ok) {
      planBox.append(banner({
        tone: plan?.refused ? 'bad' : 'warn',
        title: plan?.refused ? 'This publication is refused' : 'No plan is available',
        body: plan?.error || 'The plan could not be built for this module.',
      }));
      if (plan?.remedy) planBox.append(h('p', { class: 'muted' }, plan.remedy));
      return;
    }
    const attempts = plan.attempts || [];
    planBox.append(
      h('div', { class: 'stat-grid' },
        stat({ label: 'Verdict', value: badge(String(plan.verdict || 'unknown'), VERDICT_TONE[plan.verdict] || 'neutral') }),
        stat({ label: 'Cells', value: String((plan.cells || []).length), hint: `${(plan.cells || []).filter((c) => c.state === 'printed').length} printed` }),
        stat({ label: 'Patterns tried', value: String(attempts.length), hint: 'cheapest safe pattern wins' }),
        stat({ label: 'Equations', value: String(plan.equationN || 0), hint: 'in the exact integer system' }),
      ),
      plan.determinacy ? h('p', { class: 'muted' }, plan.determinacy) : null,
      plan.removals && plan.removals.length
        ? banner({
          tone: 'info',
          title: `Reduced by ${plan.removals.length} step(s) to stay unrecoverable`,
          body: plan.removals.map((row) => row.why).join(' '),
        })
        : banner({ tone: 'good', title: 'Nothing beyond this table\'s own floor needs withholding', body: 'Publishing this release determines no withheld value, on its own or against the register.' }),
      attempts.length
        ? h('table', { class: 'table', 'aria-label': `Suppression patterns considered for ${label}` },
          h('thead', null, h('tr', null,
            h('th', null, 'Pattern'), h('th', null, 'Values it would determine'), h('th', null, 'Cells withheld'))),
          h('tbody', null, ...attempts.map((attempt) => h('tr', null,
            h('td', null, attempt.described),
            h('td', null, attempt.recoveredN ? badge(String(attempt.recoveredN), 'bad') : badge('none', 'good')),
            h('td', null, String(attempt.withheldCells))))))
        : null,
    );
  };

  const publish = () => {
    const result = ctx.api.differencesPublish({ route });
    if (!result.ok) {
      toast(result.refused ? 'Publication refused: no suppression pattern makes this safe.' : (result.error || 'Publication failed.'), 'bad');
      renderPlan();
      planBox.prepend(banner({ tone: 'bad', title: result.refused ? 'Publication refused' : 'Publication failed', body: result.error }));
      if (result.remedy) planBox.append(banner({ tone: 'info', title: 'Structural remedy', body: result.remedy }));
      return;
    }
    toast(`Published the ${label} aggregate (${result.verdict}). One release per module per day per seat.`, 'good');
    ctx.refresh();
  };

  return card({
    title: 'Publication register',
    subtitle: `Route this terminal's printed tables through the differencing register (ADR-0092), so the series — not just each table — is audited as one integer system.`,
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: renderPlan, 'data-testid': `publication-plan-btn-${route}` }, 'Plan publication'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: publish, disabled: publishedToday ? true : undefined, 'data-testid': `publication-publish-btn-${route}` }, publishedToday ? 'Published today' : 'Publish aggregate'),
    ],
    body: h('div', { class: 'stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Registered releases', value: String(own?.releases || 0), hint: own?.lastReleasedOn ? `last ${String(own.lastReleasedOn).slice(0, 10)}` : 'never published' }),
        stat({ label: 'Safe / protected', value: `${own?.safeN || 0} / ${own?.protectedN || 0}` }),
        stat({ label: 'Values determined', value: String(own?.recoveredN || 0), tone: (own?.recoveredN || 0) ? 'bad' : 'good', hint: 'reported as coordinates, never as numbers' }),
        stat({ label: 'Published today', value: publishedToday ? 'yes' : 'no', tone: publishedToday ? 'good' : 'neutral' }),
      ),
      banner({
        tone: 'info',
        title: 'Why this exists',
        body: blurb || `This terminal's own small-cell floor still applies to every table it prints. What it did not do until now is enter the register: a reader subtracting two of this module's tables across days, seats or altitudes was never audited. Planning and publishing here route that series through the exact integer-determinacy audit. A determined value is reported as a coordinate and a proof, never as the number.`,
      }),
      planBox,
    ),
  });
}
