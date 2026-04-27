import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "March 2026";

    const sql = neon(process.env.DATABASE_URL!);

    const extractions = await sql`
      SELECT id, file_name, extraction_status, extracted_json, error_message, created_at
      FROM report_extractions
      WHERE period = ${period}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    // For the latest extraction, check if the asset was found and what the components look like
    const debug = [];
    for (const ex of extractions) {
      const j = ex.extracted_json as { registration_number?: string; msn?: string } | null;
      if (!j) continue;

      const assetMatch = await sql`
        SELECT id, lessee_name, aircraft_name, serial_number, registration_number
        FROM lessee_assets
        WHERE period = ${period}
          AND (
            (registration_number IS NOT NULL AND registration_number = ${j.registration_number ?? ""})
            OR
            (serial_number IS NOT NULL AND serial_number = ${j.msn ?? ""})
          )
        LIMIT 1
      `;

      // Show nearby assets to diagnose the mismatch
      const nearbyAssets = await sql`
        SELECT id, lessee_name, aircraft_name, serial_number, registration_number
        FROM lessee_assets
        WHERE period = ${period}
          AND (
            serial_number ILIKE ${"%" + (j.msn ?? "") + "%"}
            OR registration_number ILIKE ${"%" + (j.registration_number ?? "") + "%"}
            OR aircraft_name ILIKE ${"%" + (j.msn ?? "") + "%"}
          )
        LIMIT 5
      `;

      const components = assetMatch.length > 0 ? await sql`
        SELECT id, component_type, flight_hours, flight_cycles, apu_hours, apu_cycles
        FROM lessee_components
        WHERE asset_id = ${assetMatch[0].id}
      ` : [];

      debug.push({
        file: ex.file_name,
        extracted: j,
        assetFound: assetMatch.length > 0 ? assetMatch[0] : null,
        nearbyAssets,
        components,
      });
    }

    return NextResponse.json({ success: true, extractions, debug });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
