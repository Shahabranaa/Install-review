import { Settings2 } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const { durationFormat, setDurationFormat } = useSettings();

  return (
    <div className="p-4 max-w-lg">
      <div className="flex items-center gap-2 mb-6">
        <Settings2 className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <div className="border rounded-xl bg-card divide-y">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="duration-format" className="text-sm font-medium">Expiry duration format</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {durationFormat === "verbose"
                ? "Verbose — e.g. 1y 6m 2w 3d"
                : "Compact — e.g. 547d"}
            </p>
          </div>
          <Switch
            id="duration-format"
            checked={durationFormat === "verbose"}
            onCheckedChange={(checked) => setDurationFormat(checked ? "verbose" : "compact")}
          />
        </div>
      </div>
    </div>
  );
}
