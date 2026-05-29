import OpenAI from "openai";
import { logger } from "./logger.js";

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
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

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a passport OCR assistant. Extract the following fields from the passport image and return them as a JSON object with exactly these keys:
- passportNo (string, passport number / document number)
- passportPlaceOfBirth (string, place of birth)
- passportIssueDate (string, issue date in YYYY-MM-DD format)
- passportExpiryDate (string, expiry/expiration date in YYYY-MM-DD format)
- name (string, full name as shown on passport)

Only include keys where you are confident in the value. Omit keys you cannot read. Return only valid JSON, no explanation.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${b64}`,
                detail: "high",
              },
            },
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

/** Extract role/project history, qualifications, and notes from CV PDF text.
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
