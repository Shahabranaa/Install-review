import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Info, Lock } from "lucide-react";

export default function Settings() {
  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Application configuration and information.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            About Installation Image Review
          </CardTitle>
          <CardDescription>
            System information and version details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-4 border-b border-border pb-4">
            <div className="text-muted-foreground">Version</div>
            <div className="col-span-2 font-medium">1.0.0 (Production)</div>
          </div>
          <div className="grid grid-cols-3 gap-4 border-b border-border pb-4">
            <div className="text-muted-foreground">Environment</div>
            <div className="col-span-2 font-medium">Production</div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-muted-foreground">Organization</div>
            <div className="col-span-2 font-medium flex items-center">
              <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
              Acme Operations
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/50 border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Lock className="w-5 h-5" />
            Access Control
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Role-based access control and user management are currently managed via the central identity provider. Contact your system administrator to request access changes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
