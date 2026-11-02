import { JSDOM, VirtualConsole } from 'jsdom';
import { buildDemoState } from '../app/core/demo.js';
import { createStore } from '../app/core/store.js';
import { createApi } from '../app/actions.js';
import { renderSolvency } from '../app/views/solvency.js';
const NOW = new Date('2026-11-02T10:00:00.000Z');
function storage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),keys:()=>[...m.keys()]};}
const errs=[];
const vc=new VirtualConsole(); vc.on('jsdomError',e=>errs.push(e.message)); vc.on('error',(...a)=>errs.push(a.join(' ')));
const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div></body></html>',{url:'https://example.test/#/solvency',pretendToBeVisual:true,runScripts:'outside-only',virtualConsole:vc});
const { window } = dom;
Object.assign(globalThis,{window,document:window.document,Node:window.Node,Element:window.Element,HTMLElement:window.HTMLElement,Event:window.Event,MouseEvent:window.MouseEvent});
let seq=0;
const store = createStore({storage:storage(),now:()=>NOW,idFactory:p=>`${p}-s-${++seq}`});
store.load();
const api = createApi(store,{now:()=>NOW,idFactory:p=>`${p}-a-${++seq}`});
console.log('import', store.importJSON(JSON.stringify(buildDemoState(NOW)),{now:NOW}).ok);
for (const panel of ['book','risk','capacity','repair','frozen','method',undefined]) {
  const ctx={state:store.state,now:NOW,query:new URLSearchParams(panel?`panel=${panel}`:''),navigate:()=>{},api,refresh:()=>{}};
  const t0=Date.now();
  try {
    const el = renderSolvency(ctx);
    console.log(panel||'(default)', 'ms', Date.now()-t0, 'h1:', el.querySelector('h1')?.textContent?.slice(0,60), 'chars', el.textContent.length);
    if (el.textContent.includes('failed to draw')) console.log('  !! ERROR PANEL', el.textContent.slice(0,400));
  } catch (e) { console.log(panel, 'THREW', e.message); }
}
const m = await import('../app/ui/solvency-modals.js');
const ctx={state:store.state,now:NOW,query:new URLSearchParams('panel=frozen'),navigate:()=>{},api,refresh:()=>{}};
m.openFreezeSolvencyDialog(ctx);
const d1 = window.document.querySelector('[role="dialog"]');
console.log('freeze dialog:', !!d1, JSON.stringify(d1?.textContent.slice(0,240)));
const close = d1?.querySelector('.modal-close, [aria-label*="lose"]');
console.log('close btn?', !!close, close?.outerHTML?.slice(0,120));
// call freeze via api then delete
const f = api.freezeSolvencyReading({reviewDays: 30});
console.log('freeze api', f.ok, f.error||'', f.reviewOn);
const dels = api.deleteSolvencyReading(f.ok ? f.record.id : 'x');
console.log('delete', dels.ok, dels.error||'');
const g = api.gradeSolvencyReadingNow(f.ok? f.record.id : 'x');
console.log('grade after delete', g.ok, g.error||'');
console.log('errs', errs.slice(0,6));
