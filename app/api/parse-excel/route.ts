import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

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

interface SummaryRow {
  name: string;
  assets: number;
  components: number;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = "DB_LW_Extract";

    if (!wb.SheetNames.includes(sheetName)) {
      return NextResponse.json(
        { error: `Sheet "${sheetName}" not found. Found: ${wb.SheetNames.join(", ")}` },
        { status: 400 }
      );
    }

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

    const required = ["Serial Number", "Status", "Registration Number", "Current Lessee"];
    const firstRow = rows[0] || {};
    const missing = required.filter((col) => !(col in firstRow));

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required columns: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const assigned = rows.filter((r) => {
      const status = String(r["Status"]).trim().toLowerCase();
      return status === "assigned" || status === "on lease";
    });

    if (assigned.length === 0) {
      const uniqueStatuses = [...new Set(rows.map((r) => String(r["Status"]).trim()))].filter(Boolean).slice(0, 5);
      return NextResponse.json(
        { error: `No rows with status "Assigned" or "On Lease" found. Status values in file: ${uniqueStatuses.join(", ") || "(empty)"}` },
        { status: 400 }
      );
    }

    const str = (v: unknown) => (v !== undefined && v !== null ? String(v).trim() : "");

    type AssetMap = Record<string, { rows: Record<string, string>[] }>;
    const lesseeMap: Record<string, AssetMap> = {};

    for (const row of assigned) {
      const lessee = str(row["Current Lessee"]);
      if (!lessee) continue;
      const sn = str(row["Serial Number"]);
      if (!lesseeMap[lessee]) lesseeMap[lessee] = {};
      if (!lesseeMap[lessee][sn]) lesseeMap[lessee][sn] = { rows: [] };
      lesseeMap[lessee][sn].rows.push(row as Record<string, string>);
    }

    const lessees: LesseeGroup[] = Object.entries(lesseeMap).map(([lesseeName, assetMap]) => ({
      lesseeName,
      assets: Object.entries(assetMap).map(([sn, { rows: compRows }]) => {
        const first = compRows[0];
        const regNum = str(first["Registration Number"]);
        const components: Component[] = compRows.map((r) => ({
          type: str(r["Component Type"] || r["Type"] || r["Component"] || ""),
          serialNumber: str(r["Component Serial"] || r["Component SN"] || r["Serial Number"] || ""),
          lastUtilizationDate: str(r["Last Utilization Date"] || ""),
          flightHours: str(r["Flight Hours"] || r["FH"] || ""),
          flightCycles: str(r["Flight Cycles"] || r["FC"] || ""),
          apuHours: str(r["APU Hours"] || ""),
          apuCycles: str(r["APU Cycles"] || ""),
          tsnAtPeriod: str(r["TSN At Period"] || r["TSN"] || ""),
          csnAtPeriod: str(r["CSN At Period"] || r["CSN"] || ""),
          tsnAtPeriodEnd: str(r["TSN At Period End"] || ""),
          csnAtPeriodEnd: str(r["CSN At Period End"] || ""),
          lastTsnCsnUpdate: str(r["Last TSN CSN Update"] || ""),
          lastTsnUtilization: str(r["Last TSN Utilization"] || ""),
          lastCsnUtilization: str(r["Last CSN Utilization"] || ""),
          attachmentStatus: str(r["Attachment Status"] || r["Status"] || ""),
          engineThrust: str(r["Engine Thrust"] || ""),
          status: str(r["Status"] || ""),
          utilReportStatus: str(r["Util Report Status"] || "Not Started"),
          asset_status: str(r["Asset Status"] || r["Obligation Status"] || "Non MR"),
          derate: str(r["Derate"] || ""),
        }));
        return {
          name: (() => { const t = str(first["Aircraft Type"] || first["Type"] || ""); return t ? `${sn} (${t})` : sn; })(),
          serialNumber: sn,
          registrationNumber: regNum,
          validation_status: "pending",
          report_status: "Not Started",
          obligation_status: str(first["Obligation Status"] || "Non MR"),
          components,
        };
      }),
    }));

    const summary: SummaryRow[] = lessees.map((l) => ({
      name: l.lesseeName,
      assets: l.assets.length,
      components: l.assets.reduce((acc, a) => acc + a.components.length, 0),
    }));

    return NextResponse.json({ data: { lessees }, summary });
  } catch (error) {
    console.error("Excel parse error:", error);
    return NextResponse.json({ error: "Failed to parse Excel file." }, { status: 500 });
  }
}
