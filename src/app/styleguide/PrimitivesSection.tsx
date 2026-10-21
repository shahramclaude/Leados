"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

function Block({ title, contract, children }: { title: string; contract: string[]; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4 lg:grid-cols-[1fr_minmax(220px,320px)]">
      <div>
        <h3 className="mb-3 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">{title}</h3>
        <div className="flex flex-wrap items-start gap-4">{children}</div>
      </div>
      <div className="rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3">
        <p className="mb-1 text-[var(--text-xs)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Behavior contract</p>
        <ul className="list-disc space-y-1 pl-4 text-[var(--text-sm)] text-[var(--text-secondary)]">
          {contract.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PrimitivesSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectValue, setSelectValue] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const toast = useToast();

  return (
    <div className="flex flex-col gap-6">
      <Block
        title="Button — default / hover / focus-visible / disabled / loading"
        contract={[
          "4 variants (primary/secondary/ghost/danger) × 3 sizes.",
          "Loading replaces label with spinner + visually-hidden status text.",
          "Disabled sets aria-disabled via native disabled + opacity 50%.",
          "Focus ring is the shared :focus-visible token, never a custom shadow.",
        ]}
      >
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button disabled>Disabled</Button>
        <Button loading>Loading</Button>
      </Block>

      <Block
        title="Badge — semantic + domain tones"
        contract={[
          "tint+ink pair per tone, APCA Lc >= 90 against tint and surface-0.",
          "Never conveys state via hue alone — always paired with text.",
        ]}
      >
        <Badge tone="success">Success</Badge>
        <Badge tone="warn">Warn</Badge>
        <Badge tone="danger">Danger</Badge>
        <Badge tone="info">Info</Badge>
        <Badge tone="strategy">Strategy</Badge>
        <Badge tone="people">People</Badge>
        <Badge tone="finance">Finance</Badge>
        <Badge tone="operations">Operations</Badge>
        <Badge tone="risk">Risk</Badge>
        <Badge tone="knowledge">Knowledge</Badge>
      </Block>

      <Block
        title="Input — default / hint / error / disabled"
        contract={[
          "Error ties to field via aria-describedby + aria-invalid.",
          "Error text always includes a recovery hint, never just \"Invalid\".",
        ]}
      >
        <Input label="Workspace name" placeholder="Acme Inc." />
        <Input label="Email" hint="We only use this for weekly digests." />
        <Input label="API key" error="This key was revoked. Generate a new one in Settings → API." />
        <Input label="Locked field" disabled value="Cannot edit" />
      </Block>

      <Block
        title="Select — native + searchable listbox"
        contract={[
          "One implementation; `searchable` switches native <select> for a filtered ARIA listbox.",
          "Keyboard: ArrowUp/Down move, Enter commits, Escape closes without changing value.",
        ]}
      >
        <Select
          label="Density"
          value={selectValue}
          onChange={setSelectValue}
          options={[
            { value: "compact", label: "Compact" },
            { value: "comfortable", label: "Comfortable" },
            { value: "spacious", label: "Spacious" },
          ]}
        />
        <Select
          label="Domain (searchable)"
          searchable
          value={searchValue}
          onChange={setSearchValue}
          options={[
            { value: "strategy", label: "Strategy" },
            { value: "people", label: "People" },
            { value: "finance", label: "Finance" },
            { value: "operations", label: "Operations" },
            { value: "risk", label: "Risk" },
            { value: "knowledge", label: "Knowledge" },
          ]}
        />
      </Block>

      <Block
        title="Tabs — roving tabindex"
        contract={["ArrowLeft/Right move + select; Home/End jump to ends.", "Panel is tabIndex=0 so content is reachable without a mouse."]}
      >
        <Tabs
          className="w-full"
          items={[
            { id: "a", label: "Summary", content: <p className="text-[var(--text-sm)] text-[var(--text-secondary)]">Summary panel content.</p> },
            { id: "b", label: "Evidence", content: <p className="text-[var(--text-sm)] text-[var(--text-secondary)]">Evidence panel content.</p> },
            { id: "c", label: "History", content: <p className="text-[var(--text-sm)] text-[var(--text-secondary)]">History panel content.</p> },
          ]}
        />
      </Block>

      <Block title="Tooltip" contract={["Shows on hover AND focus, never hover-only.", "Dismissible with Escape."]}>
        <Tooltip content="Source: billing ledger, refreshed nightly.">
          <button type="button" className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-1.5 text-[var(--text-sm)]">
            Hover or focus me
          </button>
        </Tooltip>
      </Block>

      <Block
        title="Dialog — modal + drawer"
        contract={[
          "Traps focus; Escape and scrim-click close; focus returns to the trigger.",
          "variant=\"drawer\" powers ExplainDrawer; variant=\"modal\" powers confirmations.",
        ]}
      >
        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          Open modal
        </Button>
        <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
          Open drawer
        </Button>
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Confirm action" description="This cannot be undone.">
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setDialogOpen(false)}>
              Confirm
            </Button>
          </div>
        </Dialog>
        <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Drawer example" variant="drawer">
          <p className="text-[var(--text-sm)] text-[var(--text-secondary)]">Same Dialog implementation, drawer variant.</p>
        </Dialog>
      </Block>

      <Block title="Toast" contract={["Polite live region; auto-dismiss 6s; keyboard dismissible."]}>
        <Button
          variant="secondary"
          onClick={() => toast.push({ title: "Saved", description: "Workspace settings updated.", tone: "success" })}
        >
          Trigger success toast
        </Button>
        <Button variant="secondary" onClick={() => toast.push({ title: "Sync failed", description: "Retrying in 30s.", tone: "danger" })}>
          Trigger danger toast
        </Button>
      </Block>

      <Block title="Skeleton" contract={["Animation collapses to 0ms under prefers-reduced-motion."]}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </Block>
    </div>
  );
}
