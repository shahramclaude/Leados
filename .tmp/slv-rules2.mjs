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
const n=k=>(s()[k]||[]).length;
const base={delegations:n('delegations'),decisions:n('decisions'),links:n('links')};
const f = api.freezeSolvencyReading({reviewDays: 30});
console.log('freeze', f.ok, f.error||'', f.reviewOn, 'record:', f.record && {any:f.record.predictedAnyBreachPct, ceil:f.record.predictedCeilingPct, exp:f.record.expectedBreaches, cov:f.record.coverageRatio, exp_n:(f.record.exposures||[]).length});
const delta = {delegations:n('delegations')-base.delegations, decisions:n('decisions')-base.decisions, links:n('links')-base.links};
console.log('delta after freeze', delta);
const rel={}; for (const l of s().links||[]) if (l.sourceType==='solvencyreading'||l.sourceId===f.record.id) rel[l.relation]=(rel[l.relation]||0)+1;
console.log('edges from the frozen reading', rel);
console.log('new tasks', (s().delegations||[]).filter(d=>/\[RULE-SLV-01/.test(d.support||'')).map(d=>({t:d.title.slice(0,60),due:d.dueOn})));
console.log('new decisions', (s().decisions||[]).filter(d=>/RULE-SLV-01/.test(d.rationale||'')).map(d=>d.title.slice(0,70)));
console.log('solvency events', (s().events||[]).filter(e=>/solvency/i.test(e.type||'')).map(e=>e.type));
console.log('markers', s().solvencyMarkers);
// second freeze same day -> refused
const f2 = api.freezeSolvencyReading({reviewDays: 30});
console.log('second freeze same day', f2.ok, f2.error||'');
// grade before window -> refused
const g1 = api.gradeSolvencyReadingNow(f.record.id);
console.log('grade early', g1.ok, g1.error||'');
// advance clock to review date and grade
const later = new Date('2026-12-05T10:00:00.000Z');
const store2 = createStore({storage:storage(),now:()=>later,idFactory:p=>`${p}-t-${++seq}`});
store2.load();
const api2 = createApi(store2,{now:()=>later,idFactory:p=>`${p}-t-${++seq}`});
console.log('import2', store2.importJSON(JSON.stringify(s()),{now:later}).ok);
const rep2 = api2.solvencyRead();
console.log('readings', rep2.readings.map(r=>({id:r.id,frozen:r.frozenAt,review:r.reviewOn,graded:!!r.graded,gradeable:r.gradeable,windowOpen:r.windowOpen})));
const g2 = api2.gradeSolvencyReadingNow(f.record.id);
console.log('grade at review', g2.ok, g2.error||'', g2.result && {considered:g2.result.considered, breached:g2.result.breached.length, brier:g2.result.brier, ceil:g2.result.brierCeiling});
const g3 = api2.gradeSolvencyReadingNow(f.record.id);
console.log('regrade', g3.ok, g3.error||'');
console.log('delete graded', api2.deleteSolvencyReading(f.record.id).ok, api2.deleteSolvencyReading(f.record.id).error||'');
