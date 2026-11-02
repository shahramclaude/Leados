#!/usr/bin/env node
/**
 * scripts/typecheck-gate.mjs — points `npm run typecheck` at the right gate.
 *
 * For most of this repository's life `npm run typecheck` was `tsc --noEmit`, which read a
 * `tsconfig.json` scoped to the quarantined `src/**` and root `*.ts(x)` trees. Because
 * `allowJs` is false, it never opened a single file of the actual application (`app/**`, ~228k
 * lines of JavaScript). It exited 0 in ~30s and looked like a passing product gate while
 * checking nothing a user runs. That is a silent failure, so it is now a loud refusal.
 *
 * The canonical app is structurally verified by:
 *   npm run check:boundary   ADR-0006/0007 module graph, imports, network calls, docs
 *   npm run lint            ESLint over the canonical tree
 *   npm test                the 337-suite canonical contract suite
 *
 * The quarantined TypeScript is still typechecked, under a name that says what it is:
 *   npm run legacy:typecheck
 *
 * Exit code 1 is deliberate: `npm run typecheck` must never again report success for a
 * check that did not touch the product.
 */
const message = [
  'npm run typecheck refuses: no type checker covers the canonical application.',
  '',
  'The app is plain browser JavaScript (index.html + app/**), run as native ES modules with no',
  'build step. The old `tsc --noEmit` opened tsconfig.json, which only includes the quarantined',
  'src/** and root *.ts(x) trees — so it could go green while the real app was broken.',
  '',
  'Use instead:',
  '  npm run check:boundary    import graph, quarantine leaks, network calls, contributor docs',
  '  npm run lint              ESLint over the canonical tree',
  '  npm test                  canonical suite (tests/app/*.test.mjs)',
  '',
  'To typecheck the frozen legacy TypeScript (never a product gate):',
  '  npm run legacy:typecheck',
].join('\n');

console.error(message);
process.exit(1);
