import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
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
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [calOpen, setCalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/dpr/teams"],
    queryFn: ({ signal }) => apiFetch("/api/dpr/teams", { signal }),
  });

  const { data: exceptions = [] } = useQuery<TeamDateException[]>({
    queryKey: ["/api/dpr/team-date-exceptions", date],
    queryFn: ({ signal }) => apiFetch(`/api/dpr/team-date-exceptions?date=${date}`, { signal }),
  });

  const exceptionsSet = useMemo(() => new Set(exceptions.map((e) => e.teamId)), [exceptions]);
  const exceptionById = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of exceptions) map.set(e.teamId, e.id);
    return map;
  }, [exceptions]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/dpr/team-date-exceptions", date] });

  const createException = useMutation({
    mutationFn: (teamId: number) =>
      apiFetch("/api/dpr/team-date-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, date }),
      }),
    onSuccess: invalidate,
  });

  const deleteException = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/dpr/team-date-exceptions/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const toggle = (teamId: number) => {
    const exId = exceptionById.get(teamId);
    if (exId !== undefined) {
      deleteException.mutate(exId);
    } else {
      createException.mutate(teamId);
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
                if (d) { setDate(format(d, "yyyy-MM-dd")); setCalOpen(false); }
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
                  disabled={createException.isPending || deleteException.isPending}
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
