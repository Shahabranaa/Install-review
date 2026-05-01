import { Link, useLocation, useSearch } from "wouter";
import {
  LayoutDashboard, FileText, Settings, Building2, LogOut, ShieldCheck,
  ClipboardCheck, ClipboardEdit, Eye, Camera, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Clock, Wind, Layers, Loader2, Map, SlidersHorizontal, ListChecks, BarChart2, Package, Flag, BarChart3, LayoutTemplate,
} from "lucide-react";
import { useState, useEffect, useCallback, type ElementType } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useListLocations, useListStrings } from "@workspace/api-client-react";
import type { Location } from "@workspace/api-client-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";

const ACCESS_ICONS = {
  admin: { icon: ShieldCheck, color: "text-red-500", label: "Admin" },
  reviewer: { icon: ClipboardCheck, color: "text-blue-500", label: "Reviewer" },
  viewer: { icon: Eye, color: "text-slate-400", label: "Viewer" },
};

const IMAGE_CHILDREN = [
  { name: "All",      href: "/drive-photos",                   icon: Camera },
  { name: "Approved", href: "/drive-photos?approval=Approved", icon: CheckCircle2 },
  { name: "Rejected", href: "/drive-photos?approval=Rejected", icon: XCircle },
  { name: "Pending",  href: "/drive-photos?approval=Pending",  icon: Clock },
];

function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: ElementType;
  isActive: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center px-2 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors",
          isActive
            ? "bg-sidebar-primary/10 text-sidebar-primary"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
      >
        <Icon
          className={cn(
            "mr-3 h-5 w-5 flex-shrink-0",
            isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50",
          )}
          aria-hidden="true"
        />
        {label}
      </div>
    </Link>
  );
}

function OspTreeItem({ osp, location }: { osp: Location; location: string }) {
  const [open, setOpen] = useState(false);
  const { data: strings, isLoading } = useListStrings(
    { locationId: osp.id },
    { query: { enabled: open } },
  );

  const search = useSearch();
  const currentStringId =
    location === "/towers"
      ? new URLSearchParams(search).get("stringId")
      : null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center px-2 py-1.5 text-xs rounded-md cursor-pointer transition-colors text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 mr-1.5 flex-shrink-0 opacity-60" />
        ) : (
          <ChevronRight className="h-3 w-3 mr-1.5 flex-shrink-0 opacity-60" />
        )}
        <span className="flex-1 text-left font-medium">{osp.name}</span>
        {open && isLoading && <Loader2 className="h-3 w-3 animate-spin opacity-40" />}
      </button>

      {open && (
        <div className="ml-5 border-l border-sidebar-border pl-2 space-y-0.5 pb-0.5">
          {strings && strings.length > 0
            ? strings.map((str) => {
                const href = `/towers?stringId=${str.id}`;
                const isActive = currentStringId === String(str.id);
                return (
                  <Link key={str.id} href={href}>
                    <div
                      className={cn(
                        "px-2 py-1 text-xs rounded cursor-pointer transition-colors truncate",
                        isActive
                          ? "text-sidebar-primary font-semibold bg-sidebar-primary/5"
                          : "text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                    >
                      {str.name}
                    </div>
                  </Link>
                );
              })
            : !isLoading && (
                <div className="px-2 py-1 text-xs text-sidebar-foreground/30 italic">
                  No strings
                </div>
              )}
        </div>
      )}
    </div>
  );
}

function StructureSection({ location }: { location: string }) {
  const structureActive = location.startsWith("/strings") || location.startsWith("/towers");
  const [open, setOpen] = useState(structureActive);
  const { data: locations, isLoading: locLoading, isError: locError } = useListLocations();
  const ospLocations = locations?.filter((l) => l.type === "OSP") ?? [];

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center px-2 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors",
          structureActive
            ? "bg-sidebar-primary/10 text-sidebar-primary"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
      >
        <Layers
          className={cn(
            "mr-3 h-5 w-5 flex-shrink-0",
            structureActive ? "text-sidebar-primary" : "text-sidebar-foreground/50",
          )}
          aria-hidden="true"
        />
        <span className="flex-1 text-left">Structure</span>
        {open ? (
          <ChevronDown className="h-4 w-4 opacity-60" />
        ) : (
          <ChevronRight className="h-4 w-4 opacity-60" />
        )}
      </button>

      {open && (
        <div className="mt-1 ml-4 border-l border-sidebar-border pl-2 space-y-0.5">
          {locLoading ? (
            <div className="flex items-center gap-1.5 px-2 py-2 text-xs text-sidebar-foreground/40">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </div>
          ) : locError ? (
            <div className="px-2 py-1.5 text-xs text-red-400/70 italic">
              Failed to load
            </div>
          ) : ospLocations.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-sidebar-foreground/30 italic">
              No OSPs found
            </div>
          ) : (
            ospLocations.map((osp) => (
              <OspTreeItem key={osp.id} osp={osp} location={location} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ImagesSection({ location }: { location: string }) {
  const imagesActive = location.startsWith("/drive-photos");
  const [open, setOpen] = useState(imagesActive);
  const currentSearch = useSearch();

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center px-2 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors",
          imagesActive
            ? "bg-sidebar-primary/10 text-sidebar-primary"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
      >
        <Camera
          className={cn(
            "mr-3 h-5 w-5 flex-shrink-0",
            imagesActive ? "text-sidebar-primary" : "text-sidebar-foreground/50",
          )}
          aria-hidden="true"
        />
        <span className="flex-1 text-left">Images</span>
        {open ? (
          <ChevronDown className="h-4 w-4 opacity-60" />
        ) : (
          <ChevronRight className="h-4 w-4 opacity-60" />
        )}
      </button>

      {open && (
        <div className="mt-1 ml-4 space-y-0.5 border-l border-sidebar-border pl-3">
          {IMAGE_CHILDREN.map((child) => {
            const isChildActive =
              location + currentSearch === child.href ||
              (child.href === "/drive-photos" &&
                location === "/drive-photos" &&
                !currentSearch);
            return (
              <Link key={child.name} href={child.href}>
                <div
                  className={cn(
                    "flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors",
                    isChildActive
                      ? "text-sidebar-primary font-medium"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <child.icon
                    className={cn(
                      "mr-2 h-3.5 w-3.5 flex-shrink-0",
                      isChildActive ? "text-sidebar-primary" : "text-sidebar-foreground/40",
                    )}
                  />
                  {child.name}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [openIssueCount, setOpenIssueCount] = useState(0);

  const fetchOpenCount = useCallback(() => {
    fetch(`${BASE_URL}api/issues?resolved=false`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: unknown[]) => setOpenIssueCount(rows.length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchOpenCount();
    window.addEventListener("issues:changed", fetchOpenCount);
    return () => window.removeEventListener("issues:changed", fetchOpenCount);
  }, [fetchOpenCount]);

  const accessInfo = user
    ? (ACCESS_ICONS[user.accessLevel as keyof typeof ACCESS_ICONS] ?? ACCESS_ICONS.viewer)
    : null;
  const AccessIcon = accessInfo?.icon;

  const structureActive = location.startsWith("/strings") || location.startsWith("/towers");

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex h-14 items-center px-4 border-b border-sidebar-border flex-shrink-0">
        <Building2 className="h-6 w-6 text-sidebar-primary mr-2 flex-shrink-0" />
        <span className="font-bold text-sidebar-foreground">InstallReview</span>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-3">
        <nav className="space-y-0.5 px-2">
          {/* CVOW — project header, top of nav */}
          <Link href="/strings">
            <div
              className={cn(
                "flex items-center px-2 py-2 text-sm font-semibold rounded-md cursor-pointer transition-colors mb-1",
                structureActive
                  ? "text-sidebar-primary"
                  : "text-sidebar-foreground hover:text-sidebar-primary",
              )}
            >
              <Wind
                className={cn(
                  "mr-3 h-5 w-5 flex-shrink-0",
                  structureActive ? "text-sidebar-primary" : "text-sidebar-foreground/60",
                )}
                aria-hidden="true"
              />
              CVOW
            </div>
          </Link>

          {/* Dashboard */}
          <NavItem
            href="/"
            label="Dashboard"
            icon={LayoutDashboard}
            isActive={location === "/"}
          />

          {/* Map */}
          <NavItem
            href="/map"
            label="Map"
            icon={Map}
            isActive={location === "/map"}
          />

          {/* Structure — collapsible OSP → String tree */}
          <StructureSection location={location} />

          {/* Images — collapsible with filter submenu */}
          <ImagesSection location={location} />

          {/* Compliance */}
          <NavItem
            href="/compliance"
            label="Compliance"
            icon={ListChecks}
            isActive={location === "/compliance"}
          />
          <NavItem
            href="/tower-compliance"
            label="Tower Compliance"
            icon={BarChart2}
            isActive={location === "/tower-compliance"}
          />

          {/* Reports */}
          <NavItem
            href="/reports"
            label="Reports"
            icon={FileText}
            isActive={location === "/reports" || location.startsWith("/reports")}
          />

          {/* Field Reports (manual creation) */}
          <NavItem
            href="/field-reports"
            label="Field Reports"
            icon={ClipboardEdit}
            isActive={location === "/field-reports" || location.startsWith("/field-reports")}
          />

          {/* Handover Packs */}
          <NavItem
            href="/documents"
            label="Handover Packs"
            icon={Package}
            isActive={location === "/documents" || location.startsWith("/documents")}
          />

          {/* Installation Progress */}
          <NavItem
            href="/progress"
            label="Progress"
            icon={BarChart3}
            isActive={location === "/progress"}
          />

          {/* Punch List / Issues */}
          <Link href="/issues">
            <div
              className={cn(
                "flex items-center px-2 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors",
                location === "/issues"
                  ? "bg-sidebar-primary/10 text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <Flag
                className={cn(
                  "mr-3 h-5 w-5 flex-shrink-0",
                  location === "/issues" ? "text-sidebar-primary" : "text-amber-500",
                )}
              />
              <span className="flex-1">Punch List</span>
              {openIssueCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1">
                  {openIssueCount}
                </span>
              )}
            </div>
          </Link>
        </nav>
      </div>

      {/* Settings + Site Setup — pinned above user footer */}
      <div className="px-2 pb-2 pt-1 border-t border-sidebar-border flex-shrink-0 space-y-0.5">
        {user?.accessLevel === "admin" && (
          <NavItem
            href="/templates"
            label="Phase Templates"
            icon={LayoutTemplate}
            isActive={location === "/templates"}
          />
        )}
        {user?.accessLevel === "admin" && (
          <NavItem
            href="/setup"
            label="Site Setup"
            icon={SlidersHorizontal}
            isActive={location === "/setup"}
          />
        )}
        <NavItem
          href="/settings"
          label="Settings"
          icon={Settings}
          isActive={location === "/settings"}
        />
      </div>

      {/* User info + logout */}
      {user && (
        <div className="border-t border-sidebar-border p-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-2 px-1">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {user.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user.displayName}
              </p>
              {user.title ? (
                <p className="text-xs text-sidebar-foreground/50 truncate">{user.title}</p>
              ) : (
                <p className="text-xs text-sidebar-foreground/50 truncate">@{user.username}</p>
              )}
            </div>
            {accessInfo && AccessIcon && (
              <AccessIcon
                className={`w-4 h-4 flex-shrink-0 ${accessInfo.color}`}
                title={accessInfo.label}
              />
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent h-8 px-2"
            onClick={logout}
          >
            <LogOut className="w-3.5 h-3.5 mr-2" />
            Sign Out
          </Button>
        </div>
      )}
    </div>
  );
}
