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

async function getSheetsClient() {
  const auth = await getAuth();
  return google.sheets({ version: "v4", auth: auth as never });
}

async function getSheetWithTitle(sheetId: string, gid: string) {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const sheet = meta.data.sheets?.find(
    (item) => String(item.properties?.sheetId) === String(gid)
  );
  if (!sheet) throw new Error(`Sheet with GID ${gid} not found in spreadsheet ${sheetId}`);
  return { sheets, title: sheet.properties?.title ?? "Sheet1" };
}

export function sheetTabRange(title: string, columnCount: number): string {
  if (!Number.isInteger(columnCount) || columnCount < 1 || columnCount > 26) {
    throw new Error("Sheet column count must be between 1 and 26.");
  }
  const escapedTitle = title.replace(/'/g, "''");
  return `'${escapedTitle}'!A:${String.fromCharCode(64 + columnCount)}`;
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
 * Fetches all values from a tab by its visible title. This is intentionally
 * separate from the GID helper because DPR Capture tabs are named by date.
 */
export async function fetchSheetRowsByTitle(sheetId: string, title: string, columnCount = 6): Promise<string[][]> {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets(properties(title))",
  });
  const exists = meta.data.sheets?.some((sheet) => sheet.properties?.title === title);
  if (!exists) throw new Error(`Sheet tab "${title}" not found in spreadsheet ${sheetId}`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: sheetTabRange(title, columnCount),
  });
  return (response.data.values ?? []).map((row) =>
    (row as (string | null | undefined)[]).map((cell) => String(cell ?? "").trim()),
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

/**
 * Appends rows to a named tab, creating the tab when it does not exist.
 * Existing tabs are validated against the expected header before writing.
 */
export async function appendSheetRowsToTab(
  sheetId: string,
  title: string,
  values: string[][],
  headers?: string[],
): Promise<number> {
  if (values.length === 0) return 0;

  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const existing = meta.data.sheets?.find((sheet) => sheet.properties?.title === title);

  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    });
  }

  const escapedTitle = title.replace(/'/g, "''");
  const endColumn = String.fromCharCode(64 + (headers?.length ?? values[0].length));

  if (headers) {
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${escapedTitle}'!A1:${endColumn}1`,
    });
    const existingHeaders = (headerResponse.data.values?.[0] ?? [])
      .map((cell) => String(cell).trim());

    if (existingHeaders.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'${escapedTitle}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    } else if (
      existingHeaders.length !== headers.length ||
      existingHeaders.some((header, index) => header !== headers[index])
    ) {
      throw new Error(`The "${title}" tab header must be: ${headers.join(", ")}`);
    }
  }

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `'${escapedTitle}'!A:${endColumn}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });

  return response.data.updates?.updatedRows ?? values.length;
}

export function buildRawSheetTabValuesRequest(
  tabs: Array<{ title: string; values: string[][] }>,
  headers: string[],
) {
  return {
    // DPR data can contain user-entered comments such as "=SUM(A1:A2)".
    // RAW prevents Sheets from executing those values as formulas.
    valueInputOption: "RAW" as const,
    data: tabs.map((tab) => ({
      range: `'${tab.title.replace(/'/g, "''")}'!A1`,
      values: [headers, ...tab.values],
    })),
  };
}

/**
 * Rebuilds a set of named tabs in three batched operations: create missing
 * tabs, clear their old values, then write the supplied headers and rows.
 * Tabs not named in `tabs` are never touched.
 */
export async function replaceSheetRowsByTab(
  sheetId: string,
  tabs: Array<{ title: string; values: string[][] }>,
  headers: string[],
): Promise<number> {
  if (tabs.length === 0) return 0;

  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets(properties(title))",
  });
  const existingTitles = new Set(
    (meta.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title)),
  );
  const missingTitles = tabs
    .map((tab) => tab.title)
    .filter((title) => !existingTitles.has(title));

  if (missingTitles.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: missingTitles.map((title) => ({ addSheet: { properties: { title } } })),
      },
    });
  }

  const endColumn = String.fromCharCode(64 + headers.length);
  const rangeFor = (title: string) => `'${title.replace(/'/g, "''")}'!A:${endColumn}`;
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId: sheetId,
    requestBody: { ranges: tabs.map((tab) => rangeFor(tab.title)) },
  });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: buildRawSheetTabValuesRequest(tabs, headers),
  });

  return tabs.reduce((total, tab) => total + tab.values.length, 0);
}
