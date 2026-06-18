import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Folder, Image as ImageIcon, ChevronRight, Home, HardDrive,
  AlertCircle, RefreshCw, X, ExternalLink, ZoomIn, Link as LinkIcon,
  Search, ArrowLeft, Download, CheckCircle2, Loader2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DriveFolder {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  modifiedTime?: string;
  size?: string;
  imageMediaMetadata?: { width?: number; height?: number };
}

interface DriveStatus {
  connected: boolean;
  user?: { displayName?: string; emailAddress?: string };
}

interface SyncResult {
  synced: number;
  skipped: number;
  total: number;
  phaseId: number;
  folderName: string;
}

interface SyncStatus {
  imported: number;
  phaseId?: number;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

function extractFolderIdFromUrl(input: string): string | null {
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim();
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

function useDriveStatus() {
  return useQuery<DriveStatus>({
    queryKey: ["drive-status"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/drive/status`);
      if (!res.ok) return { connected: false };
      return res.json();
    },
    staleTime: 30000,
  });
}

function useDriveFolders(parentId: string) {
  return useQuery<{ folders: DriveFolder[] }>({
    queryKey: ["drive-folders", parentId],
    queryFn: async () => {
      const url = parentId && parentId !== "root"
        ? `${API_BASE}/api/drive/folders?parentId=${parentId}`
        : `${API_BASE}/api/drive/folders`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load folders");
      return res.json();
    },
    staleTime: 60000,
  });
}

function useDriveFiles(folderId: string) {
  return useQuery<{ files: DriveFile[] }>({
    queryKey: ["drive-files", folderId],
    queryFn: async () => {
      const url = folderId && folderId !== "root"
        ? `${API_BASE}/api/drive/files?folderId=${folderId}`
        : `${API_BASE}/api/drive/files`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load files");
      return res.json();
    },
    staleTime: 60000,
  });
}

function useSyncStatus(folderId: string, enabled: boolean) {
  return useQuery<SyncStatus>({
    queryKey: ["drive-sync-status", folderId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/drive/sync-status?folderId=${folderId}`);
      if (!res.ok) return { imported: 0 };
      return res.json();
    },
    enabled: enabled && !!folderId && folderId !== "root",
    staleTime: 10000,
  });
}

function useFolderInfo(folderId: string, enabled: boolean) {
  return useQuery<DriveFolder>({
    queryKey: ["drive-folder-info", folderId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/drive/folder-info/${folderId}`);
      if (!res.ok) throw new Error("Folder not accessible");
      return res.json();
    },
    enabled: enabled && !!folderId && folderId !== "root",
    staleTime: 300000,
    retry: 1,
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DriveImage({ file, onClick }: { file: DriveFile; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const src = `${API_BASE}/api/drive/image/${file.id}`;

  return (
    <Card
      className="group cursor-pointer overflow-hidden hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
      onClick={onClick}
    >
      <div className="relative aspect-square bg-muted">
        {imgError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-2">
            <ImageIcon className="w-8 h-8 mb-1 opacity-40" />
            <span className="text-xs text-center line-clamp-2">{file.name}</span>
          </div>
        ) : (
          <img
            src={src}
            alt={file.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
          <ZoomIn className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      <CardContent className="p-2">
        <p className="text-xs font-medium truncate" title={file.name}>{file.name}</p>
        {file.size && <p className="text-xs text-muted-foreground">{formatBytes(Number(file.size))}</p>}
      </CardContent>
    </Card>
  );
}

function ImageLightbox({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  const src = `${API_BASE}/api/drive/image/${file.id}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative max-w-5xl max-h-[92vh] w-full bg-background rounded-xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <span className="text-sm font-medium truncate max-w-lg">{file.name}</span>
          <div className="flex items-center gap-2 ml-4">
            {file.webViewLink && (
              <Button variant="ghost" size="sm" asChild>
                <a href={file.webViewLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1.5" /> Open in Drive
                </a>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-muted/20 overflow-auto p-4 min-h-0">
          <img src={src} alt={file.name} className="max-w-full max-h-full object-contain rounded" />
        </div>
        <div className="flex flex-wrap gap-4 px-4 py-2.5 border-t text-xs text-muted-foreground flex-shrink-0">
          {file.imageMediaMetadata?.width && (
            <span>{file.imageMediaMetadata.width} × {file.imageMediaMetadata.height}px</span>
          )}
          {file.size && <span>{formatBytes(Number(file.size))}</span>}
          {file.modifiedTime && <span>Modified {new Date(file.modifiedTime).toLocaleDateString()}</span>}
        </div>
      </div>
    </div>
  );
}

function FolderEntryInput({ onNavigate }: { onNavigate: (id: string, name: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const folderId = value ? extractFolderIdFromUrl(value) : null;
  const { data: folderInfo, isLoading, isError } = useFolderInfo(folderId ?? "", !!folderId);

  const handleGo = () => {
    const id = extractFolderIdFromUrl(value);
    if (!id) { setError("Please enter a valid Google Drive folder URL or folder ID."); return; }
    if (isError) { setError("Folder not accessible. Check permissions and try again."); return; }
    onNavigate(id, folderInfo?.name ?? `Folder (${id.slice(0, 8)}…)`);
    setValue(""); setError("");
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <LinkIcon className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">Browse a specific folder</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Copy a Google Drive folder URL and paste it here to view its contents.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="https://drive.google.com/drive/folders/... or folder ID"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleGo()}
          className="text-sm"
        />
        <Button onClick={handleGo} disabled={!value || isLoading} size="sm">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Go"}
        </Button>
      </div>
      {folderInfo?.name && folderId && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <Folder className="w-3.5 h-3.5" /> Found: <strong>{folderInfo.name}</strong>
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Sync button for current folder
function SyncFolderButton({ folderId, folderName, fileCount }: { folderId: string; folderName: string; fileCount: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: syncStatus, refetch: refetchStatus } = useSyncStatus(folderId, true);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/drive/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, folderName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Sync failed" }));
        throw new Error(err.error ?? "Sync failed");
      }
      return res.json() as Promise<SyncResult>;
    },
    onSuccess: (result) => {
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["images"] });
      toast({
        title: result.synced > 0 ? `Synced ${result.synced} image${result.synced !== 1 ? "s" : ""}` : "Already up to date",
        description: result.synced > 0
          ? `${result.synced} new image${result.synced !== 1 ? "s" : ""} imported. ${result.skipped > 0 ? `${result.skipped} already existed.` : ""} They are now in the Image Review queue.`
          : `All ${result.total} images were already imported.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const alreadyImported = syncStatus?.imported ?? 0;
  const allImported = alreadyImported > 0 && alreadyImported >= fileCount;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 px-4 py-3">
      <HardDrive className="w-5 h-5 text-blue-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {allImported
            ? `${alreadyImported} image${alreadyImported !== 1 ? "s" : ""} already imported`
            : fileCount > 0
              ? `${fileCount} image${fileCount !== 1 ? "s" : ""} in this folder`
              : "Import images to the review queue"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {allImported
            ? "This folder is synced. Run again to pick up new files."
            : "Import all images from this folder into the review queue."}
        </p>
      </div>
      <Button
        onClick={() => syncMutation.mutate()}
        disabled={syncMutation.isPending}
        size="sm"
        variant={allImported ? "outline" : "default"}
        className="flex-shrink-0"
      >
        {syncMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Syncing…</>
        ) : syncMutation.isSuccess && syncMutation.data?.synced === 0 ? (
          <><CheckCircle2 className="w-4 h-4 mr-1.5 text-green-600" /> Up to date</>
        ) : (
          <><Download className="w-4 h-4 mr-1.5" /> Import to App</>
        )}
      </Button>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Drive() {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: "root", name: "My Drive" }]);
  const [selectedImage, setSelectedImage] = useState<DriveFile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const currentFolder = breadcrumbs[breadcrumbs.length - 1];
  const isRoot = currentFolder.id === "root";

  const { data: status } = useDriveStatus();
  const { data: foldersData, isLoading: foldersLoading, error: foldersError, refetch: refetchFolders } = useDriveFolders(currentFolder.id);
  const { data: filesData, isLoading: filesLoading, error: filesError, refetch: refetchFiles } = useDriveFiles(currentFolder.id);

  const navigateToFolder = useCallback((folder: { id: string; name: string }) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearchQuery("");
  }, []);

  const navigateToBreadcrumb = useCallback((index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSearchQuery("");
  }, []);

  const isLoading = foldersLoading || filesLoading;
  const hasError = foldersError || filesError;

  const folders = (foldersData?.folders ?? []).filter((f) =>
    searchQuery ? f.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );
  const files = (filesData?.files ?? []).filter((f) =>
    searchQuery ? f.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-6 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HardDrive className="w-6 h-6 text-blue-500" /> Google Drive
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Browse folders and import images into the review queue.</p>
        </div>
        <div className="flex items-center gap-3 mt-1">
          {status?.connected ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 inline-block" />
                Connected
              </Badge>
              {status.user?.emailAddress && (
                <span className="text-xs text-muted-foreground hidden sm:inline">{status.user.emailAddress}</span>
              )}
            </div>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
              <AlertCircle className="w-3 h-3 mr-1" /> Not connected
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => { refetchFolders(); refetchFiles(); }} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Breadcrumb + Search */}
      <div className="flex items-center justify-between px-6 py-1.5 gap-3">
        <nav className="flex items-center gap-1 text-sm flex-wrap">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
              <button
                onClick={() => navigateToBreadcrumb(index)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors max-w-[180px] truncate ${
                  index === breadcrumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={crumb.name}
              >
                {index === 0 && <Home className="w-3.5 h-3.5 flex-shrink-0" />}
                {crumb.name}
              </button>
            </div>
          ))}
        </nav>
        <div className="relative w-56 flex-shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
        {hasError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="w-10 h-10 text-destructive mb-3" />
            <p className="text-lg font-medium">Failed to load Drive contents</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Check your connection and try again.</p>
            <Button variant="outline" onClick={() => { refetchFolders(); refetchFiles(); }}>
              <RefreshCw className="w-4 h-4 mr-2" /> Try Again
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="space-y-5 pt-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <div>
              <Skeleton className="h-4 w-20 mb-3" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            </div>
            <div>
              <Skeleton className="h-4 w-20 mb-3" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
              </div>
            </div>
          </div>
        )}

        {!isLoading && !hasError && (
          <>
            {/* Back button */}
            {!isRoot && (
              <Button variant="ghost" size="sm" className="-ml-1" onClick={() => navigateToBreadcrumb(breadcrumbs.length - 2)}>
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
              </Button>
            )}

            {/* Root: folder URL input */}
            {isRoot && <FolderEntryInput onNavigate={navigateToFolder} />}

            {/* Sub-folder: Sync button (when images exist) */}
            {!isRoot && (
              <SyncFolderButton
                folderId={currentFolder.id}
                folderName={currentFolder.name}
                fileCount={filesData?.files.length ?? 0}
              />
            )}

            {/* Folders */}
            {folders.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5" /> Folders ({folders.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => navigateToFolder(folder)}
                      className="flex items-center gap-2 p-2.5 rounded-lg border bg-card hover:bg-blue-50 hover:border-blue-200 dark:hover:bg-blue-950/20 transition-colors text-left group"
                    >
                      <Folder className="w-4 h-4 text-blue-400 flex-shrink-0 group-hover:text-blue-500" />
                      <span className="text-xs font-medium truncate" title={folder.name}>{folder.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Images */}
            {files.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" /> Images ({files.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {files.map((file) => (
                    <DriveImage key={file.id} file={file} onClick={() => setSelectedImage(file)} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {folders.length === 0 && files.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <HardDrive className="w-14 h-14 text-muted-foreground/30 mb-4" />
                {isRoot ? (
                  <>
                    <p className="text-base font-medium text-muted-foreground">No files visible yet</p>
                    <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                      Paste a Google Drive folder URL above to browse its images and subfolders.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-medium text-muted-foreground">This folder is empty</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">No folders or images found here.</p>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {selectedImage && <ImageLightbox file={selectedImage} onClose={() => setSelectedImage(null)} />}
    </div>
  );
}
