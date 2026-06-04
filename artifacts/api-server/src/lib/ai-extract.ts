import OpenAI from "openai";
import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import { logger } from "./logger.js";

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function getOpenRouter(): OpenAI | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://workforce-compliance.app",
      "X-Title": "Workforce Compliance",
    },
  });
}

export interface PassportExtractResult {
  passportNo?: string;
  passportPlaceOfBirth?: string;
  passportIssueDate?: string;
  passportExpiryDate?: string;
  name?: string;
}

export interface CvRoleEntry {
  project: string;
  role: string;
  dateFrom: string;
  dateTo: string;
}

export interface CvExtractResult {
  roles: CvRoleEntry[];
  qualifications: string | null;
  notes: string | null;
}

// ── Passport comparison helpers ───────────────────────────────────────────────

export interface PassportCompareResult {
  method: string;
  description: string;
  result: PassportExtractResult | null;
  durationMs: number;
  error: string | null;
}

/** Build an OpenAI content part for an image or PDF buffer. */
function makeDocPart(b64: string, mimeType: string): OpenAI.Chat.ChatCompletionContentPart {
  if (mimeType === "application/pdf") {
    return {
      type: "file" as const,
      file: { filename: "passport.pdf", file_data: `data:application/pdf;base64,${b64}` },
    } as unknown as OpenAI.Chat.ChatCompletionContentPartText;
  }
  return {
    type: "image_url",
    image_url: { url: `data:${mimeType};base64,${b64}`, detail: "high" },
  } as OpenAI.Chat.ChatCompletionContentPartImage;
}

/** Parse a JSON blob out of a GPT response string. */
function parseJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as T; } catch { return null; }
}

/** Method 1: GPT-4o general vision — general OCR prompt (current production approach). */
export async function extractPassportGptGeneral(
  buffer: Buffer,
  mimeType: string,
): Promise<PassportExtractResult | null> {
  const openai = getOpenAI();
  if (!openai) return null;
  const b64 = buffer.toString("base64");
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `You are a passport OCR assistant. Extract the following fields from the passport document and return them as a JSON object with exactly these keys:
- passportNo (string, passport number / document number)
- passportPlaceOfBirth (string, place of birth)
- passportIssueDate (string, issue date in YYYY-MM-DD format)
- passportExpiryDate (string, expiry/expiration date in YYYY-MM-DD format)
- name (string, full name as shown on passport)

Only include keys where you are confident in the value. Omit keys you cannot read. Return only valid JSON, no explanation.` },
        makeDocPart(b64, mimeType),
      ],
    }],
  });
  const text = response.choices[0]?.message?.content?.trim() ?? "";
  return parseJson<PassportExtractResult>(text);
}

/** Method 2: GPT-4o MRZ-focused — asks GPT to first transcribe the MRZ lines verbatim,
 *  then derive fields from them. More structured approach for printed passports.
 */
export async function extractPassportGptMrz(
  buffer: Buffer,
  mimeType: string,
): Promise<PassportExtractResult | null> {
  const openai = getOpenAI();
  if (!openai) return null;
  const b64 = buffer.toString("base64");
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 768,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `You are a passport MRZ (Machine Readable Zone) expert. The passport has two lines of machine-readable text at the bottom, each exactly 44 characters long, containing only uppercase letters, digits, and '<' (filler).

Step 1: Transcribe both MRZ lines EXACTLY as they appear — character by character. Do not guess or infer; copy only what you can clearly see.

Step 2: From the MRZ lines, extract the following fields and return a JSON object:
- passportNo: document number (positions 1–9 of line 2, excluding check digit)
- passportPlaceOfBirth: null (not in MRZ, skip)
- passportIssueDate: null (not in MRZ, skip)
- passportExpiryDate: expiry date from MRZ in YYYY-MM-DD format (positions 22–27 of line 2, format YYMMDD)
- name: surname and given names from line 1 (after the country code, separated by '<<', replace '<' with space)

Also include a "mrzLines" key with the two raw MRZ strings as an array so they can be verified.

Return only valid JSON, no explanation.` },
        makeDocPart(b64, mimeType),
      ],
    }],
  });
  const text = response.choices[0]?.message?.content?.trim() ?? "";
  const parsed = parseJson<PassportExtractResult & { mrzLines?: string[] }>(text);
  if (!parsed) return null;
  const { mrzLines: _ignored, ...rest } = parsed;
  return rest;
}

/** Method 3: Azure AI Document Intelligence — prebuilt-idDocument model.
 *  Works on images (JPEG, PNG, WebP) and PDFs. Returns structured fields
 *  directly without MRZ heuristics. Requires AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
 *  and AZURE_DOCUMENT_INTELLIGENCE_KEY environment variables.
 */
export async function extractPassportAzure(
  buffer: Buffer,
  mimeType: string,
): Promise<PassportExtractResult | null> {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  if (!endpoint || !key) {
    throw new Error("Azure Document Intelligence is not configured — AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY must be set.");
  }

  const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));

  const { Readable } = await import("stream");
  const stream = Readable.from(buffer);

  const poller = await client.beginAnalyzeDocument("prebuilt-idDocument", stream, {
    contentType: mimeType as "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
  });
  const result = await poller.pollUntilDone();

  const doc = result.documents?.[0];
  if (!doc) return null;

  const f = doc.fields;

  function strVal(field: unknown): string | undefined {
    const f = field as { value?: unknown } | undefined;
    return typeof f?.value === "string" && f.value ? f.value : undefined;
  }

  function dateVal(field: unknown): string | undefined {
    const f = field as { value?: unknown } | undefined;
    if (!f?.value) return undefined;
    const d = f.value;
    if (d instanceof Date) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return undefined;
  }

  const firstName = strVal(f["FirstName"]);
  const lastName = strVal(f["LastName"]);
  const fullName = [lastName, firstName].filter(Boolean).join(", ") || undefined;

  return {
    name: fullName,
    passportNo: strVal(f["DocumentNumber"]),
    passportPlaceOfBirth: strVal(f["PlaceOfBirth"]),
    passportIssueDate: dateVal(f["DateOfIssue"]),
    passportExpiryDate: dateVal(f["DateOfExpiration"]),
  };
}

/** Run all three passport OCR methods in parallel and return timed results. */
export async function comparePassportExtractors(
  buffer: Buffer,
  mimeType: string,
): Promise<PassportCompareResult[]> {
  const methods: { key: string; description: string; fn: () => Promise<PassportExtractResult | null> }[] = [
    {
      key: "GPT-4o General",
      description: "Current production method — general OCR prompt",
      fn: () => extractPassportGptGeneral(buffer, mimeType),
    },
    {
      key: "GPT-4o MRZ-focused",
      description: "MRZ-first prompt — transcribes machine-readable zone then parses fields",
      fn: () => extractPassportGptMrz(buffer, mimeType),
    },
    {
      key: "Tesseract + MRZ parser",
      description: "Open-source OCR (no API cost) — finds MRZ lines and parses with mrz package",
      fn: () => extractPassportTesseract(buffer, mimeType),
    },
  ];

  const settled = await Promise.allSettled(
    methods.map(async (m) => {
      const start = Date.now();
      try {
        const result = await m.fn();
        return { method: m.key, description: m.description, result, durationMs: Date.now() - start, error: null };
      } catch (err) {
        return {
          method: m.key,
          description: m.description,
          result: null,
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  return settled.map((outcome, i) => {
    const m = methods[i];
    if (outcome.status === "fulfilled") return outcome.value;
    return {
      method: m.key,
      description: m.description,
      result: null,
      durationMs: 0,
      error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
    };
  });
}

/** Extract passport fields from an image or PDF buffer using GPT-4o vision.
 *  Returns null if OpenAI is not configured or extraction fails.
 */
export async function extractPassportFields(
  buffer: Buffer,
  mimeType: string,
): Promise<PassportExtractResult | null> {
  const openai = getOpenAI();
  if (!openai) {
    logger.warn("OPENAI_API_KEY not set — skipping passport extraction");
    return null;
  }

  try {
    const b64 = buffer.toString("base64");

    const promptText = `You are a passport OCR assistant. Extract the following fields from the passport document and return them as a JSON object with exactly these keys:
- passportNo (string, passport number / document number)
- passportPlaceOfBirth (string, place of birth)
- passportIssueDate (string, issue date in YYYY-MM-DD format)
- passportExpiryDate (string, expiry/expiration date in YYYY-MM-DD format)
- name (string, full name as shown on passport)

Only include keys where you are confident in the value. Omit keys you cannot read. Return only valid JSON, no explanation.`;

    const isPdf = mimeType === "application/pdf";

    const docPart: OpenAI.Chat.ChatCompletionContentPart = isPdf
      ? ({
          type: "file" as const,
          file: {
            filename: "passport.pdf",
            file_data: `data:application/pdf;base64,${b64}`,
          },
        } as unknown as OpenAI.Chat.ChatCompletionContentPartText)
      : ({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${b64}`, detail: "high" },
        } as OpenAI.Chat.ChatCompletionContentPartImage);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            docPart,
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as PassportExtractResult;
  } catch (err) {
    logger.error({ err }, "passport AI extraction error");
    return null;
  }
}

const CV_PROMPT = `You are a CV parser. Analyse the CV and return a JSON object with exactly these keys:

- roles: array of work experience entries, each with:
  - project (string, company or project name)
  - role (string, job title)
  - dateFrom (string, start date as YYYY-MM if known, else just the year e.g. "2019")
  - dateTo (string, end date in same format, or "Present" if current)
- qualifications: string summarising academic qualifications, certifications, and training (null if none found)
- notes: string with any other notable information (skills summary, languages, memberships, etc.) — null if none

Return only valid JSON, no explanation. If no work experience is found, set roles to [].`;

/** Extract CV data directly from a PDF buffer (handles scanned/image-based PDFs).
 *  Uses OpenAI's native file content type — no text extraction needed.
 *  Returns null if OpenAI is not configured or extraction fails.
 */
export async function extractCvDataFromPdfBuffer(
  buffer: Buffer,
): Promise<CvExtractResult | null> {
  const openai = getOpenAI();
  if (!openai) {
    logger.warn("OPENAI_API_KEY not set — skipping CV PDF extraction");
    return null;
  }

  try {
    const b64 = buffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file" as const,
              file: {
                filename: "cv.pdf",
                file_data: `data:application/pdf;base64,${b64}`,
              },
            } as unknown as OpenAI.Chat.ChatCompletionContentPartText,
            { type: "text", text: CV_PROMPT },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { roles: [], qualifications: null, notes: null };
    return JSON.parse(jsonMatch[0]) as CvExtractResult;
  } catch (err) {
    logger.error({ err }, "CV PDF (vision) AI extraction error");
    return null;
  }
}

export interface CertExtractResult {
  certTypeName: string | null;
  dateAchieved: string | null;
  expiryDate: string | null;
  noExpiry: boolean;
  notes: string | null;
  confidence: "high" | "medium" | "low";
}

/** Extract certification details from a PDF buffer using GPT-4o.
 *  certTypeNames is the list of known cert type names in this organisation
 *  so the AI can match the document to the closest type.
 *  Returns null if OpenAI is not configured or extraction fails.
 */
export async function extractCertFromPdf(
  buffer: Buffer,
  certTypeNames: string[],
  mimeType = "application/pdf",
): Promise<CertExtractResult | null> {
  const openai = getOpenAI();
  if (!openai) {
    logger.warn("OPENAI_API_KEY not set — skipping cert extraction");
    return null;
  }

  const typeList = certTypeNames.slice(0, 80).join("\n");

  const prompt = `You are a certification document parser. Analyse this document and extract the following fields, then return them as a JSON object.

Known certification types in this organisation:
${typeList}

Return a JSON object with exactly these keys:
- certTypeName (string): the name of the certification from the list above that best matches this document. Use the exact name from the list. If no match, use your best description.
- dateAchieved (string | null): the date the certification was awarded/passed/achieved, in YYYY-MM-DD format. Null if not found.
- expiryDate (string | null): the expiry/renewal date in YYYY-MM-DD format. Null if not found or not applicable.
- noExpiry (boolean): true if the document explicitly states the certification does not expire or has no expiry date.
- notes (string | null): any other notable information from the document (issuing body, cert number, etc.). Null if nothing noteworthy.
- confidence ("high" | "medium" | "low"): your overall confidence in the extracted fields. Use "high" if dates and cert type are clearly readable, "medium" if some fields required inference, "low" if the document is unclear.

Return only valid JSON, no explanation.`;

  try {
    const b64 = buffer.toString("base64");

    const isImage = mimeType.startsWith("image/");

    const filePart: OpenAI.Chat.ChatCompletionContentPart = isImage
      ? ({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${b64}` },
        } as OpenAI.Chat.ChatCompletionContentPartImage)
      : ({
          type: "file" as const,
          file: {
            filename: "cert.pdf",
            file_data: `data:application/pdf;base64,${b64}`,
          },
        } as unknown as OpenAI.Chat.ChatCompletionContentPartText);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [filePart, { type: "text", text: prompt }],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as CertExtractResult;
  } catch (err) {
    logger.error({ err }, "cert AI extraction error");
    return null;
  }
}

/** Extract role/project history, qualifications, and notes from CV text.
 *  Returns null if OpenAI is not configured or extraction fails.
 */
export async function extractCvData(
  pdfText: string,
): Promise<CvExtractResult | null> {
  const openai = getOpenAI();
  if (!openai) {
    logger.warn("OPENAI_API_KEY not set — skipping CV extraction");
    return null;
  }

  try {
    const truncated = pdfText.slice(0, 12000);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `You are a CV parser. Analyse the following CV text and return a JSON object with exactly these keys:

- roles: array of work experience entries, each with:
  - project (string, company or project name)
  - role (string, job title)
  - dateFrom (string, start date as YYYY-MM if known, else just the year e.g. "2019")
  - dateTo (string, end date in same format, or "Present" if current)
- qualifications: string summarising academic qualifications, certifications, and training (null if none found)
- notes: string with any other notable information (skills summary, languages, memberships, etc.) — null if none

Return only valid JSON, no explanation. If no work experience is found, set roles to [].

CV TEXT:
${truncated}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { roles: [], qualifications: null, notes: null };
    return JSON.parse(jsonMatch[0]) as CvExtractResult;
  } catch (err) {
    logger.error({ err }, "CV AI extraction error");
    return null;
  }
}

// ── OpenRouter extractors ─────────────────────────────────────────────────────

const PASSPORT_OCR_PROMPT = `You are a passport OCR assistant. Extract the following fields from the passport document and return them as a JSON object with exactly these keys:
- passportNo (string, passport number / document number)
- passportPlaceOfBirth (string, place of birth)
- passportIssueDate (string, issue date in YYYY-MM-DD format)
- passportExpiryDate (string, expiry/expiration date in YYYY-MM-DD format)
- name (string, full name as shown on passport)

Only include keys where you are confident in the value. Omit keys you cannot read. Return only valid JSON, no explanation.`;

/**
 * Extract passport fields via OpenRouter using a specified model.
 * Uses the OpenAI SDK pointed at OpenRouter's base URL.
 */
export async function extractPassportOpenRouter(
  buffer: Buffer,
  mimeType: string,
  model: string,
): Promise<PassportExtractResult | null> {
  const client = getOpenRouter();
  if (!client) {
    logger.warn("OPENROUTER_API_KEY not set — skipping OpenRouter passport extraction");
    return null;
  }

  const b64 = buffer.toString("base64");

  const docPart: OpenAI.Chat.ChatCompletionContentPart =
    mimeType === "application/pdf"
      ? ({
          type: "file" as const,
          file: { filename: "passport.pdf", file_data: `data:application/pdf;base64,${b64}` },
        } as unknown as OpenAI.Chat.ChatCompletionContentPartText)
      : ({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${b64}`, detail: "high" },
        } as OpenAI.Chat.ChatCompletionContentPartImage);

  const response = await client.chat.completions.create({
    model,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: PASSPORT_OCR_PROMPT }, docPart],
      },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim() ?? "";
  return parseJson<PassportExtractResult>(text);
}

/**
 * Extract certification details via OpenRouter using a specified model.
 */
export async function extractCertOpenRouter(
  buffer: Buffer,
  certTypeNames: string[],
  model: string,
  mimeType = "application/pdf",
): Promise<CertExtractResult | null> {
  const client = getOpenRouter();
  if (!client) {
    logger.warn("OPENROUTER_API_KEY not set — skipping OpenRouter cert extraction");
    return null;
  }

  const typeList = certTypeNames.slice(0, 80).join("\n");
  const prompt = `You are a certification document parser. Analyse this document and extract the following fields, then return them as a JSON object.

Known certification types in this organisation:
${typeList}

Return a JSON object with exactly these keys:
- certTypeName (string): the name of the certification from the list above that best matches this document. Use the exact name from the list. If no match, use your best description.
- dateAchieved (string | null): the date the certification was awarded/passed/achieved, in YYYY-MM-DD format. Null if not found.
- expiryDate (string | null): the expiry/renewal date in YYYY-MM-DD format. Null if not found or not applicable.
- noExpiry (boolean): true if the document explicitly states the certification does not expire or has no expiry date.
- notes (string | null): any other notable information from the document (issuing body, cert number, etc.). Null if nothing noteworthy.
- confidence ("high" | "medium" | "low"): your overall confidence in the extracted fields.

Return only valid JSON, no explanation.`;

  const b64 = buffer.toString("base64");
  const filePart: OpenAI.Chat.ChatCompletionContentPart =
    mimeType.startsWith("image/")
      ? ({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${b64}` },
        } as OpenAI.Chat.ChatCompletionContentPartImage)
      : ({
          type: "file" as const,
          file: { filename: "cert.pdf", file_data: `data:application/pdf;base64,${b64}` },
        } as unknown as OpenAI.Chat.ChatCompletionContentPartText);

  const response = await client.chat.completions.create({
    model,
    max_tokens: 8192,
    messages: [{ role: "user", content: [filePart, { type: "text", text: prompt }] }],
  });

  const text = response.choices[0]?.message?.content?.trim() ?? "";
  return parseJson<CertExtractResult>(text);
}
