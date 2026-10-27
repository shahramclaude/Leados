/** Robust decision making under box uncertainty; no probabilities or inferred evidence.
 * Payoffs are comparable, transferable utility units, NOT currency. Each of eight
 * payoffs varies independently by ±radius, without clipping at the input scale.
 * Closed-form linear bounds cover the entire continuous box, not a sample.
 */
export function analyzePowerStress(cells, radius, target = '00', players = [], quota = 1) {
  if (radius === null || radius === undefined || radius === '') return null;
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 0 || radius > 100) {
    throw new RangeError('Payoff uncertainty must be between 0 and 100 utility units.');
  }
  if (!/^[01]{2}$/.test(target)) throw new RangeError('Invalid target cell.');
  if (!Array.isArray(cells) || cells.length !== 2 || cells.some(row => !Array.isArray(row) || row.length !== 2 || row.some(cell => !Array.isArray(cell) || cell.length !== 2 || cell.some(x => typeof x !== 'number' || !Number.isFinite(x))))) {
    throw new TypeError('A complete finite 2×2 payoff matrix is required.');
  }
  const [r, c] = [...target].map(Number);
  const leaderSlack = cells[r][c][0] - cells[1-r][c][0];
  const rivalSlack = cells[r][c][1] - cells[r][1-c][1];
  const minimumTransfer = Math.max(0, -rivalSlack + 2 * radius);
  const maximumTransfer = leaderSlack - 2 * radius;
  const transferFeasible = minimumTransfer <= maximumTransfer + 1e-9;
  const strategies = [0, 1].map(row => ({
    row,
    worstPayoff: Math.min(...cells[row].map(cell => cell[0])) - radius,
    worstRegret: Math.max(0, ...[0, 1].map(col => cells[1-row][col][0] - cells[row][col][0] + 2 * radius)),
  }));
  const minRegret = Math.min(...strategies.map(s => s.worstRegret));
  const maxSecurity = Math.max(...strategies.map(s => s.worstPayoff));
  // One previously non-opposed stakeholder becomes opposed; keep the electorate
  // and quota fixed. This is NOT departure (which could change the voting rules).
  const support = players.filter(p => p.stance !== 'opposed').reduce((sum, p) => sum + p.weight, 0);
  const oppositionShocks = players.filter(p => p.stance !== 'opposed').map(p => ({
    id: p.id, name: p.name, remainingWeight: support - p.weight,
    blocks: support - p.weight < quota,
  }));
  return {
    radius, target, leaderSlack, rivalSlack,
    targetGuaranteed: Math.min(leaderSlack, rivalSlack) >= 2 * radius - 1e-9,
    targetRadius: Math.min(leaderSlack, rivalSlack) < 0 ? null : Math.min(leaderSlack, rivalSlack) / 2,
    minimumTransfer, maximumTransfer, transferFeasible,
    // Both inequalities must hold: L-2d >= 0 and L+R >= 4d.
    transferRadius: leaderSlack < 0 || leaderSlack + rivalSlack < 0 ? null : Math.min(leaderSlack / 2, (leaderSlack + rivalSlack) / 4),
    strategies,
    minimaxRows: strategies.filter(s => Math.abs(s.worstRegret-minRegret) < 1e-9).map(s => s.row),
    maximinRows: strategies.filter(s => Math.abs(s.worstPayoff-maxSecurity) < 1e-9).map(s => s.row),
    oppositionShocks, coalitionInitiallyFeasible: support >= quota,
    needsReview: !transferFeasible || (players.length > 0 && (support < quota || oppositionShocks.some(s => s.blocks))),
  };
}

export function powerStressBrief(stress) {
  if (!stress) return 'Robust strategy stress test: not configured; no uncertainty bound was supplied.';
  return [
    `ROBUST STRATEGY • independent payoff uncertainty ±${stress.radius} utility units (not a probability).`,
    `Target ${stress.target}: ${stress.targetGuaranteed ? 'Nash throughout the box' : 'not guaranteed throughout the box'}.`,
    `One fixed conditional transfer: ${stress.transferFeasible ? `[${stress.minimumTransfer}, ${stress.maximumTransfer}] units works throughout the box` : `no feasible transfer; required ≥${stress.minimumTransfer}, affordable ≤${stress.maximumTransfer}`}. Weak Nash only; enforcement and transferable utility assumed.`,
    `Pure-strategy minimax regret: row(s) ${stress.minimaxRows.join(', ')}. ${stress.strategies.map(s => `Row ${s.row}: worst regret ${s.worstRegret}, security payoff ${s.worstPayoff}`).join('; ')}. Counterparty response is unrestricted; this is not an equilibrium forecast.`,
    `Single opposition shocks blocking quota: ${stress.oppositionShocks.filter(s => s.blocks).map(s => s.name).join(', ') || 'none'}. Electorate and quota held fixed.`,
    'Verify the uncertainty bound with stakeholders. No probability, statistical confidence, money or causal effect is inferred. No transfer or strategy is executed automatically.',
  ].join('\n');
}
