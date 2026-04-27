import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "March 2026";

    const sql = neon(process.env.DATABASE_URL!);

    // Ensure tables exist (no-op if already created)
    await sql`
      CREATE TABLE IF NOT EXISTS lessee_assets (
        id                  SERIAL PRIMARY KEY,
        period              VARCHAR(50)  NOT NULL,
        lessee_name         VARCHAR(255) NOT NULL,
        aircraft_name       VARCHAR(255),
        serial_number       VARCHAR(100),
        registration_number VARCHAR(100),
        obligation_status   VARCHAR(100),
        validation_status   VARCHAR(50) DEFAULT 'pending',
        report_status       VARCHAR(50) DEFAULT 'Not Started',
        file_name           VARCHAR(255),
        uploaded_at         TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS lessee_components (
        id                SERIAL PRIMARY KEY,
        asset_id          INTEGER REFERENCES lessee_assets(id) ON DELETE CASCADE,
        component_type    VARCHAR(100),
        serial_number     VARCHAR(100),
        tsn               VARCHAR(50),
        csn               VARCHAR(50),
        flight_hours      VARCHAR(50),
        flight_cycles     VARCHAR(50),
        util_report_status VARCHAR(50) DEFAULT 'Not Started',
        obligation_status VARCHAR(50)
      )
    `;

    const assets = await sql`
      SELECT * FROM lessee_assets WHERE period = ${period} ORDER BY lessee_name, id
    `;

    const components = await sql`
      SELECT lc.* FROM lessee_components lc
      INNER JOIN lessee_assets la ON la.id = lc.asset_id
      WHERE la.period = ${period}
    `;

    // Which MSNs have a PDF uploaded for this period
    const pdfRows = await sql`
      SELECT DISTINCT extracted_json->'aircraft'->>'msn' AS msn
      FROM report_extractions
      WHERE period = ${period}
        AND extraction_status != 'error'
        AND (edgestore_url IS NOT NULL OR session_id IS NOT NULL)
    `;
    const msnsWithPdf = new Set(pdfRows.map((r: Record<string, unknown>) => r.msn as string).filter(Boolean));

    // Get last upload info for this period
    const lastUploadResult = await sql`
      SELECT uploaded_at, file_name FROM lessee_assets
      WHERE period = ${period}
      ORDER BY uploaded_at DESC
      LIMIT 1
    `;

    const lastUpload = lastUploadResult.length > 0
      ? { uploadedAt: lastUploadResult[0].uploaded_at, fileName: lastUploadResult[0].file_name }
      : null;

    // Group into airline → aircraft → components
    type ComponentRow = {
      id: number; asset_id: number; component_type: string; serial_number: string;
      tsn: string; csn: string; flight_hours: string; flight_cycles: string;
      util_report_status: string; obligation_status: string;
    };
    type AssetRow = {
      id: number; lessee_name: string; aircraft_name: string; serial_number: string;
      registration_number: string; obligation_status: string; report_status: string;
    };

    const compsByAsset: Record<number, ComponentRow[]> = {};
    for (const c of components as ComponentRow[]) {
      if (!compsByAsset[c.asset_id]) compsByAsset[c.asset_id] = [];
      compsByAsset[c.asset_id].push(c);
    }

    const airlineMap: Record<string, { assets: AssetRow[] }> = {};
    for (const a of assets as AssetRow[]) {
      if (!airlineMap[a.lessee_name]) airlineMap[a.lessee_name] = { assets: [] };
      airlineMap[a.lessee_name].assets.push(a);
    }

    const airlines = Object.entries(airlineMap).map(([name, { assets: airAssets }]) => ({
      name,
      aircraftCount: airAssets.length,
      aircraft: airAssets.map((a) => ({
        id: a.id,
        name: (a.aircraft_name || a.serial_number || "Unknown").replace(/\s*\(\s*\)\s*$/, ''),
        registration: a.registration_number || "N/A",
        obligation: a.obligation_status || "—",
        status: "Pending",
        hasPdf: msnsWithPdf.has(a.serial_number || ""),
        components: (compsByAsset[a.id] || []).map((c) => ({
          type: c.component_type || "—",
          serial: c.serial_number || "—",
          tsn: c.tsn || "",
          csn: c.csn || "",
          flightHours: c.flight_hours || "",
          flightCycles: c.flight_cycles || "",
          utilStatus: c.util_report_status || "Not Started",
        })),
      })),
    }));

    return NextResponse.json({ success: true, airlines, lastUpload });
  } catch (err) {
    console.error("Get operations error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
