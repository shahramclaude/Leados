import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const NOW = new Date('2026-11-08T12:00:00.000Z');

test('person dialog refuses queue loss before create or edit, then saves the reviewed list through the real action', async () => {
  const dom = new JSDOM(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8'), {
    url: 'https://leados.test/', pretendToBeVisual: true,
  });
  const w = dom.window;
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'FileReader', 'localStorage']) {
    globalThis[name] = name === 'window' ? w : w[name];
  }
  w.__LEADOS_TEST__ = true;
  const { createApp } = await import('../../app/main.js');
  const { openPersonDialog } = await import('../../app/ui/modals.js');
  const app = createApp({ storage: w.localStorage, now: () => NOW });
  const ctx = { state: app.store.state, api: app.api, now: NOW };
  const topics = Array.from({ length: 12 }, (_, i) => `Topic ${i + 1}`);
  const clickSave = (label) => {
    const button = [...w.document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === label);
    assert.ok(button, `button ${label} exists`);
    button.click();
  };

  openPersonDialog(ctx);
  w.document.querySelector('[name="name"]').value = 'Jordan';
  const field = w.document.querySelector('[name="talkingPoints"]');
  const overflow = [...topics, 'Last topic'];
  field.value = overflow.join('\n');
  clickSave('Add person');
  assert.equal(app.store.state.people.length, 0, 'refusal does not create a record');
  assert.equal(field.value, overflow.join('\n'), 'all input stays editable');
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.match(w.document.querySelector('.field-error[role="alert"]:not(:empty)').textContent, /Last topic/);
  assert.equal(w.document.activeElement, field);
  field.value = [...topics, '  Topic 1  ', ''].join('\n');
  clickSave('Add person');
  assert.equal(app.store.state.people.length, 1);
  const person = app.store.state.people[0];
  assert.deepEqual(person.talkingPoints, topics, 'duplicates do not trigger overflow');
  assert.ok(app.store.state.events.some((e) => e.type === 'person.created'));

  openPersonDialog({ ...ctx, state: app.store.state }, { person });
  const editField = w.document.querySelector('[name="talkingPoints"]');
  editField.value = [...topics, 'Engine prompt [RULE-COACH-01:c1]'].join('\n');
  clickSave('Save changes');
  assert.deepEqual(app.store.state.people[0].talkingPoints, topics, 'edit refusal leaves persisted queue untouched');
  assert.match(w.document.querySelector('.field-error[role="alert"]:not(:empty)').textContent, /Engine prompt/);
  editField.value = [...topics.slice(0, 11), 'Engine prompt [RULE-COACH-01:c1]'].join('\n');
  clickSave('Save changes');
  assert.deepEqual(app.store.state.people[0].talkingPoints, [...topics.slice(0, 11), 'Engine prompt [RULE-COACH-01:c1]']);
  assert.ok(app.store.state.events.some((e) => e.type === 'person.updated'));
  app.destroy?.();
  dom.window.close();
});
