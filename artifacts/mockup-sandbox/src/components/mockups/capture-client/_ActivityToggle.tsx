import type { ActivityKind, ActivityGroup } from "./_shared";

export function ActivityToggle({
  kind,
  group,
  onChange,
}: {
  kind: ActivityKind;
  group: ActivityGroup | null;
  onChange: (k: ActivityKind, g: ActivityGroup | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <button
          onClick={() => onChange("working", group ?? "effective")}
          className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
            kind === "working"
              ? "bg-sky-600 text-white"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
        >
          Working Time
        </button>
        <button
          onClick={() => onChange("non-working", null)}
          className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
            kind === "non-working"
              ? "bg-amber-600 text-white"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
        >
          Non-Working
        </button>
      </div>

      {kind === "working" && (
        <div className="flex gap-1">
          {(["effective", "extra", "rework"] as const).map((g) => {
            const label = g === "effective" ? "Effective" : g === "extra" ? "Extra Work" : "Re-Work";
            return (
              <button
                key={g}
                onClick={() => onChange("working", g)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  group === g
                    ? "bg-emerald-600 text-white"
                    : "bg-muted/40 text-muted-foreground/60 hover:bg-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
