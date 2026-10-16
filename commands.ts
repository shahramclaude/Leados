// Command-mode dispatcher for "> prefix" commands in the universal search box.
// FABRICATED surface — matches the pt-E brief's own command list.

export interface CommandContext {
  navigate: (hash: string) => void;
  setTheme: (t: "light" | "dark") => void;
  undoLast: () => boolean;
  exportNow: () => void;
  muteRule: (rule: string, reason: string) => void;
  unmuteRule: (rule: string) => void;
  updateSetting: (key: string, value: number) => void;
  resetAndReseed: () => void;
  toggleFocus: () => void;
  notify: (msg: string) => void;
}

export function runCommand(commandText: string, ctx: CommandContext): void {
  const [verb, ...rest] = commandText.trim().split(/\s+/);
  const arg = rest.join(" ");
  switch ((verb || "").toLowerCase()) {
    case "export":
      ctx.exportNow();
      ctx.notify("Exported full JSON store.");
      return;
    case "seed":
      ctx.notify("Already seeded — use >purge to reset and reseed.");
      return;
    case "purge":
      ctx.resetAndReseed();
      ctx.notify("Store purged and reseeded.");
      return;
    case "health":
      ctx.navigate("#/health");
      return;
    case "theme":
      if (arg === "dark" || arg === "light") {
        ctx.setTheme(arg);
        ctx.notify(`Theme: ${arg}`);
      }
      return;
    case "focus":
      ctx.toggleFocus();
      return;
    case "review":
      ctx.navigate("#/review");
      return;
    case "digest":
      ctx.navigate("#/digest");
      return;
    case "bundle":
      ctx.navigate("#/playbooks/" + bundleToPlaybook(arg));
      return;
    case "undo": {
      const ok = ctx.undoLast();
      ctx.notify(ok ? "Last event undone." : "Nothing to undo (60s window elapsed, or no event logged).");
      return;
    }
    case "backup":
      ctx.exportNow();
      ctx.notify("Backup exported now.");
      return;
    case "settings": {
      const m = arg.match(/^(\w+)=(-?\d+(?:\.\d+)?)$/);
      if (m) {
        ctx.updateSetting(m[1], Number(m[2]));
        ctx.notify(`Setting ${m[1]} = ${m[2]}`);
      } else {
        ctx.notify("Usage: >settings key=value");
      }
      return;
    }
    case "mute": {
      const rule = arg.toUpperCase();
      if (/^R\d+$/.test(rule)) {
        ctx.muteRule(rule, "muted via command palette");
        ctx.notify(`${rule} globally muted.`);
      }
      return;
    }
    case "unmute": {
      const rule = arg.toUpperCase();
      if (/^R\d+$/.test(rule)) {
        ctx.unmuteRule(rule);
        ctx.notify(`${rule} unmuted.`);
      }
      return;
    }
    case "trace":
      ctx.navigate("#/trace/" + arg);
      return;
    case "explain":
      ctx.navigate("#/explain/" + arg.toUpperCase());
      return;
    default:
      ctx.notify(`Unknown command: >${commandText}`);
  }
}

function bundleToPlaybook(arg: string): string {
  const map: Record<string, string> = {
    "1:1": "weekly-1-1",
    sprint: "ops-review",
    board: "pl-review",
    incident: "production-stop",
  };
  return map[arg.trim().toLowerCase()] || "ops-review";
}
