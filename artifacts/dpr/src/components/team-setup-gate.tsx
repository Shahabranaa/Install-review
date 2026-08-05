import { format, parseISO } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function TeamSetupGate({ date }: { date: string }) {
  const dateLabel = (() => {
    try { return format(parseISO(date), "EEEE, d MMMM yyyy"); } catch { return date; }
  })();

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-muted/20">
      <div className="bg-background border border-border rounded-xl shadow-sm w-full max-w-md text-center p-8">
        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
        </div>
        <h2 className="font-semibold text-lg mb-2">Team setup required</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Team setup hasn't been completed for{" "}
          <span className="font-medium text-foreground">{dateLabel}</span>.
          Please select the working teams before capturing or clarifying entries for this date.
        </p>
        <Link href="/team-setup">
          <Button>Go to Team Setup</Button>
        </Link>
      </div>
    </div>
  );
}
