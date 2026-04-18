import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useListStrings, useListLocations, useListCables } from "@workspace/api-client-react";
import { Save, FileCheck2, Eye, ChevronLeft } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

interface HeaderField { key: string; label: string; type: "text"|"textarea"|"date"|"time"|"number"; defaultValue?: string; placeholder?: string; required?: boolean }
interface ChecklistItem { key: string; label: string }
interface ChecklistGroup { title?: string; items: ChecklistItem[] }
interface PhaseRow { key: string; label: string }
interface PhaseColumn { key: string; label: string }
interface PhasesSection { title: string; rows: PhaseRow[]; columns: PhaseColumn[] }
interface NumericField { key: string; label: string; unit?: string }
interface DocumentRef { name: string; number?: string }
interface Template {
  id: string; label: string; scope: "string"|"cable";
  documentTitle: string; documentRefs: DocumentRef[] | null;
  header: HeaderField[]; phases: PhasesSection | null;
  checklists: ChecklistGroup[]; numericFields: NumericField[] | null;
  imagePlaceholders: string[] | null; hasRemarks: boolean;
}

interface ChecklistResponse { response: ""|"Yes"|"No"|"N/A"; comment?: string }
interface FormData {
  header: Record<string,string>;
  phases?: Record<string, Record<string,string>>;
  checklist: Record<string, ChecklistResponse>;
  numericFields?: Record<string,string>;
  remarks?: string;
}

interface FieldReport {
  id: number; templateId: string; stringName: string; cableName: string|null;
  formData: FormData; status: "draft"|"final"; createdBy: string;
  wasabiKey: string|null;
}

function emptyFormForTemplate(t: Template): FormData {
  const header: Record<string,string> = {};
  for (const f of t.header) header[f.key] = f.defaultValue ?? "";
  const checklist: Record<string,ChecklistResponse> = {};
  for (const g of t.checklists) for (const it of g.items) checklist[it.key] = { response: "", comment: "" };
  const phases: Record<string,Record<string,string>> = {};
  if (t.phases) for (const r of t.phases.rows) {
    phases[r.key] = {};
    for (const c of t.phases.columns) phases[r.key][c.key] = "";
  }
  const numericFields: Record<string,string> = {};
  if (t.numericFields) for (const f of t.numericFields) numericFields[f.key] = "";
  return { header, phases: t.phases ? phases : undefined, checklist, numericFields: t.numericFields ? numericFields : undefined, remarks: "" };
}

export default function EditFieldReportPage(): JSX.Element {
  const [, navigate] = useLocation();
  const [matchEdit, paramsEdit] = useRoute<{ id: string }>("/field-reports/:id/edit");
  const [matchNew] = useRoute("/field-reports/new");
  const editId = matchEdit && paramsEdit ? Number(paramsEdit.id) : null;
  const { toast } = useToast();
  const { user } = useAuth();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [stringName, setStringName] = useState("");
  const [cableName, setCableName] = useState("");
  const [data, setData] = useState<FormData | null>(null);
  const [loadedReport, setLoadedReport] = useState<FieldReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const stringsQ = useListStrings();
  const locationsQ = useListLocations();
  const cablesQ = useListCables();

  // Group strings by their OSP location: [{ ospName, strings: [name, ...] }, ...]
  const stringGroups = useMemo(() => {
    const strings = stringsQ.data ?? [];
    const ospById = new Map(
      (locationsQ.data ?? []).filter(l => l.type === "OSP").map(l => [l.id, l.name]),
    );
    const byOsp = new Map<string, string[]>();
    for (const s of strings) {
      const osp = ospById.get(s.locationId) ?? "Other";
      if (!byOsp.has(osp)) byOsp.set(osp, []);
      byOsp.get(osp)!.push(s.name);
    }
    return Array.from(byOsp.entries())
      .map(([ospName, names]) => ({ ospName, strings: names.sort() }))
      .sort((a, b) => a.ospName.localeCompare(b.ospName));
  }, [stringsQ.data, locationsQ.data]);

  // Cables for the currently-selected string, sorted naturally.
  const cableOptions = useMemo(() => {
    if (!stringName) return [] as string[];
    const rows = cablesQ.data?.cables ?? [];
    const matches = rows.filter(c => c.string === stringName).map(c => c.cableName);
    return Array.from(new Set(matches)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [cablesQ.data, stringName]);

  // When the loaded draft (or user) sets a cable that isn't in the list — e.g.
  // a legacy free-text value or a string with no synced cables — keep it visible.
  const cableOptionsWithCurrent = useMemo(() => {
    if (cableName && !cableOptions.includes(cableName)) return [cableName, ...cableOptions];
    return cableOptions;
  }, [cableOptions, cableName]);

  const template = useMemo(() => templates.find(t => t.id === templateId), [templates, templateId]);

  // Load templates
  useEffect(() => {
    fetch(`${BASE_URL}api/field-reports/templates`).then(r => r.json()).then(j => setTemplates(j.templates));
  }, []);

  // Load existing report when editing
  useEffect(() => {
    if (!editId || templates.length === 0) return;
    fetch(`${BASE_URL}api/field-reports/${editId}`).then(r => r.json()).then((row: FieldReport) => {
      setLoadedReport(row);
      setTemplateId(row.templateId);
      setStringName(row.stringName);
      setCableName(row.cableName ?? "");
      setData(row.formData);
    });
  }, [editId, templates.length]);

  // Initialize empty form when template changes (new report only).
  // Always reset to a fresh shape so fields from a previously-selected template
  // don't leak into the new template's form data.
  useEffect(() => {
    if (matchNew && template) {
      setData(emptyFormForTemplate(template));
    }
  }, [template?.id, matchNew]);

  function setHeader(k: string, v: string): void { setData(d => d ? ({ ...d, header: { ...d.header, [k]: v } }) : d); }
  function setChecklist(k: string, partial: Partial<ChecklistResponse>): void {
    setData(d => d ? ({ ...d, checklist: { ...d.checklist, [k]: { response: "", comment: "", ...d.checklist[k], ...partial } as ChecklistResponse } }) : d);
  }
  function setPhase(rowKey: string, colKey: string, v: string): void {
    setData(d => {
      if (!d) return d;
      const phases = { ...(d.phases ?? {}) };
      phases[rowKey] = { ...(phases[rowKey] ?? {}), [colKey]: v };
      return { ...d, phases };
    });
  }
  function setNumeric(k: string, v: string): void {
    setData(d => d ? ({ ...d, numericFields: { ...(d.numericFields ?? {}), [k]: v } }) : d);
  }
  function setRemarks(v: string): void { setData(d => d ? ({ ...d, remarks: v }) : d); }

  async function saveDraft(): Promise<FieldReport | null> {
    if (!template || !data || !stringName) {
      toast({ title: "Missing fields", description: "Pick a template and a string.", variant: "destructive" });
      return null;
    }
    if (template.scope === "cable" && !cableName) {
      toast({ title: "Cable required", description: "This template needs a cable.", variant: "destructive" });
      return null;
    }
    setSaving(true);
    try {
      const body = {
        templateId: template.id,
        stringName,
        cableName: template.scope === "cable" ? cableName : null,
        formData: data,
      };
      const url = loadedReport ? `${BASE_URL}api/field-reports/${loadedReport.id}` : `${BASE_URL}api/field-reports`;
      const method = loadedReport ? "PATCH" : "POST";
      const r = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const saved = await r.json() as FieldReport;
      setLoadedReport(saved);
      toast({ title: "Saved as draft" });
      if (!loadedReport) navigate(`/field-reports/${saved.id}/edit`);
      return saved;
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
      return null;
    } finally { setSaving(false); }
  }

  async function finalize(): Promise<void> {
    const saved = await saveDraft();
    if (!saved) return;
    if (!confirm("Finalize this report? It will be uploaded and added to the Reports list and Handover Packs. Drafts cannot be edited after finalizing.")) return;
    setFinalizing(true);
    try {
      const r = await fetch(`${BASE_URL}api/field-reports/${saved.id}/finalize`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Finalize failed");
      }
      toast({ title: "Report finalized", description: "PDF uploaded and added to Reports." });
      navigate("/field-reports");
    } catch (err) {
      toast({ title: "Finalize failed", description: String(err), variant: "destructive" });
    } finally { setFinalizing(false); }
  }

  function previewPdf(): void {
    if (!loadedReport) {
      toast({ title: "Save the draft first", description: "Saving lets us render the preview." });
      return;
    }
    window.open(`${BASE_URL}api/field-reports/${loadedReport.id}/pdf`, "_blank");
  }

  const isFinal = loadedReport?.status === "final";

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/field-reports")}>
            <ChevronLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <h1 className="text-2xl font-semibold">
            {editId ? "Edit Field Report" : "New Field Report"}
          </h1>
          {isFinal && <Badge className="bg-green-600 text-white">Finalized</Badge>}
        </div>
        <div className="space-x-2">
          <Button variant="outline" onClick={previewPdf} disabled={!loadedReport}>
            <Eye className="h-4 w-4 mr-1" />Preview PDF
          </Button>
          {!isFinal && (
            <>
              <Button variant="outline" onClick={saveDraft} disabled={saving || finalizing}>
                <Save className="h-4 w-4 mr-1" />Save Draft
              </Button>
              <Button onClick={finalize} disabled={saving || finalizing || !loadedReport && !template}>
                <FileCheck2 className="h-4 w-4 mr-1" />Finalize
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Template + scope picker */}
      <Card>
        <CardHeader><CardTitle className="text-base">Report scope</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <Label>Template</Label>
            <Select value={templateId} onValueChange={(v) => { setTemplateId(v); setLoadedReport(null); }} disabled={!!editId}>
              <SelectTrigger><SelectValue placeholder="Pick a template" /></SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>String</Label>
            <Select
              value={stringName}
              onValueChange={(v) => { setStringName(v); setCableName(""); }}
              disabled={isFinal}
            >
              <SelectTrigger><SelectValue placeholder="Pick a string" /></SelectTrigger>
              <SelectContent>
                {stringGroups.map(g => (
                  <div key={g.ospName}>
                    <div className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">{g.ospName}</div>
                    {g.strings.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          {template?.scope === "cable" && (
            <div>
              <Label>Cable</Label>
              {cableOptionsWithCurrent.length > 0 ? (
                <Select value={cableName} onValueChange={setCableName} disabled={isFinal || !stringName}>
                  <SelectTrigger>
                    <SelectValue placeholder={stringName ? "Pick a cable" : "Pick a string first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {cableOptionsWithCurrent.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={cableName}
                  onChange={(e) => setCableName(e.target.value)}
                  placeholder={stringName ? "No cables synced — type one (e.g. A02-1)" : "Pick a string first"}
                  disabled={isFinal || !stringName}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {template && data && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Header</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {template.header.map(f => (
                <div key={f.key} className={f.type === "textarea" ? "col-span-2" : ""}>
                  <Label>{f.label}{f.required && <span className="text-red-500"> *</span>}</Label>
                  {f.type === "textarea" ? (
                    <Textarea value={data.header[f.key] ?? ""} onChange={(e) => setHeader(f.key, e.target.value)} disabled={isFinal} />
                  ) : (
                    <Input
                      type={f.type === "date" ? "date" : f.type === "time" ? "time" : f.type === "number" ? "number" : "text"}
                      value={data.header[f.key] ?? ""}
                      onChange={(e) => setHeader(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      disabled={isFinal}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {template.documentRefs && template.documentRefs.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Document References</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {template.documentRefs.map((r, i) => (
                    <li key={i}>• {r.name}{r.number ? ` — ${r.number}` : ""}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {template.phases && (
            <Card>
              <CardHeader><CardTitle className="text-base">{template.phases.title}</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left border">Phase</th>
                      {template.phases.columns.map(c => <th key={c.key} className="p-2 text-left border">{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {template.phases.rows.map(r => (
                      <tr key={r.key}>
                        <td className="p-2 border font-medium">{r.label}</td>
                        {template.phases!.columns.map(c => (
                          <td key={c.key} className="p-1 border">
                            <Input
                              value={data.phases?.[r.key]?.[c.key] ?? ""}
                              onChange={(e) => setPhase(r.key, c.key, e.target.value)}
                              disabled={isFinal}
                              className="h-8"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {template.checklists.map((group, gi) => group.items.length > 0 && (
            <Card key={gi}>
              <CardHeader><CardTitle className="text-base">{group.title ?? "Checklist"}</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 w-32">Response</th>
                      <th className="p-2 text-left">Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(it => (
                      <tr key={it.key} className="border-t">
                        <td className="p-2">{it.label}</td>
                        <td className="p-1">
                          <Select
                            value={data.checklist[it.key]?.response ?? ""}
                            onValueChange={(v) => setChecklist(it.key, { response: v as ChecklistResponse["response"] })}
                            disabled={isFinal}
                          >
                            <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Yes">Yes</SelectItem>
                              <SelectItem value="No">No</SelectItem>
                              <SelectItem value="N/A">N/A</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-1">
                          <Input
                            value={data.checklist[it.key]?.comment ?? ""}
                            onChange={(e) => setChecklist(it.key, { comment: e.target.value })}
                            disabled={isFinal}
                            className="h-8"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}

          {template.numericFields && template.numericFields.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Recorded Values</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                {template.numericFields.map(f => (
                  <div key={f.key}>
                    <Label>{f.label}{f.unit ? ` (${f.unit})` : ""}</Label>
                    <Input
                      value={data.numericFields?.[f.key] ?? ""}
                      onChange={(e) => setNumeric(f.key, e.target.value)}
                      disabled={isFinal}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {template.imagePlaceholders && template.imagePlaceholders.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Required Images (captions)</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">
                  These captions describe the photos required for this report. Photos themselves live in the image review system.
                </p>
                <ul className="text-sm space-y-1">
                  {template.imagePlaceholders.map((cap, i) => <li key={i}>• {cap}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          {template.hasRemarks && (
            <Card>
              <CardHeader><CardTitle className="text-base">Remarks</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={data.remarks ?? ""}
                  onChange={(e) => setRemarks(e.target.value)}
                  disabled={isFinal}
                  rows={6}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
