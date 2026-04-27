/**
 * PDF extraction pipeline:
 *   PDF buffer → LlamaParse (cloud) → plain text → pi (OpenRouter / Gemini) → structured JSON
 *
 * Output format matches examples/result.json
 */

import LlamaCloud, { toFile } from "@llamaindex/llama-cloud";
import fs from "fs";
import path from "path";
import {
  AuthStorage,
  createAgentSession,
  createExtensionRuntime,
  ModelRegistry,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a precise data extraction assistant for aircraft utilization reports.
You extract structured component-level data and return ONLY valid JSON — no explanation, no markdown, no code fences.
When converting flight time from HH:MM format (e.g. "38212:57") to decimal hours, use: hours + minutes/60 (e.g. 38212 + 57/60 = 38212.95, rounded to 2 decimal places).`;

function buildUserPrompt(text: string): string {
  return `Extract data from this aircraft monthly utilization report.

Return a JSON object with EXACTLY this structure:

{
  "aircraft": {
    "registration_number": "aircraft registration e.g. OY-JRP — string or null",
    "msn": "manufacturer serial number — string or null",
    "aircraft_type": "e.g. AIRBUS A320 — string or null",
    "reporting_period": "e.g. February 2026 — string or null"
  },
  "components": {
    "Airframe": {
      "SerialNumber": "serial number or null",
      "TSN": numeric decimal hours (convert HH:MM, e.g. 38212:57 → 38212.95) or null,
      "TSN_raw": "raw string from document or null",
      "CSN": numeric integer or null,
      "CSN_raw": "raw string or null",
      "MonthlyUtil_Hrs": numeric decimal hours FOR THIS PERIOD ONLY (not cumulative) or null,
      "MonthlyUtil_Hrs_raw": "raw string or null",
      "MonthlyUtil_Cyc": numeric integer cycles FOR THIS PERIOD ONLY or null,
      "MonthlyUtil_Cyc_raw": "raw string or null",
      "attachment_status": "Attached or Detached or null",
      "derate": "derate value or null",
      "location": "registration of aircraft this component is installed on or null",
      "extraction_confidence": 0.0 to 1.0,
      "raw_source_text": "verbatim text snippet from document used for this extraction or null",
      "available": true if data was found, false if not
    },
    "Engine1": { same structure as Airframe },
    "Engine2": { same structure as Airframe },
    "APU": { same structure as Airframe },
    "LandingGearLeft": { same structure as Airframe },
    "LandingGearRight": { same structure as Airframe },
    "LandingGearNose": { same structure as Airframe }
  }
}

Rules:
- Include ALL component keys even if not found in the document (set available: false, all values null, confidence: 0).
- MonthlyUtil_Hrs and MonthlyUtil_Cyc MUST be this month's values only, NOT total since new.
- HH:MM time format conversion: decimal = integer_hours + minutes/60, rounded to 2 decimal places.
- SerialNumber must be the component's own serial number, not the aircraft MSN.
- Return ONLY the JSON object.

Report text:
---
${text}
---`;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface ComponentExtraction {
  SerialNumber: string | null;
  TSN: number | null;
  TSN_raw: string | null;
  CSN: number | null;
  CSN_raw?: string | null;
  MonthlyUtil_Hrs: number | null;
  MonthlyUtil_Hrs_raw: string | null;
  MonthlyUtil_Cyc: number | null;
  MonthlyUtil_Cyc_raw?: string | null;
  attachment_status: string | null;
  derate: string | null;
  location: string | null;
  extraction_confidence: number;
  raw_source_text: string | null;
  available: boolean;
}

export interface UtilizationExtraction {
  aircraft: {
    registration_number: string | null;
    msn: string | null;
    aircraft_type: string | null;
    reporting_period: string | null;
  };
  components: {
    Airframe?: ComponentExtraction;
    Engine1?: ComponentExtraction;
    Engine2?: ComponentExtraction;
    APU?: ComponentExtraction;
    LandingGearLeft?: ComponentExtraction;
    LandingGearRight?: ComponentExtraction;
    LandingGearNose?: ComponentExtraction;
    [key: string]: ComponentExtraction | undefined;
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/** Step 1 — Upload PDF buffer to LlamaParse and get back plain text. */
export async function parsePdfToText(pdfBuffer: Buffer): Promise<string> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY;
  if (!apiKey) throw new Error("LLAMA_CLOUD_API_KEY is not configured");

  const client = new LlamaCloud({ apiKey });

  const uploadable = await toFile(pdfBuffer, "report.pdf", {
    type: "application/pdf",
  });

  const result = await client.parsing.parse({
    upload_file: uploadable,
    tier: "cost_effective",
    version: "latest",
    expand: ["text"],
  });

  if (result.text_full) return result.text_full;
  if (result.text?.pages) {
    return result.text.pages
      .map((p: { text: string }) => p.text)
      .join("\n\n");
  }
  return "";
}

/** Step 2 — Send extracted text to pi (OpenRouter / Gemini) and return structured JSON. */
export async function extractWithPi(
  text: string,
  basePath: string,
  sessionDirName: string
): Promise<{ json: UtilizationExtraction | null; raw: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey("openrouter", apiKey);

  const modelRegistry = ModelRegistry.inMemory(authStorage);

  const model = getModel("openrouter", "google/gemini-2.5-flash");
  if (!model) throw new Error("Model 'google/gemini-2.5-flash' not found");

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 2 },
  });

  const resourceLoader: ResourceLoader = {
    getExtensions: () => ({
      extensions: [],
      errors: [],
      runtime: createExtensionRuntime(),
    }),
    getSkills:             () => ({ skills: [], diagnostics: [] }),
    getPrompts:            () => ({ prompts: [], diagnostics: [] }),
    getThemes:             () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles:        () => ({ agentsFiles: [] }),
    getSystemPrompt:       () => SYSTEM_PROMPT,
    getAppendSystemPrompt: () => [],
    extendResources:       () => {},
    reload:                async () => {},
  };

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    resourceLoader,
    noTools: "all",
    sessionManager: SessionManager.create(basePath, sessionDirName),
    settingsManager,
  });

  let raw = "";
  session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      raw += event.assistantMessageEvent.delta;
    }
  });

  await session.prompt(buildUserPrompt(text));

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    return { json: JSON.parse(cleaned) as UtilizationExtraction, raw };
  } catch {
    return { json: null, raw };
  }
}

/** Full pipeline: PDF buffer → LlamaParse text → pi JSON. */
export async function extractFromPdf(pdfBuffer: Buffer, fileName: string = "report.pdf"): Promise<{
  rawText: string;
  extractedJson: UtilizationExtraction | null;
  rawPiResponse: string;
  sessionId: string;
}> {
  // 1. Setup session directory
  const sessionId = Date.now().toString() + "-" + Math.random().toString(36).substring(2, 8);
  const basePath = path.join(process.cwd(), "sessions", sessionId);
  const docsPath = path.join(basePath, "Docs");
  const piSessionPath = path.join(basePath, "pi-session");

  fs.mkdirSync(docsPath, { recursive: true });
  fs.mkdirSync(piSessionPath, { recursive: true });

  // 2. Save the uploaded document
  fs.writeFileSync(path.join(docsPath, fileName), pdfBuffer);

  const rawText = await parsePdfToText(pdfBuffer);
  
  // 3. Save the parsed TXT
  fs.writeFileSync(path.join(basePath, "parsed.txt"), rawText);

  const { json: extractedJson, raw: rawPiResponse } = await extractWithPi(rawText, basePath, piSessionPath);

  // 4. Save result.json in the standard report format
  if (extractedJson) {
    const ac = extractedJson.aircraft;
    const msn = ac?.msn ?? "";
    const acType = (ac?.aircraft_type ?? "").replace(/\s+/g, "");
    const testId = [msn, ac?.registration_number ?? "", acType].filter(Boolean).join("_");
    const description = [
      msn ? `MSN ${msn}` : "",
      ac?.registration_number ?? "",
      ac?.aircraft_type ?? "",
      ac?.reporting_period ?? "",
      "Monthly Reporting",
    ].filter(Boolean).join(" ");

    const componentList = Object.entries(extractedJson.components ?? {}).map(
      ([type, comp]) => ({
        type,
        serialNumber: comp?.SerialNumber ?? "",
      })
    );

    const resultFile = {
      test_id: testId || "",
      description: description || "",
      reporting_period: ac?.reporting_period ?? "",
      document: fileName,
      document_pages: 0,
      document_type: "FLIGHT_INFO",
      input: {
        aircraft: {
          registration_number: ac?.registration_number ?? "",
          msn: ac?.msn ?? "",
          aircraft_type: ac?.aircraft_type ?? "",
          reporting_period: ac?.reporting_period ?? "",
        },
        component_list: componentList,
      },
      result: extractedJson.components ?? {},
    };

    fs.writeFileSync(path.join(basePath, "result.json"), JSON.stringify(resultFile, null, 2));
  }

  // 5. Write the full PI session log
  const piSessionFile = path.join(piSessionPath, "session.json");
  const sessionLog = {
    timestamp: new Date().toISOString(),
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(rawText),
    rawPiResponse: rawPiResponse,
    extractedJson: extractedJson,
  };
  fs.writeFileSync(piSessionFile, JSON.stringify(sessionLog, null, 2));

  return { rawText, extractedJson, rawPiResponse, sessionId };
}
