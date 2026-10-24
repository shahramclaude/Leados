import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://app.example/',
  virtualConsole: vc,
  pretendToBeVisual: true,
});
await new Promise((r) => setTimeout(r, 400));
const d = dom.window.document;
console.log('title:', d.title);
console.log('nav buttons:', d.querySelectorAll('#nav button').length);
console.log('cards rendered:', d.querySelectorAll('.card').length);
console.log('body text length:', d.body.textContent.trim().length);
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
console.log('routes present:', [...d.querySelectorAll('#nav button')].map(b => b.textContent).join(' | '));
console.log('localStorage keys:', Object.keys(dom.window.localStorage).join(','));
