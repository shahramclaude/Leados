// Every surface states who can see what — this badge is the shared visual
// vocabulary for that rule across My Growth, 1:1 Space, and Feedback Flows.
export function VisibilityBadge({ visibility }: { visibility: "private" | "shared_with_manager" }) {
  const isPrivate = visibility === "private";
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium " +
        (isPrivate ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800")
      }
      title={isPrivate ? "Only you can see this." : "You and your manager can both see this — never anyone else."}
    >
      {isPrivate ? "🔒 Private — only you" : "🤝 Shared with your manager"}
    </span>
  );
}

export function ConfidentialityBadge({ policy, threshold }: { policy: string; threshold: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800"
      title={
        policy === "anonymous_aggregate"
          ? `Responses are never attributable to a rater. Shown only once ${threshold}+ people respond.`
          : "Only shown as attributed if the individual rater explicitly consents when they respond."
      }
    >
      {policy === "anonymous_aggregate" ? `🕶️ Anonymous, aggregated at ${threshold}+` : "✍️ Attributed only with rater consent"}
    </span>
  );
}
