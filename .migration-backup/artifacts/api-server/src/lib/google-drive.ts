import { createPrivateKey } from "crypto";
import { GoogleAuth } from "google-auth-library";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

/**
 * Normalises a PEM private key that may:
 * - Have literal "\n" sequences instead of real newlines
 * - Have wrong dash counts in the header/footer (e.g. 4 instead of 5)
 * - Have irregular base64 line lengths
 *
 * Returns a well-formed PKCS#8 PEM string that Node.js / OpenSSL 3 accepts.
 */
function normalizePem(raw: string): string {
  // 1. Convert literal \n → real newlines, remove \r
  let pem = raw.replace(/\\n/g, "\n").replace(/\r/g, "").trim();

  // 2. Strip ALL existing header/footer lines (regardless of dash count)
  //    then reconstruct with exactly 5 dashes each side.
  const body = pem
    .replace(/-{2,}BEGIN[^-]+-{2,}/g, "") // remove header (any dash count)
    .replace(/-{2,}END[^-]+-{2,}/g, "")   // remove footer (any dash count)
    .replace(/\s+/g, "");                  // strip all whitespace from body

  if (!body) {
    throw new Error("GOOGLE_DRIVE_PRIVATE_KEY does not contain a recognisable PEM body");
  }

  // 3. Rebuild with canonical 64-char lines and correct headers
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

let _auth: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (_auth) return _auth;

  const email = process.env["GOOGLE_DRIVE_CLIENT_EMAIL"]?.trim();
  const rawKey = process.env["GOOGLE_DRIVE_PRIVATE_KEY"]?.trim();

  if (!email || !rawKey) {
    throw new Error("GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY must be set");
  }

  const pemKey = normalizePem(rawKey);

  // Validate the key is parseable by Node.js crypto before handing to Google Auth
  createPrivateKey({ key: pemKey, format: "pem" });

  _auth = new GoogleAuth({
    credentials: {
      type: "service_account",
      client_email: email,
      private_key: pemKey,
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return _auth;
}

export async function driveRequest(
  path: string,
  params?: URLSearchParams,
): Promise<Response> {
  const auth = getAuth();
  const token = await auth.getAccessToken();

  if (!token) {
    throw new Error("Failed to obtain Google access token");
  }

  const url = params
    ? `${DRIVE_API}${path}?${params.toString()}`
    : `${DRIVE_API}${path}`;

  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function isDriveConfigured(): boolean {
  return !!(
    process.env["GOOGLE_DRIVE_CLIENT_EMAIL"] &&
    process.env["GOOGLE_DRIVE_PRIVATE_KEY"]
  );
}
