/** Normalise DD-MM-YYYY-style sheet dates to YYYY-MM-DD. */
export function normaliseSheetDate(raw: string): string {
  const match = raw.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${month}-${day}`;
  }
  return raw.trim();
}

export function filterWhatsappRowsByDate<T extends { date: string }>(
  rows: T[],
  dateFilter: string | null,
): T[] {
  return dateFilter
    ? rows.filter((row) => normaliseSheetDate(row.date) === dateFilter)
    : rows;
}