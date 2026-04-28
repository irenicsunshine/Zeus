"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

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

function ValidatePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  
  const assetId = params.assetId as string;
  const period = searchParams.get("period") || "March 2026";

  const [components, setComponents] = useState<any[]>([]);
  const [msn, setMsn] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (localStorage.getItem("zeus-dark-mode") !== "light") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const opsRes = await fetch(`/api/get-operations?period=${encodeURIComponent(period)}`);
        const opsJson = await opsRes.json();
        
        let foundMsn = "";
        let foundComps: any[] = [];

        // Search through airlines -> aircraft to find the matching assetId
        for (const airline of opsJson.airlines || []) {
          for (const ac of airline.aircraft || []) {
            if (ac.id.toString() === assetId) {
              foundMsn = ac.name;
              foundComps = ac.components || [];
              break;
            }
          }
        }
        
        setMsn(foundMsn);
        setComponents(foundComps);
      } catch (err) {
        console.error("Failed to fetch operations data", err);
      } finally {
        setLoading(false);
      }
    }

    if (assetId) {
      fetchData();
    }
  }, [assetId, period]);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col font-sans transition-colors duration-500">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border px-8 py-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <Link 
            href="/operations"
            className="p-2.5 hover:bg-accent rounded-full transition-all border border-transparent hover:border-border group"
          >
            <ArrowLeft className="w-5 h-5 text-foreground/40 group-hover:text-foreground" />
          </Link>
          <div>
            <h1 className="text-xl font-serif-elegant text-foreground flex items-center gap-4">
              Data Validation
              <span className="px-3 py-1 rounded-full bg-foreground text-background text-[10px] font-bold uppercase tracking-widest">
                {period}
              </span>
            </h1>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/20 mt-1">
              MSN: <span className="text-foreground/60 font-serif-elegant normal-case tracking-normal text-sm ml-2">{msn || "Retrieving..."}</span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Link
            href="/operations"
            className="px-8 py-2.5 rounded-full bg-foreground text-background text-[10px] font-bold uppercase tracking-widest hover:bg-foreground/80 transition-all shadow-lg shadow-foreground/10 flex items-center gap-3"
          >
            <CheckCircle2 className="w-4 h-4" />
            Finish & Archive
          </Link>
        </div>
      </header>

      {/* Main Split View */}
      <main className="flex-1 flex overflow-hidden">

        {/* Left Pane: PDF Viewer */}
        <div className="w-1/2 border-r border-border flex flex-col bg-accent/20 min-h-0">
          <div className="px-6 py-4 border-b border-border bg-background/50 flex items-center gap-3 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-foreground/20"></div>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">Primary Document</h2>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-6 custom-scrollbar">
            <div className="w-full h-full min-h-[75vh] rounded-2xl overflow-hidden border border-border shadow-xl">
              {msn ? (
                <iframe
                  src={`/api/document?assetId=${assetId}&period=${encodeURIComponent(period)}#toolbar=0&view=FitH`}
                  className="w-full h-full min-h-[75vh]"
                  title="PDF Document"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-foreground/20 gap-4">
                  <div className="w-10 h-10 border-2 border-foreground/5 border-t-foreground/20 rounded-full animate-spin"></div>
                  <p className="text-[10px] font-bold uppercase tracking-widest">Loading Manifest...</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Pane: Extracted Details */}
        <div className="w-1/2 flex flex-col bg-background min-h-0">
          <div className="px-6 py-4 border-b border-border bg-background/50 flex items-center gap-3 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-foreground"></div>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-foreground">Extracted Telemetry</h2>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-accent/5">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-foreground/20 gap-6">
                <div className="w-12 h-12 border-2 border-foreground/5 border-t-foreground/20 rounded-full animate-spin"></div>
                <p className="text-[10px] font-bold uppercase tracking-widest">Synchronizing Records...</p>
              </div>
            ) : components.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-foreground/10 gap-4">
                <AlertCircle className="w-12 h-12" />
                <p className="font-serif-elegant text-xl">No component data mapped</p>
              </div>
            ) : (
              components.map((comp, idx) => (
                <div 
                  key={idx}
                  className="bg-card border border-border rounded-2xl p-6 hover:border-foreground/10 transition-all shadow-sm group"
                >
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-2xl font-serif-elegant text-foreground">{comp.type}</h3>
                      <p className="text-[10px] font-mono font-bold text-foreground/30 mt-1 uppercase tracking-tight">SN: {comp.serial}</p>
                    </div>
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                      comp.status === "Approved" ? "bg-emerald-500/5 text-emerald-700 border-emerald-500/10" :
                      comp.status === "Ready for Review" ? "bg-foreground text-background border-foreground" :
                      "bg-accent text-foreground/40 border-border"
                    }`}>
                      {comp.status}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Total Time (TSN)", value: comp.tsn, highlight: false },
                      { label: "Total Cycles (CSN)", value: comp.csn, highlight: false },
                      { label: "Flight Hours", value: toDecimalHours(comp.flightHours), highlight: true },
                      { label: "Flight Cycles", value: comp.flightCycles, highlight: true }
                    ].map((stat, sIdx) => (
                      <div key={sIdx} className="bg-background/40 p-5 rounded-xl border border-border group-hover:bg-background/80 transition-all">
                        <p className="text-[9px] font-bold text-foreground/20 uppercase tracking-[0.2em] mb-2">{stat.label}</p>
                        <p className={`font-mono text-lg font-bold ${stat.highlight ? "text-foreground" : "text-foreground/40"}`}>
                          {stat.value || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ValidatePageWrapper() {
  return (
    <Suspense fallback={null}>
      <ValidatePage />
    </Suspense>
  );
}
