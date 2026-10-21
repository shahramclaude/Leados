import Link from "next/link";
import { generateBoardPack, renderBoardPackMarkdown } from "@/lib/boardPack";

export const dynamic = "force-dynamic";

export default async function BoardPackPage() {
  const pack = await generateBoardPack(new Date().toISOString().slice(0, 10));
  const markdown = renderBoardPackMarkdown(pack);

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <Link href="/" className="text-sm font-medium text-indigo-600 hover:underline">← Cockpit</Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Board Pack — {pack.periodLabel}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Deterministic template: identical underlying data always produces this exact content hash. Content hash: <code className="rounded bg-slate-100 px-1.5 py-0.5">{pack.contentHash}</code>
          </p>
          <div className="mt-3 flex gap-3 text-sm">
            <a className="font-medium text-indigo-600 hover:underline" href="/api/export?type=board-pack&format=markdown">Export markdown</a>
            <a className="font-medium text-indigo-600 hover:underline" href="/api/export?type=board-pack&format=json">Export JSON</a>
          </div>
        </div>
      </header>
      <article className="mx-auto mt-6 max-w-4xl whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-8 text-sm leading-relaxed text-slate-800 shadow-sm">
        {markdown}
      </article>
    </main>
  );
}
