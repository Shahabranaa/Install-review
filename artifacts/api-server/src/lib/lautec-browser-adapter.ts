import { appSettingsTable, db, type DprLautecRejectedRow, type DprLautecSnapshotRow } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { assertApprovedLautecBrowserUrl, assertApprovedLautecUrl } from "./lautec-url-policy.js";

type SelectorMap = {
  username: string;
  password: string;
  continueSubmit: string;
  loginSubmit: string;
  loginComplete?: string;
  resetRows?: string;
  addRow?: string;
  row?: string;
  activityGroup?: string;
  activity?: string;
  location?: string;
  start?: string;
  finish?: string;
  comment?: string;
  pax?: string;
  submit?: string;
  success?: string;
  rejectedRows?: string;
  importDataButton?: string;
};

export type LautecBrowserConfig = {
  loginUrl: string;
  selectors: SelectorMap;
  username: string;
  password: string;
};

export type LautecBrowserResult = {
  rowsSubmitted: number;
  rejectedRows: DprLautecRejectedRow[];
  confirmation: string | null;
};

/**
 * This small interface keeps the business sequence testable without launching
 * Chromium. The production implementation below operates only through visible
 * browser controls; it does not call a Lautec HTTP endpoint.
 */
export interface LautecUi {
  login(username: string, password: string): Promise<void>;
  openImport(teamName: string, date: string): Promise<void>;
  ensureRows(rowCount: number): Promise<void>;
  populateRow(index: number, row: DprLautecSnapshotRow): Promise<void>;
  verifyRow(index: number, row: DprLautecSnapshotRow): Promise<void>;
  submit(): Promise<{ confirmation: string | null; rejectedRows: DprLautecRejectedRow[] }>;
  close(): Promise<void>;
}

function configError(message: string): Error {
  return new Error(`Lautec browser configuration is incomplete: ${message}`);
}

const LAUTEC_TWO_STEP_LOGIN_DEFAULTS: Pick<
  SelectorMap,
  "username" | "continueSubmit" | "password" | "loginSubmit"
> = {
  username: 'input[type="email"]',
  continueSubmit: "button[type=submit]",
  password: 'input[type="password"]',
  loginSubmit: "button[type=submit]",
};

export async function getLautecBrowserConfig(): Promise<LautecBrowserConfig> {
  const configRows = await db.select().from(appSettingsTable)
    .where(inArray(appSettingsTable.key, ["lautec_login_url", "lautec_ui_selectors"]));
  const saved = Object.fromEntries(configRows.map((row) => [row.key, row.value]));
  const username = process.env.LAUTEC_USERNAME;
  const password = process.env.LAUTEC_PASSWORD;
  const loginUrl = saved.lautec_login_url ?? process.env.LAUTEC_LOGIN_URL ?? "https://dpr.lautec.com/";
  const rawSelectors = process.env.LAUTEC_UI_SELECTORS_JSON;

  if (!username || !password) throw configError("LAUTEC_USERNAME and LAUTEC_PASSWORD must be set.");
  if (!loginUrl) throw configError("LAUTEC_LOGIN_URL must be set.");
  try {
    assertApprovedLautecUrl(loginUrl);
  } catch (error) {
    throw configError(error instanceof Error ? error.message : "an approved Lautec URL is required.");
  }

  let selectors: SelectorMap;
  try {
    const environmentSelectors = rawSelectors ? JSON.parse(rawSelectors) as Partial<SelectorMap> : {};
    const savedSelectors = saved.lautec_ui_selectors
      ? JSON.parse(saved.lautec_ui_selectors) as Partial<SelectorMap>
      : {};
    selectors = {
      ...LAUTEC_TWO_STEP_LOGIN_DEFAULTS,
      ...environmentSelectors,
      ...savedSelectors,
      continueSubmit: savedSelectors.continueSubmit
        ?? environmentSelectors.continueSubmit
        ?? LAUTEC_TWO_STEP_LOGIN_DEFAULTS.continueSubmit,
    } as SelectorMap;
  } catch {
    throw configError("Lautec UI selectors must be valid JSON.");
  }
  const required = [
    "username", "password", "continueSubmit", "loginSubmit",
  ] as const;
  const missing = required.filter((key) => !selectors[key]?.trim());
  if (missing.length > 0) throw configError(`selectors missing: ${missing.join(", ")}.`);

  return {
    username,
    password,
    loginUrl,
    selectors,
  };
}

export async function performLautecUiImport(
  ui: LautecUi,
  input: {
    teamName: string;
    date: string;
    rows: DprLautecSnapshotRow[];
    username: string;
    password: string;
    beforeSubmit?: () => Promise<void>;
  },
): Promise<LautecBrowserResult> {
  try {
    await ui.login(input.username, input.password);
    await ui.openImport(input.teamName, input.date);
    await ui.ensureRows(input.rows.length);
    for (let index = 0; index < input.rows.length; index += 1) {
      await ui.populateRow(index, input.rows[index]);
      await ui.verifyRow(index, input.rows[index]);
    }
    // Confirm the whole grid again immediately before submit. This catches a
    // dependent dropdown/update that changes an earlier row while later rows
    // are being completed.
    for (let index = 0; index < input.rows.length; index += 1) {
      await ui.verifyRow(index, input.rows[index]);
    }
    // Persist the pre-submit state before the visible Lautec Submit click.
    // A lost browser confirmation after this point is potentially an accepted
    // import and must never be treated as an ordinary safe-to-retry failure.
    await input.beforeSubmit?.();
    const result = await ui.submit();
    return {
      rowsSubmitted: input.rows.length,
      rejectedRows: result.rejectedRows,
      confirmation: result.confirmation,
    };
  } finally {
    await ui.close();
  }
}

export function lautecDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid DPR date: ${date}`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function normaliseVisibleText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export type LautecVisibleTableSnapshot = {
  headers: string[];
  rows: string[][];
};

function visibleRowKey(row: string[]): string {
  return JSON.stringify(row.map(normaliseVisibleText));
}

function addedVisibleRows(
  baseline: LautecVisibleTableSnapshot,
  current: LautecVisibleTableSnapshot,
): string[][] | null {
  if (
    baseline.headers.length !== current.headers.length
    || baseline.headers.some((header, index) =>
      normaliseVisibleText(header) !== normaliseVisibleText(current.headers[index] ?? ""))
  ) {
    return null;
  }
  const remaining = current.rows.map((row) => ({ key: visibleRowKey(row), row }));
  for (const baselineRow of baseline.rows) {
    const key = visibleRowKey(baselineRow);
    const matchIndex = remaining.findIndex((candidate) => candidate.key === key);
    if (matchIndex < 0) return null;
    remaining.splice(matchIndex, 1);
  }
  return remaining.map((candidate) => candidate.row);
}

export function lautecTableDeltaMatchesReviewedRows(
  baseline: LautecVisibleTableSnapshot,
  current: LautecVisibleTableSnapshot,
  expectedRows: DprLautecSnapshotRow[],
): boolean {
  const addedRows = addedVisibleRows(baseline, current);
  if (!addedRows || addedRows.length !== expectedRows.length) return false;

  const headers = current.headers.map(normaliseVisibleText);
  const column = (predicate: (header: string) => boolean) => headers.findIndex(predicate);
  const indexes = {
    activityGroup: column((header) => header.includes("activity group")),
    activity: column((header) => header === "activity"),
    location: column((header) => header.includes("location") || header.includes("position")),
    start: column((header) => header.includes("start")),
    finish: column((header) => header.includes("finish")),
    comment: column((header) => header.includes("comment")),
    pax: column((header) => header.startsWith("pax") || header.includes(" pax")),
  };
  if (Object.values(indexes).some((index) => index < 0)) return false;
  if (addedRows.some((row) => normaliseVisibleText(row[indexes.pax] ?? "") !== "")) return false;

  const unmatched = [...addedRows];
  for (const row of expectedRows) {
    const expected = {
      activityGroup: normaliseVisibleText(row.activityGroup),
      activity: normaliseVisibleText(row.activity),
      location: normaliseVisibleText(row.location),
      start: normaliseVisibleText(row.start),
      finish: normaliseVisibleText(row.finish),
      comment: normaliseVisibleText(row.comment),
    };
    const matchIndex = unmatched.findIndex((visibleRow) =>
      normaliseVisibleText(visibleRow[indexes.activityGroup] ?? "") === expected.activityGroup
      && normaliseVisibleText(visibleRow[indexes.activity] ?? "") === expected.activity
      && normaliseVisibleText(visibleRow[indexes.location] ?? "") === expected.location
      && normaliseVisibleText(visibleRow[indexes.start] ?? "") === expected.start
      && normaliseVisibleText(visibleRow[indexes.finish] ?? "") === expected.finish
      && normaliseVisibleText(visibleRow[indexes.comment] ?? "") === expected.comment);
    if (matchIndex < 0) return false;
    unmatched.splice(matchIndex, 1);
  }
  return true;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Creates the concrete Puppeteer implementation. @sparticuz/chromium works in
 * Vercel's serverless Linux runtime while LAUTEC_BROWSER_EXECUTABLE_PATH makes
 * local controlled runs possible with a separately installed browser.
 */
export async function createPuppeteerLautecUi(config: LautecBrowserConfig): Promise<LautecUi> {
  const puppeteerModule = await import("puppeteer-core");
  const chromiumModule = await import("@sparticuz/chromium");
  const puppeteer = puppeteerModule.default;
  const chromium = chromiumModule.default;
  const executablePath = process.env.LAUTEC_BROWSER_EXECUTABLE_PATH || await chromium.executablePath();
  if (!executablePath) throw new Error("No Chromium executable is available for the Lautec import.");

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 900 },
    executablePath,
    headless: true,
  });
  // Puppeteer's ElementHandle and Page types intentionally have distinct
  // private members. The adapter uses the same `$`/keyboard interaction
  // surface for both row handles and the page, so keep this local bridge
  // untyped rather than leaking browser-specific types into the service API.
  const page: any = await browser.newPage();
  page.setDefaultTimeout(15_000);
  let requestedRowCount = 0;
  let importDialogTitle = "";
  let currentTeamName = "";
  let currentDate = "";
  let preImportTable: LautecVisibleTableSnapshot | null = null;
  let expectedRows: DprLautecSnapshotRow[] = [];

  function verifyApprovedPage(): void {
    assertApprovedLautecBrowserUrl(page.url());
  }

  function verifyApprovedDprPage(): void {
    verifyApprovedPage();
    if (new URL(page.url()).origin !== "https://dpr.lautec.com") {
      throw new Error("Lautec browser did not return to the approved DPR application after sign-in.");
    }
  }

  async function requireElement(selector: string, context: any = page) {
    const element = await context.$(selector);
    if (!element) throw new Error(`Lautec page did not show the expected control: ${selector}`);
    return element;
  }

  async function replaceValue(selector: string, value: string, context: any = page): Promise<void> {
    const element = await requireElement(selector, context);
    await element.click();
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    if (value) await page.keyboard.type(value);
    await page.keyboard.press("Tab");
    await pause(150);
  }

  async function stringProperty(element: any, property: string): Promise<string | null> {
    const handle = await element.getProperty(property);
    try {
      const value = await handle.jsonValue();
      return typeof value === "string" ? value : null;
    } finally {
      await handle.dispose();
    }
  }

  async function visibleDprTableSnapshot(): Promise<LautecVisibleTableSnapshot> {
    const tables = await page.$$("table, mat-table, [role=table], [role=grid]");
    for (const table of tables) {
      if (!await table.boundingBox()) continue;
      const headerElements = await table.$$(
        "thead th, th.mat-mdc-header-cell, th.mat-header-cell, mat-header-cell, [role=columnheader]",
      );
      const headers: string[] = [];
      for (const header of headerElements) {
        headers.push((await stringProperty(header, "textContent") ?? "").trim());
      }
      const normalisedHeaders = headers.map(normaliseVisibleText);
      if (
        !normalisedHeaders.some((header) => header.includes("activity group"))
        || !normalisedHeaders.some((header) => header.startsWith("pax") || header.includes(" pax"))
      ) {
        continue;
      }
      const rowElements = await table.$$("tbody tr, tr.mat-mdc-row, tr.mat-row, mat-row, [role=row]");
      const rows: string[][] = [];
      for (const row of rowElements) {
        if (!await row.boundingBox()) continue;
        const cellElements = await row.$$(
          "td, td.mat-mdc-cell, td.mat-cell, mat-cell, [role=cell], [role=gridcell]",
        );
        if (cellElements.length === 0) continue;
        const cells: string[] = [];
        for (const cell of cellElements) {
          cells.push((await stringProperty(cell, "textContent") ?? "").trim());
        }
        rows.push(cells);
      }
      return { headers, rows };
    }
    throw new Error("Lautec did not show the selected team's visible activity table.");
  }

  async function waitForVisibleDprTable(): Promise<LautecVisibleTableSnapshot> {
    const deadline = Date.now() + 30_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        return await visibleDprTableSnapshot();
      } catch (error) {
        lastError = error;
      }
      await pause(500);
    }
    throw lastError instanceof Error ? lastError : new Error("Lautec activity table did not become visible.");
  }

  async function waitForReviewedTableDelta(
    baseline: LautecVisibleTableSnapshot,
  ): Promise<LautecVisibleTableSnapshot> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const current = await visibleDprTableSnapshot();
        if (lautecTableDeltaMatchesReviewedRows(baseline, current, expectedRows)) {
          return current;
        }
      } catch {
        // The table may briefly disappear while Lautec redraws or reloads it.
      }
      await pause(500);
    }
    throw new Error("Lautec did not visibly retain the exact newly reviewed rows with blank PAX.");
  }

  async function assertGridContainsOnlyReviewedRows(): Promise<void> {
    const occupiedRows = await page.evaluate(
      `Array.from(new Set(
        Array.from(document.querySelectorAll('td[data-x][data-y]'))
          .filter((cell) => (cell.textContent || "").trim().length > 0)
          .map((cell) => Number(cell.getAttribute("data-y")))
      )).sort((a, b) => a - b)`,
    ) as number[];
    const expectedIndexes = Array.from({ length: requestedRowCount }, (_, index) => index);
    if (
      occupiedRows.length !== expectedIndexes.length
      || occupiedRows.some((rowIndex, index) => rowIndex !== expectedIndexes[index])
    ) {
      throw new Error("Lautec Import Data contains rows outside the reviewed Capture snapshot.");
    }
  }

  async function valueOf(selector: string, context: any = page): Promise<string> {
    const element = await requireElement(selector, context);
    const value = await stringProperty(element, "value");
    if (value !== null) return value.trim();
    return (await stringProperty(element, "textContent") ?? "").trim();
  }

  async function clickVisibleButton(label: RegExp): Promise<void> {
    const source = JSON.stringify(label.source);
    const flags = JSON.stringify(label.flags);
    const handle = await page.evaluateHandle(
      `(() => {
        const pattern = new RegExp(${source}, ${flags});
        const visible = (element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        return Array.from(document.querySelectorAll("button, a, [role=button]"))
          .find((element) => visible(element) && pattern.test((element.textContent || "").trim()));
      })()`,
    );
    const target = handle.asElement();
    if (!target) {
      await handle.dispose();
      throw new Error(`Lautec did not show the expected action: ${label.source}`);
    }
    await target.click();
    await handle.dispose();
  }

  async function gridCell(column: number, row: number) {
    return requireElement(`td[data-x="${column}"][data-y="${row}"]`);
  }

  async function selectGridOption(column: number, row: number, expectedValue: string, label: string): Promise<void> {
    const cell = await gridCell(column, row);
    await cell.click({ clickCount: 2 });
    await page.waitForSelector(".jdropdown-container", { visible: true });
    const container = await requireElement(".jdropdown-container");
    const options = await container.$$(".jdropdown-item");
    let selected = false;
    for (const option of options) {
      const text = (await stringProperty(option, "textContent") ?? "").trim();
      const matches = text.toLowerCase() === expectedValue.trim().toLowerCase();
      if (!matches) continue;
      await option.click();
      selected = true;
      break;
    }
    if (!selected) {
      throw new Error(`Lautec row ${row + 1} has no ${label} option named "${expectedValue}".`);
    }
    await pause(500);
  }

  async function enterGridText(column: number, row: number, value: string): Promise<void> {
    const cell = await gridCell(column, row);
    await cell.click({ clickCount: 2 });
    await pause(100);
    if (value) await page.keyboard.type(value);
    await page.keyboard.press("Enter");
    await pause(150);
  }

  async function gridValue(column: number, row: number): Promise<string> {
    const cell = await gridCell(column, row);
    return (await stringProperty(cell, "textContent") ?? "").trim();
  }

  async function waitForEditorControls(teamName: string): Promise<void> {
    const encodedTeamName = JSON.stringify(teamName);
    await page.waitForFunction(
      `(() => {
        const requestedTeam = ${encodedTeamName};
        const normalise = (value) => (value || "").replace(/\\s+/g, "").toLowerCase();
        const visible = (element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const controls = Array.from(document.querySelectorAll("button, a, [role=button]"));
        return controls.some((element) => visible(element) && /\\bimport\\s+data\\b/i.test(element.textContent || ""))
          && controls.some((element) => visible(element) && normalise(element.textContent) === normalise(requestedTeam));
      })()`,
      { timeout: 45_000 },
    );
  }

  async function clickDateEdit(date: string, teamName: string): Promise<void> {
    const label = lautecDateLabel(date);
    const encodedLabel = JSON.stringify(label);
    await page.waitForFunction(
      `document.body.innerText.includes(${encodedLabel})`,
      { timeout: 15_000 },
    );
    const handle = await page.evaluateHandle(
      `(() => {
        const dateLabel = ${encodedLabel};
        const visible = (element) => {
          const style = window.getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().width > 0;
        };
        const edit = (root) => Array.from(root.querySelectorAll("button, a, [role=button]"))
          .find((element) => visible(element) && /\\bedit\\b/i.test(element.textContent || ""));
        const candidates = Array.from(document.querySelectorAll("body *"))
          .filter((element) => visible(element) && (element.textContent || "").includes(dateLabel))
          .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
        for (const candidate of candidates) {
          let root = candidate;
          for (let depth = 0; depth < 7 && root; depth += 1, root = root.parentElement) {
            const editButton = edit(root);
            if (editButton) {
              return editButton;
            }
          }
        }
        return null;
      })()`,
    );
    const editButton = handle.asElement();
    if (!editButton) {
      await handle.dispose();
      throw new Error(`Lautec dashboard did not show an Edit control for ${label}.`);
    }
    await editButton.click();
    await handle.dispose();
    await waitForEditorControls(teamName);
    await pause(1_000);
  }

  async function clickImportData(): Promise<void> {
    if (config.selectors.importDataButton) {
      await page.waitForSelector(config.selectors.importDataButton, { visible: true });
      await page.click(config.selectors.importDataButton);
      return;
    }
    await page.waitForFunction(
      `Array.from(document.querySelectorAll("button, a, [role=button]"))
        .some((element) => /\\bimport\\s+data\\b/i.test(element.textContent || "") && element.getBoundingClientRect().width > 0)`,
      { timeout: 15_000 },
    );
    const handle = await page.evaluateHandle(
      `(() => {
        const visible = (element) => {
          const style = window.getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().width > 0;
        };
        const button = Array.from(document.querySelectorAll("button, a, [role=button]"))
          .find((element) => visible(element) && /\\bimport\\s+data\\b/i.test(element.textContent || ""));
        return button || null;
      })()`,
    );
    const button = handle.asElement();
    if (!button) {
      await handle.dispose();
      throw new Error("Lautec DPR page did not show an Import Data control.");
    }
    await button.click();
    await handle.dispose();
  }

  async function clickTeamTab(teamName: string): Promise<void> {
    const encodedTeamName = JSON.stringify(teamName);
    await page.waitForFunction(
      `(() => {
        const requestedTeam = ${encodedTeamName};
        const normalise = (value) => (value || "").replace(/\\s+/g, "").toLowerCase();
        return Array.from(document.querySelectorAll("button, a, [role=button]"))
          .some((element) => element.getBoundingClientRect().width > 0 && normalise(element.textContent) === normalise(requestedTeam));
      })()`,
      { timeout: 15_000 },
    );
    const handle = await page.evaluateHandle(
      `(() => {
        const requestedTeam = ${encodedTeamName};
        const normalise = (value) => (value || "").replace(/\\s+/g, "").toLowerCase();
        const visible = (element) => {
          const style = window.getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().width > 0;
        };
        const target = Array.from(document.querySelectorAll("button, a, [role=button]"))
          .find((element) => visible(element) && normalise(element.textContent) === normalise(requestedTeam));
        return target || null;
      })()`,
    );
    const target = handle.asElement();
    if (!target) {
      await handle.dispose();
      throw new Error(`Lautec DPR page did not show the requested team tab: ${teamName}.`);
    }
    await target.click();
    await handle.dispose();
    await pause(250);
  }

  return {
    async login(username, password) {
      await page.goto(config.loginUrl, { waitUntil: "domcontentloaded" });
      verifyApprovedPage();
      await page.waitForSelector(config.selectors.username, { visible: true });
      verifyApprovedPage();
      await replaceValue(config.selectors.username, username);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }),
        page.click(config.selectors.continueSubmit),
      ]);
      await page.waitForSelector(config.selectors.password, { visible: true });
      verifyApprovedPage();
      await replaceValue(config.selectors.password, password);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }),
        page.click(config.selectors.loginSubmit),
      ]);
      if (config.selectors.loginComplete) {
        await page.waitForSelector(config.selectors.loginComplete, { visible: true });
      } else {
        await page.waitForFunction(
          `location.hostname === "dpr.lautec.com"
            && (document.body.innerText || "").includes("DPRs")
            && (document.body.innerText || "").includes("Edit")`,
          { timeout: 60_000 },
        );
      }
      // Lautec continues through several app redirects after the password form
      // disappears. Do not click a DPR card until the final route is stable.
      await pause(5_000);
      verifyApprovedDprPage();
    },
    async openImport(teamName, date) {
      verifyApprovedDprPage();
      currentTeamName = teamName;
      currentDate = date;
      expectedRows = [];
      await clickDateEdit(date, teamName);
      await clickTeamTab(teamName);
      preImportTable = await waitForVisibleDprTable();
      await clickImportData();
      importDialogTitle = `${teamName}: Import Data`;
      await page.waitForSelector('td[data-x="0"][data-y="0"]', { visible: true, timeout: 30_000 });
    },
    async ensureRows(rowCount) {
      requestedRowCount = rowCount;
      const rows = await page.$$('td[data-x="0"][data-y]');
      if (rows.length < rowCount) {
        throw new Error(`Lautec Import Data only exposed ${rows.length} rows for a ${rowCount}-row import.`);
      }
      const occupiedCellCount = await page.evaluate(
        `Array.from(document.querySelectorAll('td[data-x][data-y]'))
          .filter((cell) => (cell.textContent || "").trim().length > 0).length`,
      ) as number;
      if (occupiedCellCount !== 0) {
        throw new Error("Lautec Import Data did not open with an empty grid; refusing to submit unreviewed rows.");
      }
    },
    async populateRow(index, row) {
      expectedRows[index] = { ...row };
      await selectGridOption(0, index, row.activityGroup, "Activity Group");
      await selectGridOption(1, index, row.activity, "Activity");
      await selectGridOption(2, index, row.location, "Location");
      await enterGridText(3, index, row.start);
      await enterGridText(4, index, row.finish);
      await enterGridText(5, index, row.comment);
      // PAX (column 6) is intentionally never populated.
    },
    async verifyRow(index, row) {
      const expected: Array<[string, number, string, boolean]> = [
        ["Activity Group", 0, row.activityGroup, true],
        ["Activity", 1, row.activity, true],
        ["Location", 2, row.location, true],
        ["Start", 3, row.start, false],
        ["Finish", 4, row.finish, false],
        ["Comment", 5, row.comment, false],
        ["PAX", 6, "", false],
      ];
      for (const [label, column, expectedValue, caseInsensitive] of expected) {
        const cell = await gridCell(column, index);
        const className = await stringProperty(cell, "className") ?? "";
        const warning = className.split(/\s+/).includes("jss_warning");
        const shown = await gridValue(column, index);
        const retained = caseInsensitive
          ? shown.toLowerCase() === expectedValue.toLowerCase()
          : shown === expectedValue;
        if (!retained || warning) {
          throw new Error(`Lautec row ${index + 1} did not retain ${label}.`);
        }
      }
    },
    async submit() {
      verifyApprovedDprPage();
      if (!preImportTable) throw new Error("Lautec import baseline is missing.");
      await assertGridContainsOnlyReviewedRows();
      if (config.selectors.submit) {
        await page.click(config.selectors.submit);
      } else {
        await clickVisibleButton(/^Import$/i);
      }
      await page.waitForFunction(
        `!(document.body.innerText || "").includes(${JSON.stringify(importDialogTitle)})`,
        { timeout: 30_000 },
      );
      await pause(1_500);
      await waitForReviewedTableDelta(preImportTable);
      await clickVisibleButton(/^Save\s+Changes$/i);
      await page.waitForFunction(
        `!(document.body.innerText || "").includes("There are unsaved changes")`,
        { timeout: 30_000 },
      );
      // A reload forces a server-backed read of the selected DPR. Only this
      // visible readback can promote the pre-submit checkpoint to success.
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
      verifyApprovedDprPage();
      await waitForEditorControls(currentTeamName);
      await clickTeamTab(currentTeamName);
      await waitForReviewedTableDelta(preImportTable);
      const rejectedRows: DprLautecRejectedRow[] = [];
      if (config.selectors.rejectedRows) {
        const rejected = await page.$$(config.selectors.rejectedRows);
        for (let index = 0; index < rejected.length; index += 1) {
          const reason = (await stringProperty(rejected[index], "textContent") ?? "").trim();
          if (reason) rejectedRows.push({ rowNumber: index + 1, reason });
        }
      }
      const confirmation = config.selectors.success
        ? await page.waitForSelector(config.selectors.success, { visible: true })
          .then(() => valueOf(config.selectors.success!))
          .catch(() => null)
        : `Reloaded ${currentDate} / ${currentTeamName} and confirmed ${requestedRowCount} saved row(s)`;
      return { confirmation, rejectedRows };
    },
    async close() {
      await browser.close();
    },
  };
}

export async function runLautecBrowserImport(input: {
  teamName: string;
  date: string;
  rows: DprLautecSnapshotRow[];
  beforeSubmit?: () => Promise<void>;
}): Promise<LautecBrowserResult> {
  const config = await getLautecBrowserConfig();
  const ui = await createPuppeteerLautecUi(config);
  return performLautecUiImport(ui, { ...input, username: config.username, password: config.password });
}