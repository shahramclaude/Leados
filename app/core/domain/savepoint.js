/**
 * app/core/domain/savepoint.js — copy-on-write transactional drafts.
 *
 * WHY THIS EXISTS
 * ---------------
 * ADR-0008 gives every post-commit rule a *savepoint*: a rule sees a private
 * copy of the workspace, and a rule that throws leaves the workspace exactly
 * as it found it. The original implementation of that promise was
 *
 *     const candidate = JSON.parse(JSON.stringify(draft));
 *
 * which is correct but pays O(|workspace|) for *every* (rule, event) pair the
 * engine considers. Measured on the demo workspace that is 3.6 ms per clone;
 * a three-event fan-out across fourteen rules is 42 clones and 153 ms of pure
 * copying, and the cost grows linearly with tenant size (1.45 s at ~5.8k
 * records). Almost all of it is wasted: every rule in this codebase opens with
 * a cheap `event.type` guard and returns `[]` without reading a single
 * collection, so the engine was deep-copying a workspace that the rule was
 * about to ignore.
 *
 * WHAT THIS DOES
 * --------------
 * A savepoint now materialises a private deep copy of a top-level collection
 * the first time a rule actually reads it, and nothing else. A rule that
 * returns early costs no copying at all; a rule that touches two collections
 * pays for two. Rollback semantics are unchanged, because the proxy is the
 * only route a rule has to the workspace, and nothing is written back until
 * the rule returns without throwing.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It does not filter rules by event type. Skipping a (rule, event) pair is a
 * behaviour change and would need a hand-maintained subscription table that
 * could silently stop a rule running — the exact silent-regression failure
 * this codebase's rules exist to avoid. Lazy cloning delivers most of the
 * saving with *no* dispatch change: a rule that is not interested never reads,
 * so it never clones. Subscription integrity is tracked separately and
 * honestly, as an audit (`propagationContracts.js`), not as a gate.
 *
 * The proxy only ever wraps the top-level workspace object. Collections
 * arrive as ordinary arrays and records as ordinary objects, so rules cannot
 * observe that they are behind a proxy unless they were relying on whole-
 * workspace object identity — which no rule does (verified by audit).
 */

/** Values that need their own copy; everything else is copied by assignment. */
function isCopyable(value) {
  return value !== null && typeof value === 'object';
}

/**
 * Deep copy with the same observable result as `JSON.parse(JSON.stringify(x))`
 * for JSON-safe data, which is what `normalizeState` guarantees the workspace
 * is. Used per collection, so the cost is proportional to what a rule touches.
 */
function copyValue(value) {
  if (!isCopyable(value)) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {object} base The workspace draft as it stands when the rule is called.
 * @param {{strategy?: 'cow'|'clone'}} [options] `clone` restores the eager
 *   whole-workspace deep copy this module replaced. It exists only so the
 *   equivalence suite can prove the two strategies agree; nothing in the app
 *   selects it.
 * @returns {{
 *   draft: object,
 *   touched: () => string[],
 *   changed: () => string[],
 *   peek: (key: string) => unknown,
 *   commitInto: (target: object) => { collections: string[] },
 *   discard: () => void,
 * }}
 */
export function createSavepointDraft(base, options = {}) {
  if (!isCopyable(base) || Array.isArray(base)) {
    throw new TypeError('A savepoint needs a plain workspace object.');
  }
  if (options.strategy === 'clone') return createEagerSavepoint(base);
  return createLazySavepoint(base);
}

/** The pre-ADR-0026 strategy, kept verbatim for equivalence testing. */
function createEagerSavepoint(base) {
  const candidate = JSON.parse(JSON.stringify(base));
  return {
    draft: candidate,
    touched: () => Object.keys(base),
    changed: () => Object.keys(base).filter((key) => (
      JSON.stringify(candidate[key]) !== JSON.stringify(base[key])
    )).sort(),
    peek: (key) => candidate[key],
    commitInto: (target) => {
      const collections = Object.keys(base).filter((key) => (
        Array.isArray(candidate[key]) && JSON.stringify(candidate[key]) !== JSON.stringify(base[key])
      )).sort();
      for (const key of Object.keys(target)) {
        if (!Object.hasOwn(candidate, key)) delete target[key];
      }
      Object.assign(target, candidate);
      return { collections };
    },
    discard: () => {},
  };
}

function createLazySavepoint(base) {

  /** key -> private copy, created on first read or write. */
  const materialised = new Map();
  /** keys the rule removed; JS gives no way to observe a delete otherwise. */
  const removed = new Set();
  /** A blank target keeps every proxy invariant trivially satisfiable. */
  const shadow = {};

  const read = (key) => {
    if (materialised.has(key)) return materialised.get(key);
    if (!Object.hasOwn(base, key)) return undefined;
    const copy = copyValue(base[key]);
    materialised.set(key, copy);
    return copy;
  };

  /**
   * Assignment does NOT deep-copy the value, and that is deliberate.
   *
   * The eager strategy this replaced copied the whole draft once, up front, and
   * committed with `Object.assign` — so a rule that held a reference to a
   * collection and later pushed into it kept working, because the assigned
   * array was still the one it held. Copying on write breaks that aliasing: a
   * rule doing `const rows = ensure(draft); ...; rows.push(x)` would push into
   * an orphaned array. `comms.js` does exactly this in `ensureDrafts`
   * (`draft.commsDrafts = Array.isArray(...) ? draft.commsDrafts : []`), which
   * is how this was found: closure notes silently stopped being created while
   * the rule still reported "applied".
   *
   * Matching the old semantics is the correct choice. Cross-rule isolation is
   * unaffected: the next rule's savepoint copies anything it reads, and no
   * caller outside the transaction ever sees the assigned object.
   */
  const write = (key, value) => {
    materialised.set(key, value);
    removed.delete(key);
    return true;
  };

  const draft = new Proxy(shadow, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      return read(prop);
    },
    set(_target, prop, value) {
      if (typeof prop === 'symbol') return true;
      return write(prop, value);
    },
    has(_target, prop) {
      if (typeof prop === 'symbol') return false;
      if (removed.has(prop)) return false;
      return materialised.has(prop) || Object.hasOwn(base, prop);
    },
    deleteProperty(_target, prop) {
      if (typeof prop === 'symbol') return true;
      materialised.delete(prop);
      removed.add(prop);
      return true;
    },
    ownKeys() {
      const keys = new Set(Object.keys(base));
      for (const key of materialised.keys()) keys.add(key);
      for (const key of removed) keys.delete(key);
      return [...keys];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (removed.has(prop)) return undefined;
      if (!materialised.has(prop) && !Object.hasOwn(base, prop)) return undefined;
      return { value: read(prop), enumerable: true, configurable: true, writable: true };
    },
    defineProperty(_target, prop, descriptor) {
      if (typeof prop === 'symbol') return true;
      if ('value' in descriptor) { write(prop, descriptor.value); return true; }
      // A pure attribute change (e.g. Object.freeze) cannot be honoured
      // without changing semantics, so it is refused rather than faked.
      return false;
    },
  });

  /** Keys the rule has read or written. Reading is enough to need a rollback. */
  const touched = () => [...materialised.keys(), ...removed];

  /**
   * Touched top-level keys whose serialised content differs from the base.
   * Untouched keys are byte-identical to the base by construction, so limiting
   * the comparison to touched keys is equivalent to comparing all of them —
   * and avoids materialising the whole workspace just to prove nothing changed.
   */
  const changed = () => {
    const out = [];
    for (const key of touched()) {
      const now = removed.has(key) ? undefined : materialised.get(key);
      const was = Object.hasOwn(base, key) ? base[key] : undefined;
      if (now === undefined && was === undefined) continue;
      if (removed.has(key) && !Object.hasOwn(base, key)) continue;
      if (JSON.stringify(now) === JSON.stringify(was)) continue;
      out.push(key);
    }
    return out;
  };

  /**
   * Read a key without creating a private copy. Used for read-only diffs, so
   * that *asking* what a rule changed never materialises the workspace.
   */
  const peek = (key) => {
    if (materialised.has(key)) return materialised.get(key);
    if (removed.has(key)) return undefined;
    return base[key];
  };

  /**
   * Write this savepoint into the live draft. Called only on success; a throw
   * before this point leaves the draft untouched, which is the rollback.
   */
  const commitInto = (target) => {
    const changedKeys = changed();
    for (const key of touched()) {
      if (removed.has(key) || materialised.get(key) === undefined) {
        delete target[key];
      } else {
        target[key] = materialised.get(key);
      }
    }
    // Sorted, not access-ordered: diagnostics must not depend on which
    // savepoint strategy produced them, or two equivalent runs cannot be
    // compared. This is the only place the order is decided.
    return { collections: changedKeys.filter((key) => Array.isArray(peek(key))).sort() };
  };

  const discard = () => {
    materialised.clear();
    removed.clear();
  };

  return { draft, touched, changed, peek, commitInto, discard };
}
