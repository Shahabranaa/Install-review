/**
 * Thin Google Sheets helper — host-agnostic service-account auth.
 *
 * Requires the environment variable GOOGLE_SERVICE_ACCOUNT_JSON to be set to
 * the full JSON string of a Google service account key whose email has been
 * granted Viewer access for reads and Editor access for writes on the target
 * spreadsheet.
 */
import { google } from "googleapis";

let _authClient: Awaited<ReturnType<typeof buildAuth>> | null = null;

async function buildAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return auth.getClient();
}

async function getAuth() {
  if (!_authClient) _authClient = await buildAuth();
  return _authClient;
}

async function getSheetWithTitle(sheetId: string, gid: string) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth: auth as never });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const sheet = meta.data.sheets?.find(
    (item) => String(item.properties?.sheetId) === String(gid)
  );
  if (!sheet) throw new Error(`Sheet with GID ${gid} not found in spreadsheet ${sheetId}`);
  return { sheets, title: sheet.properties?.title ?? "Sheet1" };
}

/**
 * Fetch all values from a sheet tab identified by numeric GID.
 * Returns rows as string arrays (including the header row as row[0]).
 * Throws if GOOGLE_SERVICE_ACCOUNT_JSON is missing or auth fails.
 */
export async function fetchSheetRows(sheetId: string, gid: string): Promise<string[][]> {
  const { sheets, title } = await getSheetWithTitle(sheetId, gid);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${title}'!A:F`,
  });

  return (response.data.values ?? []).map((row) =>
    (row as (string | null | undefined)[]).map((cell) => (cell ?? "").trim())
  );
}

/**
 * Appends rows to a tab identified by numeric GID. When headers are provided,
 * a blank sheet is initialised with those headers and an existing tab must
 * already match them exactly.
 */
export async function appendSheetRows(
  sheetId: string,
  gid: string,
  values: string[][],
  headers?: string[],
): Promise<number> {
  if (values.length === 0) return 0;

  const { sheets, title } = await getSheetWithTitle(sheetId, gid);
  const range = `'${title}'!A:${String.fromCharCode(64 + values[0].length)}`;

  if (headers) {
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${title}'!A1:${String.fromCharCode(64 + headers.length)}1`,
    });
    const existingHeaders = (headerResponse.data.values?.[0] ?? [])
      .map((cell) => String(cell).trim());

    if (existingHeaders.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'${title}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    } else if (
      existingHeaders.length !== headers.length ||
      existingHeaders.some((header, index) => header !== headers[index])
    ) {
      throw new Error(`The destination tab header must be: ${headers.join(", ")}`);
    }
  }

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });

  return response.data.updates?.updatedRows ?? values.length;
}
