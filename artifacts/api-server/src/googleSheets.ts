/**
 * Thin Google Sheets helper — host-agnostic service-account auth.
 *
 * Requires the environment variable GOOGLE_SERVICE_ACCOUNT_JSON to be set to
 * the full JSON string of a Google service account key whose email has been
 * granted at least Viewer access on the target sheet.
 */
import { google } from "googleapis";

let _authClient: Awaited<ReturnType<typeof buildAuth>> | null = null;

async function buildAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return auth.getClient();
}

async function getAuth() {
  if (!_authClient) _authClient = await buildAuth();
  return _authClient;
}

/**
 * Fetch all values from a sheet tab identified by numeric GID.
 * Returns rows as string arrays (including the header row as row[0]).
 * Throws if GOOGLE_SERVICE_ACCOUNT_JSON is missing or auth fails.
 */
export async function fetchSheetRows(sheetId: string, gid: string): Promise<string[][]> {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth: auth as never });

  // Resolve the GID to a sheet title so we can use A:Z range notation
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const sheet = meta.data.sheets?.find(
    (s) => String(s.properties?.sheetId) === String(gid)
  );
  if (!sheet) throw new Error(`Sheet with GID ${gid} not found in spreadsheet ${sheetId}`);
  const title = sheet.properties?.title ?? "Sheet1";

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${title}'!A:F`,
  });

  return (response.data.values ?? []).map((row) =>
    (row as (string | null | undefined)[]).map((cell) => (cell ?? "").trim())
  );
}
