"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import { useEdgeStore } from "../lib/edgestore";
import {
  Upload,
  FileText,
  CheckCircle,
  X,
  Loader2,
  Trash2,
  AlertCircle,
  InboxIcon,
} from "lucide-react";

interface UploadedReport {
  id: number;
  file_name: string;
  file_size: number;
  status: string;
  uploaded_at: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function UploadReportsPage() {
  const { edgestore } = useEdgeStore();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previousReports, setPreviousReports] = useState<UploadedReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPreviousReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const res = await fetch("/api/upload-reports?period=March%202026");
      const json = await res.json();
      if (json.success) {
        setPreviousReports(json.reports);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    fetchPreviousReports();
  }, [fetchPreviousReports]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function addFiles(newFiles: FileList | File[]) {
    const pdfFiles = Array.from(newFiles).filter(
      (f) => f.type === "application/pdf" || f.name.endsWith(".pdf")
    );
    if (pdfFiles.length === 0) return;
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const unique = pdfFiles.filter((f) => !existingNames.has(f.name));
      return [...prev, ...unique];
    });
    setUploadResult(null);
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setProgress(0);
    setUploadResult(null);

    try {
      // 1. Upload each PDF to EdgeStore and collect the resulting URLs
      const edgestoreUrls: Record<string, string> = {};
      for (const file of files) {
        const result = await edgestore.zeus.upload({ file });
        edgestoreUrls[file.name] = result.url;
      }

      // 2. Start the simulated progress bar for the backend extraction phase
      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 90;
          }
          return prev + Math.random() * 8;
        });
      }, 150);

      const formData = new FormData();
      formData.append("period", "March 2026");
      formData.append("edgestore_urls", JSON.stringify(edgestoreUrls));
      for (const file of files) {
        formData.append("files", file);
      }

      const res = await fetch("/api/upload-reports", {
        method: "POST",
        body: formData,
      });

      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);

      const json = await res.json();
      if (json.success) {
        setUploadResult({
          ok: true,
          msg: `Successfully uploaded ${json.count} report(s). Database mapped.`,
        });
        setFiles([]);
        fetchPreviousReports();
      } else {
        setUploadResult({
          ok: false,
          msg: json.error || "Upload failed.",
        });
      }
    } catch (err) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setUploadResult({ ok: false, msg: String(err) });
    } finally {
      setUploading(false);
    }
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-500">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-start justify-between mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div>
            <h1 className="text-4xl font-serif-elegant text-foreground">
              Upload Utilization Reports
            </h1>
            <p className="text-foreground/40 mt-3 text-sm max-w-xl leading-relaxed">
              Securely ingest monthly PDF utilization reports. Our automated pipeline will parse the data and synchronize it with your asset ecosystem.
            </p>
          </div>
          <span className="text-[10px] font-bold text-foreground/40 bg-accent/30 border border-border px-5 py-2 rounded-full uppercase tracking-widest shrink-0">
            Cohort: March 2026
          </span>
        </div>

        {uploadResult && (
          <div
            className={`rounded-2xl p-6 mb-10 flex items-start gap-4 animate-in fade-in ${
              uploadResult.ok
                ? "bg-emerald-500/5 border border-emerald-500/10"
                : "bg-red-500/5 border border-red-500/10"
            }`}
          >
            {uploadResult.ok ? (
              <CheckCircle size={20} className="text-emerald-700 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={20} className="text-red-700 mt-0.5 shrink-0" />
            )}
            <div>
              <p className={`text-sm font-bold uppercase tracking-widest ${uploadResult.ok ? "text-emerald-800" : "text-red-800"}`}>
                {uploadResult.ok ? "Ingestion Complete" : "Critical Error"}
              </p>
              <p className={`text-sm mt-1 ${uploadResult.ok ? "text-emerald-700/60" : "text-red-700/60"}`}>
                {uploadResult.msg}
              </p>
            </div>
          </div>
        )}

        {/* Upload Card */}
        <div className="bg-card rounded-2xl border border-border p-10 shadow-sm transition-all mb-10">
          <div className="flex items-start gap-6 mb-10">
            <div className="p-3 bg-background/50 rounded-xl border border-border">
              <Upload size={24} className="text-foreground/70" />
            </div>
            <div>
              <h2 className="text-2xl font-serif-elegant text-foreground">
                Queue PDF Documents
              </h2>
              <p className="text-sm text-foreground/40 mt-1">
                Drag and drop PDF reports into the secure zone below.
              </p>
            </div>
          </div>

          {/* Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploading) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-20 px-6 transition-all relative overflow-hidden group ${
              dragOver
                ? "border-foreground/20 bg-background scale-[1.01]"
                : "border-border bg-background/30 hover:border-foreground/10 hover:bg-background/50 cursor-pointer"
            }`}
          >
            <div className={`h-20 w-20 rounded-full flex items-center justify-center mb-6 transition-colors bg-background border border-border`}>
               <Upload size={32} className="text-foreground/20" strokeWidth={1.5} />
            </div>
            <p className="text-lg font-serif-elegant text-foreground relative z-10 text-center px-10">
              Drop batch reports here, or <span className="text-foreground/40 underline underline-offset-4 decoration-foreground/10">browse files</span>
            </p>
            <p className="text-[10px] font-bold text-foreground/20 mt-6 uppercase tracking-[0.3em] bg-accent/30 px-5 py-2 rounded-full border border-border relative z-10">
              PDF Format · Multiple Files Supported
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            multiple
            title="Upload PDF files"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Selected Files */}
          {files.length > 0 && (
            <div className="mt-12 pt-10 border-t border-border">
              <div className="flex items-center justify-between mb-6 px-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/30">
                  Staged Documents ({files.length})
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/50 bg-accent/40 px-3 py-1 rounded-full border border-border">
                  Total Payload: {formatBytes(totalSize)}
                </span>
              </div>
              
              <div className="space-y-3 max-h-[350px] overflow-y-auto custom-scrollbar pr-2 mb-10">
                {files.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center gap-5 bg-background/40 border border-border rounded-xl px-6 py-4 hover:bg-background/80 transition-all group"
                  >
                    <div className="p-2.5 bg-background border border-border rounded-lg group-hover:scale-105 transition-transform">
                       <FileText size={20} className="text-foreground/40" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {f.name}
                      </p>
                      <p className="text-[10px] font-bold text-foreground/20 mt-1 uppercase tracking-widest">
                        {formatBytes(f.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(f.name);
                      }}
                      disabled={uploading}
                      className="p-3 text-foreground/20 hover:text-red-700 transition-colors disabled:opacity-50"
                      title="Remove file"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Progress Bar */}
              {uploading && (
                <div className="mb-10 bg-accent/20 p-6 rounded-2xl border border-border">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-foreground/30 mb-4 px-1">
                    <span>Synthesizing and Parsing</span>
                    <span className="text-foreground">{Math.min(Math.round(progress), 100)}%</span>
                  </div>
                  <div className="h-1 bg-foreground/5 rounded-full overflow-hidden border border-border/50">
                    <div
                      className="h-full bg-foreground transition-all duration-300 ease-out"
                      style={{ width: `${Math.min(Math.round(progress), 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-6">
                <button
                  type="button"
                  onClick={() => {
                    setFiles([]);
                    setUploadResult(null);
                  }}
                  disabled={uploading}
                  className="text-[10px] font-bold uppercase tracking-widest text-foreground/30 hover:text-foreground transition-colors disabled:opacity-50"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading || files.length === 0}
                  className={`rounded-full px-10 py-4 text-sm font-bold text-background transition-all shadow-xl shadow-foreground/10 ${
                    files.length > 0 && !uploading
                      ? "bg-foreground hover:bg-foreground/80"
                      : "bg-foreground/10 text-foreground/20 cursor-not-allowed"
                  }`}
                >
                  {uploading ? (
                    <div className="flex items-center gap-3">
                      <Loader2 size={18} className="animate-spin" />
                      Parsing...
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Upload size={18} />
                      Ingest {files.length} {files.length > 1 ? "Reports" : "Report"}
                    </div>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Previous Reports */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden mb-12">
          <div className="px-10 py-8 border-b border-border flex items-center justify-between bg-background/20">
            <div>
              <h3 className="text-2xl font-serif-elegant text-foreground">
                Document Archive
              </h3>
              <p className="text-sm text-foreground/40 mt-1">
                Historical record of processed and mapped utilization snapshots.
              </p>
            </div>
            <div className="h-12 w-12 bg-background rounded-full flex items-center justify-center border border-border shadow-sm">
               <FileText size={20} className="text-foreground/30" />
            </div>
          </div>

          {loadingReports ? (
            <div className="flex flex-col items-center justify-center py-24 text-foreground/20">
              <Loader2 size={32} className="animate-spin mb-6" />
              <p className="text-[10px] font-bold uppercase tracking-widest">Retrieving Historical Payloads...</p>
            </div>
          ) : previousReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 px-10 text-foreground/20">
              <div className="h-20 w-20 bg-background rounded-full flex items-center justify-center mb-6 border border-border shadow-sm">
                 <InboxIcon size={32} className="text-foreground/10" />
              </div>
              <p className="text-lg font-serif-elegant text-foreground/40">
                No archived ingestion found
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {previousReports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center gap-8 px-10 py-6 hover:bg-background/40 transition-all group"
                >
                  <div className="p-3 bg-background border border-border rounded-xl group-hover:scale-105 transition-transform shadow-sm">
                     <FileText size={20} className="text-foreground/40" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate transition-colors">
                      {report.file_name}
                    </p>
                    <div className="flex items-center gap-5 mt-2">
                       <p className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest bg-accent/40 px-3 py-1 rounded border border-border">
                         {formatBytes(report.file_size)}
                       </p>
                       <p className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest">
                         {formatDate(report.uploaded_at)}
                       </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] bg-emerald-500/5 text-emerald-800 border border-emerald-500/10 rounded-full px-5 py-2">
                    {report.status === "uploaded" ? "Parsed & Mapped" : report.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
