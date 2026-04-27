"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Plane,
  Calendar,
  Upload,
  RefreshCw,
  Settings,
  Shield,
  Activity,
  BarChart3,
  HelpCircle,
  ChevronDown,
  Check,
  Moon,
  Sun,
} from "lucide-react";

const MONTHS = [
  "March 2026 (Current)",
  "February 2026",
  "January 2026",
  "December 2025",
  "November 2025",
  "October 2025",
];

function toPeriod(month: string) {
  return month.replace(" (Current)", "");
}

function fromPeriod(period: string) {
  return MONTHS.find((m) => toPeriod(m) === period) ?? MONTHS[0];
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return MONTHS[0];
  });
  const [monthOpen, setMonthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const monthRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDark() {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("zeus-dark-mode", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("zeus-dark-mode", "light");
    }
  }

  useEffect(() => {
    function tick() {
      const now = new Date();
      setDateStr(now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "short",
        day: "numeric",
      }));
      setTimeStr(now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }));
    }
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (monthRef.current && !monthRef.current.contains(e.target as Node)) {
        setMonthOpen(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Sync selector from URL when on operations page
  useEffect(() => {
    if (pathname === "/operations") {
      const period = searchParams.get("period");
      if (period) setSelectedMonth(fromPeriod(period));
    }
  }, [pathname, searchParams]);

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    router.refresh();
    setTimeout(() => {
      window.location.reload();
    }, 300);
  }

  return (
    <div className="px-8 pt-8 pb-4 sticky top-0 z-50">
      <nav className="bg-background/40 backdrop-blur-2xl border border-border text-foreground px-8 py-5 rounded-3xl flex items-center gap-8 shadow-sm">
        {/* Logo + Title */}
        <Link href="/admin" className="flex items-center gap-5 mr-4 group">
          <div className="bg-foreground p-3 rounded-2xl shadow-xl shadow-foreground/10 group-hover:rotate-12 transition-all">
            <Plane size={20} className="text-background" />
          </div>
          <span className="font-serif-elegant text-3xl tracking-tight text-foreground">Zeus</span>
        </Link>

        {/* Date */}
        <div className="hidden lg:flex flex-col ml-6 border-l border-border pl-8">
          <span className="text-foreground/30 text-[10px] font-bold uppercase tracking-[0.3em]">{dateStr}</span>
          <span className="text-foreground/80 text-sm font-bold font-serif-elegant">{timeStr}</span>
        </div>

        <div className="flex-1" />

        {/* Month Selector */}
        <div className="relative" ref={monthRef}>
          <button
            type="button"
            onClick={() => setMonthOpen((v) => !v)}
            className="flex items-center gap-4 border border-border rounded-2xl px-6 py-3 text-sm bg-accent/30 hover:bg-accent/50 transition-all text-foreground/80 shadow-sm group"
          >
            <Calendar size={18} className="text-foreground/40 group-hover:text-foreground/60 transition-colors" />
            <span className="font-bold tracking-tight">{selectedMonth}</span>
            <ChevronDown size={14} className={`text-foreground/30 transition-transform duration-300 ${monthOpen ? 'rotate-180' : ''}`} />
          </button>
          {monthOpen && (
            <div className="absolute right-0 mt-4 w-72 bg-background/95 backdrop-blur-2xl border border-border text-foreground rounded-3xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 p-2">
              {MONTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setSelectedMonth(m);
                    setMonthOpen(false);
                    if (pathname === "/operations") {
                      router.push(`/operations?period=${encodeURIComponent(toPeriod(m))}`);
                    }
                  }}
                  className={`w-full text-left px-6 py-4 text-sm rounded-2xl flex items-center justify-between transition-all ${
                    m === selectedMonth 
                      ? "bg-foreground text-background font-bold shadow-lg" 
                      : "text-foreground/60 hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <span className="font-serif-elegant text-base">{m}</span>
                  {m === selectedMonth && <Check size={16} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center gap-4 border-l border-border pl-8 ml-4">
          <button
            type="button"
            onClick={() => router.push("/upload-reports")}
            className={`flex items-center gap-4 rounded-2xl px-7 py-3 text-sm font-bold transition-all ${
              pathname === "/upload-reports" 
                ? "bg-foreground text-background shadow-xl scale-[1.02]" 
                : "text-foreground/40 hover:text-foreground hover:bg-accent/40"
            }`}
          >
            <Upload size={18} />
            <span className="uppercase tracking-widest text-[11px]">Upload Util Reports</span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/operations")}
            className={`flex items-center gap-4 rounded-2xl px-7 py-3 text-sm font-bold transition-all ${
              pathname === "/operations" 
                ? "bg-foreground text-background shadow-xl scale-[1.02]" 
                : "text-foreground/40 hover:text-foreground hover:bg-accent/40"
            }`}
          >
            <BarChart3 size={18} />
            <span className="uppercase tracking-widest text-[11px]">Operations</span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 ml-4">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh data"
            className={`p-3.5 rounded-2xl border border-border bg-accent/30 text-foreground/40 hover:bg-accent/60 hover:text-foreground transition-all shadow-sm ${
              refreshing ? "opacity-40" : ""
            }`}
          >
            <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
          </button>

          <button
            type="button"
            onClick={toggleDark}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            className="p-3.5 rounded-2xl border border-border bg-accent/30 text-foreground/40 hover:bg-accent/60 hover:text-foreground transition-all shadow-sm"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className="relative" ref={settingsRef}>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              title="Settings"
              className="p-3.5 rounded-2xl border border-border bg-accent/30 text-foreground/40 hover:bg-accent/60 hover:text-foreground transition-all shadow-sm"
            >
              <Settings size={18} />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 mt-4 w-64 bg-background/95 backdrop-blur-2xl border border-border rounded-3xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 p-2">
                <div className="px-6 pt-5 pb-3">
                  <p className="text-[10px] font-bold text-foreground/20 tracking-[0.3em] uppercase">Core Systems</p>
                </div>
                {[
                  { icon: Settings, label: "Admin Panel", href: "/admin" },
                  { icon: Activity, label: "Infrastructure", href: "#" },
                  { icon: Shield, label: "Data Governance", href: "#" },
                ].map(({ icon: Icon, label, href }) => (
                  <Link
                    key={label}
                    href={href}
                    onClick={() => setSettingsOpen(false)}
                    className="flex items-center gap-5 px-6 py-4 text-sm text-foreground/60 hover:bg-accent/50 hover:text-foreground rounded-2xl transition-all"
                  >
                    <Icon size={18} className="text-foreground/30" />
                    <span className="font-serif-elegant text-base">{label}</span>
                  </Link>
                ))}
                <div className="border-t border-border mx-4 my-2" />
                <Link
                  href="#"
                  onClick={() => setSettingsOpen(false)}
                  className="flex items-center gap-5 px-6 py-5 text-sm text-foreground/60 hover:bg-accent/50 hover:text-foreground rounded-2xl transition-all"
                >
                  <HelpCircle size={18} className="text-foreground/30" />
                  <span className="font-serif-elegant text-base">Documentation</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
