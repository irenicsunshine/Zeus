"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Cpu, Clock, Coins, CheckCircle2, AlertCircle,
  Copy, Check, ChevronDown, ChevronRight, Zap, MessageSquare,
  Settings2, Activity, User, Bot, Terminal, AlignLeft,
} from "lucide-react";
import Navbar from "../../../components/Navbar";

// ─── types ───────────────────────────────────────────────────────────────────

interface Usage {
  input: number; output: number; cacheRead: number; cacheWrite: number;
  totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvent = Record<string, any>;

interface LogData {
  msn: string; sessionId: string; extractionStatus: string; createdAt: string;
  model: string; provider: string; responseId: string; durationMs: number | null;
  systemPrompt: string; userMessage: string; rawResponse: string;
  usage: Usage | null;
  events: AnyEvent[];
}

type Tab = "trace" | "timeline" | "thread";

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt     = (n: number) => n.toLocaleString();
const fmtCost = (n: number) => "$" + n.toFixed(6);
const fmtDur  = (ms: number) => ms < 1000 ? ms + "ms" : (ms / 1000).toFixed(2) + "s";

function tsMs(ev: AnyEvent): number | null {
  if (typeof ev.timestamp === "number") return ev.timestamp;
  if (typeof ev.timestamp === "string") return new Date(ev.timestamp).getTime();
  return null;
}

// ─── shared: copy button ──────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button"
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="p-2 rounded-full text-foreground/20 hover:text-foreground hover:bg-accent transition-all"
    >
      {done ? <Check size={14} className="text-emerald-700" /> : <Copy size={14} />}
    </button>
  );
}

// ─── shared: event meta ───────────────────────────────────────────────────────

function eventMeta(ev: AnyEvent): { icon: React.ReactNode; label: string; badge?: string; color: string; detail?: string } {
  if (ev.type === "session") return {
    icon: <Activity size={13} />, label: "Session Started", color: "text-foreground/40",
    detail: `ID: ${ev.id}`,
  };
  if (ev.type === "model_change") return {
    icon: <Cpu size={13} />, label: "Model Selected", badge: ev.modelId, color: "text-foreground",
    detail: `Provider: ${ev.provider}`,
  };
  if (ev.type === "thinking_level_change") return {
    icon: <Settings2 size={13} />, label: "Thinking Level", badge: ev.thinkingLevel, color: "text-foreground/40",
  };
  if (ev.type === "message" && ev.message?.role === "user") return {
    icon: <MessageSquare size={13} />, label: "User Prompt", color: "text-foreground/60",
    detail: `${fmt((ev.message?.content as { text?: string }[] ?? []).reduce((s, c) => s + (c.text?.length ?? 0), 0))} chars`,
  };
  if (ev.type === "message" && ev.message?.role === "assistant") return {
    icon: <Zap size={13} />, label: "Assistant Message", color: "text-foreground/60",
  };
  if (ev.usage) return {
    icon: <CheckCircle2 size={13} />, label: "Model Response", badge: ev.stopReason,
    color: "text-emerald-700",
    detail: `${fmt(ev.usage.totalTokens)} tokens · ${fmtCost(ev.usage.cost.total)}`,
  };
  return { icon: <Activity size={13} />, label: ev.type ?? "Event", color: "text-foreground/20" };
}

// ─── TAB 1: TRACE VIEW ────────────────────────────────────────────────────────

function TraceView({ events, sessionStart, systemPrompt }: {
  events: AnyEvent[];
  sessionStart: number | null;
  systemPrompt: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="flex h-[600px] bg-background/20">
      {/* Left: span list */}
      <div className="w-80 shrink-0 border-r border-border overflow-y-auto bg-background/50">
        <div className="px-6 py-4 border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur-sm">
          <p className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest">
            {events.length} Telemetry Spans
          </p>
        </div>

        {/* vertical guide line */}
        <div className="relative py-4">
          <div className="absolute left-[36px] top-0 bottom-0 w-px bg-border" />

          {events.map((ev, i) => {
            const meta = eventMeta(ev);
            const evTs = tsMs(ev);
            const offsetMs = sessionStart && evTs ? evTs - sessionStart : null;
            const isSelected = selected === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(isSelected ? null : i)}
                className={`w-full text-left flex items-start gap-4 px-4 py-3.5 transition-all relative ${
                  isSelected
                    ? "bg-foreground/[0.03]"
                    : "hover:bg-accent/50"
                }`}
              >
                <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 border transition-all ${
                  isSelected
                    ? "bg-foreground border-foreground text-background"
                    : `bg-background border-border ${meta.color}`
                }`}>
                  {meta.icon}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-[11px] font-bold uppercase tracking-tight ${isSelected ? "text-foreground" : meta.color}`}>{meta.label}</p>
                    {offsetMs !== null && (
                      <span className="text-[9px] font-mono font-bold text-foreground/20 shrink-0">
                        +{offsetMs < 1000 ? offsetMs + "ms" : (offsetMs / 1000).toFixed(1) + "s"}
                      </span>
                    )}
                  </div>
                  {meta.badge && (
                    <span className="text-[9px] font-mono font-bold text-foreground/30 bg-accent px-2 py-0.5 rounded border border-border inline-block mt-1 truncate max-w-full uppercase tracking-tighter">
                      {meta.badge}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 overflow-y-auto bg-background">
        {selected === null ? (
          <div className="flex flex-col items-center justify-center h-full text-foreground/10 gap-4">
            <div className="p-6 bg-accent/30 rounded-full border border-border">
              <AlignLeft size={32} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em]">Select Span to Inspect</p>
          </div>
        ) : (() => {
          const ev = events[selected];
          const meta = eventMeta(ev);

          let content = "";
          if (ev.type === "message") {
            content = (ev.message?.content as { text?: string }[]).map((c) => c.text ?? "").join("");
          } else if (ev.usage) {
            const msgContent = ev.content as { text?: string }[] | undefined;
            content = msgContent ? msgContent.map((c) => c.text ?? "").join("") : JSON.stringify(ev, null, 2);
          } else {
            content = JSON.stringify(ev, null, 2);
          }

          return (
            <div className="p-8 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
              {/* span header */}
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-4 text-sm font-bold uppercase tracking-widest ${meta.color}`}>
                  <div className="p-2 bg-accent/50 rounded-lg border border-border">
                    {meta.icon}
                  </div>
                  {meta.label}
                </div>
                {ev.usage && (
                  <div className="flex items-center gap-3">
                    <span className="bg-foreground/[0.03] text-foreground/40 border border-border px-3 py-1 rounded-full text-[10px] font-bold font-mono">{fmt(ev.usage.input)} in</span>
                    <span className="bg-foreground/[0.03] text-foreground/40 border border-border px-3 py-1 rounded-full text-[10px] font-bold font-mono">{fmt(ev.usage.output)} out</span>
                  </div>
                )}
              </div>

              {/* System prompt preview when user message selected */}
              {ev.type === "message" && ev.message?.role === "user" && systemPrompt && (
                <div className="border border-border rounded-2xl overflow-hidden bg-accent/5">
                  <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background/50">
                    <Terminal size={14} className="text-foreground/30" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">Environment Context</span>
                    <span className="text-[10px] font-bold text-foreground/20 ml-auto uppercase tracking-widest">{fmt(systemPrompt.length)} chars</span>
                  </div>
                  <pre className="text-[11px] text-foreground/40 font-mono leading-relaxed p-6 overflow-auto max-h-48 whitespace-pre-wrap break-words">
                    {systemPrompt.slice(0, 800)}{systemPrompt.length > 800 ? "\n…" : ""}
                  </pre>
                </div>
              )}

              {/* Main content */}
              {content && (
                <div className="relative border border-border rounded-2xl overflow-hidden bg-card/30">
                  <div className="absolute top-4 right-4 z-10"><CopyBtn text={content} /></div>
                  <pre className="text-[12px] text-foreground/70 font-mono leading-relaxed p-8 pr-12 overflow-auto max-h-[500px] whitespace-pre-wrap break-words">
                    {content}
                  </pre>
                </div>
              )}

              {/* Token breakdown cards */}
              {ev.usage && (
                <div className="grid grid-cols-3 gap-4 pt-4">
                  {[
                    { label: "Input Payload", tokens: ev.usage.input, cost: ev.usage.cost.input },
                    { label: "Model Output", tokens: ev.usage.output, cost: ev.usage.cost.output },
                    { label: "Batch Total", tokens: ev.usage.totalTokens, cost: ev.usage.cost.total },
                  ].map(({ label, tokens, cost }) => (
                    <div key={label} className="bg-background border border-border rounded-2xl p-6 shadow-sm">
                      <p className="text-[9px] font-bold text-foreground/20 uppercase tracking-[0.2em] mb-3">{label}</p>
                      <p className="text-2xl font-bold font-mono text-foreground">{fmt(tokens)}</p>
                      <p className="text-[10px] font-bold text-foreground/20 font-mono mt-2 uppercase tracking-widest">{fmtCost(cost)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── TAB 2: TIMELINE VIEW ────────────────────────────────────────────────────

interface Segment {
  label: string;
  offsetMs: number;
  durMs: number;
  barColor: string;
  detail?: string;
  tokens?: number;
  cost?: number;
}

function TimelineView({ events, sessionStart, durationMs, usage }: {
  events: AnyEvent[];
  sessionStart: number | null;
  durationMs: number | null;
  usage: Usage | null;
}) {
  if (!sessionStart || !durationMs) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-foreground/20 gap-4">
        <Clock size={40} className="opacity-20" />
        <p className="text-[10px] font-bold uppercase tracking-widest">Awaiting Temporal Telemetry...</p>
      </div>
    );
  }

  const segments: Segment[] = [];
  let userMsgTs: number | null = null;

  for (const ev of events) {
    const ts = tsMs(ev);
    if (ev.type === "message" && ev.message?.role === "user") userMsgTs = ts;
    if (ev.usage && ts) {
      const setupEnd = userMsgTs ?? sessionStart;
      const setupDur = setupEnd - sessionStart;
      if (setupDur > 10) {
        segments.push({ label: "Setup & Manifest", offsetMs: 0, durMs: setupDur, barColor: "bg-foreground/10", detail: "Initialization & Ingestion" });
      }
      const llmOffset = setupEnd - sessionStart;
      const llmDur = ts - setupEnd;
      if (llmDur > 0) {
        segments.push({
          label: "Inference Engine",
          offsetMs: llmOffset,
          durMs: llmDur,
          barColor: "bg-foreground",
          detail: ev.model?.split("/").pop(),
          tokens: ev.usage.totalTokens,
          cost: ev.usage.cost.total,
        });
      }
    }
  }

  const total = durationMs;

  return (
    <div className="p-10 space-y-12 bg-accent/5">
      {/* Gantt chart */}
      <div>
        <p className="text-[10px] font-bold text-foreground/30 uppercase tracking-[0.3em] mb-8 px-2">Span Timeline (Sequential)</p>
        <div className="space-y-6">
          {segments.map((seg, i) => {
            const leftPct  = (seg.offsetMs / total) * 100;
            const widthPct = Math.max((seg.durMs / total) * 100, 2);
            return (
              <div key={i} className="flex items-center gap-8 group">
                {/* label */}
                <div className="w-48 shrink-0 text-right">
                  <p className="text-xs font-bold text-foreground uppercase tracking-tight truncate">{seg.label}</p>
                  <p className="text-[10px] text-foreground/30 font-mono font-bold mt-1 uppercase tracking-widest">{fmtDur(seg.durMs)}</p>
                </div>

                {/* bar track */}
                <div className="flex-1 relative h-12 flex items-center">
                   <div className="absolute inset-0 bg-foreground/[0.03] rounded-xl border border-border" />
                    <div
                      className={`absolute h-8 ${seg.barColor} rounded-lg flex items-center px-4 transition-all group-hover:scale-[1.01] shadow-sm`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    >
                      {widthPct > 15 && (
                        <span className={`text-[9px] font-bold uppercase tracking-widest truncate ${seg.barColor === 'bg-foreground' ? 'text-background' : 'text-foreground/40'}`}>
                          {fmtDur(seg.durMs)}
                        </span>
                      )}
                    </div>
                </div>

                {/* tokens / cost */}
                <div className="w-32 shrink-0 text-right">
                  {seg.tokens != null && (
                    <p className="text-[10px] font-bold text-foreground uppercase tracking-widest">{fmt(seg.tokens)} <span className="text-foreground/20 lowercase tracking-normal">tok</span></p>
                  )}
                  {seg.cost != null && (
                    <p className="text-[10px] font-bold text-foreground/40 font-mono mt-1">{fmtCost(seg.cost)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* time axis */}
        <div className="flex items-center gap-4 mt-6 pl-56 pr-32">
          <div className="flex-1 flex justify-between text-[10px] text-foreground/20 font-bold uppercase tracking-widest border-t border-border pt-4">
            <span>0.00s</span>
            <span>{fmtDur(total / 2)}</span>
            <span>{fmtDur(total)}</span>
          </div>
        </div>
      </div>

      {/* Token distribution stacked bar */}
      {usage && (
        <div className="pt-8 border-t border-border">
          <p className="text-[10px] font-bold text-foreground/30 uppercase tracking-[0.3em] mb-8 px-2">Payload Distribution</p>
          <div className="h-4 flex rounded-full overflow-hidden bg-foreground/[0.03] border border-border mb-6">
            {[
              { tokens: usage.input,     color: "bg-foreground/20",  title: "Input" },
              { tokens: usage.cacheRead, color: "bg-foreground/10", title: "Cache Read" },
              { tokens: usage.output,    color: "bg-foreground",    title: "Output" },
            ].filter(s => s.tokens > 0).map((s) => (
              <div
                key={s.title}
                className={`${s.color} h-full transition-all`}
                style={{ width: `${(s.tokens / usage.totalTokens) * 100}%` }}
              />
            ))}
          </div>
          <div className="flex items-center gap-10 px-2">
            {[
              { label: "Input Payload",  tokens: usage.input,     color: "bg-foreground/20"  },
              { label: "Model Ingress",  tokens: usage.output,    color: "bg-foreground"    },
              ...(usage.cacheRead > 0 ? [{ label: "Cache Optimization", tokens: usage.cacheRead, color: "bg-foreground/10" }] : []),
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${s.color}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">{s.label}: <span className="text-foreground font-mono ml-2">{fmt(s.tokens)}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB 3: THREAD VIEW ──────────────────────────────────────────────────────

function ChatBlock({ role, label, content, iconEl, labelColor, borderColor, bgColor }: {
  role: string; label: string; content: string;
  iconEl: React.ReactNode; labelColor: string; borderColor: string; bgColor: string;
}) {
  const [open, setOpen] = useState(role !== "system");
  const [copied, setCopied] = useState(false);

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${borderColor} ${bgColor}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-6 py-4 text-left hover:opacity-80 transition-opacity group"
      >
        <span className={`flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest flex-1 ${labelColor}`}>
          <div className="p-1.5 bg-background border border-border rounded-lg group-hover:scale-105 transition-transform">
            {iconEl}
          </div>
          {label}
        </span>
        <span className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest">{content.length.toLocaleString()} chars</span>
        {open
          ? <ChevronDown size={14} className="text-foreground/20" />
          : <ChevronRight size={14} className="text-foreground/20" />}
      </button>
      {open && (
        <div className="relative border-t border-border/50">
          <div className="absolute top-4 right-4">
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="p-2.5 rounded-full text-foreground/20 hover:text-foreground hover:bg-accent transition-all"
            >
              {copied ? <Check size={14} className="text-emerald-700" /> : <Copy size={14} />}
            </button>
          </div>
          <pre className="text-[12px] text-foreground/60 font-mono leading-relaxed p-8 pr-14 overflow-auto max-h-[500px] whitespace-pre-wrap break-words bg-background/40">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

function ThreadView({ systemPrompt, userMessage, rawResponse }: {
  systemPrompt: string; userMessage: string; rawResponse: string;
}) {
  const messages = [
    {
      role: "system", label: "Protocol Definition",
      content: systemPrompt,
      iconEl: <Terminal size={14} />,
      labelColor: "text-foreground/40",
      borderColor: "border-border",
      bgColor: "bg-accent/10",
    },
    {
      role: "user", label: "User Instruction",
      content: userMessage,
      iconEl: <User size={14} />,
      labelColor: "text-foreground/60",
      borderColor: "border-border",
      bgColor: "bg-accent/5",
    },
    {
      role: "assistant", label: "Model Manifest",
      content: rawResponse,
      iconEl: <Bot size={14} />,
      labelColor: "text-foreground",
      borderColor: "border-border",
      bgColor: "bg-background",
    },
  ].filter((m) => m.content);

  return (
    <div className="p-8 space-y-4 bg-accent/5">
      {messages.map((m) => <ChatBlock key={m.role} {...m} />)}
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "trace",    label: "Trace"    },
  { id: "timeline", label: "Timeline" },
  { id: "thread",   label: "Thread"   },
];

export default function LogsPage() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const assetId      = params.assetId as string;
  const period       = searchParams.get("period") || "March 2026";

  const [data,    setData]    = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tab,     setTab]     = useState<Tab>("trace");

  useEffect(() => {
    fetch(`/api/logs?assetId=${assetId}&period=${encodeURIComponent(period)}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setData(json); else setError(json.error); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [assetId, period]);

  const sessionStart = data?.events
    ? (() => { const s = data.events.find((e) => e.type === "session"); return s ? tsMs(s) : null; })()
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans transition-colors duration-500">
      <Navbar />

      {/* ── header ── */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border px-8 py-5 flex items-center gap-6 shadow-sm">
        <Link href="/operations" className="p-2.5 hover:bg-accent rounded-full transition-all border border-transparent hover:border-border group">
          <ArrowLeft className="w-5 h-5 text-foreground/40 group-hover:text-foreground" />
        </Link>
        <div>
          <h1 className="text-xl font-serif-elegant text-foreground flex items-center gap-4">
            Extraction Logs
            <span className="px-3 py-1 rounded-full bg-foreground text-background text-[10px] font-bold uppercase tracking-widest">
              {period}
            </span>
          </h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/20 mt-1">
            MSN: <span className="text-foreground/60 font-serif-elegant normal-case tracking-normal text-sm ml-2">{data?.msn || "—"}</span>
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12 space-y-10">

        {/* ── loading ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-48 gap-6 text-foreground/20">
            <div className="w-12 h-12 border-2 border-foreground/5 border-t-foreground/20 rounded-full animate-spin" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em]">Synchronizing Audit Logs...</p>
          </div>
        )}

        {/* ── error ── */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-3xl p-12 flex items-start gap-6 animate-in fade-in">
            <AlertCircle className="text-red-700 shrink-0 mt-1" size={24} />
            <div>
              <p className="text-lg font-serif-elegant text-red-800">No session telemetry detected</p>
              <p className="text-sm text-red-700/60 mt-2 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {!loading && data && (
          <>
            {/* ── session overview ── */}
            <div className="bg-card border border-border rounded-3xl p-10 grid grid-cols-2 md:grid-cols-4 gap-10 shadow-sm">
              {[
                {
                  label: "Inference Status",
                  content: (
                    <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-widest ${data.extractionStatus === "success" ? "text-emerald-700" : "text-amber-700"}`}>
                      <CheckCircle2 size={16} />
                      {data.extractionStatus === "success" ? "Valid" : data.extractionStatus}
                    </div>
                  ),
                },
                {
                  label: "Model Architecture",
                  content: (
                    <div className="flex items-center gap-2">
                      <Cpu size={14} className="text-foreground/40 shrink-0" />
                      <span className="text-sm font-bold font-mono text-foreground truncate uppercase tracking-tighter" title={data.model}>
                        {data.model.split("/").pop()}
                      </span>
                    </div>
                  ),
                },
                {
                  label: "Execution Time",
                  content: (
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Clock size={14} className="text-foreground/40 shrink-0" />
                      {data.durationMs != null ? fmtDur(data.durationMs) : "—"}
                    </div>
                  ),
                },
                {
                  label: "Ingestion Cost",
                  content: (
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                      <Coins size={14} className="text-emerald-600 shrink-0" />
                      {data.usage ? fmtCost(data.usage.cost.total) : "—"}
                    </div>
                  ),
                },
              ].map(({ label, content }) => (
                <div key={label}>
                  <p className="text-[9px] font-bold text-foreground/20 uppercase tracking-[0.2em] mb-3">{label}</p>
                  {content}
                </div>
              ))}
            </div>

            {/* ── session meta ── */}
            <div className="flex flex-wrap items-center gap-6 text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 px-2">
              <span className="flex items-center gap-2">Session <code className="bg-accent px-3 py-1 rounded-full text-foreground/60 font-mono border border-border">{data.sessionId}</code></span>
              {data.responseId && <span className="flex items-center gap-2">Response <code className="bg-accent px-3 py-1 rounded-full text-foreground/60 font-mono border border-border">{data.responseId}</code></span>}
              <span className="flex items-center gap-2">Infrastructure <span className="text-foreground/60">{data.provider}</span></span>
            </div>

            {/* ── tabbed trace panel ── */}
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              {/* tab bar */}
              <div className="flex items-center gap-2 border-b border-border px-8 pt-6 bg-background/20">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`px-6 py-3 text-[10px] font-bold uppercase tracking-widest rounded-t-xl transition-all border-b-2 -mb-px ${
                      tab === t.id
                        ? "text-foreground border-foreground bg-background"
                        : "text-foreground/30 border-transparent hover:text-foreground/60 hover:bg-background/40"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* tab content */}
              <div className="animate-in fade-in duration-500">
                {tab === "trace" && (
                  data.events.length > 0
                    ? <TraceView events={data.events} sessionStart={sessionStart} systemPrompt={data.systemPrompt} />
                    : <p className="text-sm text-foreground/20 p-12 text-center italic">No JSONL trace events captured for this session.</p>
                )}

                {tab === "timeline" && (
                  <TimelineView
                    events={data.events}
                    sessionStart={sessionStart}
                    durationMs={data.durationMs}
                    usage={data.usage}
                  />
                )}

                {tab === "thread" && (
                  <ThreadView
                    systemPrompt={data.systemPrompt}
                    userMessage={data.userMessage}
                    rawResponse={data.rawResponse}
                  />
                )}
              </div>
            </div>

            {/* ── token & cost breakdown ── */}
            {data.usage && (
              <div className="bg-card border border-border rounded-3xl p-10 shadow-sm">
                <h2 className="text-[10px] font-bold text-foreground/30 uppercase tracking-[0.3em] mb-10 px-2">Metric Attribution & Ingress</h2>
                <div className="space-y-8 mb-12">
                  {[
                    { label: "Input Payload",  tokens: data.usage.input,     cost: data.usage.cost.input,     barColor: "bg-foreground/20" },
                    { label: "Model Generation", tokens: data.usage.output,    cost: data.usage.cost.output,    barColor: "bg-foreground"   },
                    ...(data.usage.cacheRead > 0
                      ? [{ label: "Cache Optimization", tokens: data.usage.cacheRead, cost: data.usage.cost.cacheRead, barColor: "bg-foreground/10" }]
                      : []),
                  ].map(({ label, tokens, cost, barColor }) => {
                    const pct = (tokens / data.usage!.totalTokens) * 100;
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-3 px-1">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${barColor}`} />
                            <span className="text-[11px] font-bold text-foreground/60 uppercase tracking-widest">{label}</span>
                          </div>
                          <div className="flex items-center gap-8">
                            <span className="text-sm font-bold font-mono text-foreground tracking-tight">{fmt(tokens)}</span>
                            <span className="text-[10px] text-foreground/30 font-mono font-bold w-24 text-right uppercase tracking-widest">{fmtCost(cost)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-foreground/[0.03] rounded-full overflow-hidden border border-border/50">
                          <div className={`h-full ${barColor} rounded-full transition-all duration-700 ease-out`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-border pt-10 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest mb-2">Aggregate Payload</p>
                    <p className="text-4xl font-bold font-mono text-foreground tracking-tighter">{fmt(data.usage.totalTokens)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest mb-2">Net Operational Cost</p>
                    <p className="text-4xl font-bold font-mono text-emerald-800 tracking-tighter">{fmtCost(data.usage.cost.total)}</p>
                    <p className="text-[9px] font-bold text-foreground/20 mt-3 uppercase tracking-widest">{data.model} · {data.provider}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
