import { generateBoardPack, getLatestPack } from "@/lib/app/boardPack";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function generateAction() {
  "use server";
  await generateBoardPack();
  revalidatePath("/boardpack");
}

export default async function BoardPackPage() {
  const pack = (await getLatestPack()) ?? (await generateBoardPack());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Board Pack</h1>
        <form action={generateAction}>
          <button
            type="submit"
            data-testid="generate-boardpack"
            className="rounded-lg px-4 py-2 font-medium text-white"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Generate new
          </button>
        </form>
      </div>

      <div className="ld-surface rounded-xl border p-6" data-testid="boardpack-summary">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Period {pack.periodLabel} · generated {new Date(pack.summary.generatedAt).toLocaleString()}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Object.entries(pack.summary.totals).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs uppercase" style={{ color: "var(--muted)" }}>
                {key}
              </dt>
              <dd className="text-xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <a
        href="/api/boardpack"
        data-testid="download-boardpack"
        className="inline-block rounded-lg border px-4 py-2 text-sm"
      >
        Export as JSON
      </a>
    </div>
  );
}
