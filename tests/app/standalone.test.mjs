/**
 * tests/app/standalone.test.mjs — Session 42, single-file offline distribution.
 *
 * Proves that `LeadOS-standalone.html` is genuinely portable: every module and
 * stylesheet is inline, no network primitive is needed, it boots from a
 * file:// URL with an arbitrary filename, the standalone storage key is
 * distinct, the portability warning is visible, and the build can be
 * regenerated to any path without touching canonical index.html.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

import { STORAGE_KEY } from '../../app/core/store.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const ROOT = path.resolve(import.meta.dirname, '../..');
const ARTIFACT = path.join(ROOT, 'LeadOS-standalone.html');
const BUILD_SCRIPT = path.join(ROOT, 'scripts/build-standalone.mjs');
const flush = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

function readArtifact() {
  return fs.readFileSync(ARTIFACT, 'utf8');
}

async function bootStandalone(html, url, { withAxe = false } = {}) {
  const errors = [];
  const networkAttempts = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    const message = String(e?.message || '');
    if (message.includes("HTMLCanvasElement's getContext()")) return;
    errors.push(`jsdomError: ${message}`);
  });
  virtualConsole.on('error', (...args) => errors.push(`console.error: ${args.join(' ')}`));
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.__LEADOS_NETWORK_ATTEMPTS__ = networkAttempts;
      window.fetch = () => {
        networkAttempts.push('fetch');
        throw new Error('A standalone build must never call fetch().');
      };
      window.WebSocket = function WebSocket() {
        networkAttempts.push('websocket');
        throw new Error('A standalone build must never open a WebSocket.');
      };
      window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {},
      }));
      window.scrollTo = () => {};
    },
  });
  await flush(80);
  let axeViolations = [];
  if (withAxe) {
    dom.window.eval(AXE_SRC);
    const result = await dom.window.axe.run(dom.window.document.getElementById('view'), {
      rules: { 'color-contrast': { enabled: false } },
    });
    axeViolations = Array.from(result.violations).map((v) => v.id);
  }
  return { dom, errors, networkAttempts, axeViolations };
}

test('standalone artifact exists and is a single inline HTML document', () => {
  const html = readArtifact();
  const bytes = Buffer.byteLength(html, 'utf8');
  assert.ok(bytes > 1_000_000, `expected the full app to be inlined (${bytes} bytes)`);
  // Two guards, because they catch different accidents. The absolute ceiling is a
  // bloat tripwire, not a cap on features: it moves when real modules are added.
  // The density bound is the one that catches a *duplication* — a module inlined
  // twice, or a binary asset embedded — which is what this test exists to stop.
  // Raised in Schema v51: the Merit & Pay-Equity Terminal added four real modules
  // (comp.js, compSchema.js, compRules.js, views/merit.js ≈ 130 KB of source), so
  // the single-file build grew by about 117 KB. Raised again in Schema v52: the
  // Workforce Transition Terminal added four modules of comparable size
  // (transition.js, transitionSchema.js, transitionRules.js, views/transition.js)
  // and the build grew by about 143 KB to 3.74 MB. Raised again in Schema v54: the
  // Information Value Terminal added valueOfInformation.js, valueOfInformationSchema.js,
  // valueOfInformationRules.js, views/valueOfInformation.js and ui/voi-modals.js, and the
  // build grew by about 120 KB to 3.95 MB. Raised again in Schema v57: the Attention
  // Market added attentionMarket.js, attentionMarketSchema.js, attentionMarketRules.js,
  // views/attentionMarket.js and ui/attention-modals.js, and the build grew by about
  // 190 KB to 4.15 MB. The density bound below is what still catches an actual
  // duplication; the absolute ceiling only catches a whole app being inlined twice.
  // Raised in Schema v62: the file grew past the old 4.4 MB ceiling when the
  // Signal Path, War Games, Coupled Load and Performance Recovery modules were
  // inlined; raised in Schema v65 for Survival, Cost of Waiting and Leadership
  // Parity & Standard Consistency; raised in Schema v66 for the Evidence
  // Terminal (evidence.js, evidenceSchema.js, evidenceRules.js,
  // views/evidence.js, ui/evidence-modals.js); raised in Session 95 for the
  // transport read model (landmark profile + classTransport in survival.js,
  // RULE-SURV-08, axis-aware wait-cost/consequence consumption and the
  // transport card — ~17 KB over the Session 94 artifact, density unchanged);
  // raised in Session 97 for the Deferral Option Terminal (deferralOption.js,
  // deferralOptionSchema.js, deferralOptionRules.js, views/deferralOption.js,
  // ui/deferral-modals.js), the first surface to price the option to wait;
  // raised in Session 98 for the Deferral Portfolio (deferralPortfolio.js,
  // deferralPortfolioSchema.js, deferralPortfolioRules.js,
  // views/deferralPortfolioPanel.js, ui/deferral-portfolio-modals.js), the
  // book-level read: declared correlation, correlated Monte Carlo, exact tail
  // contributions — ~48 KB over the Session 97 artifact, density unchanged;
  // raised in Session 99 for the Signal Integrity Board (integrityRegistry.js,
  // integrity.js, integritySchema.js, integrityRules.js, views/integrity.js,
  // ui/integrity-modals.js) — ~150 KB over the Session 98 artifact at 20,325
  // bytes per module, inside the unchanged density bound. The density bound
  // below (bytes per module) is what catches duplication; the absolute ceiling
  // only catches a runaway.
  // Raised in Session 102 (Schema v72): the Confidence Transport Terminal added
  // confidence.js, confidenceRegistry.js, confidenceSchema.js, confidenceRules.js,
  // views/confidence.js and ui/confidence-modals.js — ~90 KB over the Session 101
  // artifact, at 20,186 bytes per module against an unchanged 24,000 density
  // bound. Raised in Session 107 (Schema v75): the Outcome Attribution & Loop
  // Settlement Terminal added settlementRegistry.js, settlementSchema.js,
  // settlement.js, settlementRules.js, ui/settlement-modals.js and
  // views/settlement.js — ~98 KB minified over Session 106, at 19,515 bytes per
  // module against an unchanged 24,000 density bound.
  // Raised in Session 108 (Schema v77): the Measurement Reliability Terminal
  // added reliabilityRegistry.js, reliabilitySchema.js, reliability.js,
  // reliabilityRules.js and views/reliability.js (~93 KB minified over Session
  // 107), landing at 19,507 bytes per module against an unchanged 24,000
  // density bound.
  // Raised in Session 109 (Schema v78): the Coupling Ledger added
  // couplingLedger.js, couplingLedgerSchema.js, couplingLedgerRules.js,
  // views/couplingPanel.js, a chart in ui/charts.js and the two new
  // relations — ~66 KB minified over Session 108, at 19,490 bytes per module
  // against an unchanged 24,000 density bound. The ceiling moves only because
  // the module count moved; the density bound is what still catches a
  // duplication.
  // Raised in Schema v82: the Command Chain added six real modules (chainRegistry,
  // chainSchema, chainRules, chain.js, views/chain.js, ui/chain-modals.js) and the
  // single-file build grew by ~100 KB.
  // Raised in Schema v83: the Succession Terminal added six real modules
  // (successionRegistry, successionSchema, successionRules, succession.js,
  // views/succession.js, and its panel wiring). The density bound below is what
  // still catches a duplication; this ceiling only tracks the module count.
  // Retention and Mission Control add four more source modules; density is checked below.
  // Raised in Schema v93: the Operating Model (ADR-0087) contributes six modules on top of
  // Catchball (ADR-0084), the Board Room (ADR-0085) and the Disclosure Compiler (ADR-0086).
  // The single-file build is 7,238,250 bytes across 401 source modules — 18,050 bytes per
  // module, still under the 24,000 density bound. The ceiling moves only because the module
  // count moved; density is what catches a module inlined twice.
  // Raised in Session 131: the artifact already exceeded BOTH ceilings on main
  // (7,824,494 bytes / 451 modules at commit 9a050af), so `verify:standalone`
  // was failing before this session touched anything. One ceiling now, sized
  // from the measured build (7,830,962 bytes / 451 modules — 17,363 bytes per
  // module against the unchanged 24,000 density bound, which is what still
  // catches a module inlined twice).
  // Raised in Session 132 (Schema v96): the Differencing Defender added seven real
  // modules (differencingRegistry.js, differencingDeterminacy.js,
  // differencingSchema.js, differencing.js, differencingRules.js,
  // differencingActions.js, views/differencing.js) and the build measured
  // 7,912,690 bytes / 458 modules — 17,276 bytes per module, DOWN from the
  // Session 131 density, which is the point: the density bound (24,000) is what
  // catches a module inlined twice; this absolute ceiling only catches a runaway.
  // Raised in Session 134 (Schema v97, ADR-0094): the Prospective Intervention
  // Contract added six real modules (prospectiveRegistry, prospectiveSchema,
  // prospective, prospectiveRules, prospectiveActions, views/prospective) plus
  // the shell/CSV/graph/permission wiring. Measured build: 7,996,525 bytes /
  // 466 modules = 17,160 bytes per module, DOWN again from Session 132's
  // 17,276. The density bound (24,000) is unchanged and is still the guard that
  // catches a module inlined twice; this ceiling only tracks module count.
  // Raised in Session 135 (Schema v98, ADR-0095): the Robust Allocation Terminal
  // added six real modules (robustAllocationRegistry, robustAllocationSchema,
  // robustAllocation, robustAllocationRules, robustAllocationActions,
  // views/robustAllocation) plus the shell/CSV/graph/permission wiring and the
  // .grid-3/.grid-4 CSS. Measured build: 8,072,085 bytes / 472 modules = 17,102
  // bytes per module, DOWN again from Session 134's 17,160. The density bound
  // (24,000) is unchanged and still catches a module inlined twice; this ceiling
  // only tracks module count.
  // Session 142 (ADR-0102) added six modules (hindsightRegistry, hindsightSchema,
  // hindsight, hindsightRules, hindsightActions, views/hindsight) plus the
  // shell/CSV/graph/permission wiring. Measured build: 8,517,555 bytes / 504
  // modules = 16,900 bytes per module, DOWN again from Session 135's 17,102.
  // The ceiling only tracks module count; the density bound below is what
  // catches a module being inlined twice.
  // Session 144 (ADR-0104) added six modules (diligenceRegistry,
  // diligenceSchema, diligence, diligenceRules, diligenceActions,
  // views/diligence) plus the shell/schema/CSV/graph/permission/manifest
  // wiring. Measured build: 8,706,536 bytes / 516 modules = 16,873 bytes per
  // module, DOWN again from Session 142's 16,900. Session 152 (ADR-0112) added
  // one module (redrawRehearsal) plus shell/view wiring — measured build:
  // 9,022,803 bytes / 546 modules = 16,525 bytes per module, DOWN again.
  // The ceiling only tracks module count; the bytes-per-module bound below is
  // what catches a module being inlined twice.
  // Session 181 (ADR-0134) added one module (talkingPointPolicy) plus the
  // schema/actions/agenda wiring — measured build: 9,501,154 bytes / 584
  // modules = 16,269 bytes per module, DOWN again from 16,525. The ceiling
  // tracks module count only; the per-module bound below is what catches a
  // module inlined twice, so raising the ceiling by one session's growth does
  // not weaken the duplicate-inlining guard.
  // Session 183 (ADR-0136) added two modules (budgetExposure, budgetExposureActions)
  // plus the finance view/actions/gateway wiring — measured build: 9,545,055
  // bytes / 587 modules = 16,261 bytes per module, DOWN again from 16,269.
  // The per-module density bound below is still what catches a module inlined twice.
  // Session 203 (ADR-0147) added six modules (reviewStewardshipRegistry,
  // reviewStewardshipSchema, reviewStewardship, reviewStewardshipActions,
  // reviewStewardshipRules, views/reviewStewardshipPanel) plus the schema,
  // spine, CSV, gateway, seat-right and reviews/main wiring — measured build:
  // 9,939,891 bytes / 615 modules = 16,163 bytes per module, DOWN again from
  // 16,261. The artifact had already passed this absolute ceiling on main before
  // this session touched anything (9,882,413 bytes at the branch point), so the
  // ceiling is raised to the measured build plus headroom; the density bound
  // below is what still catches a module inlined twice.
  // Raised in Session 221 (Schema v130 unchanged, ADR-0160): the Matrix Line
  // Activity Reconciliation added three real modules (lineActivity.js,
  // lineActivityRegistry.js, views/matrixActivityPanel.js) plus shell/CSV/panel
  // wiring. Measured build: 10,497,412 bytes / 669 modules = 15,691 bytes per
  // module — DOWN from the previous density, against the unchanged 24,000 bound
  // that still catches a module or asset inlined twice. The ceiling moves only
  // because real capability was added; density is what guards duplication.
  // Session 227 adds four bundled 1:1 holder/read modules: 10,619,691 bytes
  // across 686 modules, or 15,481 bytes/module (down from 15,530 on main).
  // Session 229 (Schema v133, ADR-0166) adds three real bundled modules
  // (meritEvidence.js, meritEvidenceRegistry.js, meritEvidenceRules.js) and the
  // panel/rule wiring: 10,661,063 bytes / 690 modules = 15,451 bytes per module,
  // DOWN from 15,481. The 24,000-byte density guard is unchanged and is what
  // still catches a module inlined twice; this absolute ceiling only tracks the
  // real capability added.
  // Session 231 (Schema v135, ADR-0168) adds three real bundled modules
  // (benchEvidence.js, benchEvidenceRegistry.js, benchEvidenceRules.js) plus the
  // succession panel/rule/schema/CSV wiring: 10,708,780 bytes / 695 modules =
  // 15,408 bytes per module, DOWN from Session 229's 15,451. The 24,000-byte
  // density guard is unchanged and is what still catches a module inlined twice;
  // this absolute ceiling only tracks the real capability added.
  // The checked-in artifact is behind the current canonical source tree:
  // this rebuild brings in seven already-present source modules (709 vs 702)
  // as well as the current meeting-share parity edits. It weighs 10,898,676
  // bytes / 709 modules = 15,372 bytes per module. Keep the per-module density
  // guard unchanged (it catches duplicate inlining); this absolute ceiling
  // accommodates the actual source-to-artifact delta without masking duplication.
  // ADR-0174 (Session 237) adds 6 source modules (doaScheduleRegistry,
  // doaScheduleSchema, doaSchedule, doaScheduleActions, doaScheduleRules,
  // matrixDoaPanel) plus ADR-0173's modules on main: 10,990,130 bytes / 718
  // source modules = 15,307 bytes/module (down from 15,372).
  // ADR-0175 (Schema v139) adds 5 source modules for the Matrix Pattern Repair
  // Register (matrixRemedy, matrixRemedyRegistry, matrixRemedySchema,
  // matrixRemedyActions, matrixRemedyPanel) -> 723 source modules. The 24,000-byte
  // per-module density guard below remains unchanged.
  // ADR-0177 (Session 241, Schema v142) adds 6 source modules for the Cross-Line
  // Labour Chargeback & Internal Transfer-Price Ledger (transferPriceRegistry,
  // transferPriceSchema, transferPrice, transferPriceActions, transferPriceRules,
  // matrixChargebackPanel). Measured build: 11,182,493 bytes / 737 source modules
  // = 15,172 bytes per module, level with Session 240's 15,172 (11,090,433 / 731).
  // The ceiling moves only because the module count moved; the unchanged
  // 24,000-byte density guard below is what still catches a module inlined twice.
  // ADR-0179 (Session 245, Schema v143 unchanged) adds 1 source module
  // (matrixHorizonPanel) plus the panel's dispatch and the horizon actions.
  // Measured build: 11,279,005 bytes / 747 source modules = 15,099 bytes per
  // module, DOWN from 15,172. The ceiling moves only because real capability
  // was added; the 24,000-byte density guard below is unchanged and is what
  // still catches a module inlined twice.
  // ADR-0181 (Session 247, Schema v144) adds 6 source modules — the work-turn
  // registry, schema, read model, rule, actions and panel — plus their wiring.
  // Measured build: 11,339,650 bytes / 757 source modules = 14,979 bytes per
  // module, DOWN from 15,037 (11,293,353 / 751). The ceiling moves only because
  // real capability was added; the 24,000-byte density guard below is unchanged
  // and is what still catches a module inlined twice.
  // ADR-0182 (Session 248, Schema v145) adds 6 source modules — the pause-permit
  // registry, schema, read model, rule, actions and panel — plus their wiring.
  // Measured build: 11,393,497 bytes / 763 source modules = 14,933 bytes per
  // module, DOWN from 14,979 (11,339,650 / 757). The ceiling moves only because
  // real capability was added; the 24,000-byte density guard below is unchanged
  // and is what still catches a module inlined twice.
  // Session 250 adds the evidence-bounds reader and one 65,006-byte generated
  // instructional diagram (base64 in the offline file). The density guard is unchanged.
  // ADR-0183 (Session 251) adds the DSM partitioning registry, reader, panel,
  // their wiring and one 27,562-byte generated instructional diagram. Measured
  // build: 11,559,951 bytes / 767 source modules = 15,072 bytes per module.
  // ADR-0184 adds six workforce stock-flow modules; ADR-0185 adds five Matrix
  // change-impact review modules. Together the current build is 11,682,585 bytes
  // / 778 source modules = 15,016 bytes per module, still far below the unchanged
  // 24,000 density guard. The absolute ceiling moves only for real capability.
  // ADR-0186 adds five change-saturation modules, their wiring, and one
  // 68,418-byte generated diagram. It also derives the inlined-diagram list
  // from `app/assets` instead of a hardcoded pair, so `workforce-stock-flow.jpg`
  // — referenced by a panel since ADR-0184 but never inlined, a broken image in
  // every offline file since — is now embedded too. Measured build:
  // 11,899,034 bytes / 784 source modules = 15,177 bytes per module, still far
  // below the unchanged 24,000 density guard.
  //
  // ADR-0188 adds a sixth diagram (80,893 bytes), a fifth learning panel and a
  // whole engine, so the ceiling moves to 12,250,000 — the density guard below
  // is the real check and this bound only catches accidental double-inlining.
  //
  // ADR-0190 (2026-11-13) adds Leader Standard Work & Tiered Daily Management:
  // five domain modules, one top-level view and a seventh diagram (22,377
  // bytes). Measured build: 12,330,337 bytes / 803 source modules = 15,355 bytes
  // per module, still far below the unchanged 24,000 density guard. The ceiling
  // moves to 12,450,000 for that capability and nothing else.
  //
  // ADR-0193 (2026-11-13) adds the Cross-Line Goal Commitment Conflict
  // register: five domain modules (goalCommitmentRegistry, goalCommitmentSchema,
  // goalCommitment, goalCommitmentActions, goalCommitmentRules), one matrix
  // panel and a tenth diagram (47,013 bytes). Measured build: 12,745,610 bytes
  // / 819 source modules = 15,562 bytes per module, still far below the
  // unchanged 24,000 density guard. The ceiling moved to 12,900,000 for that
  // capability. Session 262 (ADR-0194, Schema v154) added the chargeback
  // period posting ledger: five domain modules (chargebackPostingRegistry,
  // chargebackPostingSchema, chargebackPosting, chargebackPostingActions,
  // chargebackPostingRules), one matrix panel and an eleventh diagram
  // (137,720 bytes). Measured build: 12,991,290 bytes / 825 source modules =
  // 15,747 bytes per module, still far below the unchanged 24,000 density
  // guard. The ceiling moves to 13,100,000 for that capability and nothing
  // else.
  // ADR-0196 (Session 264) added one work-reassignment module and wiring.
  // Efficiency/Intelligence/Automation improvement (2026-11-14): seven new
  // modules (perf, ruleIndex, intelligenceHub, automationOrchestrator,
  // storeOptimizations, efficiencyHub view, store wiring) + 1.2 KB CSS.
  // Measured build: 13,120,112 bytes / 838 source modules = 15,656 bytes per
  // module, still far below the unchanged 24,000 density guard. Ceiling moves
  // to 13,300,000 for this efficiency/intelligence/automation slice.
  // ADR-0204 (Session 272, Schema v159) adds one empty ledger, the precedence
  // reader/actions/rule wiring and a tenth generated diagram (54,936 bytes).
  // Measured build: 13,393,040 bytes / 848 source modules = 15,793 bytes per
  // module, still far below the unchanged 24,000 density guard. The ceiling
  // moves only because real capability was added.
  // ADR-0208 (Session 277, Schema v162) adds the Investment Case Register: six
  // domain modules (an exact BigInt appraisal kernel, registry, schema, reader,
  // actions, rule), one finance panel and one generated diagram (37,516 bytes,
  // the fifteenth .jpg in app/assets). Two measurements, because the file committed before this
  // session was older than its own source — it contained neither Session 274's
  // nor Session 276's code, since neither session rebuilt. Rebuilding that
  // UNCHANGED tree gives 13,602,723 bytes / 858 modules: already past the
  // 13,500,000 ceiling, unseen because this test reads the committed file. This
  // slice adds 160,051 bytes on top. Measured build: 13,762,774 bytes / 865
  // source modules = 15,910 bytes per module, still far below the unchanged
  // 24,000 density guard. Ceiling moves to 13,900,000.
  // ADR-0209 (Session 278, Schema v163) adds the Cross-Line Work/Rest Recovery
  // Ledger: seven domain modules (registry, zone/instant maths, the interval
  // kernel, schema, reader, actions, rule), one standard-work panel and one
  // generated diagram (46,975 bytes, the sixteenth .jpg in app/assets). The
  // slice adds 173,868 bytes. Measured build: 13,936,642 bytes / 873 source
  // modules = 15,964 bytes per module, still far below the unchanged 24,000
  // density guard. Ceiling moves to 14,100,000 only because capability was added.
  // Session 282 completed ADR-0207's surface (no new module) and added the
  // cross-window .jpg (57,380 bytes). The measurement below is taken on the
  // MERGED tree: main carried Session 280's capital-rationing register (seven
  // domain modules and another generated diagram) that its own session did not
  // rebuild into this artifact, so the slice measured here includes both and
  // cannot be attributed to one of them. Measured build: 14,423,174 bytes / 886
  // source modules = 16,278 bytes per module, still far below the unchanged
  // 24,000 density guard. Ceiling moves 14,100,000 -> 14,500,000 only because
  // real capability and a real asset were added; the density bound still
  // catches a duplication.
  // ADR-0212 (Session 283, Schema v166) adds the Temporary Standard Waiver
  // Register: six domain modules (registry, schema/loaders, the pure reader, the
  // dated actions, the pause-aware rule), one standard-work panel and one
  // generated diagram (267,637 bytes, the nineteenth .jpg in app/assets). The
  // slice adds 853,985 bytes. Measured build: 14,790,627 bytes / 892 source
  // modules = 16,581 bytes per module, still far below the unchanged 24,000
  // density guard. Ceiling moves to 14,950,000 only because capability was added.
  // Measured on the MERGED tree (Sessions 280-283): 14,878,780 bytes / 892
  // source modules = 16,680 bytes per module, still far below the unchanged
  // 24,000 density guard. Ceiling moves 14,500,000 -> 15,000,000 because the
  // waiver register (six modules and a generated diagram) is real capability;
  // the density bound still catches a duplication.
  // ADR-0213 (Session 286, Schema v167) adds the Flexible-Budget Variance
  // Statement: five domain modules (the exact rational kernel, registry,
  // schema/loaders, the pure reader, the dated actions), one finance panel and
  // one generated diagram (41,342 bytes, the twenty-first .jpg in app/assets).
  // The slice adds 164,493 bytes. Measured build: 15,043,273 bytes / 898 source
  // modules = 16,752 bytes per module, still far below the unchanged 24,000
  // density guard. Ceiling moves 15,000,000 -> 15,150,000 only because real
  // capability was added; the density bound still catches a duplication.
  // ADR-0215 (Session 288, Schema v169) adds the speak-up and impartiality
  // register: five domain modules (registry, schema/loaders, the pure reader,
  // the dated actions, the spine rule), one route view, one CSV scope and one
  // generated diagram (119,734 bytes at 1672x941, the twenty-third .jpg in
  // app/assets — inlined as a data URI, which is where most of the growth is).
  // The slice adds 242,132 bytes. Measured build: 15,433,345 bytes / 913
  // source modules = 16,904 bytes per module, still far below the unchanged
  // 24,000 density guard. Ceiling moves 15,350,000 -> 15,650,000 only because
  // real capability was added; the density bound still catches a duplication.
  // ADR-0216 (Session 289, Schema v170) adds the synergy register: six domain
  // modules and one generated diagram. The suite measured the merged tree.
  // ADR-0217 (Session 290, Schema v171) adds the earned-value register: six
  // domain modules (registry, schema/loaders, the BigInt kernel, the pure
  // reader, the dated actions, the spine rule), one finance panel, one CSV scope
  // and one generated diagram (109,166 bytes, inlined as a data URI, which is
  // where most of the growth is). Measured build: 15,859,570 bytes / 924 source
  // modules = 17,162 bytes per module, still far below the unchanged 24,000
  // density guard. Ceiling moves 15,650,000 -> 16,000,000 only because real
  // capability was added; the density bound still catches a duplication.
  // ADR-0218 adds the Just Culture modules and its embedded method illustration.
  // The rebuilt artifact is 16,047,132 bytes; retain the independent density guard.
  // ADR-0220 (Session 295, Schema v174) adds the Variable-Pay Design & Incentive
  // Integrity Register: five domain modules (registry, schema/loaders, the pure
  // reader, the dated actions, the pause-aware spine rule), one route view, one
  // CSV scope and one generated diagram (94,596 bytes at 1536x864, the
  // twenty-sixth .jpg in app/assets, inlined as a data URI — which is where most
  // of the growth is). Measured build: 16,340,165 bytes / 942 source modules =
  // 17,347 bytes per module, still far below the unchanged 24,000 density guard.
  // Ceiling moves 16,200,000 -> 16,500,000 only because real capability was
  // added; the density bound still catches a module inlined twice.
  // ADR-0221 (Session 297, Schema v175) adds the Duty-Without-Means Register:
  // five domain modules (registry, schema/loaders, pure reader, dated actions,
  // pause-aware spine rule), one route view, one CSV scope, and one generated
  // diagram (`app/assets/duty-without-means-method.jpg`, 55,890 bytes, inlined
  // as base64). Measured build: 16,506,727 bytes / 948 source modules = 17,412
  // bytes per module, well below the unchanged 24,000 bytes/module density guard.
  // ADR-0226 (Session 303, Schema v181 unchanged) adds the shared-dependency
  // concentration reader, one view tab, one action and two generated diagrams
  // (`risk-concentration-method.jpg`, `risk-appetite-tolerance.jpg`, which the
  // register view referenced without the file existing). Measured build: 17,867,959
  // bytes / 982 source modules = 18,196 bytes per module, under the unchanged
  // 24,000 bytes/module density guard. NOTE: the artifact at base f0f0d3a was
  // already 17,513,621 bytes, above the previous 16,800,000 ceiling, so that
  // ceiling was failing before this session; it is moved here to the measured size.
  // ADR-0227 (Sessions 304–309, Schema v185) completes the Frontline
  // Improvement-Suggestion Ledger: seven suggestion modules, the `#/suggestions`
  // view, CSV #173 and the generated method diagram
  // (`improvement-suggestion-method.jpg`, embedded with the rest of app/assets).
  // Measured build: 18,700,133 bytes / 1,019 source modules = 18,351 bytes per
  // module, under the unchanged 24,000 bytes/module density guard. NOTE: the
  // artifact at base b3b814c was a stale Session 308 build already above the
  // previous 18,000,000 ceiling, so that ceiling was failing before this
  // session; it is moved here to the measured size of the rebuilt artifact.
  // ADR-0232 (Session 311, Schema v187) completes the Assurance Finding &
  // Remediation Closure Register: seven assurance modules, the `#/findings`
  // view, CSV #175 and the generated method diagram
  // (`assurance-finding-method.jpg`, embedded with the rest of app/assets).
  // Measured build after merging `origin/main`: 19,001,526 bytes / 1,027
  // source modules = 18,502 bytes per
  // module, still under the unchanged 24,000 bytes/module density guard, which
  // is the bound that catches a module or asset inlined twice. This absolute
  // ceiling moves only because real capability was added.
  // ADR-0233 (Session 312, Schema v188) completes the Probation Confirmation
  // Gate: seven probation modules, the `#/probation` view, CSV #176 and the
  // generated method diagram (`probation-gate-method.jpg`, 199,153 bytes,
  // embedded with the rest of app/assets). Measured build: 19,353,333 bytes /
  // 1,035 source modules = 18,699 bytes per module, still under the unchanged
  // 24,000 bytes/module density guard, which is the bound that catches a
  // module or asset inlined twice. The ceiling is moved to the measured size
  // plus headroom per this file's documented convention.
  // ADR-0234 (Session 313, Schema v189) completes the Regulatory Undertaking &
  // Outward-Commitment Closure Register: seven undertaking modules, the
  // `#/undertakings` view, CSV #177 and the generated method diagram
  // (`undertaking-closure-method.jpg`, 178,509 bytes, embedded with the rest of
  // app/assets). Measured build: 19,863,274 bytes / 1,043 source modules =
  // 19,045 bytes per module, still well under the unchanged 24,000
  // bytes/module density guard. Ceiling moved to the measured size plus
  // headroom per the convention above.
  // ADR-0235/0236 (Sessions 314/315, Schema v191) adds the information-request
  // register and follow-up lineage. The v190 source was not in the prior artifact,
  // so this build incorporates the seven distributed-equity modules and the
  // ADR-0238 method diagram: 20,645,547 bytes / 1,063 source modules = 19,422
  // bytes per module, still below the unchanged density guard. Move the
  // absolute ceiling to measured size plus headroom; this is not a relaxation
  // of density.
  // ADR-0241 (Session 319, Schema v195) adds the workplace adjustment register:
  // eight domain modules plus its panel, on top of the v194 build. Measured at
  // 21,389,249 bytes / 1,080 source modules = 19,805 bytes per module, still
  // below the unchanged 24,000 density guard. The ceiling moves with the module
  // count; the density bound is what still catches a module inlined twice.
  // ADR-0242 (Session 320, Schema v196) adds the lone-working welfare register:
  // eight domain modules plus its view, on top of the v195 build. Measured at
  // 21,469,844 bytes / 1,088 source modules = 19,733 bytes per module — under
  // the previous ceiling, so no relaxation was needed. The density guard stays
  // the bound that catches a module inlined twice.
  assert.ok(bytes < 21_500_000, `standalone file is unexpectedly large (${bytes} bytes)`);
  // Derived from the folder, not from a list in this file: the day a panel adds
  // a diagram, an enumerator that names the old two would still pass. Same
  // lesson the build script learned in ADR-0186.
  const assets = fs.readdirSync(path.join(ROOT, 'app/assets')).filter((name) => name.endsWith('.jpg')).sort();
  assert.ok(assets.length >= 4, `expected the generated diagrams to be present, saw ${assets.join(', ')}`);
  for (const asset of assets.map((name) => `app/assets/${name}`)) {
    const diagram = fs.readFileSync(path.join(ROOT, asset));
    assert.ok(html.includes(`data:image/jpeg;base64,${diagram.toString('base64')}`), `the offline artifact embeds the exact bytes of ${asset}`);
    assert.doesNotMatch(html, new RegExp(`\\./${asset.replaceAll('/', '\\/').replaceAll('.', '\\.')}`), `${asset} must not depend on the app folder offline`);
  }
  const declaredModules = Number((html.match(/content="[^"]*?(\d+) source modules/) || [])[1]);
  assert.ok(declaredModules > 100, `expected the build to declare its module count (got ${declaredModules})`);
  const bytesPerModule = Math.round(bytes / declaredModules);
  assert.ok(
    bytesPerModule < 24_000,
    `standalone bytes per source module is ${bytesPerModule} (${bytes} bytes / ${declaredModules} modules); ` +
      'that usually means something is inlined twice',
  );
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="en" data-leados-standalone="true">/);
  assert.match(html, /<meta name="leados-distribution" content="standalone-offline" \/>/);
  assert.match(html, /<meta name="leados-standalone-build" content="[^"]*[0-9]+ source modules/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /<style id="leados-inline-styles">/);
  assert.match(html, /<script id="leados-standalone-bootstrap">/);
  assert.match(html, /<script id="leados-standalone-app">/);
  assert.match(html, /\.standalone-banner/);
  assert.match(html, /window\.__LEADOS_STANDALONE__ = true/);
  assert.match(html, /window\.__LEADOS_STORAGE_KEY__ = 'leados\.standalone\.v1'/);
  assert.match(html, /Standalone offline copy/);
  assert.match(html, /records are NOT embedded/);
});

test('standalone artifact has no external resources, module imports or runtime npm dependency', () => {
  const html = readArtifact();
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["']/i);
  assert.doesNotMatch(html, /<script[^>]+type=["']module["']/i);
  assert.doesNotMatch(html, /\bimport\s*\(/);
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /XMLHttpRequest/);
  assert.doesNotMatch(html, /node_modules/);
  assert.doesNotMatch(html, /@import/);
  assert.doesNotMatch(html, /url\(\s*['"]?https?:/i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i);
  // Canonical development entry remains untouched and server-based.
  const canonical = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(canonical, /<script type="module" src="\.\/app\/main\.js"><\/script>/);
  assert.match(canonical, /<link rel="stylesheet" href="\.\/app\/styles\.css" \/>/);
});

test('standalone storage key is distinct from the served workspace', () => {
  assert.equal(STORAGE_KEY, 'leados.lifecycle.v1');
  const html = readArtifact();
  assert.match(html, /leados\.standalone\.v1/);
  assert.doesNotMatch(html, /__LEADOS_STORAGE_KEY__ = 'leados\.lifecycle\.v1'/);
});

test('build script regenerates to an arbitrary filename and refuses to overwrite index.html', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leados-standalone-'));
  try {
    const out = path.join(tmp, 'LeadOS portable copy.html');
    const stdout = execFileSync(process.execPath, [BUILD_SCRIPT, '--out', out], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.match(stdout, /[0-9]+ source modules/);
    const rebuilt = fs.readFileSync(out, 'utf8');
    assert.match(rebuilt, /data-leados-standalone="true"/);
    assert.match(rebuilt, /<script id="leados-standalone-app">/);
    assert.doesNotMatch(rebuilt, /<script[^>]+src=/i);

    let refused = false;
    try {
      execFileSync(process.execPath, [BUILD_SCRIPT, '--out', 'index.html'], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      refused = /Refusing to overwrite the canonical index\.html/.test(String(error.stderr || error.message));
    }
    assert.ok(refused, 'build script must protect canonical index.html');
    assert.match(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /<script type="module"/);
    fs.writeFileSync(path.join(tmp, 'boot.html'), rebuilt, 'utf8');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('standalone HTML boots from a file:// path, renders Today and makes no network call', async () => {
  const html = readArtifact();
  const { dom, errors, networkAttempts, axeViolations } = await bootStandalone(
    html,
    'file:///C:/Users/Test/Desktop/LeadOS-standalone.html',
    { withAxe: true },
  );
  try {
    const { window } = dom;
    assert.equal(window.__LEADOS_STANDALONE__, true);
    assert.equal(window.__LEADOS_STORAGE_KEY__, 'leados.standalone.v1');
    assert.ok(window.__LEADOS_BUILD_ID__);
    assert.equal(window.document.title, 'Today · LeadOS');
    const view = window.document.getElementById('view');
    assert.match(view.textContent, /Start with the people you lead/);
    assert.match(window.document.querySelector('[data-leados-standalone-banner]').textContent, /records are NOT embedded/);
    assert.deepEqual(networkAttempts, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(axeViolations, []);
  } finally {
    dom.window.close();
  }
});

test('standalone copy keeps hash routing and exposes the portability/data-export guidance in Settings', async () => {
  const html = readArtifact();
  const { dom, errors, networkAttempts } = await bootStandalone(
    html,
    'file:///home/someone/LeadOS%20portable%20copy.html',
  );
  try {
    const { window } = dom;
    window.location.hash = '#/settings';
    window.dispatchEvent(new window.Event('hashchange'));
    await flush();
    const text = window.document.getElementById('view').textContent;
    assert.match(text, /Settings & data/);
    assert.match(text, /You are running the portable copy/);
    assert.match(text, /Export JSON before moving PCs/);
    assert.match(text, /Some browsers block local storage for local files/);

    window.location.hash = '#/forecasts';
    window.dispatchEvent(new window.Event('hashchange'));
    await flush();
    assert.match(window.document.getElementById('view').textContent, /Forecast integrity/);
    assert.equal(window.document.title, 'Forecast integrity terminal · LeadOS');
    assert.deepEqual(networkAttempts, []);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test('static server exposes only the deliberate standalone artifact outside app/**', () => {
  const server = fs.readFileSync(path.join(ROOT, 'scripts/serve.mjs'), 'utf8');
  assert.match(server, /relPath === 'LeadOS-standalone\.html'/);
  assert.match(server, /relPath === 'index\.html'/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['build:standalone'], 'node scripts/build-standalone.mjs');
  assert.equal(pkg.scripts['verify:standalone'], 'npm run build:standalone && node --test tests/app/standalone.test.mjs');
  assert.ok(pkg.devDependencies.esbuild, 'esbuild is an explicit build-time-only dependency');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /Run LeadOS from one HTML file on any PC/);
  assert.match(readme, /LeadOS-standalone\.html/);
});
