import { breachCountDistribution, jointBreachRisk, rankedProbabilityScore, countLogScore } from '../app/core/domain/solvency.js';
const show=(d)=>d.pmf.map(v=>v.toFixed(4)).join(' ');
for (const [pds, rho] of [[[0.1,0.2],0],[[0.1,0.2],0.3],[[0.5,0.5],0.999],[Array(16).fill(0.3),0.3],[[1e-12,1e-12],0.5]]) {
  const d = breachCountDistribution({pds, rho});
  const j = jointBreachRisk({pds: pds, rho});
  const sum = d.pmf.reduce((a,b)=>a+b,0);
  const mean = d.pmf.reduce((a,v,i)=>a+v*i,0);
  console.log(`n=${d.n} rho=${rho} sum=${sum.toFixed(12)} mean=${mean.toFixed(6)} vs ${d.mean.toFixed(6)} P0=${d.pmf[0].toFixed(6)} vs ${(1-j.pAny).toFixed(6)}`);
  if (d.n<=2) console.log('  pmf', show(d));
}
// scores
console.log('rps perfect', rankedProbabilityScore([0,0,1],2), 'rps off-by-1', rankedProbabilityScore([0,1,0],2), 'rps copula16@9', rankedProbabilityScore(breachCountDistribution({pds:Array(16).fill(0.3),rho:0.3}).pmf, 9).toFixed(4));
console.log('log perfect', countLogScore([0,0,1],2), 'log zero', countLogScore([0,1,0],2), 'log 16@9', countLogScore(breachCountDistribution({pds:Array(16).fill(0.3),rho:0.3}).pmf,9).toFixed(4));
