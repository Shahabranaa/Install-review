import { useListLocations, useListStrings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Network, ChevronRight, MapPin, Activity } from "lucide-react";
import { Link } from "wouter";
import type { StringRecord } from "@workspace/api-zod";

const STATUS_COLORS: Record<string, string> = {
  "In Progress": "bg-blue-100 text-blue-800",
  Complete: "bg-green-100 text-green-800",
  Completed: "bg-green-100 text-green-800",
  Pending: "bg-yellow-100 text-yellow-800",
  pending: "bg-yellow-100 text-yellow-800",
  "Not Started": "bg-slate-100 text-slate-700",
  Excluded: "bg-slate-100 text-slate-500",
};

function getStatusClass(status: string) {
  return STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700";
}

function StringCard({ str, ospName }: { str: StringRecord; ospName?: string }) {
  return (
    <Link href={`/towers?stringId=${str.id}`}>
      <Card className="hover-elevate cursor-pointer transition-all group">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">{str.name}</CardTitle>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          {str.stringNumber && (
            <p className="text-xs text-muted-foreground">String #{str.stringNumber}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {ospName && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{ospName}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-sm">
            <Activity className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
            <Badge className={`text-xs ${getStatusClass(str.status)}`}>
              {str.status || "No status"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Strings() {
  const { data: locations, isLoading: locLoading } = useListLocations();
  const { data: strings, isLoading: strLoading } = useListStrings();

  const isLoading = locLoading || strLoading;
  const ospLocations = locations?.filter((l) => l.type === "OSP") ?? [];

  // Group strings by OSP location
  const stringsByOsp: Record<number, StringRecord[]> = {};
  for (const str of strings ?? []) {
    if (!stringsByOsp[str.locationId]) {
      stringsByOsp[str.locationId] = [];
    }
    stringsByOsp[str.locationId].push(str);
  }

  const totalStrings = strings?.length ?? 0;

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Strings</h1>
          <p className="text-muted-foreground mt-2">
            Cable strings connecting turbine towers to Offshore Substation Platforms.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Network className="w-4 h-4" />
          {totalStrings} strings
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-32 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : totalStrings === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center bg-muted/50 border-dashed">
          <Network className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No strings found</h3>
          <p className="text-muted-foreground mt-1">No string data available.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {ospLocations.map((osp) => {
            const ospStrings = stringsByOsp[osp.id] ?? [];
            if (ospStrings.length === 0) return null;
            return (
              <section key={osp.id}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-xl font-semibold">{osp.name}</h2>
                  <Badge variant="outline" className="text-xs">
                    {ospStrings.length} strings
                  </Badge>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {ospStrings.map((str) => (
                    <StringCard key={str.id} str={str} ospName={osp.name} />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Strings without an OSP match (edge case) */}
          {(() => {
            const ospIds = new Set(ospLocations.map((o) => o.id));
            const orphans = (strings ?? []).filter((s) => !ospIds.has(s.locationId));
            if (orphans.length === 0) return null;
            return (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-xl font-semibold text-muted-foreground">Other</h2>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {orphans.map((str) => (
                    <StringCard key={str.id} str={str} />
                  ))}
                </div>
              </section>
            );
          })()}
        </div>
      )}
    </div>
  );
}
