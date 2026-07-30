import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useCaptureNav } from "@/contexts/CaptureNavContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CalendarDays } from "lucide-react";

interface Team {
  id: number;
  name: string;
}

interface TeamDateException {
  id: number;
  teamId: number;
  date: string;
  status: string;
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok && res.status !== 204) throw new Error(`Request failed: ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

export default function TeamSetupPage() {
  // Sync with the sidebar's active date so clicking a date in the sidebar
  // automatically jumps Team Setup to that date, and vice versa.
  const { activeDate, setActiveDate } = useCaptureNav();
  const date = activeDate ?? format(new Date(), "yyyy-MM-dd");
  const [calOpen, setCalOpen] = useState(false);
  // Tracks which team IDs have an in-flight mutation so only that row shows as pending
  const [pendingTeamIds, setPendingTeamIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/dpr/teams"],
    queryFn: ({ signal }) => apiFetch("/api/dpr/teams", { signal }),
  });

  const exceptionsKey = ["/api/dpr/team-date-exceptions", date];

  const { data: exceptions = [] } = useQuery<TeamDateException[]>({
    queryKey: exceptionsKey,
    queryFn: ({ signal }) => apiFetch(`/api/dpr/team-date-exceptions?date=${date}`, { signal }),
  });

  const exceptionsSet = useMemo(() => new Set(exceptions.map((e) => e.teamId)), [exceptions]);
  const exceptionById = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of exceptions) map.set(e.teamId, e.id);
    return map;
  }, [exceptions]);

  const markPending = (teamId: number) =>
    setPendingTeamIds((s) => new Set([...s, teamId]));
  const clearPending = (teamId: number) =>
    setPendingTeamIds((s) => { const n = new Set(s); n.delete(teamId); return n; });

  const createException = useMutation({
    mutationFn: ({ teamId }: { teamId: number }) =>
      apiFetch("/api/dpr/team-date-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, date }),
      }) as Promise<TeamDateException>,
    onMutate: ({ teamId }) => {
      markPending(teamId);
      // Optimistically add a placeholder exception so the switch flips immediately
      const prev = queryClient.getQueryData<TeamDateException[]>(exceptionsKey);
      queryClient.setQueryData<TeamDateException[]>(exceptionsKey, (old = []) => [
        ...old,
        { id: -teamId, teamId, date, status: "not_working" },
      ]);
      return { prev, teamId };
    },
    onSuccess: (data, { teamId }) => {
      // Replace placeholder with real record from server
      queryClient.setQueryData<TeamDateException[]>(exceptionsKey, (old = []) =>
        old.map((e) => (e.id === -teamId ? data : e))
      );
      clearPending(teamId);
      // Background-refresh the sidebar counts
      queryClient.invalidateQueries({ queryKey: ["/api/dpr/timesheet-entries/date-summary"] });
    },
    onError: (_err, { teamId }, ctx) => {
      // Roll back optimistic update
      if (ctx?.prev !== undefined) queryClient.setQueryData(exceptionsKey, ctx.prev);
      clearPending(teamId);
    },
  });

  const deleteException = useMutation({
    mutationFn: ({ id }: { id: number; teamId: number }) =>
      apiFetch(`/api/dpr/team-date-exceptions/${id}`, { method: "DELETE" }),
    onMutate: ({ id, teamId }) => {
      markPending(teamId);
      const prev = queryClient.getQueryData<TeamDateException[]>(exceptionsKey);
      queryClient.setQueryData<TeamDateException[]>(exceptionsKey, (old = []) =>
        old.filter((e) => e.id !== id)
      );
      return { prev, teamId };
    },
    onSuccess: (_data, { teamId }) => {
      clearPending(teamId);
      queryClient.invalidateQueries({ queryKey: ["/api/dpr/timesheet-entries/date-summary"] });
    },
    onError: (_err, { teamId }, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(exceptionsKey, ctx.prev);
      clearPending(teamId);
    },
  });

  const toggle = (teamId: number) => {
    if (pendingTeamIds.has(teamId)) return; // debounce double-tap
    const exId = exceptionById.get(teamId);
    if (exId !== undefined) {
      deleteException.mutate({ id: exId, teamId });
    } else {
      createException.mutate({ teamId });
    }
  };

  const workingCount = teams.length - exceptionsSet.size;

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-bold mb-1">Team Setup</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Toggle off any teams not working on this date — they'll be excluded from the coverage counts in the sidebar.
      </p>

      {/* Date picker */}
      <div className="mb-6">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          Date
        </label>
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarDays className="w-4 h-4" />
              {format(parseISO(date), "EEE, dd MMM yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={parseISO(date)}
              onSelect={(d) => {
                if (d) { setActiveDate(format(d, "yyyy-MM-dd")); setCalOpen(false); }
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Summary */}
      <div className="flex gap-4 mb-4 text-sm">
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
          {workingCount} working
        </span>
        {exceptionsSet.size > 0 && (
          <span className="text-red-500 dark:text-red-400 font-medium">
            {exceptionsSet.size} not working
          </span>
        )}
      </div>

      {/* Teams list */}
      <div className="space-y-1.5">
        {teams.map((team) => {
          const isOff = exceptionsSet.has(team.id);
          const isPending = pendingTeamIds.has(team.id);
          return (
            <div
              key={team.id}
              className="flex items-center justify-between rounded-lg px-4 py-3 bg-card border border-border"
            >
              <span className={isOff ? "text-muted-foreground line-through text-sm" : "text-sm font-medium"}>
                {team.name}
              </span>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${isOff ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {isOff ? "Not working" : "Working"}
                </span>
                <Switch
                  checked={!isOff}
                  onCheckedChange={() => toggle(team.id)}
                  disabled={isPending}
                />
              </div>
            </div>
          );
        })}
        {teams.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading teams…</p>
        )}
      </div>
    </div>
  );
}
