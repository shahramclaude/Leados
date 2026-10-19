// src/app/api/financial/simulate/route.ts
//
// POST /api/financial/simulate
// Body: { burnRate, revenue, revenueGrowth, cashBalance }
// Runs a faster (n=2000) Monte Carlo runway simulation against
// what-if inputs supplied by the user in the Financial view, instead of
// the persisted actuals used by GET /api/financial.

import { runMonteCarloRunway } from "@/lib/financialOS";

export const dynamic = "force-dynamic";

interface SimulateBody {
  burnRate?: unknown;
  revenue?: unknown;
  revenueGrowth?: unknown;
  cashBalance?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function POST(request: Request) {
  let body: SimulateBody;
  try {
    body = (await request.json()) as SimulateBody;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const { burnRate, revenue, revenueGrowth, cashBalance } = body;

  if (!isFiniteNumber(cashBalance) || cashBalance <= 0) {
    return Response.json(
      { error: "cashBalance must be a positive number." },
      { status: 400 }
    );
  }
  if (!isFiniteNumber(burnRate) || burnRate <= 0) {
    return Response.json(
      { error: "burnRate must be a positive number." },
      { status: 400 }
    );
  }
  if (!isFiniteNumber(revenue) || revenue < 0) {
    return Response.json(
      { error: "revenue must be a non-negative number." },
      { status: 400 }
    );
  }
  if (
    !isFiniteNumber(revenueGrowth) ||
    revenueGrowth < -0.5 ||
    revenueGrowth > 0.5
  ) {
    return Response.json(
      { error: "revenueGrowth must be a number between -0.5 and 0.5." },
      { status: 400 }
    );
  }

  try {
    const runway = runMonteCarloRunway({
      cashBalance,
      burnRate,
      revenue,
      revenueGrowth,
      paths: 2000, // faster, interactive what-if run
      maxMonths: 60,
      // Seed is derived from the full scenario so identical what-if inputs
      // always reproduce the same simulated distribution, while different
      // inputs get an independent, still-deterministic stream.
      seedKey: `${cashBalance}:${burnRate}:${revenue}:${revenueGrowth}`,
    });

    return Response.json(runway);
  } catch (error) {
    console.error("POST /api/financial/simulate failed", error);
    return Response.json(
      { error: "Failed to run the what-if simulation." },
      { status: 500 }
    );
  }
}
