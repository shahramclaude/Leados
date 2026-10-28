/**
 * app/ui/dom.js — element construction and accessible overlays.
 *
 * Everything is built with createElement + textContent. No user-supplied string
 * is ever assigned to innerHTML, so a person named `<img onerror=...>` renders
 * as text and cannot execute.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'line', 'rect', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'linearGradient', 'stop', 'title']);

let idCounter = 0;
export function uid(prefix = 'uid') {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function applyProps(node, props, isSvg) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class' || key === 'className') {
      node.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value));
    } else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (v !== undefined && v !== null) node.style.setProperty(prop, String(v));
      }
    } else if (key === 'dataset') {
      for (const [prop, v] of Object.entries(value)) node.dataset[prop] = String(v);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') {
      // Explicitly refused: this helper does not support raw HTML.
      throw new Error('h(): raw HTML is not supported. Use text children instead.');
    } else if (key === 'value' && !isSvg) {
      node.value = value;
    } else if (key === 'checked' || key === 'selected' || key === 'disabled' || key === 'multiple' || key === 'required') {
      node[key] = Boolean(value);
      if (value && key === 'disabled') node.setAttribute('disabled', '');
    } else if (key === 'textContent') {
      node.textContent = value;
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
}

function appendChild(parent, child) {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) appendChild(parent, c);
    return;
  }
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }
  parent.appendChild(document.createTextNode(String(child)));
}

/** Create an element. `h('div', {class:'x'}, 'text', h('span', {}, 'more'))` */
export function h(tag, props = null, ...children) {
  const isSvg = SVG_TAGS.has(tag);
  const node = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  applyProps(node, props, isSvg);
  for (const child of children) appendChild(node, child);
  return node;
}

export function svg(tag, props = null, ...children) {
  return h(tag, props, ...children);
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(parent, child) {
  clear(parent);
  if (child) parent.appendChild(child);
  return child;
}

/* ------------------------------------------------------------------ text */

export function pct(n, dp = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Number(n).toFixed(dp)}%`;
}

export function toneFor(score) {
  if (score === null || score === undefined) return 'neutral';
  if (score >= 75) return 'good';
  if (score >= 55) return 'warn';
  return 'bad';
}

export function severityTone(severity) {
  if (severity >= 5) return 'bad';
  if (severity >= 4) return 'warn';
  if (severity >= 3) return 'caution';
  return 'neutral';
}

export function confidenceTone(confidence) {
  return confidence === 'high' ? 'good' : confidence === 'medium' ? 'caution' : 'neutral';
}

/* --------------------------------------------------------------- overlays */

const overlayState = { modals: [], lastFocus: null };

function trapFocus(event, container) {
  if (event.key !== 'Tab') return;
  const focusable = container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Open an accessible modal dialog.
 * @param {{title:string, description?:string, body:Node, footer?:Node[],
 *          onClose?:Function, size?:'sm'|'md'|'lg'}} options
 * @returns {{close:Function, dialog:HTMLElement}}
 */
/** Close every open dialog. Used when the route changes underneath them. */
export function closeAllModals() {
  for (const close of overlayState.modals.slice()) close();
}

export function openModal({ title, description = '', body, footer = [], onClose = null, size = 'md' }) {
  const root = document.getElementById('modal-root');
  if (!root) throw new Error('modal-root missing from index.html');

  // Focus is restored per dialog, to whatever was focused when *this* dialog
  // opened. A shared stack leaked across mounts meant a single dialog left open
  // somewhere permanently disabled focus restoration for every later dialog.
  const previousFocus = document.activeElement;
  const titleId = uid('modal-title');
  const descId = description ? uid('modal-desc') : null;

  const closeBtn = h(
    'button',
    { class: 'icon-btn', type: 'button', 'aria-label': 'Close dialog', onClick: () => close() },
    '✕',
  );

  const dialog = h(
    'div',
    {
      class: `modal modal-${size}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      ...(descId ? { 'aria-describedby': descId } : {}),
    },
    h(
      'div',
      { class: 'modal-head' },
      h('div', null, h('h2', { id: titleId }, title), description ? h('p', { class: 'modal-desc', id: descId }, description) : null),
      closeBtn,
    ),
    h('div', { class: 'modal-body' }, body),
    footer.length ? h('div', { class: 'modal-foot' }, ...footer) : null,
  );

  const backdrop = h('div', { class: 'modal-backdrop', onClick: (e) => { if (e.target === backdrop) close(); } }, dialog);

  function onKey(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else {
      trapFocus(event, dialog);
    }
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
    if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    overlayState.modals = overlayState.modals.filter((m) => m !== close);
    if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    } else if (overlayState.modals.length === 0) {
      // The trigger was replaced by a re-render while the dialog was open. Put
      // focus back at the top of the content instead of dropping it on <body>,
      // which would send a keyboard user to the very start of the document.
      const main = document.getElementById('view');
      if (main && typeof main.focus === 'function') main.focus();
      else document.body?.focus?.();
    }
    if (onClose) onClose();
  }

  overlayState.modals.push(close);
  document.addEventListener('keydown', onKey, true);
  root.appendChild(backdrop);
  const firstField = dialog.querySelector('input, select, textarea');
  (firstField || closeBtn).focus();
  return { close, dialog };
}

/**
 * Destructive-action confirmation.
 *
 * Two call shapes exist in this codebase and both must mean the same thing:
 *
 *   confirmDialog({ ..., onConfirm: () => doThing() })    // callback
 *   if (await confirmDialog({ ... })) doThing();          // promise
 *
 * The promise shape used to be silently broken: this function returned the
 * modal handle, so `await` resolved immediately to a truthy object and the
 * delete ran *before* anyone pressed the button — the dialog was decoration.
 * It now returns a promise that resolves only when the dialog actually closes:
 * `true` after the confirm button, `false` for cancel, Escape, the close button
 * or a backdrop click. The handle's `close`/`dialog` are attached to the same
 * promise, so any caller that used the return value as a handle still works.
 * `onConfirm` is invoked only on a real confirmation.
 */
export function confirmDialog({ title, message, body, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  let settle;
  let settled = false;
  const decision = new Promise((resolve) => { settle = resolve; });
  const finish = (value) => {
    if (settled) return;
    settled = true;
    settle(value);
  };

  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { finish(false); api.close(); } }, 'Cancel');
  const confirmBtn = h(
    'button',
    {
      class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
      type: 'button',
      onClick: () => {
        finish(true);
        api.close();
        if (typeof onConfirm === 'function') onConfirm();
      },
    },
    confirmLabel,
  );

  const api = openModal({
    title,
    body: h('p', { class: 'modal-text' }, message ?? body ?? ''),
    footer: [cancelBtn, confirmBtn],
    size: 'sm',
    // Escape, the close button, a backdrop click and programmatic closes all
    // land here, so a caller awaiting the promise can never hang.
    onClose: () => finish(false),
  });

  decision.close = api.close;
  decision.dialog = api.dialog;
  return decision;
}

let toastTimer = null;
export function toast(message, tone = 'neutral') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  clear(root);
  const node = h('div', { class: `toast toast-${tone}`, role: 'status', 'aria-live': 'polite' }, message);
  root.appendChild(node);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (node.parentNode) node.parentNode.removeChild(node);
  }, 4200);
}

/* ------------------------------------------------------------------ forms */

/**
 * Build a form from a field spec.
 * @param {Array<{name:string,label:string,type?:string,value?:any,required?:boolean,
 *   help?:string,placeholder?:string,options?:Array<{value,label}>,rows?:number,
 *   min?:number,max?:number,step?:number,hideLabel?:boolean}>} fieldSpecs
 * @returns {{node:Node, getValues:Function, setFieldError:Function, clearErrors:Function,
 *            field:Function, focusFirst:Function}}
 */
export function buildForm(fieldSpecs) {
  const inputs = new Map();
  const errorNodes = new Map();
  const form = h('form', { class: 'form', novalidate: true });

  for (const spec of fieldSpecs) {
    if (spec.type === 'hidden') {
      const input = h('input', { type: 'hidden', name: spec.name, value: spec.value ?? '' });
      inputs.set(spec.name, input);
      form.appendChild(input);
      continue;
    }
    if (spec.type === 'divider') {
      form.appendChild(h('div', { class: 'form-divider' }, spec.label ? h('span', null, spec.label) : null));
      continue;
    }
    if (spec.type === 'static') {
      form.appendChild(
        h(
          'div',
          { class: `field field-static ${spec.wide || spec.span === 2 ? 'field-wide' : ''}` },
          spec.label ? h('span', { class: 'field-label' }, spec.label) : null,
          spec.value,
          spec.help ? h('p', { class: 'field-help' }, spec.help) : null,
        ),
      );
      continue;
    }

    const id = uid('field');
    const errorId = `${id}-error`;
    const helpId = `${id}-help`;
    let input;

    if (spec.type === 'textarea') {
      input = h('textarea', {
        id,
        name: spec.name,
        rows: spec.rows || 3,
        placeholder: spec.placeholder || '',
        'aria-describedby': spec.help ? helpId : null,
      });
      input.value = spec.value ?? '';
    } else if (spec.type === 'select') {
      input = h('select', { id, name: spec.name, 'aria-describedby': spec.help ? helpId : null });
      for (const option of spec.options || []) {
        input.appendChild(h('option', { value: option.value }, option.label));
      }
      // Setting `.selected` before the option is in the document does not
      // survive; assigning `.value` afterwards is the only reliable way, and it
      // matters because required selects otherwise submit empty and the form
      // reports "choose a person first" even though a person is pre-selected.
      if (spec.value !== undefined && spec.value !== null && spec.value !== '') {
        input.value = String(spec.value);
      }
    } else if (spec.type === 'checkbox') {
      input = h('input', { id, name: spec.name, type: 'checkbox' });
      input.checked = Boolean(spec.value);
    } else if (spec.type === 'boolean-block') {
      input = h('div', { class: 'check-grid', id, role: 'group', 'aria-label': spec.label });
      for (const option of spec.options || []) {
        const cbId = `${id}-${option.value}`;
        const cb = h('input', { id: cbId, type: 'checkbox', name: `${spec.name}[]`, value: option.value });
        cb.checked = Array.isArray(spec.value) && spec.value.includes(option.value);
        input.appendChild(h('label', { class: 'check', for: cbId }, cb, h('span', null, option.label)));
      }
    } else if (spec.type === 'scale') {
      input = h('div', { class: 'scale', id, role: 'radiogroup', 'aria-label': spec.label });
      for (let v = spec.min ?? 1; v <= (spec.max ?? 5); v += 1) {
        const radioId = `${id}-${v}`;
        const radio = h('input', { id: radioId, type: 'radio', name: spec.name, value: String(v) });
        radio.checked = String(spec.value) === String(v);
        const optionLabel = h('label', { class: `scale-option ${radio.checked ? 'is-checked' : ''}`, for: radioId }, radio, h('span', null, String(v)));
        radio.addEventListener('change', () => {
          for (const node of input.querySelectorAll('.scale-option')) node.classList.remove('is-checked');
          optionLabel.classList.add('is-checked');
        });
        input.appendChild(optionLabel);
      }
    } else {
      input = h('input', {
        id,
        name: spec.name,
        type: spec.type || 'text',
        placeholder: spec.placeholder || '',
        min: spec.min,
        max: spec.max,
        step: spec.step,
        'aria-describedby': spec.help ? helpId : null,
      });
      input.value = spec.value ?? '';
    }

    inputs.set(spec.name, input);

    const errorNode = h('span', { class: 'field-error', id: errorId, role: 'alert' });
    errorNodes.set(spec.name, errorNode);

    const label =
      spec.hideLabel || spec.type === 'boolean-block' || spec.type === 'scale' || spec.type === 'checkbox'
        ? spec.label
          ? h('span', { class: 'field-label', id: `${id}-label` }, spec.label, spec.required ? h('span', { class: 'req' }, ' *') : null)
          : null
        : h(
            'label',
            { class: 'field-label', for: id },
            spec.label,
            spec.required ? h('span', { class: 'req' }, ' *') : null,
          );

    form.appendChild(
      h(
        'div',
        { class: `field field-${spec.type || 'text'} ${spec.wide || spec.span === 2 ? 'field-wide' : ''}` },
        label,
        spec.type === 'checkbox'
          ? h('label', { class: 'check', for: id }, input, h('span', null, spec.checkboxLabel || spec.boxLabel || spec.label))
          : input,
        spec.help ? h('p', { class: 'field-help', id: helpId }, spec.help) : null,
        errorNode,
      ),
    );
  }

  function getValues() {
    const values = {};
    for (const [name, input] of inputs.entries()) {
      if (input.tagName === 'DIV') {
        if (input.classList.contains('scale')) {
          const picked = input.querySelector('input:checked');
          values[name] = picked ? Number(picked.value) : null;
        } else {
          values[name] = [...input.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value);
        }
      } else if (input.type === 'checkbox') {
        values[name] = input.checked;
      } else {
        values[name] = input.value;
      }
    }
    return values;
  }

  function setFieldError(name, message) {
    const node = errorNodes.get(name);
    const input = inputs.get(name);
    if (node) node.textContent = message || '';
    if (input && input.classList) {
      input.classList.toggle('is-invalid', Boolean(message));
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');

      // Keep help text and the current inline error associated with the control.
      // This lets assistive technology announce the actionable error again when
      // focus returns to the field, not only when the alert first appears.
      if (node && input.setAttribute) {
        const describedBy = (input.getAttribute('aria-describedby') || '')
          .split(/\s+/)
          .filter((id) => id && id !== node.id);
        if (message) describedBy.push(node.id);
        if (describedBy.length) input.setAttribute('aria-describedby', describedBy.join(' '));
        else input.removeAttribute('aria-describedby');
      }
    }
  }

  function clearErrors() {
    for (const name of errorNodes.keys()) setFieldError(name, '');
  }

  /**
   * Bulk variant used by dialogs: `setErrors({ field: 'message' })`.
   *
   * This alias exists because four dialog modules (strategy, capital, dynamics
   * and the after-action ledger) call `form.setErrors(...)` and `buildForm`
   * only ever returned `setFieldError`. The mismatch threw a TypeError inside
   * the click handler, so a rejected submission showed the user *nothing*: the
   * dialog stayed open and the field error was never rendered. Adding the alias
   * fixes every one of those call sites at once, and it is the shape they
   * already assume.
   */
  function setErrors(errors) {
    if (!errors || typeof errors !== 'object') return;
    for (const [name, message] of Object.entries(errors)) setFieldError(name, message);
  }

  function focusFirst() {
    const first = form.querySelector('input, textarea, select');
    if (first) first.focus();
  }

  function field(name) {
    return inputs.get(name) || null;
  }

  return { node: form, getValues, setFieldError, setErrors, clearErrors, field, focusFirst };
}

export function labelValue(label, value, opts = {}) {
  return h(
    'div',
    { class: `kv ${opts.className || ''}` },
    h('span', { class: 'kv-label' }, label),
    h('span', { class: 'kv-value' }, value),
  );
}

export function emptyState({ title, body, action }) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-mark', 'aria-hidden': 'true' }, '◇'),
    h('h2', { class: 'empty-title' }, title),
    body ? h('p', null, body) : null,
    action || null,
  );
}
