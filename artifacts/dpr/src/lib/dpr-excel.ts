import type { WorkBook } from "xlsx";

export type DprExcelRow = {
  rowNumber: number;
  teamRaw: string;
  activityGroupRaw: string;
  activityRaw: string;
  locationRaw: string;
  dateRaw: string;
  startTime: string;
  endTime: string;
  notes: string;
  paxRaw: string;
};

const REQUIRED_HEADERS: ReadonlyArray<{ key: string; label: string; aliases: readonly string[] }> = [
  { key: "team", label: "Activity Stream", aliases: ["activity stream"] },
  { key: "activityGroup", label: "Activity Group", aliases: ["activity group"] },
  { key: "activity", label: "Activity", aliases: ["activity"] },
  { key: "location", label: "Location", aliases: ["location", "activity location"] },
  { key: "date", label: "DPR Date", aliases: ["dpr date"] },
  { key: "start", label: "Start", aliases: ["start"] },
  { key: "finish", label: "Finish", aliases: ["finish", "end"] },
  { key: "remarks", label: "Remarks", aliases: ["remarks", "notes"] },
  {
    key: "pax",
    label: "[CD] PAX working on task",
    aliases: ["[cd] pax working on task", "pax working on task"],
  },
] as const;

type CellValue = string | number | boolean | Date | null | undefined;

function normalizeHeader(value: CellValue): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cellText(value: CellValue): string {
  const text = String(value ?? "").trim();
  return /^(none|null|undefined)$/i.test(text) ? "" : text;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function excelSerialToDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
}

function formatExcelDate(value: CellValue): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad(value.getUTCDate())}-${pad(value.getUTCMonth() + 1)}-${value.getUTCFullYear()}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = excelSerialToDate(value);
    return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
  }

  const text = cellText(value);
  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${pad(Number(dmy[1]))}-${pad(Number(dmy[2]))}-${year}`;
  }
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${pad(Number(iso[3]))}-${pad(Number(iso[2]))}-${iso[1]}`;
  return text;
}

function formatExcelTime(value: CellValue): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
  }

  const text = cellText(value);
  const time = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:\s|$)/);
  return time ? `${pad(Number(time[1]))}:${time[2]}` : text;
}

function rowHasData(row: CellValue[], indexes: Record<string, number>): boolean {
  return ["team", "activityGroup", "activity", "location", "date", "start", "finish", "remarks", "pax"]
    .some((key) => cellText(row[indexes[key]]).length > 0);
}

export async function parseDprExportWorkbook(buffer: ArrayBuffer): Promise<DprExcelRow[]> {
  const XLSX = await import("xlsx");
  let workbook: WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  } catch {
    throw new Error("This file could not be read as an Excel workbook.");
  }

  const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === "dprexport");
  if (!sheetName) throw new Error("The workbook is missing the required DPRExport sheet.");

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<CellValue[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  });
  const headerRow = matrix[0] ?? [];
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const indexes: Record<string, number> = {};
  const missing: string[] = [];

  for (const required of REQUIRED_HEADERS) {
    const index = normalizedHeaders.findIndex((header) => required.aliases.includes(header));
    if (index < 0) missing.push(required.label);
    else indexes[required.key] = index;
  }
  if (missing.length > 0) {
    throw new Error(`DPRExport is missing required columns: ${missing.join(", ")}.`);
  }

  return matrix.slice(1)
    .map((row, index) => ({
      row,
      rowNumber: index + 2,
    }))
    .filter(({ row }) => rowHasData(row, indexes))
    .map(({ row, rowNumber }) => ({
      rowNumber,
      teamRaw: cellText(row[indexes.team]),
      activityGroupRaw: cellText(row[indexes.activityGroup]),
      activityRaw: cellText(row[indexes.activity]),
      locationRaw: cellText(row[indexes.location]),
      dateRaw: formatExcelDate(row[indexes.date]),
      startTime: formatExcelTime(row[indexes.start]),
      endTime: formatExcelTime(row[indexes.finish]),
      notes: cellText(row[indexes.remarks]),
      paxRaw: cellText(row[indexes.pax]),
    }));
}