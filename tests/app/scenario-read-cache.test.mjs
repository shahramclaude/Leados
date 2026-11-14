import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';

import { buildDemoState } from '../../app/core/demo.js';
import { clearPerf, perfLaneSummary } from '../../app/core/perf.js';
import { compareScenarios, computeSensitivityTornado } from '../../app/core/domain/scenarios.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-11-14T10:00:00Z');
const computations = () => perfLaneSummary('scenario.read').count;

function boot() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (!String(error?.message).includes('HTMLCanvasElement')) errors.push(error.message);
  });
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  dom.testErrors = errors;
  dom.window.__LEADOS_TEST__ = true;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.localStorage = dom.window.localStorage;
  dom.window.localStorage.setItem('leados.lifecycle.v1', JSON.stringify(buildDemoState(NOW)));
  return dom;
}

test('scenario simulations are reused only for the same snapshot, day and sandbox levers', async () => {
  clearPerf();
  const dom = boot();
  try {
    const { createApp } = await import('../../app/main.js');
    let at = NOW;
    const app = createApp({ root: dom.window.document.getElementById('view'), storage: dom.window.localStorage, now: () => at });
    app.navigate('#/scenarios');
    assert.equal(computations(), 1, 'the first visit evaluates the comparison and sensitivity once');
    const firstText = dom.window.document.getElementById('view').textContent;

    app.render();
    app.navigate('#/today');
    app.navigate('#/scenarios');
    assert.equal(computations(), 1, 'repeated renders and route returns reuse the seeded read');
    assert.equal(dom.window.document.getElementById('view').textContent, firstText);

    const input = dom.window.document.getElementById('scn-op-reserve');
    assert.ok(input, 'the sandbox control is present');
    input.value = String(Number(input.value) + 1);
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(computations(), 2, 'a changed lever invalidates the read');

    const revision = app.store.state.meta.revision;
    const result = app.api.addPerson({ name: 'Scenario cache probe', role: 'Engineer', level: 'ic' });
    assert.equal(result.ok, true, result.error);
    assert.ok(app.store.state.meta.revision > revision);
    assert.equal(computations(), 3, 'a committed workspace change invalidates the read');

    at = new Date('2026-11-15T10:00:00Z');
    app.render();
    assert.equal(computations(), 4, 'a new calendar day invalidates the read');

    // The cached result is not a substitute calculation: compare it against
    // the same public engines with the same fixed clock and default seed.
    const { buildSuggestedScenarios } = await import('../../app/core/domain/scenarios.js');
    const sandbox = dom.window.document.getElementById('scn-op-reserve');
    assert.ok(sandbox);
    const spec = { id: 'custom-sandbox', name: dom.window.document.getElementById('scn-custom-name').value || 'Custom what-if sandbox', category: 'custom', description: 'Interactive counterfactual adjustments evaluated in memory against Live Baseline.', levers: { portfolioDecisions: [], hypotheticalItems: [], caseMitigations: [], changeActions: [], hiringActions: [], dependencyHardening: [], settingsPatch: { operationalLoadPct: Number(sandbox.value) }, absenceCount: 0 } };
    const presets = buildSuggestedScenarios(app.ctx.state, { now: at });
    const expected = compareScenarios(app.ctx.state, [spec, ...presets], { now: at });
    const expectedTornado = computeSensitivityTornado(app.ctx.state, { now: at });
    const view = dom.window.document.getElementById('view');
    for (const scenario of expected.scenarios) assert.ok(view.textContent.includes(scenario.name));
    assert.ok(view.textContent.includes(`seed ${expectedTornado.seed} · ${expectedTornado.trials} trials`));
    dom.window.eval(AXE_SRC);
    const audit = await dom.window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.equal(audit.violations.length, 0);
    assert.equal(dom.testErrors.length, 0, dom.testErrors.join("\n"));
  } finally {
    dom.window.close();
  }
});
