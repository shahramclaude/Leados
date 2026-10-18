// Monte Carlo runway scenario simulator.
// Source: standard Monte Carlo simulation (Metropolis & Ulam, 1949) applied
// to cash-flow projection; random normal draws via the Box–Muller transform
// (Box, G.E.P. & Muller, M.E. "A Note on the Generation of Random Normal
// Deviates", 1958): z = sqrt(-2 ln(u1)) * cos(2*pi*u2).

export interface ScenarioAssumptions {
  startingCash: number;
  monthlyBurn: number;
  monthlyRevenue: number;
  revenueGrowthRate: number; // fractional, e.g. 0.05 = 5%/mo
  burnVolatility: number; // stddev as a fraction of monthlyBurn, e.g. 0.1
  headcountDelta: number;
  monthlyBurnDelta: number;
  months: number;
}

export interface ScenarioResult {
  projectedRunwayMonths: number;
  runwayP10: number;
  runwayP90: number;
  probabilityOfRunningOutWithinHorizon: number;
  projectedMrrDelta: number;
  simulations: number;
}

function boxMullerSample(): number {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function runMonteCarloScenario(assumptions: ScenarioAssumptions, simulations = 2000): ScenarioResult {
  const {
    startingCash,
    monthlyBurn,
    monthlyRevenue,
    revenueGrowthRate,
    burnVolatility,
    monthlyBurnDelta,
    months,
  } = assumptions;

  const runwayOutcomes: number[] = [];
  let ranOutCount = 0;

  for (let sim = 0; sim < simulations; sim++) {
    let cash = startingCash;
    let revenue = monthlyRevenue;
    let runwayMonth = months; // if never runs out within horizon, cap at horizon
    let ranOut = false;

    for (let m = 1; m <= months; m++) {
      const burnNoise = boxMullerSample() * burnVolatility * monthlyBurn;
      const effectiveBurn = Math.max(0, monthlyBurn + monthlyBurnDelta + burnNoise);
      revenue = revenue * (1 + revenueGrowthRate);
      cash = cash + revenue - effectiveBurn;
      if (cash <= 0 && !ranOut) {
        runwayMonth = m;
        ranOut = true;
        ranOutCount++;
        break;
      }
    }
    runwayOutcomes.push(runwayMonth);
  }

  runwayOutcomes.sort((a, b) => a - b);
  const percentile = (p: number): number => {
    const idx = Math.min(runwayOutcomes.length - 1, Math.floor(p * runwayOutcomes.length));
    return runwayOutcomes[idx];
  };

  const mean = runwayOutcomes.reduce((a, b) => a + b, 0) / runwayOutcomes.length;

  return {
    projectedRunwayMonths: Math.round(mean * 10) / 10,
    runwayP10: percentile(0.1),
    runwayP90: percentile(0.9),
    probabilityOfRunningOutWithinHorizon: Math.round((ranOutCount / simulations) * 1000) / 1000,
    projectedMrrDelta: Math.round((monthlyRevenue * Math.pow(1 + revenueGrowthRate, months) - monthlyRevenue) * 100) / 100,
    simulations,
  };
}
