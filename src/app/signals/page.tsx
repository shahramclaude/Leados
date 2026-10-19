import { Suspense } from "react";
import SignalsView from "@/views/SignalsView";

export default function SignalsPage() {
  return (
    <Suspense fallback={<div className="p-4 font-mono text-xs text-slate-500">LOADING…</div>}>
      <SignalsView />
    </Suspense>
  );
}
