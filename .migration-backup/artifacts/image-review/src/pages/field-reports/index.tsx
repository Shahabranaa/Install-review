import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ClipboardEdit, Plus, FileText, Trash2, CheckCircle2, ExternalLink } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

interface FieldReport {
  id: number;
  templateId: string;
  ospName: string;
  stringName: string;
  cableName: string | null;
  status: "draft" | "final";
  createdBy: string;
  finalizedAt: string | null;
  wasabiKey: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateMeta { id: string; label: string; scope: "string" | "cable" }

export default function FieldReportsListPage(): JSX.Element {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [rows, setRows] = useState<FieldReport[] | null>(null);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);

  async function load(): Promise<void> {
    const r = await fetch(`${BASE_URL}api/field-reports`);
    const j = await r.json();
    setRows(j.reports);
  }

  useEffect(() => {
    load();
    fetch(`${BASE_URL}api/field-reports/templates`).then(r => r.json()).then(j => setTemplates(j.templates));
  }, []);

  const labelFor = (id: string) => templates.find(t => t.id === id)?.label ?? id;

  async function deleteRow(id: number): Promise<void> {
    if (!confirm("Delete this draft?")) return;
    const r = await fetch(`${BASE_URL}api/field-reports/${id}`, { method: "DELETE" });
    if (r.ok) { toast({ title: "Draft deleted" }); load(); }
    else toast({ title: "Delete failed", variant: "destructive" });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardEdit className="h-6 w-6 text-primary" />
            Field Reports
          </h1>
          <p className="text-sm text-muted-foreground">Create field reports manually using the standard CVOW templates.</p>
        </div>
        <Button onClick={() => navigate("/field-reports/new")}>
          <Plus className="h-4 w-4 mr-1" /> New Field Report
        </Button>
      </div>

      {rows === null ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="border rounded-md p-12 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No field reports yet.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/field-reports/new")}>
            <Plus className="h-4 w-4 mr-1" /> Create your first report
          </Button>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-left">Template</th>
                <th className="p-2 text-left">String</th>
                <th className="p-2 text-left">Cable</th>
                <th className="p-2 text-left">Created by</th>
                <th className="p-2 text-left">Updated</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 font-medium">{labelFor(r.templateId)}</td>
                  <td className="p-2">{r.stringName}</td>
                  <td className="p-2">{r.cableName ?? "—"}</td>
                  <td className="p-2">{r.createdBy}</td>
                  <td className="p-2 text-muted-foreground">{new Date(r.updatedAt).toLocaleString()}</td>
                  <td className="p-2">
                    {r.status === "final" ? (
                      <Badge className="bg-green-600 hover:bg-green-600 text-white">
                        <CheckCircle2 className="h-3 w-3 mr-1" />Finalized
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </td>
                  <td className="p-2 text-right space-x-2 whitespace-nowrap">
                    {r.status === "final" && r.wasabiKey ? (
                      <a
                        href={`${BASE_URL}api/reports/view?key=${encodeURIComponent(r.wasabiKey)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-3 w-3 mr-1" />Open
                        </Button>
                      </a>
                    ) : (
                      <>
                        <Link href={`/field-reports/${r.id}/edit`}>
                          <Button size="sm" variant="outline">Edit</Button>
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => deleteRow(r.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
