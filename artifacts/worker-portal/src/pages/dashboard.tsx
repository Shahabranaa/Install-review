import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  User,
  ShieldCheck,
  Briefcase,
  Phone,
  Award,
  CalendarDays,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCheck,
  Loader2,
  FileText,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkerProfile {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  passportNo: string | null;
  passportExpiryDate: string | null;
  passportWasabiKey: string | null;
  nokName: string | null;
  nokPhone: string | null;
  cvWasabiKey: string | null;
  cvUploadedAt: string | null;
}

interface WorkerCert {
  id: number;
  expiryDate: string | null;
  verified: boolean;
  rejected: boolean;
  fileUrl: string | null;
  dateAchieved: string | null;
  certification: { name: string };
}

interface RotationPeriod {
  id: number;
  plannedStart: string;
  plannedEnd: string | null;
  status: string;
  siteName: string;
  siteLocation: string | null;
}

interface ScheduleResponse {
  rotations: RotationPeriod[];
}

type Tab = "home" | "certifications" | "schedule" | "profile";

interface DashboardProps {
  onNavigate: (tab: Tab) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function monthsAgo(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

// ── Card shell ────────────────────────────────────────────────────────────────

function DashCard({
  icon: Icon,
  title,
  children,
  onGo,
  goLabel = "Go to",
  tab,
  onNavigate,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  onGo?: () => void;
  goLabel?: string;
  tab?: Tab;
  onNavigate?: (tab: Tab) => void;
}) {
  function handleGo() {
    if (onGo) onGo();
    else if (tab && onNavigate) onNavigate(tab);
  }

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-xs h-7 text-muted-foreground hover:text-foreground"
          onClick={handleGo}
        >
          {goLabel}
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
      <div>{children}</div>
    </section>
  );
}

// ── Profile completion card ───────────────────────────────────────────────────

function ProfileCompletionCard({ profile, onNavigate }: { profile: WorkerProfile; onNavigate: (tab: Tab) => void }) {
  const checks = useMemo(() => [
    { label: "Name",            done: !!profile.name },
    { label: "Email",           done: !!profile.email },
    { label: "Phone",           done: !!profile.phone },
    { label: "Passport number", done: !!profile.passportNo },
    { label: "Passport expiry", done: !!profile.passportExpiryDate },
    { label: "CV uploaded",     done: !!profile.cvWasabiKey },
    { label: "Next of kin",     done: !!(profile.nokName && profile.nokPhone) },
  ], [profile]);

  const doneCount = checks.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checks.length) * 100);

  return (
    <DashCard icon={User} title="Profile completion" tab="profile" goLabel="Edit profile" onNavigate={onNavigate}>
      <div className="px-4 py-4 space-y-3">
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{doneCount} of {checks.length} fields complete</span>
            <span className="font-semibold text-foreground">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : "bg-amber-500",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center gap-2 text-sm">
              {c.done
                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
              }
              <span className={c.done ? "text-foreground" : "text-muted-foreground"}>
                {c.label}
                {c.label === "CV uploaded" && profile.cvUploadedAt && (
                  <span className="text-muted-foreground font-normal ml-1">
                    · {formatDate(profile.cvUploadedAt)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        {pct === 100 && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
            <CheckCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Profile complete</p>
          </div>
        )}
      </div>
    </DashCard>
  );
}

// ── Certifications summary card ───────────────────────────────────────────────

function CertSummaryCard({ certs, onNavigate }: { certs: WorkerCert[]; onNavigate: (tab: Tab) => void }) {
  const summary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in60 = new Date(today);
    in60.setDate(in60.getDate() + 60);

    let valid = 0, expiringSoon = 0, expired = 0, needsAction = 0, pendingVerification = 0;

    for (const c of certs) {
      if (c.rejected || !c.fileUrl || !c.dateAchieved || !c.expiryDate) {
        needsAction++;
        continue;
      }
      const exp = new Date(c.expiryDate + "T00:00:00");
      if (exp < today) { expired++; continue; }
      if (exp <= in60) { expiringSoon++; continue; }
      if (!c.verified) { pendingVerification++; continue; }
      valid++;
    }

    return { total: certs.length, valid, expiringSoon, expired, needsAction, pendingVerification };
  }, [certs]);

  const expiringItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in60 = new Date(today);
    in60.setDate(in60.getDate() + 60);
    return certs
      .filter((c) => {
        if (!c.expiryDate || c.rejected) return false;
        const exp = new Date(c.expiryDate + "T00:00:00");
        return exp >= today && exp <= in60;
      })
      .sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""))
      .slice(0, 3);
  }, [certs]);

  return (
    <DashCard icon={Award} title="Certifications" tab="certifications" goLabel="View all" onNavigate={onNavigate}>
      <div className="px-4 py-4 space-y-3">
        {summary.total === 0 ? (
          <p className="text-sm text-muted-foreground">No certifications on record yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {summary.valid > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  {summary.valid} valid
                </span>
              )}
              {summary.pendingVerification > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border bg-orange-50 text-orange-700 border-orange-200">
                  <Clock className="h-3 w-3" />
                  {summary.pendingVerification} awaiting review
                </span>
              )}
              {summary.expiringSoon > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                  <Clock className="h-3 w-3" />
                  {summary.expiringSoon} expiring soon
                </span>
              )}
              {summary.expired > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
                  <XCircle className="h-3 w-3" />
                  {summary.expired} expired
                </span>
              )}
              {summary.needsAction > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
                  <AlertTriangle className="h-3 w-3" />
                  {summary.needsAction} requires action
                </span>
              )}
            </div>

            {expiringItems.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Expiring within 60 days</p>
                {expiringItems.map((c) => {
                  const days = c.expiryDate ? daysUntil(c.expiryDate) : null;
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-foreground">{c.certification.name}</span>
                      <span className="text-amber-600 text-xs flex-shrink-0 font-medium">
                        {days !== null ? (days === 0 ? "Today" : days < 0 ? "Expired" : `${days}d`) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </DashCard>
  );
}

// ── Schedule snapshot card ────────────────────────────────────────────────────

function ScheduleCard({ rotations, onNavigate }: { rotations: RotationPeriod[]; onNavigate: (tab: Tab) => void }) {
  const { current, next } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const active = rotations
      .filter((r) => r.status !== "cancelled")
      .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));

    const current = active.find((r) => {
      const start = new Date(r.plannedStart + "T00:00:00");
      const end = r.plannedEnd ? new Date(r.plannedEnd + "T00:00:00") : null;
      return start <= today && (end === null || end >= today);
    }) ?? null;

    const next = active.find((r) => {
      const start = new Date(r.plannedStart + "T00:00:00");
      return start > today && r.id !== current?.id;
    }) ?? null;

    return { current, next };
  }, [rotations]);

  return (
    <DashCard icon={CalendarDays} title="Schedule" tab="schedule" goLabel="Full schedule" onNavigate={onNavigate}>
      <div className="px-4 py-4 space-y-3">
        {!current && !next ? (
          <p className="text-sm text-muted-foreground">No upcoming shifts scheduled.</p>
        ) : (
          <>
            {current && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Current rotation</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100 truncate">{current.siteName}</p>
                    {current.siteLocation && (
                      <p className="text-xs text-emerald-700/70 flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />
                        {current.siteLocation}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-emerald-700 flex-shrink-0">
                    <p>{formatDate(current.plannedStart)}</p>
                    {current.plannedEnd && <p className="text-emerald-600/70">{"\u2192"} {formatDate(current.plannedEnd)}</p>}
                  </div>
                </div>
              </div>
            )}

            {next && (
              <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Next rotation</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 truncate">{next.siteName}</p>
                    {next.siteLocation && (
                      <p className="text-xs text-blue-700/70 flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />
                        {next.siteLocation}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-blue-700 flex-shrink-0">
                    <p>{formatDate(next.plannedStart)}</p>
                    {next.plannedEnd && <p className="text-blue-600/70">{"\u2192"} {formatDate(next.plannedEnd)}</p>}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashCard>
  );
}

// ── CV staleness banner ───────────────────────────────────────────────────────

function CvStalenessBanner({ profile, onNavigate }: { profile: WorkerProfile; onNavigate: (tab: Tab) => void }) {
  if (!profile.cvWasabiKey || !profile.cvUploadedAt) return null;
  const months = monthsAgo(profile.cvUploadedAt);
  if (months < 6) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3">
      <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Time to update your CV</p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
          Your CV was uploaded {months} month{months !== 1 ? "s" : ""} ago. Keeping it current helps administrators with scheduling.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="flex-shrink-0 h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
        onClick={() => onNavigate("profile")}
      >
        Update CV
      </Button>
    </div>
  );
}

// ── Passport expiry banner ────────────────────────────────────────────────────

function PassportExpiryBanner({ profile, onNavigate }: { profile: WorkerProfile; onNavigate: (tab: Tab) => void }) {
  if (!profile.passportExpiryDate) return null;
  const days = daysUntil(profile.passportExpiryDate);
  if (days > 90) return null;

  const isExpired = days < 0;
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-xl border px-4 py-3",
      isExpired
        ? "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800"
        : "border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"
    )}>
      <ShieldCheck className={cn("h-4 w-4 flex-shrink-0 mt-0.5", isExpired ? "text-red-600" : "text-amber-600")} />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", isExpired ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-200")}>
          {isExpired ? "Passport expired" : "Passport expiring soon"}
        </p>
        <p className={cn("text-xs mt-0.5", isExpired ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400")}>
          {isExpired
            ? `Your passport expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} ago (${formatDate(profile.passportExpiryDate)}).`
            : days === 0
            ? "Your passport expires today."
            : `Your passport expires in ${days} day${days !== 1 ? "s" : ""} (${formatDate(profile.passportExpiryDate)}).`
          }
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "flex-shrink-0 h-7 text-xs",
          isExpired
            ? "border-red-300 text-red-800 hover:bg-red-100"
            : "border-amber-300 text-amber-800 hover:bg-amber-100",
        )}
        onClick={() => onNavigate("profile")}
      >
        Update
      </Button>
    </div>
  );
}

// ── Passport / CV file status row ─────────────────────────────────────────────

function DocumentStatusCard({ profile, onNavigate }: { profile: WorkerProfile; onNavigate: (tab: Tab) => void }) {
  const hasPassport = !!profile.passportWasabiKey;
  const hasCv = !!profile.cvWasabiKey;

  if (hasPassport && hasCv) return null;

  return (
    <DashCard icon={FileText} title="Documents needed" tab="profile" goLabel="Upload" onNavigate={onNavigate}>
      <div className="px-4 py-4 space-y-2">
        {!hasPassport && (
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            Passport scan not uploaded yet
          </div>
        )}
        {!hasCv && (
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            CV not uploaded yet
          </div>
        )}
      </div>
    </DashCard>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────

export default function DashboardPage({ onNavigate }: DashboardProps) {
  const profileQ = useQuery<WorkerProfile>({
    queryKey: ["worker-profile"],
    queryFn: () => apiFetch("/api/worker-portal/profile"),
    staleTime: 30_000,
  });

  const certsQ = useQuery<WorkerCert[]>({
    queryKey: ["worker-certs"],
    queryFn: () => apiFetch("/api/worker-portal/certifications"),
    staleTime: 60_000,
  });

  const scheduleQ = useQuery<ScheduleResponse>({
    queryKey: ["worker-schedule"],
    queryFn: () => apiFetch("/api/worker-portal/schedule"),
    staleTime: 60_000,
  });

  const isLoading = profileQ.isLoading || certsQ.isLoading || scheduleQ.isLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const profile = profileQ.data;
  const certs = certsQ.data ?? [];
  const rotations = scheduleQ.data?.rotations ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

      {profile && (
        <>
          {/* Action banners */}
          <PassportExpiryBanner profile={profile} onNavigate={onNavigate} />
          <CvStalenessBanner profile={profile} onNavigate={onNavigate} />

          {/* Summary cards */}
          <ProfileCompletionCard profile={profile} onNavigate={onNavigate} />
          <DocumentStatusCard profile={profile} onNavigate={onNavigate} />
        </>
      )}

      <CertSummaryCard certs={certs} onNavigate={onNavigate} />
      <ScheduleCard rotations={rotations} onNavigate={onNavigate} />

    </div>
  );
}
