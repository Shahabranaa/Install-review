import { useState } from "react";
import { useListLocations } from "@workspace/api-client-react";
import { useListStrings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Network, ChevronRight, MapPin, Activity } from "lucide-react";
import { Link } from "wouter";

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

export default function Strings() {
  const { data: locations, isLoading: locLoading } = useListLocations();
  const ospLocations = locations?.filter((l) => l.type === "OSP") ?? [];
  const [selectedOspId, setSelectedOspId] = useState<number | undefined>(undefined);

  const { data: strings, isLoading: strLoading } = useListStrings(
    selectedOspId ? { locationId: selectedOspId } : undefined,
  );

  const isLoading = locLoading || strLoading;

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Strings</h1>
          <p className="text-muted-foreground mt-2">
            Cable strings connecting turbine towers to Offshore Substation Platforms.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Network className="w-4 h-4" />
          {strings?.length ?? 0} strings
        </div>
      </div>

      {/* OSP Filter */}
      {ospLocations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={selectedOspId === undefined ? "default" : "outline"}
            onClick={() => setSelectedOspId(undefined)}
          >
            All OSPs
          </Button>
          {ospLocations.map((osp) => (
            <Button
              key={osp.id}
              size="sm"
              variant={selectedOspId === osp.id ? "default" : "outline"}
              onClick={() => setSelectedOspId(osp.id)}
            >
              {osp.name}
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : strings?.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center bg-muted/50 border-dashed">
          <Network className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No strings found</h3>
          <p className="text-muted-foreground mt-1">
            {selectedOspId ? "No strings for this OSP." : "No string data available."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {strings?.map((str) => {
            const osp = locations?.find((l) => l.id === str.locationId);
            return (
              <Link key={str.id} href={`/towers?stringId=${str.id}`}>
                <Card className="hover-elevate cursor-pointer transition-all group">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-semibold">{str.name}</CardTitle>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    {str.stringNumber && (
                      <p className="text-xs text-muted-foreground">String #{str.stringNumber}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {osp && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{osp.name}</span>
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
          })}
        </div>
      )}
    </div>
  );
}
