import { buildDemoState } from '../app/core/demo.js';
import { createStore } from '../app/core/store.js';
import { createApi } from '../app/actions.js';
const NOW = new Date('2026-11-02T10:00:00.000Z');
function storage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),keys:()=>[...m.keys()]};}
let seq=0;
const store = createStore({storage:storage(),now:()=>NOW,idFactory:p=>`${p}-s-${++seq}`});
store.load();
const api = createApi(store,{now:()=>NOW,idFactory:p=>`${p}-a-${++seq}`});
store.importJSON(JSON.stringify(buildDemoState(NOW)),{now:NOW});
const s=()=>store.state;
const count=(k)=>(s()[k]||[]).length;
const tagTasks=()=>s().delegations.filter(d=>/\[RULE-SLV/.test(d.support||'')).length;
console.log('before', {delegations:count('delegations'), decisions:count('decisions'), links:count('links'), events:count('events'), markers:count('solvencyMarkers')});
const sc = api.scanSolvency();
console.log('scan', sc.ok, Object.keys(sc));
console.log('after ', {delegations:count('delegations'), decisions:count('decisions'), links:count('links'), events:count('events'), markers:count('solvencyMarkers'), tagTasks:tagTasks()});
const rel = {};
for (const l of s().links||[]) rel[l.relation]=(rel[l.relation]||0)+1;
console.log('relations', rel);
console.log('slv tasks', (s().delegations||[]).filter(d=>/\[RULE-SLV/.test(d.support||'')).map(d=>d.title.slice(0,70)));
console.log('slv decisions', (s().decisions||[]).filter(d=>/solven|breach|promise/i.test(d.title||'')).map(d=>d.title.slice(0,80)));
console.log('events', (s().events||[]).filter(e=>/solvency/.test(e.type||'')).map(e=>e.type));
// freeze a new reading -> propagation inside transaction
const before = count('delegations');
const f = api.freezeSolvencyReading({reviewDays: 30});
console.log('freeze', f.ok, f.error||'', 'new tasks', count('delegations')-before, 'links now', count('links'));
// renegotiate: find a promise from report
const rep = api.solvencyRead();
const target = rep.book.find(p=>p.pdPct!==null) || rep.book[0];
console.log('reneg target', target && {sourceKey:target.sourceKey, promiseId:target.promiseId, due:target.obligationOn, label:target.label});
if (target) {
  const r1 = api.renegotiatePromise({sourceKey:target.sourceKey, promiseId:target.promiseId, toOn:'2026-12-15', reason:'Vendor slipped the integration date by two weeks.'});
  console.log('reneg1', r1.ok, r1.error||JSON.stringify({from:r1.fromOn,to:r1.toOn}));
  const r2 = api.renegotiatePromise({sourceKey:target.sourceKey, promiseId:target.promiseId, toOn:'2026-12-29', reason:'Vendor slipped again; second slip.'});
  console.log('reneg2', r2.ok, r2.error||'');
  const r3 = api.renegotiatePromise({sourceKey:target.sourceKey, promiseId:target.promiseId, toOn:'2027-01-12', reason:'Third slip attempt should be refused.'});
  console.log('reneg3 (expect refuse)', r3.ok, r3.error||'');
  const r4 = api.renegotiatePromise({sourceKey:target.sourceKey, promiseId:target.promiseId, toOn:'2026-11-01', reason:'Earlier date should be refused.'});
  console.log('reneg4 (expect refuse)', r4.ok, r4.error||'');
  const r5 = api.renegotiatePromise({sourceKey:target.sourceKey, promiseId:target.promiseId, toOn:'2027-06-15', reason:'Too far out should be refused.'});
  console.log('reneg5 (expect refuse)', r5.ok, r5.error||'');
  const r6 = api.renegotiatePromise({sourceKey:target.sourceKey, promiseId:target.promiseId, toOn:'2026-12-30', reason:'short'});
  console.log('reneg6 (expect refuse)', r6.ok, r6.error||'');
}
const rel2 = {};
for (const l of s().links||[]) rel2[l.relation]=(rel2[l.relation]||0)+1;
console.log('relations after reneg', rel2);
console.log('reneg ledger', (s().solvencyRenegotiations||[]).length);
const conv = api.setSolvencyConventions({solvencyRhoPct: 45, solvencyMaxMoves: 2});
console.log('conventions', conv.ok, s().settings.solvencyRhoPct, s().settings.solvencyMaxMoves);
console.log('csv', (await import('../app/core/csv.js')).CSV_EXPORTS.length);
