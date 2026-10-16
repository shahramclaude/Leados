import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Check,
  Database,
  Download,
  FileCode2,
  FileText,
  GitBranch,
  Layers,
  Play,
  Radio,
  ScrollText,
  ShieldCheck,
  Terminal,
  XCircle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* data                                                                */
/* ------------------------------------------------------------------ */

const FILES = [
  { id: "index.html", path: "leados/index.html", icon: FileCode2, kind: "code", desc: "the complete application — single file, zero build, zero network" },
  { id: "README.md", path: "leados/README.md", icon: FileText, kind: "md", desc: "claims, registry, rules table, non-claims" },
  { id: "AI-SESSION-LOG.md", path: "leados/AI-SESSION-LOG.md", icon: ScrollText, kind: "md", desc: "§0 claim-vs-inspection audit + session evidence" },
] as const;

const RECEIPTS: { claim: string; status: "verified" | "not-obtained" | "inferred"; proof: string }[] = [
  { claim: "Upstream @ HEAD is pt-18 — 24 flat files, index.html = 963,415 bytes", status: "verified", proof: "git trees API · tree e02be53 · truncated:false" },
  { claim: "store.js = pt-5-era relic (SCHEMA_VERSION 5, tag pt-6) — ported near-verbatim", status: "verified", proof: "blob 596773e · 14,941 B · read in full" },
  { claim: "rules.js is a 761-byte tombstone; scaffold unbootable as shipped", status: "verified", proof: "tree sizes + upstream's own pt-18 README" },
  { claim: "Other five loose js files are equally stale", status: "inferred", proof: "inference from store.js + README — not individually fetched" },
  { claim: "pt-14 bytes (134 rules / 21 files) — no commit is labeled by part", status: "not-obtained", proof: "~800 KB+ historical index.html exceeds fetch truncation" },
  { claim: "R1–R134 rule bodies, pt-1..14 contracts, upstream helper semantics", status: "not-obtained", proof: "reconstructed interfaces shipped instead — labeled recon" },
];

const CHANGELOG: { change: string; why?: string }[] = [
  { change: "schema v15: MIGRATIONS['14>15'] backfills the four brief settings (90 / 180 / 90 / 18), idempotent + repair-counted; rungs 1>2–4>5 are byte-verified ports, 5>6–13>14 reconstructed and labeled", why: "the brief pins the v15 keys exactly; honest rungs keep a v1 store climbable without pretending upstream's middle rungs were read" },
  { change: "13 new event contracts (succession · legacy · avoidance · career · value · brand · mentor · board · exit-plan), all through the port of the byte-verified validation gate", why: "ids made REQUIRED on succession.candidate / legacy.defined / avoidance.named — the brief's own *.reviewed/.addressed contracts reference them (brief-internal conflict, labeled)" },
  { change: "leaderSelf engine: successionDashboard · avoidancePatterns (5 detectors) · brandGap · careerArc (Bezos regret-minimization, labeled by name and source) · legacyScore (composite refused, n=0→null)" },
  { change: "rules R135–R144 implemented literally, incl. R137 sev-2 hard ceiling, R139 sev-1 nudge, R141 strict <3.5 ∧ n≥3, R143 strictly-past deadlines, R144 any-one-plan-satisfies-all" },
  { change: "R19 / R61 / R102 ship as feed-reader rules with a purple 'recon' badge", why: "R138 cross-references R19/R61 by id and the UI clause names R102 — they exist so pt-15 has real inputs, and they are labeled rather than passed off as the unfetched upstream bodies" },
  { change: "avoidance named-matching is kind-aware AND subject-aware; terms printed per pattern", why: "the health wall caught both failure directions this session (naming a conversation silenced the feedback hypothesis; naming feedback for A silenced it for C) — regression guarded by G136" },
  { change: "T12b split into two seeds: A (R144 fires) and B (R142 fires)", why: "the two rules are mutually exclusive from one log state (exit plan absent vs present) — a brief-internal conflict; one seed cannot fire both" },
  { change: "T12b scope printed as a reduction: asserts the 13 rules present in this file, not the brief's 144", why: "R1–R134 live only in upstream's 963,415-byte index.html, never fetched; '#/health reports what ships' is the project's own doctrine" },
  { change: "7 playbooks with printed refusals (e.g. acknowledged avoidance without a deadline refuses; TBD successor with empty knowledge-transfer refuses); brand playbook renders known-vs-wanted live per brief" },
  { change: "#/self view: legacy scorecard (sources+labels, no composite), succession bench grid, career timeline, avoidance tracker, brand gap bars, mentors, board seats; Today collapses sev-1 nudges; export carries a labeled self-assessment section" },
];

/* ------------------------------------------------------------------ */
/* tiny markdown renderer                                              */
/* ------------------------------------------------------------------ */

function inline(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderMarkdown(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^---\s*$/.test(line)) { out.push("<hr/>"); i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { const l = h[1].length; out.push(`<h${l}>${inline(h[2])}</h${l}>`); i++; continue; }
    if (/^\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        const cells = lines[i].replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      out.push(
        "<table>" +
          rows.map((r, ri) => `<tr>${r.map((c) => (ri === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join("")}</tr>`).join("") +
          "</table>"
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      out.push("<ul>" + items.map((x) => `<li>${inline(x)}</li>`).join("") + "</ul>");
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, "")); i++; }
      out.push("<ol>" + items.map((x) => `<li>${inline(x)}</li>`).join("") + "</ol>");
      continue;
    }
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre>${buf.join("\n").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`);
      continue;
    }
    if (/^>/.test(line)) { out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`); i++; continue; }
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  return out.join("\n");
}

/* ------------------------------------------------------------------ */
/* console                                                             */
/* ------------------------------------------------------------------ */

type Tab = "live" | (typeof FILES)[number]["id"];

export default function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [contents, setContents] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    FILES.forEach((f) => {
      fetch(f.path)
        .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
        .then((t) => setContents((c) => ({ ...c, [f.id]: t })))
        .catch(() => setContents((c) => ({ ...c, [f.id]: "/* failed to load " + f.path + " — the static asset was not copied to dist */" })));
    });
  }, []);

  const active = FILES.find((f) => f.id === tab);
  const stats = useMemo(() => {
    const s: Record<string, { bytes: number; lines: number }> = {};
    Object.entries(contents).forEach(([k, v]) => { s[k] = { bytes: new Blob([v]).size, lines: v.split("\n").length }; });
    return s;
  }, [contents]);

  const copy = useCallback(() => {
    if (!active) return;
    navigator.clipboard.writeText(contents[active.id] || "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [active, contents]);

  const download = useCallback(() => {
    if (!active) return;
    const blob = new Blob([contents[active.id] || ""], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = active.id;
    a.click();
  }, [active, contents]);

  return (
    <div className="shell">
      {/* top bar */}
      <header className="bar">
        <div className="bar-l">
          <Terminal size={15} className="acc" />
          <span className="bar-title">LeadOS <strong>delivery dossier</strong></span>
          <span className="chip gold">pt-15 · personal leadership architecture</span>
        </div>
        <div className="bar-r">
          <span className="chip"><Database size={11} /> schema v15</span>
          <span className="chip"><Layers size={11} /> 9 modules · 1 file</span>
          <span className="chip"><ShieldCheck size={11} /> 13 rules</span>
          <span className="chip ok"><CheckCircle2 size={11} /> wall 26/26</span>
        </div>
      </header>

      <main className="main">
        {/* thesis */}
        <section className="hero panel">
          <div className="hero-eyebrow">delivery · part 15 of the LeadOS brief line · three files</div>
          <h1>Every previous slice optimized the system around the leader.<br/><span className="gold-text">This one optimizes the leader.</span></h1>
          <div className="doctrine">
            {["append-only log", "derived never persisted", "skip rather than infer", "n=0 → null, never 0", "hypotheses, not diagnoses", "zero network calls"].map((d) => (
              <span key={d} className="doctrine-item"><CheckCircle2 size={11} /> {d}</span>
            ))}
          </div>
        </section>

        {/* receipts */}
        <section className="panel">
          <h2><GitBranch size={14} /> Upstream inspection receipts</h2>
          <p className="hint">github.com/wbweve/Leados was inspected before anything was claimed. Unfetched code is marked, never asserted.</p>
          <div className="receipts">
            {RECEIPTS.map((r) => (
              <div key={r.claim} className="receipt">
                {r.status === "verified" && <CheckCircle2 size={14} className="ic-ok" />}
                {r.status === "inferred" && <Radio size={14} className="ic-warn" />}
                {r.status === "not-obtained" && <XCircle size={14} className="ic-bad" />}
                <div>
                  <div className="receipt-claim">{r.claim}</div>
                  <div className="receipt-proof">{r.status === "verified" ? "BYTE-VERIFIED" : r.status === "inferred" ? "INFERRED (labeled)" : "NOT OBTAINED"} · {r.proof}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* changelog */}
        <section className="panel">
          <h2><ScrollText size={14} /> Changelog — what changed, and why</h2>
          <div className="log">
            {CHANGELOG.map((c, i) => (
              <div key={i} className="log-item">
                <div className="log-num">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <div className="log-change">{c.change}</div>
                  {c.why && <div className="log-why"><ArrowUpRight size={11} /> why: {c.why}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* workspace */}
        <section className="workspace">
          <div className="ws-tabs">
            <button className={`ws-tab ${tab === "live" ? "on" : ""}`} onClick={() => setTab("live")}>
              <Play size={13} /> live app
            </button>
            {FILES.map((f) => {
              const Icon = f.icon;
              return (
                <button key={f.id} className={`ws-tab ${tab === f.id ? "on" : ""}`} onClick={() => setTab(f.id)}>
                  <Icon size={13} /> {f.id}
                  {stats[f.id] && <span className="ws-meta">{stats[f.id].lines.toLocaleString()} ln · {(stats[f.id].bytes / 1024).toFixed(1)} KB</span>}
                </button>
              );
            })}
            <div className="ws-actions">
              {tab !== "live" && (
                <>
                  <button className="iconbtn" onClick={copy} title="copy complete file">
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "copied" : "copy"}
                  </button>
                  <button className="iconbtn" onClick={download} title="download file"><Download size={14} /> download</button>
                  <a className="iconbtn" href={active?.path} target="_blank" rel="noreferrer" title="open raw"><ArrowUpRight size={14} /> raw</a>
                </>
              )}
              {tab === "live" && (
                <button className="iconbtn" onClick={() => setIframeKey((k) => k + 1)} title="reload app"><Play size={14} /> reload</button>
              )}
            </div>
          </div>

          {tab === "live" && (
            <div className="live-wrap">
              <div className="live-note">
                <AlertTriangle size={12} /> running the shipped <code>index.html</code> unmodified — hash routes: <code>#/today</code> <code>#/self</code> <code>#/playbooks</code> <code>#/log</code> <code>#/data</code> <code>#/health</code> · go to <code>#/health</code> and press the seed button to fire every rule
              </div>
              <iframe key={iframeKey} src="leados/index.html#/health" title="LeadOS pt-15 live" className="live" />
            </div>
          )}
          {active && tab !== "live" && (
            <div className="fileview">
              <div className="file-desc">{active.desc}</div>
              {active.kind === "code" ? (
                <pre className="code">{contents[active.id] || "loading…"}</pre>
              ) : (
                <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(contents[active.id] || "loading…") }} />
              )}
            </div>
          )}
        </section>

        <footer className="foot">
          <span>Where the README and <code>#/health</code> disagree, <strong>#/health wins</strong>. It always has.</span>
          <span className="foot-dim">three physical files · no more, no fewer · nothing unverified was claimed</span>
        </footer>
      </main>
    </div>
  );
}
