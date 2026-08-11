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

/** Colour presets available for custom roles */
export const COLOR_PRESETS: { key: string; classes: string; swatch: string }[] = [
  { key: "blue",    swatch: "#3b82f6", classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800" },
  { key: "violet",  swatch: "#7c3aed", classes: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800" },
  { key: "rose",    swatch: "#e11d48", classes: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800" },
  { key: "amber",   swatch: "#d97706", classes: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
  { key: "emerald", swatch: "#059669", classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" },
  { key: "cyan",    swatch: "#0891b2", classes: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800" },
  { key: "pink",    swatch: "#db2777", classes: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800" },
  { key: "indigo",  swatch: "#4f46e5", classes: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800" },
  { key: "teal",    swatch: "#0d9488", classes: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800" },
  { key: "orange",  swatch: "#ea580c", classes: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800" },
  { key: "lime",    swatch: "#65a30d", classes: "bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-950/40 dark:text-lime-300 dark:border-lime-800" },
  { key: "sky",     swatch: "#0284c7", classes: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800" },
  { key: "purple",  swatch: "#9333ea", classes: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800" },
  { key: "red",     swatch: "#dc2626", classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" },
  { key: "green",   swatch: "#16a34a", classes: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800" },
  { key: "slate",   swatch: "#64748b", classes: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/40 dark:text-slate-300 dark:border-slate-700" },
];

/** Returns the CSS classes for a color preset key (falls back to slate) */
export function colorPresetClasses(key?: string | null): string {
  return COLOR_PRESETS.find((p) => p.key === key)?.classes
    ?? COLOR_PRESETS.find((p) => p.key === "slate")!.classes;
}

export const FALLBACK_COLORS = [
  "bg-slate-50   text-slate-700   border-slate-200   dark:bg-slate-950/40  dark:text-slate-300  dark:border-slate-700",
  "bg-zinc-50    text-zinc-700    border-zinc-200    dark:bg-zinc-950/40   dark:text-zinc-300   dark:border-zinc-700",
  "bg-stone-50   text-stone-700   border-stone-200   dark:bg-stone-950/40  dark:text-stone-300  dark:border-stone-700",
];

/** Human-readable full names for each predefined abbreviation */
export const ROLE_NAMES: Record<string, string> = {
  HV:  "High Voltage",
  HVJ: "HV Jointer",
  FO:  "Fibre Optic",
  FOJ: "FO Jointer",
  CT:  "Cable Technician",
  CAB: "Cabling",
  OIM: "Installation Manager",
  DOI: "Deputy OIM",
  SUP: "Supervisor",
  DC:  "Document Controller",
  HSE: "HSE",
  ASS: "Assurance",
  MEL: "MEL",
  SCA: "Scaffolder (A)",
  SCF: "Scaffolder (F)",
  WF:  "Welfare",
};

/** Returns the human-readable label for a role abbreviation, or the abbreviation itself if unknown */
export function roleLabel(abbr: string): string {
  return ROLE_NAMES[abbr] ?? abbr;
}

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
