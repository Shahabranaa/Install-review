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

/** Extract role/project history from CV PDF text using GPT-4o.
 *  Returns null if OpenAI is not configured or extraction fails.
 */
export async function extractCvRoles(
  pdfText: string,
): Promise<CvRoleEntry[] | null> {
  const openai = getOpenAI();
  if (!openai) {
    logger.warn("OPENAI_API_KEY not set — skipping CV extraction");
    return null;
  }

  try {
    const truncated = pdfText.slice(0, 12000);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a CV parser. Extract all work experience / project roles from the following CV text and return them as a JSON array. Each entry must have exactly these keys:
- project (string, company or project name)
- role (string, job title / role)
- dateFrom (string, start date, format YYYY-MM if known, otherwise approximate year e.g. "2019")
- dateTo (string, end date in same format, or "Present" if current)

Return only the JSON array, no explanation. If no work experience is found, return [].

CV TEXT:
${truncated}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]) as CvRoleEntry[];
  } catch (err) {
    logger.error({ err }, "CV AI extraction error");
    return null;
  }
}
