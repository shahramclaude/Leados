"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  DatePicker,
  DropdownMenu,
  EmptyState,
  ErrorState,
  FormField,
  GaugeArc,
  IconButton,
  Input,
  Modal,
  Panel,
  Drawer,
  PageHeader,
  Popover,
  ProgressBar,
  ProgressRing,
  Radio,
  Select,
  Skeleton,
  SkeletonText,
  StatTile,
  Switch,
  Tabs,
  TabPanel,
  Tag,
  Textarea,
  Tooltip,
  useToast,
  severityLabel,
  SEVERITY_ORDER,
  typeScale,
} from "@/components/leados/ui";
import { ChartFrame, LineSVG, SparklineSVG, HeatmapSVG, RadarSVG, NetworkSVG, WaterfallSVG } from "@/components/leados/ui/Charts";
import { DataTable, type ColumnDef } from "@/components/leados/ui/Table";
import { useTheme } from "@/components/leados/ui/theme";

const SURFACE_SWATCHES = [
  { token: "surface-sunken", className: "bg-surface-sunken" },
  { token: "surface", className: "bg-surface" },
  { token: "surface-raised", className: "bg-surface-raised" },
  { token: "surface-overlay", className: "bg-surface-overlay" },
] as const;
const TEXT_SWATCHES = [
  { token: "text-primary", className: "text-text-primary" },
  { token: "text-secondary", className: "text-text-secondary" },
  { token: "text-tertiary", className: "text-text-tertiary" },
  { token: "text-disabled", className: "text-text-disabled" },
] as const;
const TYPE_SCALE_CLASS: Record<string, string> = {
  caption: "text-caption",
  "body-sm": "text-body-sm",
  body: "text-body",
  "body-lg": "text-body-lg",
  h4: "text-h4",
  h3: "text-h3",
  h2: "text-h2",
  h1: "text-h1",
  display: "text-display",
};

type DemoRow = { id: string; name: string; score: number; status: string };
const demoRows: DemoRow[] = [
  { id: "1", name: "Atlas migration", score: 92, status: "on-track" },
  { id: "2", name: "Horizon portal", score: 61, status: "at-risk" },
  { id: "3", name: "Beacon warehouse", score: 34, status: "blocked" },
];
const demoColumns: ColumnDef<DemoRow>[] = [
  { key: "name", header: "Name", render: (r) => r.name, sortValue: (r) => r.name },
  { key: "score", header: "Score", render: (r) => r.score, sortValue: (r) => r.score, align: "right" },
  { key: "status", header: "Status", render: (r) => <Badge severity={r.status === "on-track" ? "good" : r.status === "at-risk" ? "caution" : "critical"}>{r.status}</Badge> },
];

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="flex flex-col gap-4 border-b border-border-subtle pb-8">
      <div>
        <h2 id={`${id}-heading`} className="text-h3 font-semibold text-text-primary">
          {title}
        </h2>
        {description ? <p className="mt-1 text-body-sm text-text-tertiary">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  const { push } = useToast();
  const { preference, setPreference } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);
  const [comboValue, setComboValue] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [tab, setTab] = useState("one");

  return (
    <div className="flex flex-col gap-10 pb-16">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Styleguide" }]}
        title="Styleguide"
        description="Every LEADOS primitive, token and chart in one place — the visual contract the rest of the app is built against."
        primaryAction={
          <div className="flex items-center gap-2">
            {(["system", "light", "dark"] as const).map((p) => (
              <Button key={p} size="sm" variant={preference === p ? "primary" : "secondary"} onClick={() => setPreference(p)}>
                {p}
              </Button>
            ))}
          </div>
        }
      />

      <Section id="color" title="Color tokens" description="Semantic surfaces, text and severity scale — every color in the app comes from these tokens.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SURFACE_SWATCHES.map((s) => (
            <div key={s.token} className={`rounded-lg border border-border p-4 ${s.className}`}>
              <p className="text-caption font-mono text-text-secondary">{s.token}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TEXT_SWATCHES.map((t) => (
            <p key={t.token} className={`rounded-lg border border-border bg-surface-raised p-4 text-body-sm ${t.className}`}>
              {t.token}
            </p>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SEVERITY_ORDER.map((s) => (
            <Badge key={s} severity={s}>
              {severityLabel[s]}
            </Badge>
          ))}
        </div>
      </Section>

      <Section id="typography" title="Typography scale">
        <div className="flex flex-col gap-2">
          {typeScale
            .slice()
            .reverse()
            .map((t) => (
              <p key={t} className={`text-text-primary ${TYPE_SCALE_CLASS[t]}`}>
                {t} — The quick brown fox jumps over the lazy dog
              </p>
            ))}
        </div>
      </Section>

      <Section id="buttons" title="Buttons & icon buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <IconButton label="Notifications">🔔</IconButton>
          <IconButton label="Active state" active>
            ⭐
          </IconButton>
        </div>
      </Section>

      <Section id="badges" title="Badges & tags">
        <div className="flex flex-wrap items-center gap-2">
          <Tag>Design system</Tag>
          <Tag onRemove={() => push({ title: "Tag removed", tone: "info" })}>Removable</Tag>
        </div>
      </Section>

      <Section id="forms" title="Form controls" description="Every input carries a label, optional description and error slot.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField id="sg-input" label="Decision title" description="Shown to the whole leadership team.">
            <Input id="sg-input" placeholder="e.g. Approve renewal ceiling" />
          </FormField>
          <FormField id="sg-input-err" label="Owner" error="Owner is required.">
            <Input id="sg-input-err" invalid placeholder="Required" />
          </FormField>
          <FormField id="sg-select" label="Severity">
            <Select id="sg-select" defaultValue="warning">
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Informational</option>
            </Select>
          </FormField>
          <FormField id="sg-textarea" label="Context">
            <Textarea id="sg-textarea" rows={3} placeholder="Why does this matter?" />
          </FormField>
          <DatePicker id="sg-date" label="Due date" value={date} onChange={setDate} />
          <div className="flex flex-col gap-3">
            <Checkbox id="sg-check" label="Notify stakeholders" defaultChecked />
            <Radio id="sg-radio-1" name="sg-radio" label="Weekly cadence" defaultChecked />
            <Radio id="sg-radio-2" name="sg-radio" label="Daily cadence" />
            <div className="flex items-center gap-2">
              <Switch id="sg-switch" checked={switchOn} onCheckedChange={setSwitchOn} label="Enable automations" />
              <label htmlFor="sg-switch" className="text-body-sm text-text-primary">
                Enable automations
              </label>
            </div>
          </div>
        </div>
        <div className="max-w-sm">
          <Combobox
            id="sg-combobox"
            label="Assign owner"
            value={comboValue}
            onChange={setComboValue}
            options={[
              { value: "amara", label: "Amara Okafor", hint: "Product" },
              { value: "leo", label: "Leo Bergström", hint: "Engineering" },
              { value: "priya", label: "Priya Rao", hint: "Revenue" },
            ]}
          />
        </div>
      </Section>

      <Section id="overlays" title="Overlays" description="Tooltip, popover, dropdown menu, modal and drawer — all focus-trapped and Escape-to-close.">
        <div className="flex flex-wrap items-center gap-3">
          <Tooltip content="Appears on hover or focus">
            <Button variant="secondary">Hover for tooltip</Button>
          </Tooltip>
          <Popover trigger={(props) => <Button variant="secondary" {...props}>Open popover</Button>}>
            <p className="px-2 py-1.5 text-body-sm text-text-secondary">Popovers close on outside click or Escape.</p>
          </Popover>
          <DropdownMenu
            trigger={<Button variant="secondary">Open menu</Button>}
            items={[
              { key: "edit", label: "Edit", icon: "✏️", onSelect: () => push({ title: "Edit selected", tone: "info" }) },
              { key: "duplicate", label: "Duplicate", icon: "📄", onSelect: () => push({ title: "Duplicated", tone: "good" }) },
              { key: "delete", label: "Delete", icon: "🗑️", destructive: true, onSelect: () => push({ title: "Deleted", tone: "critical" }) },
            ]}
          />
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              push({ title: "Orchestration complete", description: "3 new signals detected.", tone: "good" })
            }
          >
            Fire toast
          </Button>
        </div>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Example modal" description="Focus is trapped inside while open.">
          <p className="text-body-sm text-text-secondary">Press Tab to cycle focus, Escape to close.</p>
        </Modal>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Example drawer" description="Used for progressive disclosure of detail.">
          <p className="text-body-sm text-text-secondary">Drawers are the detail view for a summary → detail flow.</p>
        </Drawer>
      </Section>

      <Section id="tabs" title="Tabs">
        <Tabs items={[{ key: "one", label: "Overview" }, { key: "two", label: "Detail" }, { key: "three", label: "History", badge: 3 }]} value={tab} onChange={setTab} />
        <TabPanel tabsId="sg" tabKey="one" active={tab === "one"}>
          <p className="text-body-sm text-text-secondary">Overview panel content.</p>
        </TabPanel>
        <TabPanel tabsId="sg" tabKey="two" active={tab === "two"}>
          <p className="text-body-sm text-text-secondary">Detail panel content.</p>
        </TabPanel>
        <TabPanel tabsId="sg" tabKey="three" active={tab === "three"}>
          <p className="text-body-sm text-text-secondary">History panel content.</p>
        </TabPanel>
      </Section>

      <Section id="feedback" title="Loading, empty & error states">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-4">
            <SkeletonText lines={3} />
          </div>
          <EmptyState title="No results" description="Try adjusting your filters." />
          <ErrorState description="The orchestration engine timed out." onRetry={() => push({ title: "Retrying…", tone: "info" })} />
        </div>
        <Skeleton className="h-24 w-full" />
      </Section>

      <Section id="data-display" title="Progress, gauges & stat tiles">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatTile label="Pipeline" value="$4.2M" delta="+12%" deltaTone="good" icon="💰" />
          <div className="flex items-center justify-center rounded-lg border border-border bg-surface-raised p-4">
            <GaugeArc value={72} label="Health" severity="good" />
          </div>
          <div className="flex items-center justify-center rounded-lg border border-border bg-surface-raised p-4">
            <ProgressRing value={45} label="Budget" severity="caution" />
          </div>
          <div className="flex flex-col justify-center gap-2 rounded-lg border border-border bg-surface-raised p-4">
            <ProgressBar value={80} label="Rollout" severity="good" />
            <ProgressBar value={35} label="Adoption" severity="warning" />
          </div>
        </div>
      </Section>

      <Section id="tables" title="Tables">
        <Panel padded={false}>
          <div className="p-4">
            <DataTable caption="Example portfolio" columns={demoColumns} rows={demoRows} rowKey={(r) => r.id} searchable />
          </div>
        </Panel>
      </Section>

      <Section id="charts" title="Charts" description="Every chart ships with a 'view as table' toggle for full data access.">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartFrame
            title="Line with uncertainty band"
            legend={[{ label: "Forecast", color: "var(--chart-1)" }]}
            table={{
              columns: [
                { key: "label", header: "Period", render: (r: { label: string; value: number }) => r.label },
                { key: "value", header: "Value", render: (r) => r.value, align: "right" },
              ],
              rows: ["Jan", "Feb", "Mar", "Apr"].map((label, i) => ({ label, value: [10, 14, 18, 22][i] })),
              rowKey: (r) => r.label,
            }}
          >
            <LineSVG
              labels={["Jan", "Feb", "Mar", "Apr"]}
              series={[{ label: "Forecast", points: [10, 14, 18, 22], band: [{ low: 9, high: 11 }, { low: 12, high: 16 }, { low: 14, high: 22 }, { low: 15, high: 29 }] }]}
            />
          </ChartFrame>

          <ChartFrame
            title="Heatmap"
            table={{
              columns: [
                { key: "row", header: "Row", render: (r: { row: string; a: number; b: number }) => r.row },
                { key: "a", header: "A", render: (r) => r.a, align: "right" },
                { key: "b", header: "B", render: (r) => r.b, align: "right" },
              ],
              rows: [{ row: "Team 1", a: 3, b: 7 }, { row: "Team 2", a: 8, b: 2 }],
              rowKey: (r) => r.row,
            }}
          >
            <HeatmapSVG rows={["Team 1", "Team 2"]} cols={["A", "B"]} values={[[3, 7], [8, 2]]} valueLabel={(v) => String(v)} />
          </ChartFrame>

          <ChartFrame
            title="Radar"
            table={{
              columns: [
                { key: "axis", header: "Axis", render: (r: { axis: string; value: number }) => r.axis },
                { key: "value", header: "Value", render: (r) => r.value, align: "right" },
              ],
              rows: ["Speed", "Quality", "Cost", "Risk"].map((axis, i) => ({ axis, value: [0.8, 0.6, 0.4, 0.3][i] })),
              rowKey: (r) => r.axis,
            }}
          >
            <RadarSVG axes={["Speed", "Quality", "Cost", "Risk"]} series={[{ label: "Current", values: [0.8, 0.6, 0.4, 0.3] }]} />
          </ChartFrame>

          <ChartFrame
            title="Network"
            table={{
              columns: [
                { key: "source", header: "From", render: (r: { source: string; target: string }) => r.source },
                { key: "target", header: "To", render: (r) => r.target },
              ],
              rows: [{ source: "a", target: "b" }, { source: "b", target: "c" }],
              rowKey: (r) => `${r.source}-${r.target}`,
            }}
          >
            <NetworkSVG
              nodes={[{ id: "a", label: "Amara", group: 0 }, { id: "b", label: "Leo", group: 1 }, { id: "c", label: "Priya", group: 2 }]}
              edges={[{ source: "a", target: "b", weight: 2 }, { source: "b", target: "c", weight: 1 }]}
            />
          </ChartFrame>

          <ChartFrame
            title="Waterfall"
            table={{
              columns: [
                { key: "label", header: "Step", render: (r: { label: string; delta: number }) => r.label },
                { key: "delta", header: "Amount", render: (r) => r.delta, align: "right" },
              ],
              rows: [{ label: "Start", delta: 100 }, { label: "Gain", delta: 20 }, { label: "Loss", delta: -10 }, { label: "End", delta: 110 }],
              rowKey: (r) => r.label,
            }}
          >
            <WaterfallSVG steps={[{ label: "Start", delta: 100, isTotal: true }, { label: "Gain", delta: 20 }, { label: "Loss", delta: -10 }, { label: "End", delta: 110, isTotal: true }]} />
          </ChartFrame>

          <div className="flex flex-col justify-center gap-2 rounded-lg border border-border bg-surface-raised p-4">
            <p className="text-body-sm font-medium text-text-primary">Sparkline (inline, no axes)</p>
            <SparklineSVG points={[4, 6, 5, 8, 9, 7, 11]} label="7-day trend" />
          </div>
        </div>
      </Section>
    </div>
  );
}
