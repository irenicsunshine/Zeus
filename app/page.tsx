import Link from "next/link";
import Navbar from "./components/Navbar";
import { Plane, ShieldCheck, BarChart3, Upload, ArrowRight, Zap } from "lucide-react";

const FEATURES = [
  {
    icon: Upload,
    title: "Automated Ingestion",
    description: "Upload monthly PDF utilization reports and let the system parse, extract, and map every component automatically.",
  },
  {
    icon: ShieldCheck,
    title: "Data Validation",
    description: "Side-by-side validation view compares the original document against extracted figures before anything is committed.",
  },
  {
    icon: BarChart3,
    title: "Fleet Operations",
    description: "Live per-aircraft and per-component status across the entire lessee fleet, filterable by cohort and period.",
  },
  {
    icon: Zap,
    title: "Instant Matching",
    description: "Serial-number-based matching links extracted data to the correct lessee asset in the database automatically.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center pt-20 pb-32">
        {/* Badge */}
        <div className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <span className="px-5 py-2 rounded-full border border-border bg-card/50 text-[10px] font-bold uppercase tracking-[0.3em] text-foreground/40">
            Intelligent Asset Management
          </span>
        </div>

        {/* Hero Title */}
        <h1 className="text-6xl md:text-8xl font-serif-elegant text-foreground max-w-4xl leading-[1.1] mb-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
          The future of aircraft lessee operations.
        </h1>

        {/* Description */}
        <p className="text-lg md:text-xl text-foreground/50 max-w-2xl mb-14 leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500">
          A high-fidelity platform for fleet synchronization, automated reporting, and real-time validation. 
          Built for the modern aviation landscape.
        </p>

        {/* CTA Section */}
        <div className="flex flex-col sm:flex-row items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-700">
          <Link
            href="/upload-reports"
            className="group flex items-center gap-3 bg-foreground text-background px-10 py-4 rounded-full font-bold text-sm hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
          >
            Launch Ingestion
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/operations"
            className="group flex items-center gap-3 bg-card border border-border text-foreground px-10 py-4 rounded-full font-bold text-sm hover:bg-accent transition-all"
          >
            View Fleet
          </Link>
        </div>

        {/* Features Grid */}
        <div className="mt-32 w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 gap-5 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group text-left bg-card border border-border rounded-2xl p-8 hover:border-foreground/20 hover:bg-accent/40 transition-all"
            >
              <div className="p-3 bg-background border border-border rounded-xl inline-flex mb-5 group-hover:scale-105 transition-transform">
                <Icon size={20} className="text-foreground/50" />
              </div>
              <h3 className="font-serif-elegant text-xl text-foreground mb-2">{title}</h3>
              <p className="text-sm text-foreground/40 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/20 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4">
            <div className="bg-foreground p-2 rounded-lg">
               <Plane size={16} className="text-background" />
            </div>
            <span className="font-serif-elegant text-xl tracking-tight">Zeus</span>
          </div>

          <nav className="flex items-center gap-10">
            {[
              { label: "Features", href: "#" },
              { label: "Architecture", href: "#" },
              { label: "Support", href: "#" }
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-[10px] font-bold text-foreground/40 hover:text-foreground transition-colors uppercase tracking-[0.2em]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="text-[10px] uppercase tracking-[0.2em] text-foreground/30 font-bold">
            © 2026 Grant Thornton · <span className="opacity-50 font-normal">Zeus v1.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
