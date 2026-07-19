export function EditableCell({
  value,
  editing,
  onActivate,
  onChange,
  className = "",
  inputClassName = "",
}: {
  value: string;
  editing: boolean;
  onActivate: () => void;
  onChange: (v: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-primary/10 border border-primary rounded px-1.5 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary font-mono tabular-nums ${inputClassName}`}
      />
    );
  }
  return (
    <span
      onClick={onActivate}
      title="Click to edit"
      className={`cursor-text select-none hover:bg-muted/40 rounded px-1 -mx-1 transition-colors ${className}`}
    >
      {value || <span className="text-muted-foreground/40">—</span>}
    </span>
  );
}
