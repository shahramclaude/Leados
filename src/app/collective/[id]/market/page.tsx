import Link from "next/link";
import { notFound } from "next/navigation";
import { getBeliefVsPrice, getMarketState, getQuestion } from "@/lib/collective/service";
import { TradeForm } from "../../_components/TradeForm";

export const dynamic = "force-dynamic";

export default async function MarketFloorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const question = await getQuestion(id);
  if (!question) notFound();
  const [market, beliefVsPrice] = await Promise.all([getMarketState(id), getBeliefVsPrice(id)]);
  if (!market) notFound();

  const maxPrice = Math.max(0.01, ...market.priceHistory.map((p) => p.priceAfter), 0.5);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <Link href={`/collective/${id}`} className="text-xs text-slate-500 underline underline-offset-4">
        ← Collective View
      </Link>
      <h1 className="mt-3 text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold text-slate-950">Market Floor</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">{question.title}</p>
      <p className="mt-1 text-xs text-slate-500">
        Logarithmic Market Scoring Rule (LMSR), liquidity b={market.liquidityB.toFixed(2)} (max operator loss{" "}
        {market.maxOperatorLoss.toFixed(2)} play-money). Position limits and wash-trade detection run on every trade.
      </p>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
          <p className="text-xs uppercase text-slate-400">Current YES price</p>
          <p className="text-3xl font-semibold text-slate-950">{(market.price * 100).toFixed(1)}%</p>
        </div>
        {beliefVsPrice && (
          <div className="rounded-2xl bg-white p-5 shadow-[0_12px_30px_rgba(16,24,40,0.08)] sm:col-span-2">
            <p className="text-xs uppercase text-slate-400">Belief vs. price</p>
            <p className="mt-1 text-sm text-slate-700">{beliefVsPrice.interpretation}</p>
            <p className="mt-1 text-xs font-mono text-slate-500">
              gap = {(beliefVsPrice.gap * 100).toFixed(1)} pts (price − pooled belief)
            </p>
          </div>
        )}
      </section>

      {market.integrityFlags.length > 0 && (
        <section className="mt-6 rounded-2xl border-2 border-rose-300 bg-rose-50 p-5">
          <h3 className="text-sm font-semibold text-rose-900">Integrity notices ({market.integrityFlags.length})</h3>
          <ul className="mt-3 grid gap-2">
            {market.integrityFlags.map((f) => (
              <li key={f.id} className="rounded-lg bg-white p-3 text-xs text-slate-700">
                <span className="font-semibold uppercase text-rose-700">{f.type.replace("_", " ")}</span>: {f.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
        <h3 className="text-sm font-semibold text-slate-950">Price history</h3>
        {market.priceHistory.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No trades yet.</p>
        ) : (
          <div className="mt-4 flex items-end gap-2 overflow-x-auto" style={{ height: 100 }}>
            {market.priceHistory.map((p, i) => (
              <div
                key={i}
                className={`w-4 rounded-t ${p.side === "YES" ? "bg-emerald-500" : "bg-rose-400"}`}
                style={{ height: `${Math.max(4, (p.priceAfter / maxPrice) * 90)}px` }}
                title={`${p.side} ${p.shares} shares → ${(p.priceAfter * 100).toFixed(1)}%`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
        <h3 className="text-sm font-semibold text-slate-950">Positions (play-money P&amp;L inputs)</h3>
        <ul className="mt-3 grid gap-2 text-sm">
          {market.positions.map((p) => (
            <li key={p.id} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="font-mono text-xs text-slate-500">{p.traderId.slice(0, 8)}…</span>
              <span>
                YES {Number(p.yesShares).toFixed(1)} · NO {Number(p.noShares).toFixed(1)} · net invested{" "}
                {Number(p.netInvested).toFixed(2)}
              </span>
            </li>
          ))}
          {market.positions.length === 0 && <p className="text-xs text-slate-500">No positions yet.</p>}
        </ul>
      </section>

      <section className="mt-6">
        <TradeForm questionId={id} />
      </section>
    </main>
  );
}
