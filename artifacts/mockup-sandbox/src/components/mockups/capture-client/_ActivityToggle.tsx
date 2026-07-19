import type { ActivityKind, ActivityGroup } from "./_shared";

const GROUP_LABELS: Record<ActivityGroup, string> = {
  effective: "Effective",
  extra: "Extra Work",
  rework: "Re-Work",
};

export function ActivityToggle({
  kind,
  group,
  onChange,
}: {
  kind: ActivityKind;
  group: ActivityGroup | null;
  onChange: (k: ActivityKind, g: ActivityGroup | null) => void;
}) {
  const kindLabel = kind === "working" ? "Working Time" : "Non-Working Time";
  const groupLabel = kind === "working" && group ? GROUP_LABELS[group] : null;

  return (
    <div className="flex gap-1.5">
      {/* Button 1 — kind toggle */}
      <button
        onClick={() =>
          onChange(
            kind === "working" ? "non-working" : "working",
            kind === "working" ? null : group ?? "effective"
          )
        }
        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors text-center whitespace-nowrap
          border-primary/70 bg-primary/10 text-primary hover:bg-primary/20"
      >
        {kindLabel}
      </button>

      {/* Button 2 — sub-group or inactive placeholder */}
      {kind === "working" ? (
        <button
          onClick={() => {
            const groups: ActivityGroup[] = ["effective", "extra", "rework"];
            const next = groups[(groups.indexOf(group ?? "effective") + 1) % groups.length];
            onChange("working", next);
          }}
          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors text-center whitespace-nowrap
            border-primary/70 bg-primary/10 text-primary hover:bg-primary/20"
        >
          {groupLabel}
        </button>
      ) : (
        <div className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded border text-center whitespace-nowrap
          border-border/40 bg-muted/20 text-muted-foreground/40 select-none">
          —
        </div>
      )}
    </div>
  );
}
