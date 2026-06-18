import { createPrivateKey } from "crypto";
import { GoogleAuth } from "google-auth-library";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

function normalizePem(raw: string): string {
  let pem = raw.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  const body = pem
    .replace(/-{2,}BEGIN[^-]+-{2,}/g, "")
    .replace(/-{2,}END[^-]+-{2,}/g, "")
    .replace(/\s+/g, "");
  if (!body) throw new Error("GOOGLE_DRIVE_PRIVATE_KEY does not contain a recognisable PEM body");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

let _auth: GoogleAuth | null = null;

function getSheetsAuth(): GoogleAuth {
  if (_auth) return _auth;
  const email = process.env["GOOGLE_DRIVE_CLIENT_EMAIL"]?.trim();
  const rawKey = process.env["GOOGLE_DRIVE_PRIVATE_KEY"]?.trim();
  if (!email || !rawKey) throw new Error("GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY must be set");
  const pemKey = normalizePem(rawKey);
  createPrivateKey({ key: pemKey, format: "pem" });
  _auth = new GoogleAuth({
    credentials: { type: "service_account", client_email: email, private_key: pemKey },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
  return _auth;
}

export async function sheetsRequest(path: string, params?: URLSearchParams): Promise<Response> {
  const auth = getSheetsAuth();
  let token: string | null | undefined;
  try {
    token = await auth.getAccessToken();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invalid_grant")) {
      _auth = null;
    }
    throw err;
  }
  if (!token) throw new Error("Failed to obtain Google access token for Sheets");
  const url = params ? `${SHEETS_API}${path}?${params.toString()}` : `${SHEETS_API}${path}`;
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

export function isSheetsConfigured(): boolean {
  return !!(process.env["GOOGLE_DRIVE_CLIENT_EMAIL"] && process.env["GOOGLE_DRIVE_PRIVATE_KEY"]);
}

// ─── Spreadsheet configuration ──────────────────────────────────────────────
export const SPREADSHEET_ID = "1qcr0jZEH7pwBmUlr6XS7YK4sa-Kqk2zvXFpBTJ5velw";
export const DRIVE_ROOT_FOLDER_ID = "1Fe5rOXrcgw1lJnYUC4c9jlZe2j5Ukp52";
