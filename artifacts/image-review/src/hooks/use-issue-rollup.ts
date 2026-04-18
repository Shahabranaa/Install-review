import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

export type IssueStatus = "open" | "in_progress" | "resolved";
export type Severity = "critical" | "high" | "medium" | "low";

export interface RollupBucket {
  open: number;
  in_progress: number;
  resolved: number;
  total: number;
  worstSeverity: Severity | null;
}

export interface IssueRollup {
  towers: Record<string, RollupBucket>;
  strings: Record<string, RollupBucket>;
  cables: Record<string, RollupBucket>;
}

const EMPTY: IssueRollup = { towers: {}, strings: {}, cables: {} };

export function useIssueRollup() {
  const queryClient = useQueryClient();

  const query = useQuery<IssueRollup>({
    queryKey: ["issue-rollup"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}api/issues/rollup`);
      if (!r.ok) return EMPTY;
      return (await r.json()) as IssueRollup;
    },
    staleTime: 30_000,
  });

  // Refresh on cross-page mutations
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: ["issue-rollup"] });
    window.addEventListener("issues:changed", handler);
    return () => window.removeEventListener("issues:changed", handler);
  }, [queryClient]);

  return { rollup: query.data ?? EMPTY, isLoading: query.isLoading };
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function severityClass(s: Severity | null): string {
  if (!s) return "";
  switch (s) {
    case "critical": return "bg-red-100 text-red-700 border-red-200";
    case "high":     return "bg-orange-100 text-orange-700 border-orange-200";
    case "medium":   return "bg-amber-100 text-amber-700 border-amber-200";
    default:         return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export function compareSeverity(a: Severity | null, b: Severity | null): number {
  return (a ? SEVERITY_RANK[a] : 9) - (b ? SEVERITY_RANK[b] : 9);
}
