import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";
import { extractFromPdf } from "../../lib/pdf-extract";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const period = (formData.get("period") as string) || "March 2026";
    const edgestoreUrlsRaw = formData.get("edgestore_urls") as string | null;
    const edgestoreUrlMap: Record<string, string> = edgestoreUrlsRaw
      ? JSON.parse(edgestoreUrlsRaw)
      : {};

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No files uploaded" },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Ensure tables exist
    await sql`
      CREATE TABLE IF NOT EXISTS uploaded_reports (
        id            SERIAL PRIMARY KEY,
        period        VARCHAR(50) NOT NULL,
        file_name     VARCHAR(500) NOT NULL,
        file_size     INTEGER,
        status        VARCHAR(50) DEFAULT 'uploaded',
        uploaded_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Add apu columns to lessee_components if they don't exist yet
    await sql`ALTER TABLE lessee_components ADD COLUMN IF NOT EXISTS apu_hours VARCHAR(50)`;
    await sql`ALTER TABLE lessee_components ADD COLUMN IF NOT EXISTS apu_cycles VARCHAR(50)`;

    // Add edgestore_url column to report_extractions if it doesn't exist
    await sql`ALTER TABLE report_extractions ADD COLUMN IF NOT EXISTS edgestore_url VARCHAR(255)`;

    await sql`
      CREATE TABLE IF NOT EXISTS report_extractions (
        id                SERIAL PRIMARY KEY,
        report_id         INTEGER REFERENCES uploaded_reports(id) ON DELETE CASCADE,
        period            VARCHAR(50) NOT NULL,
        file_name         VARCHAR(500) NOT NULL,
        raw_text          TEXT,
        extracted_json    JSONB,
        raw_pi_response   TEXT,
        extraction_status VARCHAR(50) DEFAULT 'pending',
        error_message     TEXT,
        created_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    const results: {
      name: string;
      size: number;
      extractionStatus: string;
      componentsMatched: number;
      error?: string;
    }[] = [];

    for (const file of files) {
      // 1. Save upload record
      const [uploadRow] = await sql`
        INSERT INTO uploaded_reports (period, file_name, file_size, status)
        VALUES (${period}, ${file.name}, ${file.size}, 'uploaded')
        RETURNING id
      `;
      const reportId: number = uploadRow.id;

      let extractionStatus = "pending";
      let rawText: string | null = null;
      let extractedJson = null;
      let rawPiResponse: string | null = null;
      let errorMessage: string | null = null;
      let componentsMatched = 0;
      let sessionId: string | null = null;
      const edgestoreUrl: string | null = edgestoreUrlMap[file.name] ?? null;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);

        // 2. LlamaParse → text → Gemini → structured per-component JSON
        const result = await extractFromPdf(pdfBuffer, file.name);
        rawText = result.rawText;
        extractedJson = result.extractedJson;
        rawPiResponse = result.rawPiResponse;
        sessionId = result.sessionId;
        extractionStatus = extractedJson !== null ? "success" : "partial";

        // 3. Match each extracted component by serial number and update lessee_components
        if (extractedJson?.components && extractedJson?.aircraft) {
          const msn = extractedJson.aircraft.msn || "";
          const reg = extractedJson.aircraft.registration_number || "";

          for (const [compKey, comp] of Object.entries(extractedJson.components)) {
            if (!comp || !comp.available) continue;

            const isApu = compKey.toLowerCase() === "apu";
            
            // Map the JSON component key to the DB component type
            let dbCompType = compKey;
            const lowerKey = compKey.toLowerCase();
            if (lowerKey === "engine1") dbCompType = "Engine 1";
            else if (lowerKey === "engine2") dbCompType = "Engine 2";
            else if (lowerKey === "engine3") dbCompType = "Engine 3";
            else if (lowerKey === "engine4") dbCompType = "Engine 4";
            else if (lowerKey.includes("landinggear")) dbCompType = "Landing Gear";
            else if (lowerKey === "apu") dbCompType = "APU";
            else if (lowerKey === "airframe") dbCompType = "Airframe";

            const sn = comp.SerialNumber || msn;

            const updated = await sql`
              UPDATE lessee_components
              SET
                serial_number = COALESCE(${comp.SerialNumber ?? null}, serial_number),
                tsn           = COALESCE(${comp.TSN_raw ?? null}, ${comp.TSN?.toString() ?? null}, tsn),
                csn           = COALESCE(${comp.CSN_raw ?? null}, ${comp.CSN?.toString() ?? null}, csn),
                flight_hours  = COALESCE(${comp.MonthlyUtil_Hrs_raw ?? null}, ${comp.MonthlyUtil_Hrs?.toString() ?? null}, flight_hours),
                flight_cycles = COALESCE(${comp.MonthlyUtil_Cyc_raw ?? null}, ${comp.MonthlyUtil_Cyc?.toString() ?? null}, flight_cycles),
                apu_hours     = CASE WHEN ${isApu} THEN COALESCE(${comp.MonthlyUtil_Hrs_raw ?? null}, ${comp.MonthlyUtil_Hrs?.toString() ?? null}, apu_hours) ELSE apu_hours END,
                apu_cycles    = CASE WHEN ${isApu} THEN COALESCE(${comp.MonthlyUtil_Cyc_raw ?? null}, ${comp.MonthlyUtil_Cyc?.toString() ?? null}, apu_cycles) ELSE apu_cycles END,
                util_report_status = 'Ready for Review'
              WHERE asset_id IN (
                  SELECT id FROM lessee_assets 
                  WHERE (serial_number = ${msn} OR registration_number = ${reg}) 
                    AND period = ${period}
                )
                AND (
                  serial_number = ${sn} OR 
                  component_type = ${dbCompType}
                )
              RETURNING id
            `;

            componentsMatched += updated.length;
          }
        }
      } catch (err) {
        extractionStatus = "error";
        errorMessage = String(err);
      }

      // 4. Save extraction record
      await sql`
        INSERT INTO report_extractions
          (report_id, period, file_name, raw_text, extracted_json, raw_pi_response, session_id, edgestore_url, extraction_status, error_message)
        VALUES
          (${reportId}, ${period}, ${file.name},
           ${rawText}, ${extractedJson ? JSON.stringify(extractedJson) : null},
           ${rawPiResponse}, ${sessionId}, ${edgestoreUrl}, ${extractionStatus}, ${errorMessage})
      `;

      results.push({
        name: file.name,
        size: file.size,
        extractionStatus,
        componentsMatched,
        error: errorMessage ?? undefined,
      });
    }

    // 5. For any components still on "Not Started", flip them to "Ready for Review"
    await sql`
      UPDATE lessee_components
      SET util_report_status = 'Ready for Review'
      WHERE util_report_status = 'Not Started'
        AND asset_id IN (SELECT id FROM lessee_assets WHERE period = ${period})
    `;

    await sql`
      UPDATE lessee_assets
      SET report_status = 'Ready for Review'
      WHERE report_status IN ('Not Started', 'pending')
        AND period = ${period}
    `;

    return NextResponse.json({
      success: true,
      count: files.length,
      results,
    });
  } catch (err) {
    console.error("Upload reports error:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "March 2026";

    const sql = neon(process.env.DATABASE_URL!);

    await sql`
      CREATE TABLE IF NOT EXISTS uploaded_reports (
        id            SERIAL PRIMARY KEY,
        period        VARCHAR(50) NOT NULL,
        file_name     VARCHAR(500) NOT NULL,
        file_size     INTEGER,
        status        VARCHAR(50) DEFAULT 'uploaded',
        uploaded_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    const reports = await sql`
      SELECT * FROM uploaded_reports
      WHERE period = ${period}
      ORDER BY uploaded_at DESC
    `;

    return NextResponse.json({ success: true, reports });
  } catch (err) {
    console.error("Get reports error:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
