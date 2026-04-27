import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get("assetId");
  const period = searchParams.get("period");

  if (!assetId || !period) {
    return new NextResponse("Missing assetId or period", { status: 400 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // 1. Get the MSN for the given assetId
    const assets = await sql`
      SELECT serial_number FROM lessee_assets WHERE id = ${assetId} LIMIT 1
    `;
    if (!assets || assets.length === 0) {
      return new NextResponse("Asset not found", { status: 404 });
    }
    const msn = assets[0].serial_number;

    // 2. Find the report_extraction for this MSN and period
    const extractions = await sql`
      SELECT session_id, file_name, edgestore_url
      FROM report_extractions
      WHERE period = ${period}
        AND extracted_json->'aircraft'->>'msn' = ${msn}
        AND (edgestore_url IS NOT NULL OR session_id IS NOT NULL)
      ORDER BY id DESC
      LIMIT 1
    `;

    if (!extractions || extractions.length === 0) {
      return new NextResponse("Document not found for this asset and period", { status: 404 });
    }

    const { session_id, file_name, edgestore_url } = extractions[0];

    // 3. Prefer EdgeStore cloud URL — redirect the browser directly to it
    if (edgestore_url) {
      return NextResponse.redirect(edgestore_url);
    }

    // 4. Fall back to serving the locally stored file
    const filePath = path.join(process.cwd(), "sessions", session_id, "Docs", file_name);

    if (!fs.existsSync(filePath)) {
      return new NextResponse("Document file physically missing on server", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${file_name}"`,
      },
    });
  } catch (error) {
    console.error("Error serving document:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
