"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import { Download, FileSpreadsheet, Info, X, Upload, CheckCircle, ChevronDown, ChevronRight, Database, AlertCircle, Clock } from "lucide-react";

interface Component {
  type: string;
  serialNumber: string;
  lastUtilizationDate: string;
  flightHours: string;
  flightCycles: string;
  apuHours: string;
  apuCycles: string;
  tsnAtPeriod: string;
  csnAtPeriod: string;
  tsnAtPeriodEnd: string;
  csnAtPeriodEnd: string;
  lastTsnCsnUpdate: string;
  lastTsnUtilization: string;
  lastCsnUtilization: string;
  attachmentStatus: string;
  engineThrust: string;
  status: string;
  utilReportStatus: string;
  asset_status: string;
  derate: string;
}

interface LesseeAsset {
  name: string;
  serialNumber: string;
  registrationNumber: string;
  validation_status: string;
  report_status: string;
  obligation_status: string;
  components: Component[];
}

interface LesseeGroup {
  lesseeName: string;
  assets: LesseeAsset[];
}

interface ParsedData {
  lessees: LesseeGroup[];
}

interface SummaryRow {
  name: string;
  assets: number;
  components: number;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatUploadDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function AdminPage() {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploaded, setUploaded] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [existingUpload, setExistingUpload] = useState<{ uploadedAt: string; fileName: string } | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [forceUnlocked, setForceUnlocked] = useState(false);
  const [dbData, setDbData] = useState<ParsedData | null>(null);
  const [dbSummary, setDbSummary] = useState<SummaryRow[]>([]);

  const checkExistingData = useCallback(async () => {
    setCheckingExisting(true);
    try {
      const res = await fetch("/api/get-operations?period=March%202026");
      const json = await res.json();
      if (json.success && json.lastUpload) {
        setExistingUpload(json.lastUpload);
        if (json.airlines && json.airlines.length > 0) {
          const lessees = json.airlines.map((a: { name: string; aircraftCount: number; aircraft: { name: string; registration: string; obligation: string; components: { type: string; serial: string; tsn: string; csn: string; flightHours: string; flightCycles: string; utilStatus: string }[] }[] }) => ({
            lesseeName: a.name,
            assets: a.aircraft.map((ac: { name: string; registration: string; obligation: string; components: { type: string; serial: string; tsn: string; csn: string; flightHours: string; flightCycles: string; utilStatus: string }[] }) => ({
              name: ac.name,
              serialNumber: ac.name,
              registrationNumber: ac.registration,
              validation_status: "pending",
              report_status: "Not Started",
              obligation_status: ac.obligation,
              components: ac.components.map((c: { type: string; serial: string; tsn: string; csn: string; flightHours: string; flightCycles: string; utilStatus: string }) => ({
                type: c.type,
                serialNumber: c.serial,
                tsnAtPeriod: c.tsn,
                csnAtPeriod: c.csn,
                flightHours: c.flightHours,
                flightCycles: c.flightCycles,
                utilReportStatus: c.utilStatus,
              })),
            })),
          }));
          setDbData({ lessees });
          setDbSummary(json.airlines.map((a: { name: string; aircraftCount: number; aircraft: { components: unknown[] }[] }) => ({
            name: a.name,
            assets: a.aircraftCount,
            components: a.aircraft.reduce((s: number, ac: { components: unknown[] }) => s + ac.components.length, 0),
          })));
        }
      } else {
        setExistingUpload(null);
        setDbData(null);
        setDbSummary([]);
      }
    } catch {
      // silently fail
    } finally {
      setCheckingExisting(false);
    }
  }, []);

  useEffect(() => {
    checkExistingData();
  }, [checkExistingData]);

  function resetState() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSelectedFile(null);
    setUploaded(false);
    setUploading(false);
    setProgress(0);
    setParseError(null);
    setParsedData(null);
    setSummary([]);
    setSaveResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function pickFile(file: File) {
    resetState();
    setSelectedFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) pickFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) pickFile(file);
  }

  async function handleUpload() {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setProgress(0);
    setParseError(null);

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 90;
        }
        return prev + Math.random() * 12;
      });
    }, 120);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch("/api/parse-excel", {
        method: "POST",
        body: formData,
      });

      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);

      const json = await res.json();
      if (!res.ok || json.error) {
        setParseError(json.error || "Failed to parse Excel file.");
        setUploading(false);
        setUploaded(false);
      } else {
        setParsedData(json.data);
        setSummary(json.summary);
        setUploading(false);
        setUploaded(true);
      }
    } catch (err) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setParseError(String(err));
      setUploading(false);
      setUploaded(false);
    }
  }

  async function handleSave() {
    if (!parsedData || saving) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch("/api/save-lessee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessees: parsedData.lessees,
          period: "March 2026",
          fileName: selectedFile?.name ?? "",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSaveResult({ ok: true, msg: `Saved ${json.insertedAssets} asset(s) and ${json.insertedComponents} component(s) to database.` });
        checkExistingData();
      } else {
        setSaveResult({ ok: false, msg: json.error ?? "Save failed." });
      }
    } catch (err) {
      setSaveResult({ ok: false, msg: String(err) });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const isLocked = existingUpload !== null && !uploaded;

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-500">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-12">
          <h1 className="text-4xl font-serif-elegant text-foreground animate-in fade-in slide-in-from-bottom-4 duration-500">
            Admin Settings
          </h1>
          <div className="h-10 w-10 rounded-full bg-accent/50 border border-border flex items-center justify-center shadow-sm hover:shadow-md transition-all cursor-pointer">
            <Info size={18} className="text-foreground/70" />
          </div>
        </div>

      {checkingExisting ? (
        <div className="bg-accent/20 border border-border rounded-2xl p-20 flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-2 border-foreground/20 border-t-foreground/80 rounded-full animate-spin" />
          <p className="text-foreground/40 font-medium animate-pulse">Synchronizing with database...</p>
        </div>
      ) : (
        <>

        {/* ACS Data Export Card */}
        <div className="bg-card rounded-2xl border border-border p-10 mb-8 hover:border-foreground/20 transition-all group">
          <div className="flex items-start gap-8">
            <div className="p-4 bg-background/50 rounded-xl border border-border group-hover:rotate-3 transition-transform">
              <Download size={28} className="text-foreground/70" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-serif-elegant text-foreground mb-3">ACS Data Export</h2>
              <p className="text-foreground/50 text-sm mb-8 max-w-2xl leading-relaxed">
                Export all aircraft assets and their components from ACS Salesforce. This operation synchronizes your workspace with current fleet operations.
              </p>
              <button type="button" className="flex items-center gap-2 bg-foreground text-background rounded-full px-8 py-3.5 text-sm font-bold hover:bg-foreground/80 transition-all">
                <Download size={18} />
                Export Salesforce Data
              </button>
            </div>
          </div>
        </div>

        {/* Upload Lessee Data Card */}
        <div className="bg-card rounded-2xl border border-border p-10 shadow-sm transition-all">
          <h2 className="text-2xl font-serif-elegant text-foreground mb-8 flex items-center gap-4">
            <div className="p-2.5 bg-background/50 rounded-lg border border-border">
              <FileSpreadsheet size={24} className="text-foreground/70" />
            </div>
            Upload Lessee Data
          </h2>

          {!isLocked && !uploaded && (
            <div className="bg-background/40 border border-border rounded-xl p-6 mb-10 border-l-4 border-l-foreground/20">
              <div className="flex items-start gap-4">
                <Info size={20} className="text-foreground/40 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-foreground uppercase tracking-wider">Period: March 2026</p>
                  <p className="text-sm text-foreground/50 mt-1">Ready for fresh ingestion. No existing records detected for this timeframe.</p>
                </div>
              </div>
            </div>
          )}

          {(() => {
            const displayData = uploaded && parsedData ? parsedData : isLocked && dbData ? dbData : null;
            const displaySummary = uploaded && parsedData ? summary : isLocked ? dbSummary : [];
            const showSaveButton = uploaded && parsedData && !isLocked;
            if (!displayData) return null;
            return (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-600">
                {uploaded && parsedData && !saveResult?.ok && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 mb-8">
                    <p className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
                      <CheckCircle size={16} /> File Processed Successfully
                    </p>
                    <p className="text-sm text-emerald-600/80 mt-1.5 ml-6">Your data has been validated and is ready to save to the database.</p>
                  </div>
                )}

                <div className="bg-card/40 border border-border rounded-xl p-6 mb-10">
                  {showSaveButton && (
                    <div className="flex items-center justify-between mb-8 pb-8 border-b border-border">
                      <div>
                         <h3 className="text-xl font-serif-elegant text-foreground">Review Data</h3>
                         <p className="text-sm text-foreground/40">Audit the extracted payload before committing.</p>
                      </div>
                      <div className="flex items-center gap-4">
                        {saveResult && (
                          <span className={`text-sm font-medium ${saveResult.ok ? "text-emerald-700" : "text-red-700"}`}>
                            {saveResult.msg}
                          </span>
                        )}
                        {!saveResult?.ok && (
                          <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className={`flex items-center gap-2 text-background rounded-full px-8 py-3 text-sm font-bold transition-all shadow-lg ${
                              saving ? "bg-emerald-700/50 cursor-not-allowed" : "bg-foreground hover:bg-foreground/80"
                            }`}
                          >
                            <Database size={16} />
                            {saving ? "Saving..." : "Commit to DB"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="border border-border rounded-xl mb-6 overflow-hidden bg-background/30">
                    <button
                      type="button"
                      onClick={() => setJsonExpanded((v) => !v)}
                      className="w-full flex items-center gap-3 px-6 py-4 text-xs font-bold uppercase tracking-widest text-foreground/50 hover:bg-background/50 transition-colors text-left cursor-pointer"
                    >
                      {jsonExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      {jsonExpanded ? "Hide Source Payload" : "View Source Payload"}
                    </button>
                    {jsonExpanded && (
                      <div className="bg-background border-t border-border p-6 overflow-auto max-h-[400px] custom-scrollbar">
                        <pre className="text-xs text-foreground/60 font-mono leading-relaxed whitespace-pre">
                          {JSON.stringify(displayData, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>

                  <div className="border border-border rounded-xl overflow-hidden bg-background/30">
                    <div className="px-6 py-6 border-b border-border bg-background/20">
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-[0.1em]">Extraction Summary</h3>
                    </div>
                    {displaySummary.length === 0 ? (
                      <p className="px-6 py-10 text-sm text-foreground/30 italic text-center">No matching records found.</p>
                    ) : (
                      <div className="overflow-auto max-h-[350px] custom-scrollbar">
                        <table className="w-full text-sm text-left">
                          <thead className="sticky top-0 bg-background/80 backdrop-blur-md z-10 text-[10px] uppercase tracking-[0.2em] text-foreground/40 border-b border-border">
                            <tr>
                              <th className="px-6 py-4 font-bold">Lessee</th>
                              <th className="px-6 py-4 font-bold text-center">Assets</th>
                              <th className="px-6 py-4 font-bold text-center">Units</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {displaySummary.map((row) => (
                              <tr key={row.name} className="hover:bg-background/40 transition-colors">
                                <td className="px-6 py-5 text-foreground font-medium">{row.name}</td>
                                <td className="px-6 py-5 text-center">
                                   <span className="text-foreground/70 font-mono text-xs">
                                      {row.assets}
                                   </span>
                                </td>
                                <td className="px-6 py-5 text-center">
                                   <span className="text-foreground/70 font-mono text-xs">
                                      {row.components}
                                   </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {existingUpload && (
                  <div className="bg-card border border-border rounded-2xl p-10 mb-10 relative overflow-hidden group">
                    <div className="flex items-start gap-6 relative z-10">
                      <div className="p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                         <CheckCircle size={28} className="text-emerald-700" />
                      </div>
                      <div className="flex-1">
                        <p className="text-2xl font-serif-elegant text-foreground">Ecosystem Synchronized</p>
                        <div className="flex items-center gap-2 mt-4 text-foreground/40">
                          <Clock size={14} />
                          <p className="text-xs font-bold uppercase tracking-widest">
                            March 2026 Batch · {formatUploadDate(existingUpload.uploadedAt)}
                          </p>
                        </div>
                        <p className="text-sm text-foreground/50 mt-6 leading-relaxed">
                          The current data layer is locked to <span className="text-foreground font-semibold italic">"{existingUpload.fileName}"</span>. 
                          Contact support to request a manual override for this period.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {parseError && (
            <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-6 mb-10 flex items-start gap-4 animate-in fade-in">
              <AlertCircle size={20} className="text-red-700 mt-0.5 shrink-0" />
              <div>
                 <p className="text-sm font-bold text-red-700 uppercase tracking-widest mb-1">Critical Parser Error</p>
                 <p className="text-sm text-red-700/70 leading-relaxed">{parseError}</p>
              </div>
            </div>
          )}

          {!isLocked && (
            <div className="border-2 border-border rounded-2xl p-2 bg-background/20 relative overflow-hidden group hover:border-foreground/10 transition-all">
              <div className="p-8 bg-card rounded-[14px]">
                <h3 className="text-xl font-serif-elegant text-foreground mb-2">
                  Select Document for Batch Ingestion
                </h3>
                <p className="text-sm text-foreground/40 mb-10 leading-relaxed">
                  Upload the monthly lessee snapshot (.xlsx). Our forensic parser will validate the schema.
                </p>

                {uploaded ? (
                  <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl flex flex-col items-center justify-center py-20 px-6">
                    <div className="h-20 w-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border border-emerald-500/20">
                       <CheckCircle size={40} className="text-emerald-600" />
                    </div>
                    <p className="text-2xl font-serif-elegant text-emerald-800">Batch Validated</p>
                    <p className="text-xs font-bold text-emerald-600/60 mt-4 uppercase tracking-[0.2em]">
                      {selectedFile?.name}
                    </p>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => !selectedFile && !uploading && inputRef.current?.click()}
                    className={`border border-dashed rounded-xl flex flex-col items-center justify-center py-24 px-6 transition-all bg-background/30 ${
                      selectedFile || uploading ? "cursor-default" : "cursor-pointer hover:bg-background/60"
                    } ${dragOver ? "border-foreground/20 bg-background/80" : "border-foreground/10"}`}
                  >
                    <div className={`h-20 w-20 rounded-full flex items-center justify-center mb-8 transition-colors bg-background border border-border shadow-sm`}>
                       <FileSpreadsheet size={36} className="text-foreground/30" />
                    </div>
                    
                    {selectedFile ? (
                      <div className="text-center w-full max-w-sm px-10">
                        <p className="text-lg font-serif-elegant text-foreground">{selectedFile.name}</p>
                        {uploading && (
                          <div className="mt-10 w-full">
                            <div className="flex justify-between text-[10px] font-bold text-foreground/30 mb-3 uppercase tracking-widest">
                               <span>Synthesizing</span>
                               <span>{Math.min(Math.round(progress), 100)}%</span>
                            </div>
                            <div className="h-1 bg-foreground/5 rounded-full overflow-hidden border border-border/50">
                              <div
                                className="h-full bg-foreground transition-all duration-300 ease-out"
                                style={{ width: `${Math.min(Math.round(progress), 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-lg text-foreground/70 font-serif-elegant">Drop batch file here</p>
                        <p className="text-[10px] font-bold text-foreground/20 mt-8 uppercase tracking-[0.3em]">Click to Browse</p>
                      </div>
                    )}
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      title="Upload Excel file"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                )}

                {!uploaded && (
                  <div className="flex items-center justify-end gap-6 mt-10">
                    <button
                      type="button"
                      onClick={resetState}
                      disabled={uploading}
                      className="text-[10px] font-bold text-foreground/40 hover:text-foreground uppercase tracking-widest transition-colors"
                    >
                      Clear Batch
                    </button>
                    <button
                      type="button"
                      onClick={handleUpload}
                      className={`rounded-full px-10 py-3.5 text-sm font-bold text-background transition-all ${
                        selectedFile && !uploading
                          ? "bg-foreground hover:bg-foreground/80"
                          : "bg-foreground/10 text-foreground/20 cursor-not-allowed"
                      }`}
                      disabled={!selectedFile || uploading}
                    >
                      {uploading ? "Analyzing..." : "Begin Ingestion"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* File Requirements */}
          <div className="mt-12 pt-10 border-t border-border">
             <div className="bg-accent/20 border border-border rounded-xl p-8 shadow-inner">
                <p className="text-xs font-bold text-foreground/40 mb-6 flex items-center gap-2 uppercase tracking-[0.2em]">
                   <Info size={14} /> Protocol Requirements
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="flex items-start gap-4 p-4 bg-card/60 rounded-xl border border-border">
                      <div className="h-6 w-6 rounded bg-foreground/5 flex items-center justify-center shrink-0 border border-border text-[10px] font-bold text-foreground/60">01</div>
                      <p className="text-sm text-foreground/60 leading-relaxed">Sheet must be strictly named: <code className="bg-accent text-foreground font-mono text-xs px-2 py-0.5 rounded border border-border">DB_LW_Extract</code></p>
                   </div>
                   <div className="flex items-start gap-4 p-4 bg-card/60 rounded-xl border border-border">
                      <div className="h-6 w-6 rounded bg-foreground/5 flex items-center justify-center shrink-0 border border-border text-[10px] font-bold text-foreground/60">02</div>
                      <p className="text-sm text-foreground/60 leading-relaxed">Must include columns: <span className="text-foreground/80 font-medium">Serial Number, Status, Registration, Current Lessee</span></p>
                   </div>
                   <div className="flex items-start gap-4 p-4 bg-card/60 rounded-xl border border-border">
                      <div className="h-6 w-6 rounded bg-foreground/5 flex items-center justify-center shrink-0 border border-border text-[10px] font-bold text-foreground/60">03</div>
                      <p className="text-sm text-foreground/60 leading-relaxed">Only rows with status <span className="text-emerald-700 font-semibold">&quot;Assigned&quot;</span> will be ingested into the pipeline.</p>
                   </div>
                   <div className="flex items-start gap-4 p-4 bg-card/60 rounded-xl border border-border">
                      <div className="h-6 w-6 rounded bg-foreground/5 flex items-center justify-center shrink-0 border border-border text-[10px] font-bold text-foreground/60">04</div>
                      <p className="text-sm text-foreground/60 leading-relaxed">Successful ingestion will <span className="text-red-700 font-semibold italic underline decoration-red-700/20">overwrite</span> any existing records for this period.</p>
                   </div>
                </div>
             </div>
          </div>

        </div>

        </>
      )}
      </main>
    </div>
  );
}
