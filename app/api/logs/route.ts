import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvent = Record<string, any>;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("assetId");
  const period = searchParams.get("period") || "March 2026";

  if (!assetId) {
    return NextResponse.json({ success: false, error: "Missing assetId" }, { status: 400 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    const assets = await sql`SELECT serial_number FROM lessee_assets WHERE id = ${assetId} LIMIT 1`;
    if (!assets.length) {
      return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });
    }
    const msn = assets[0].serial_number as string;

    const extractions = await sql`
      SELECT session_id, raw_pi_response, extraction_status, created_at
      FROM report_extractions
      WHERE period = ${period}
        AND extracted_json->'aircraft'->>'msn' = ${msn}
        AND session_id IS NOT NULL
      ORDER BY id DESC
      LIMIT 1
    `;

    if (!extractions.length) {
      return NextResponse.json(
        { success: false, error: "No logs found for this aircraft and period" },
        { status: 404 }
      );
    }

    const { session_id, raw_pi_response, extraction_status, created_at } = extractions[0];
    const piSessionDir = path.join(process.cwd(), "sessions", session_id as string, "pi-session");

    // Read session.json for system prompt
    let systemPrompt = "";
    const sessionFile = path.join(piSessionDir, "session.json");
    if (fs.existsSync(sessionFile)) {
      const log = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
      systemPrompt = log.systemPrompt ?? "";
    }

    // Parse every line of the JSONL file
    const events: AnyEvent[] = [];
    let modelName = "google/gemini-2.5-flash";
    let providerName = "openrouter";
    let startTs: number | null = null;
    let endTs: number | null = null;
    let usage: AnyEvent | null = null;
    let responseId = "";
    let userMessage = "";

    if (fs.existsSync(piSessionDir)) {
      const jsonlFiles = fs.readdirSync(piSessionDir).filter((f) => f.endsWith(".jsonl"));
      if (jsonlFiles.length > 0) {
        const content = fs.readFileSync(path.join(piSessionDir, jsonlFiles[0]), "utf-8");

        for (const line of content.split("\n").filter(Boolean)) {
          try {
            const ev: AnyEvent = JSON.parse(line);
            events.push(ev);

            if (ev.type === "session") {
              startTs =
                typeof ev.timestamp === "string"
                  ? new Date(ev.timestamp).getTime()
                  : (ev.timestamp as number) ?? null;
            } else if (ev.type === "model_change") {
              modelName = ev.modelId ?? modelName;
              providerName = ev.provider ?? providerName;
            } else if (ev.type === "message" && ev.message?.role === "user") {
              userMessage = (ev.message.content as { type: string; text: string }[])
                .map((c) => c.text ?? "")
                .join("");
            } else if (ev.usage) {
              usage = ev.usage;
              modelName = ev.model ?? modelName;
              endTs = typeof ev.timestamp === "number" ? ev.timestamp : null;
              responseId = ev.responseId ?? "";
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      msn,
      sessionId: session_id,
      extractionStatus: extraction_status,
      createdAt: created_at,
      model: modelName,
      provider: providerName,
      responseId,
      durationMs: startTs && endTs ? endTs - startTs : null,
      systemPrompt,
      userMessage,
      rawResponse: raw_pi_response ?? "",
      usage,
      events, // full JSONL event list for the trace view
    });
  } catch (err) {
    console.error("Logs error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
