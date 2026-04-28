"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "../components/Navbar";
import { Search, ChevronDown, ChevronRight, MessageSquare, Pencil, Loader2, InboxIcon, Upload, FileText, CheckCircle, Database, AlertCircle, Activity } from "lucide-react";

type StatusFilter = "All" | "Ready for Review" | "To Check" | "Approved" | "Not Received";
type ObligationFilter = "All" | "MR" | "Non-MR";

interface Component {
  type: string;
  serial: string;
  tsn: string;
  csn: string;
  flightHours: string;
  flightCycles: string;
  utilStatus: string;
}

interface Aircraft {
  id: number;
  name: string;
  registration: string;
  obligation: string;
  status: string;
  hasPdf: boolean;
  components: Component[];
}

interface Airline {
  name: string;
  aircraftCount: number;
  aircraft: Aircraft[];
}

const STATUS_FILTERS: StatusFilter[] = ["All", "Ready for Review", "To Check", "Approved", "Not Received"];
const OBLIGATION_FILTERS: ObligationFilter[] = ["All", "MR", "Non-MR"];

function toDecimalHours(value: string): string {
  if (!value) return "—";
  if (value.includes(":")) {
    const [h, m] = value.split(":");
    const hours = parseInt(h, 10);
    const mins = parseInt(m, 10);
    if (!isNaN(hours) && !isNaN(mins)) {
      return (hours + mins / 60).toFixed(2);
    }
  }
  return value;
}

function utilBadge(status: string) {
  const s = status?.toLowerCase() || "";
  if (s.includes("no util"))
    return <span className="text-xs font-semibold bg-accent text-foreground/40 rounded-lg px-2.5 py-1 border border-border">No Utils</span>;
  if (s.includes("approved"))
    return <span className="text-xs font-semibold bg-emerald-500/10 text-emerald-700 rounded-lg px-2.5 py-1 border border-emerald-500/20">Approved</span>;
  if (s.includes("check"))
    return <span className="text-xs font-semibold bg-amber-500/10 text-amber-700 rounded-lg px-2.5 py-1 border border-amber-500/20">To Check</span>;
  if (s.includes("review"))
    return <span className="text-xs font-semibold bg-blue-500/10 text-blue-700 rounded-lg px-2.5 py-1 border border-blue-500/20">Ready for Review</span>;
  return <span className="text-xs font-semibold bg-foreground/5 text-foreground/40 rounded-lg px-2.5 py-1 border border-border">Not Started</span>;
}

function countByStatus(components: Component[]) {
  let notStarted = 0, noUtils = 0, review = 0, toCheck = 0, approved = 0;
  for (const c of components) {
    const s = c.utilStatus?.toLowerCase() || "";
    if (s.includes("no util")) noUtils++;
    else if (s.includes("approved")) approved++;
    else if (s.includes("check")) toCheck++;
    else if (s.includes("review")) review++;
    else notStarted++;
  }
  return { notStarted, noUtils, review, toCheck, approved };
}

function AircraftRow({ aircraft, period }: { aircraft: Aircraft; period: string }) {
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  function handleApprove() {
    setApproving(true);
    setTimeout(() => { setApproving(false); setIsApproved(true); }, 800);
  }

  return (
    <div className="mx-6 mb-3 border border-border rounded-2xl overflow-hidden bg-background shadow-sm transition-all hover:border-foreground/20 hover:shadow-md">
      <div className="flex items-center px-5 py-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-3 min-w-0 cursor-pointer group"
        >
          <div className="p-1 rounded-full group-hover:bg-accent transition-colors">
            {expanded
              ? <ChevronDown size={17} className="text-foreground/40 shrink-0" />
              : <ChevronRight size={17} className="text-foreground/20 shrink-0" />}
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground tracking-wide">{aircraft.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-mono text-foreground/40 bg-accent px-2 py-0.5 rounded border border-border">{aircraft.registration}</span>
              <span className="text-xs text-foreground/20">·</span>
              <span className="text-xs text-foreground/40">Obligation: <span className="text-foreground/60">{aircraft.obligation}</span></span>
            </div>
          </div>
        </button>

        <div className="flex-1" />

        {isApproved ? (
          <div className="flex items-center gap-2 mr-4 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
            <CheckCircle size={14} className="text-emerald-700" />
            <span className="text-sm font-medium text-emerald-700">Load Approved</span>
          </div>
        ) : (
          <span className="text-sm font-medium text-foreground/30 mr-5 bg-accent/50 px-3 py-1 rounded-lg border border-border">{aircraft.status}</span>
        )}

        <a
          href={aircraft.hasPdf ? `/operations/validate/${aircraft.id}?period=${encodeURIComponent(period)}` : undefined}
          title={aircraft.hasPdf ? "Open validation view" : "Upload a utilization report for this aircraft first"}
          className={`mr-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border flex items-center gap-2 ${
            aircraft.hasPdf
              ? "bg-blue-500/10 text-blue-700 border-blue-500/20 hover:bg-blue-500/20"
              : "bg-accent/50 text-foreground/20 border-border cursor-not-allowed pointer-events-none select-none"
          }`}
        >
          Validate
        </a>

        <a
          href={aircraft.hasPdf ? `/operations/logs/${aircraft.id}?period=${encodeURIComponent(period)}` : undefined}
          title={aircraft.hasPdf ? "View extraction logs" : "No logs available — upload a utilization report first"}
          className={`mr-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border flex items-center gap-2 ${
            aircraft.hasPdf
              ? "bg-violet-500/10 text-violet-700 border-violet-500/20 hover:bg-violet-500/20"
              : "bg-accent/50 text-foreground/20 border-border cursor-not-allowed pointer-events-none select-none"
          }`}
        >
          Logs
        </a>

        <button type="button" title="Comment" className="p-2 text-foreground/30 hover:text-foreground/60 hover:bg-accent rounded-lg transition-colors mr-3">
          <MessageSquare size={17} />
        </button>

        {!isApproved && (
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving}
            className={`text-background text-sm font-semibold rounded-xl px-5 py-2 transition-all shadow-md ${
              approving
                ? "bg-emerald-600/50 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 border border-emerald-500/30"
            }`}
          >
            {approving ? "Approving..." : "Approve Load"}
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border/60 bg-accent/10 px-5 pb-5 pt-3 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
          {aircraft.components.length === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl">
              <p className="text-sm text-foreground/30 font-medium">No component data available.</p>
            </div>
          ) : (
            aircraft.components.map((comp, i) => (
              <div key={i} className="border border-border rounded-xl px-5 py-3.5 flex items-center gap-5 bg-background hover:bg-accent/20 transition-colors shadow-sm relative group overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-foreground/10 to-foreground/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-l-xl" />

                <div className="w-48 shrink-0 pl-2">
                  <p className="text-sm font-semibold text-foreground">{comp.type || "—"}</p>
                  <p className="text-xs font-mono text-foreground/30 mt-1">{comp.serial || "—"}</p>
                </div>
                <div className="w-28 shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/30 mb-0.5">TSN</p>
                  <p className="text-sm font-semibold text-foreground/80 font-mono">{comp.tsn || "—"}</p>
                </div>
                <div className="w-24 shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/30 mb-0.5">CSN</p>
                  <p className="text-sm font-semibold text-foreground/80 font-mono">{comp.csn || "—"}</p>
                </div>
                <div className="w-32 shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/30 mb-0.5">Flight Hours</p>
                  <p className="text-sm font-medium text-foreground/70">{toDecimalHours(comp.flightHours)}</p>
                </div>
                <div className="w-32 shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/30 mb-0.5">Flight Cycles</p>
                  <p className="text-sm font-medium text-foreground/70">{comp.flightCycles || "—"}</p>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/30 mb-1">Status</p>
                  {utilBadge(comp.utilStatus)}
                </div>
                <button type="button" title="Edit" className="p-2 bg-accent text-foreground/40 hover:text-foreground hover:bg-accent border border-border rounded-lg shrink-0 transition-all shadow-sm">
                  <Pencil size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function OperationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = searchParams.get("period") || "March 2026";

  const [airlines, setAirlines] = useState<Airline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [obligationFilter, setObligationFilter] = useState<ObligationFilter>("All");
  const [expandedAirlines, setExpandedAirlines] = useState<Set<string>>(new Set());
  const [reportCount, setReportCount] = useState(0);
  const [loadedPeriod, setLoadedPeriod] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [opsRes, reportsRes] = await Promise.all([
        fetch(`/api/get-operations?period=${encodeURIComponent(period)}`),
        fetch(`/api/upload-reports?period=${encodeURIComponent(period)}`),
      ]);
      const opsJson = await opsRes.json();
      if (opsJson.success) {
        setAirlines(opsJson.airlines);
        if (opsJson.airlines.length > 0) {
          setExpandedAirlines(new Set([opsJson.airlines[0].name]));
        }
        setLoadedPeriod(period);
      } else {
        setError(opsJson.error || "Failed to load data");
        setLoadedPeriod(period);
      }

      const reportsJson = await reportsRes.json();
      if (reportsJson.success) {
        setReportCount(reportsJson.reports?.length || 0);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleAirline(name: string) {
    setExpandedAirlines((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const filtered = airlines.map((a) => {
    const term = search.toLowerCase();
    const matchingAircraft = a.aircraft.filter((ac) => {
      const matchesSearch = search === "" ||
        a.name.toLowerCase().includes(term) ||
        ac.name.toLowerCase().includes(term) ||
        ac.registration.toLowerCase().includes(term) ||
        ac.components.some((c) => c.serial.toLowerCase().includes(term));
      if (!matchesSearch) return false;
      if (obligationFilter !== "All") {
        const obs = ac.obligation.toLowerCase().replace(/[^a-z]/g, "");
        if (obs !== obligationFilter.toLowerCase().replace(/[^a-z]/g, "")) return false;
      }
      if (statusFilter !== "All") {
        const acCounts = countByStatus(ac.components);
        if (statusFilter === "Ready for Review" && acCounts.review === 0) return false;
        if (statusFilter === "To Check" && acCounts.toCheck === 0) return false;
        if (statusFilter === "Approved" && acCounts.approved === 0) return false;
        if (statusFilter === "Not Received" && acCounts.notStarted === 0 && acCounts.noUtils === 0) return false;
      }
      return true;
    });
    return matchingAircraft.length > 0 ? { ...a, aircraftCount: matchingAircraft.length, aircraft: matchingAircraft } : null;
  }).filter(Boolean) as Airline[];

  const totalAssets = filtered.reduce((s, a) => s + a.aircraftCount, 0);
  const allComponents = filtered.flatMap((a) => a.aircraft.flatMap((ac) => ac.components));
  const globalCounts = countByStatus(allComponents);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-500">
      <Navbar />

      <main className="px-6 py-8 max-w-[1600px] mx-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-serif-elegant text-foreground">Operations Control</h1>
            <p className="text-foreground/40 mt-2 text-sm max-w-xl leading-relaxed">
              Track and verify monthly utilization reports across all active lessee assets in the global fleet.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-card border border-border rounded-xl flex items-center gap-3 shadow-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
              </span>
              <span className="text-sm font-medium text-foreground/60">System Online</span>
            </div>
          </div>
        </div>

        {/* Search + status filters */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
          <div className="relative flex-1 w-full max-w-md">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30" />
            <input
              type="text"
              placeholder="Search airlines, MSN, registration..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-border rounded-xl text-sm bg-background text-foreground placeholder:text-foreground/20 outline-none focus:border-foreground/30 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap uppercase tracking-wide ${
                  statusFilter === f
                    ? "bg-foreground text-background border-foreground shadow-sm"
                    : "bg-card text-foreground/40 border-border hover:border-foreground/20 hover:bg-accent"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Period bar + obligation filter */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-4">
            <div className="bg-background px-3 py-1.5 rounded-lg border border-border shadow-inner">
              <span className="text-sm font-semibold text-foreground/60">{period} Cohort</span>
            </div>
            {!loading && loadedPeriod === period && reportCount > 0 && (
              <span className="flex items-center gap-2 text-xs font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 rounded-lg px-4 py-2">
                <FileText size={13} />
                {reportCount} verified report{reportCount !== 1 ? "s" : ""}
              </span>
            )}
            {!loading && loadedPeriod === period && reportCount === 0 && airlines.length > 0 && (
              <button
                type="button"
                onClick={() => router.push("/upload-reports")}
                className="flex items-center gap-2 text-xs font-semibold bg-amber-500/10 text-amber-700 border border-amber-500/20 rounded-lg px-4 py-2 hover:bg-amber-500/20 transition-all"
              >
                <Upload size={13} />
                Action Required: Upload PDFs
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 mt-4 md:mt-0">
            <span className="text-sm text-foreground/40 font-medium">Obligation:</span>
            <div className="flex items-center bg-background p-1 rounded-xl border border-border shadow-inner">
              {OBLIGATION_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setObligationFilter(f)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    obligationFilter === f
                      ? "bg-foreground text-background shadow-sm"
                      : "text-foreground/40 hover:text-foreground/70"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats row */}
        {!loading && loadedPeriod === period && airlines.length > 0 && (
          <div className="flex items-center justify-between mb-4 px-2">
            <span className="text-sm text-foreground/30">
              Showing <span className="text-foreground/60 font-medium">{filtered.length}</span> of {airlines.length} airlines
            </span>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-foreground/40">
                Total Assets: <span className="font-bold text-foreground">{totalAssets}</span>
              </span>
              {globalCounts.notStarted > 0 && (
                <span className="text-red-700 font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                  Pending: {globalCounts.notStarted}
                </span>
              )}
              {globalCounts.noUtils > 0 && (
                <span className="text-foreground/40 font-medium">No Utils: {globalCounts.noUtils}</span>
              )}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 text-foreground/30">
            <Loader2 size={36} className="animate-spin mb-4" />
            <p className="text-sm font-medium">Synchronizing fleet data...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center max-w-2xl mx-auto mt-12">
            <AlertCircle size={28} className="text-red-600 mx-auto mb-4" />
            <p className="text-base font-medium text-red-800">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && loadedPeriod === period && airlines.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-foreground/30 bg-card rounded-2xl border border-border shadow-sm max-w-3xl mx-auto mt-8">
            <div className="h-20 w-20 bg-background rounded-full flex items-center justify-center mb-6 border border-border shadow-inner">
              <InboxIcon size={36} className="text-foreground/20" />
            </div>
            <h2 className="text-2xl font-serif-elegant text-foreground mb-3">No Fleet Operations Found</h2>
            <p className="text-sm text-foreground/40 max-w-md text-center leading-relaxed">
              Initialize the pipeline to start tracking utilization reports and monitoring asset status.
            </p>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              {[
                { icon: Database, label: "1. Sync Database",   desc: "Upload the monthly lessee Excel snapshot in Admin Settings.", color: "text-foreground/50" },
                { icon: Upload,   label: "2. Upload Reports",  desc: "Submit signed PDF utilization reports via the upload portal.", color: "text-foreground/50" },
                { icon: Activity, label: "3. Track Status",    desc: "Return here to monitor extraction progress and verify compliance.", color: "text-foreground/50" },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="bg-background border border-border rounded-xl p-5 hover:border-foreground/20 transition-colors">
                  <Icon size={20} className="text-foreground/30 mb-3" />
                  <p className="text-sm font-semibold text-foreground mb-1">{label}</p>
                  <p className="text-xs text-foreground/40 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="mt-10 bg-foreground text-background text-sm font-bold rounded-full px-8 py-3 hover:bg-foreground/80 transition-all shadow-lg"
            >
              Go to Admin Settings
            </button>
          </div>
        )}

        {/* Airline cards */}
        {!loading && !error && loadedPeriod === period && filtered.map((airline) => {
          const isFiltering = search !== "" || statusFilter !== "All" || obligationFilter !== "All";
          const isExpanded = isFiltering || expandedAirlines.has(airline.name);
          const allComps = airline.aircraft.flatMap((a) => a.components);
          const counts = countByStatus(allComps);
          return (
            <div key={airline.name} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden mb-4 transition-all hover:border-foreground/20">
              <button
                type="button"
                onClick={() => toggleAirline(airline.name)}
                className="w-full flex items-center gap-4 px-6 py-5 hover:bg-accent/40 transition-colors text-left cursor-pointer group"
              >
                <div className="p-1.5 rounded-lg bg-background border border-border group-hover:bg-accent transition-colors">
                  {isExpanded
                    ? <ChevronDown size={18} className="text-foreground/40" />
                    : <ChevronRight size={18} className="text-foreground/20" />}
                </div>

                <span className="font-serif-elegant text-xl text-foreground">{airline.name}</span>
                <span className="text-xs font-bold text-foreground/40 bg-background border border-border rounded-full px-3 py-1 uppercase tracking-wide">
                  {airline.aircraftCount} Aircraft
                </span>

                <div className="flex-1" />

                <div className="hidden md:flex items-center gap-5">
                  {counts.noUtils > 0 && (
                    <span className="text-xs font-medium text-foreground/30">No Utils: <span className="text-foreground/50">{counts.noUtils}</span></span>
                  )}
                  {counts.notStarted > 0 && (
                    <span className="text-xs font-semibold text-red-700 bg-red-500/10 px-3 py-1 rounded-lg border border-red-500/20 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                      Pending: {counts.notStarted}
                    </span>
                  )}
                  {counts.review > 0 && (
                    <span className="text-xs font-semibold text-blue-700 bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20">
                      Review: {counts.review}
                    </span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border/60 pt-4 pb-2 bg-accent/5">
                  {airline.aircraft.map((ac) => (
                    <AircraftRow key={ac.id} aircraft={ac} period={period} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}

export default function OperationsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <OperationsPage />
    </Suspense>
  );
}
