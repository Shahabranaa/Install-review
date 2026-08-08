/** Colour classes for each predefined role abbreviation */
export const ROLE_COLORS: Record<string, string> = {
  HV:  "bg-blue-50   text-blue-700   border-blue-200   dark:bg-blue-950/40  dark:text-blue-300  dark:border-blue-800",
  HVJ: "bg-blue-50   text-blue-700   border-blue-200   dark:bg-blue-950/40  dark:text-blue-300  dark:border-blue-800",
  FO:  "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  FOJ: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  CT:  "bg-amber-50  text-amber-700  border-amber-200  dark:bg-amber-950/40  dark:text-amber-300  dark:border-amber-800",
  CAB: "bg-amber-50  text-amber-700  border-amber-200  dark:bg-amber-950/40  dark:text-amber-300  dark:border-amber-800",
  OIM: "bg-rose-50   text-rose-700   border-rose-200   dark:bg-rose-950/40   dark:text-rose-300   dark:border-rose-800",
  DOI: "bg-cyan-50   text-cyan-700   border-cyan-200   dark:bg-cyan-950/40   dark:text-cyan-300   dark:border-cyan-800",
  SUP: "bg-pink-50   text-pink-700   border-pink-200   dark:bg-pink-950/40   dark:text-pink-300   dark:border-pink-800",
  DC:  "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
  HSE: "bg-teal-50   text-teal-700   border-teal-200   dark:bg-teal-950/40   dark:text-teal-300   dark:border-teal-800",
  ASS: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
  MEL: "bg-lime-50   text-lime-700   border-lime-200   dark:bg-lime-950/40   dark:text-lime-300   dark:border-lime-800",
  SCA: "bg-sky-50    text-sky-700    border-sky-200    dark:bg-sky-950/40    dark:text-sky-300    dark:border-sky-800",
  SCF: "bg-sky-50    text-sky-700    border-sky-200    dark:bg-sky-950/40    dark:text-sky-300    dark:border-sky-800",
  WF:  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
};

export const FALLBACK_COLORS = [
  "bg-slate-50   text-slate-700   border-slate-200   dark:bg-slate-950/40  dark:text-slate-300  dark:border-slate-700",
  "bg-zinc-50    text-zinc-700    border-zinc-200    dark:bg-zinc-950/40   dark:text-zinc-300   dark:border-zinc-700",
  "bg-stone-50   text-stone-700   border-stone-200   dark:bg-stone-950/40  dark:text-stone-300  dark:border-stone-700",
];

/** Ordered list of predefined role abbreviations */
export const PREDEFINED_ROLES = Object.keys(ROLE_COLORS) as string[];

const _dynamicRoleMap = new Map<string, string>();

/** Returns the colour class for a role abbreviation, falling back to a deterministic colour for unknown roles */
export function roleColor(abbr: string): string {
  if (ROLE_COLORS[abbr]) return ROLE_COLORS[abbr];
  if (!_dynamicRoleMap.has(abbr)) {
    _dynamicRoleMap.set(abbr, FALLBACK_COLORS[_dynamicRoleMap.size % FALLBACK_COLORS.length]);
  }
  return _dynamicRoleMap.get(abbr)!;
}

/** Derives up to 3-char uppercase abbreviation from a free-text role string */
export function roleAbbr(role: string): string {
  const words = role.trim().split(/\s+/);
  if (words[0] && words[0].length <= 4 && words[0] === words[0].toUpperCase()) {
    return words[0].slice(0, 3).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
}
