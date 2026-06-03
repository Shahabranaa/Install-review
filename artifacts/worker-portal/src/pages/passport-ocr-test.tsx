import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FlaskConical, AlertCircle, CheckCircle2, Clock } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PassportExtractResult {
  passportNo?: string;
  passportPlaceOfBirth?: string;
  passportIssueDate?: string;
  passportExpiryDate?: string;
  name?: string;
}

interface MethodResult {
  method: string;
  description: string;
  result: PassportExtractResult | null;
  durationMs: number;
  error: string | null;
}

const FIELD_LABELS: { key: keyof PassportExtractResult; label: string }[] = [
  { key: "name", label: "Full name" },
  { key: "passportNo", label: "Passport number" },
  { key: "passportPlaceOfBirth", label: "Place of birth" },
  { key: "passportIssueDate", label: "Issue date" },
  { key: "passportExpiryDate", label: "Expiry date" },
];

function fieldCount(r: PassportExtractResult | null): number {
  if (!r) return 0;
  return FIELD_LABELS.filter((f) => r[f.key]).length;
}

function ResultCard({ result }: { result: MethodResult }) {
  const count = fieldCount(result.result);
  const total = FIELD_LABELS.length;

  return (
    <Card className="flex-1 min-w-0">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{result.method}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{result.description}</p>
          </div>
          <Badge variant="outline" className="flex-shrink-0 gap-1 text-xs">
            <Clock className="h-3 w-3" />
            {result.durationMs}ms
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          {result.error ? (
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : (
            <Badge
              variant={count === total ? "default" : count > 0 ? "secondary" : "outline"}
              className="gap-1 text-xs"
            >
              <CheckCircle2 className="h-3 w-3" />
              {count}/{total} fields
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {result.error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
            <p className="text-xs text-destructive font-medium">Error</p>
            <p className="text-xs text-muted-foreground mt-0.5 break-words">{result.error}</p>
          </div>
        )}
        {FIELD_LABELS.map(({ key, label }) => {
          const value = result.result?.[key];
          return (
            <div key={key} className="flex flex-col gap-0.5">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
              <p className={`text-sm ${value ? "font-medium" : "text-muted-foreground italic"}`}>
                {value ?? "—"}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PendingCard({ name }: { name: string }) {
  return (
    <Card className="flex-1 min-w-0 opacity-60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{name}</CardTitle>
        <div className="flex items-center gap-1.5 mt-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Running…</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {FIELD_LABELS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-0.5">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
            <p className="text-sm text-muted-foreground italic">—</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const METHOD_NAMES = ["GPT-4o General", "GPT-4o MRZ-focused", "Tesseract + MRZ parser"];

export default function PassportOcrTestPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<MethodResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResults([]);
    setError(null);
  }

  async function runComparison() {
    if (!file) return;
    setRunning(true);
    setResults([]);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`${BASE}/api/worker-portal/passport-ocr-compare`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const json = line.slice(6).trim();
            if (json && json !== "{}") {
              try {
                const r = JSON.parse(json) as MethodResult;
                setResults((prev) => [...prev, r]);
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const arrivedNames = new Set(results.map((r) => r.method));
  const pendingNames = running ? METHOD_NAMES.filter((n) => !arrivedNames.has(n)) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-2.5">
        <FlaskConical className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold">Passport OCR Comparison</h1>
          <p className="text-sm text-muted-foreground">
            Dev tool — upload a passport scan to compare three extraction methods side by side.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => fileRef.current?.click()}
              disabled={running}
            >
              <Upload className="h-4 w-4" />
              {file ? "Change file" : "Select passport file"}
            </Button>
            {file && (
              <p className="text-sm text-muted-foreground truncate max-w-xs">
                {file.name}
                <span className="ml-1.5 text-xs">({(file.size / 1024).toFixed(0)} KB)</span>
              </p>
            )}
            <Button
              className="gap-2 sm:ml-auto"
              disabled={!file || running}
              onClick={() => void runComparison()}
            >
              {running ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
              ) : (
                <><FlaskConical className="h-4 w-4" /> Run comparison</>
              )}
            </Button>
          </div>

          {running && (
            <p className="text-xs text-muted-foreground mt-3">
              Results appear as each method finishes — all three run in parallel.
            </p>
          )}

          {error && (
            <div className="mt-3 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {(results.length > 0 || pendingNames.length > 0) && (
        <div className="flex flex-col md:flex-row gap-4 items-start">
          {results.map((r) => (
            <ResultCard key={r.method} result={r} />
          ))}
          {pendingNames.map((n) => (
            <PendingCard key={n} name={n} />
          ))}
        </div>
      )}
    </div>
  );
}
