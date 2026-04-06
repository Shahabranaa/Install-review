import { useListPhases } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, AlertTriangle, Clock, Activity, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

export default function Phases() {
  const { data: phases, isLoading } = useListPhases();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Complete</Badge>;
      case 'needs_review':
        return <Badge variant="destructive">Needs Review</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white">Pending</Badge>;
      default:
        return <Badge variant="outline">{status.replace('_', ' ')}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete': return <CheckSquare className="w-4 h-4 text-green-600" />;
      case 'needs_review': return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'pending': return <Clock className="w-4 h-4 text-amber-500" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Installation Phases</h1>
          <p className="text-muted-foreground mt-2">Track progress and review status across all active phases.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : phases?.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center bg-muted/50 border-dashed">
          <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No phases found</h3>
          <p className="text-muted-foreground mt-1">Phases will appear here once they are created.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {phases?.map(phase => (
            <Link key={phase.id} href={`/phases/${phase.id}`}>
              <Card className="hover-elevate cursor-pointer transition-all border-l-4 border-l-primary/50 hover:border-l-primary">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-6 flex-1">
                    <div className="w-48">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusIcon(phase.status)}
                        <span className="font-semibold">{phase.phaseType.replace(/_/g, ' ').toUpperCase()}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Phase ID: #{phase.id}
                      </div>
                    </div>
                    
                    <div className="flex-1 grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Status</div>
                        {getStatusBadge(phase.status)}
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Required Images</div>
                        <div className="font-medium">{phase.requiredImageCount}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Last Updated</div>
                        <div className="text-sm">{format(new Date(phase.updatedAt), 'MMM d, yyyy')}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pl-4">
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
