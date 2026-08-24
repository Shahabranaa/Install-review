export interface DprRowSortFields {
  date?: string | null;
  startTime?: string | null;
  teamName?: string | null;
}

const teamNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function compareDprRows(a: DprRowSortFields, b: DprRowSortFields): number {
  const dateOrder = (a.date ?? "").localeCompare(b.date ?? "");
  if (dateOrder !== 0) return dateOrder;

  const aStart = (a.startTime ?? "").trim();
  const bStart = (b.startTime ?? "").trim();
  if (!aStart && bStart) return 1;
  if (aStart && !bStart) return -1;
  const startOrder = aStart.localeCompare(bStart);
  if (startOrder !== 0) return startOrder;

  const aTeam = (a.teamName ?? "").trim();
  const bTeam = (b.teamName ?? "").trim();
  if (!aTeam && bTeam) return 1;
  if (aTeam && !bTeam) return -1;
  return teamNameCollator.compare(aTeam, bTeam);
}