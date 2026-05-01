import { useState } from "react";
import { useListImages } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Image as ImageIcon, Camera, Clock, CheckCircle2, XCircle,
  HardDrive, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { ImageReviewModal } from "@/components/ImageReviewModal";

type StatusTab = "all" | "pending" | "approved" | "rejected" | "flagged";

const TAB_DEFS: {
  value: StatusTab;
  label: string;
  icon: React.ElementType;
  colorClass: string;
  emptyMsg: string;
}[] = [
  {
    value: "all",
    label: "All",
    icon: ImageIcon,
    colorClass: "",
    emptyMsg: "The review queue is currently empty.",
  },
  {
    value: "pending",
    label: "Pending",
    icon: Clock,
    colorClass: "text-slate-500",
    emptyMsg: "No images are awaiting review.",
  },
  {
    value: "approved",
    label: "Approved",
    icon: CheckCircle2,
    colorClass: "text-green-600",
    emptyMsg: "No images have been approved yet.",
  },
  {
    value: "rejected",
    label: "Rejected",
    icon: XCircle,
    colorClass: "text-destructive",
    emptyMsg: "No images have been rejected.",
  },
  {
    value: "flagged",
    label: "Flagged",
    icon: AlertTriangle,
    colorClass: "text-amber-500",
    emptyMsg: "No images have been flagged.",
  },
];

export default function Images() {
  const { data: images, isLoading } = useListImages();
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<StatusTab>("all");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs"><CheckCircle2 className="w-2.5 h-2.5 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="text-xs"><XCircle className="w-2.5 h-2.5 mr-1" />Rejected</Badge>;
      case "flagged":
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs"><AlertTriangle className="w-2.5 h-2.5 mr-1" />Flagged</Badge>;
      case "pending":
        return <Badge className="bg-slate-400 hover:bg-slate-500 text-white text-xs"><Clock className="w-2.5 h-2.5 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const allImages = images ?? [];

  const countFor = (status: StatusTab) =>
    status === "all"
      ? allImages.length
      : allImages.filter((i) => i.reviewStatus === status).length;

  const filteredImages =
    activeTab === "all"
      ? allImages
      : allImages.filter((i) => i.reviewStatus === activeTab);

  const driveImages = filteredImages.filter((img) => img.driveFileId);
  const localImages = filteredImages.filter((img) => !img.driveFileId);

  const allDriveImages = allImages.filter((img) => img.driveFileId);

  const activeTabDef = TAB_DEFS.find((t) => t.value === activeTab)!;

  return (
    <>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Image Review Queue</h1>
            <p className="text-muted-foreground mt-1">Click any image to open the full review panel.</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={`${import.meta.env.BASE_URL}drive`}>
              <HardDrive className="w-4 h-4 mr-2 text-blue-500" />
              Sync from Google Drive
            </a>
          </Button>
        </div>

        {/* Stats row */}
        {!isLoading && allImages.length > 0 && (
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />{allImages.length} total
            </span>
            <span className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" />{countFor("approved")} approved
            </span>
            <span className="flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="w-3.5 h-3.5" />{countFor("flagged")} flagged
            </span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <Clock className="w-3.5 h-3.5" />{countFor("pending")} pending
            </span>
            <span className="flex items-center gap-1.5 text-destructive">
              <XCircle className="w-3.5 h-3.5" />{countFor("rejected")} rejected
            </span>
            {allDriveImages.length > 0 && (
              <span className="flex items-center gap-1.5 text-blue-600">
                <HardDrive className="w-3.5 h-3.5" />{allDriveImages.length} from Drive
              </span>
            )}
          </div>
        )}

        {/* Status tabs */}
        {!isLoading && allImages.length > 0 && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as StatusTab)}>
            <TabsList className="h-auto flex-wrap gap-1 p-1">
              {TAB_DEFS.map((tab) => {
                const Icon = tab.icon;
                const count = countFor(tab.value);
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm"
                  >
                    <Icon className={`w-3.5 h-3.5 ${tab.colorClass}`} />
                    {tab.label}
                    <Badge
                      variant="secondary"
                      className="ml-0.5 h-5 min-w-5 px-1.5 text-xs font-semibold"
                    >
                      {count}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
          </div>
        )}

        {/* Empty — no images at all */}
        {!isLoading && allImages.length === 0 && (
          <Card className="flex flex-col items-center justify-center p-12 text-center bg-muted/50 border-dashed">
            <Camera className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No images to review</h3>
            <p className="text-muted-foreground mt-1 mb-4">The review queue is currently empty.</p>
            <Button variant="outline" asChild>
              <a href={`${import.meta.env.BASE_URL}drive`}>
                <HardDrive className="w-4 h-4 mr-2 text-blue-500" />
                Import from Google Drive
              </a>
            </Button>
          </Card>
        )}

        {/* Empty — tab has no images but others exist */}
        {!isLoading && allImages.length > 0 && filteredImages.length === 0 && (
          <Card className="flex flex-col items-center justify-center p-10 text-center bg-muted/30 border-dashed">
            <activeTabDef.icon className={`h-10 w-10 mb-3 ${activeTabDef.colorClass || "text-muted-foreground"}`} />
            <h3 className="text-base font-semibold">{activeTabDef.emptyMsg}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Switch to <strong>All</strong> to see the full queue.
            </p>
          </Card>
        )}

        {/* Grid */}
        {!isLoading && filteredImages.length > 0 && (
          <div className="space-y-8">
            {/* Drive-imported images */}
            {driveImages.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <HardDrive className="w-4 h-4 text-blue-500" />
                  <h2 className="text-base font-semibold">From Google Drive</h2>
                  <Badge variant="secondary" className="text-xs">{driveImages.length}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {driveImages.map((image) => (
                    <ImageCard
                      key={image.id}
                      image={image}
                      getStatusBadge={getStatusBadge}
                      isDrive
                      onClick={() => setReviewingId(image.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Local images */}
            {localImages.length > 0 && (
              <section>
                {driveImages.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-base font-semibold">Local Images</h2>
                    <Badge variant="secondary" className="text-xs">{localImages.length}</Badge>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {localImages.map((image) => (
                    <ImageCard
                      key={image.id}
                      image={image}
                      getStatusBadge={getStatusBadge}
                      isDrive={false}
                      onClick={() => setReviewingId(image.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Review modal */}
      {reviewingId !== null && (
        <ImageReviewModal
          imageId={reviewingId}
          onClose={() => setReviewingId(null)}
        />
      )}
    </>
  );
}

// ─── Image card ───────────────────────────────────────────────────────────────

function ImageCard({
  image,
  getStatusBadge,
  isDrive,
  onClick,
}: {
  image: {
    id: number;
    imageUrl?: string | null;
    filename?: string | null;
    uploadedAt: string;
    phaseId: number;
    reviewStatus: string;
    driveFileId?: string | null;
  };
  getStatusBadge: (status: string) => React.ReactNode;
  isDrive: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className="overflow-hidden cursor-pointer group hover:shadow-lg hover:ring-2 hover:ring-primary/30 transition-all duration-200 hover:-translate-y-0.5"
      onClick={onClick}
    >
      <div className="aspect-square bg-muted flex items-center justify-center relative">
        {image.imageUrl ? (
          <img
            src={image.imageUrl}
            alt={image.filename ?? `Image ${image.id}`}
            className="object-cover w-full h-full transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
        )}

        {/* Status badge */}
        <div className="absolute top-2 right-2">{getStatusBadge(image.reviewStatus)}</div>

        {/* Drive badge */}
        {isDrive && (
          <div className="absolute top-2 left-2">
            <div className="bg-blue-500/90 text-white rounded-full p-1" title="From Google Drive">
              <HardDrive className="w-3 h-3" />
            </div>
          </div>
        )}

        {/* Click to review overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100">
          <span className="text-white text-xs font-semibold bg-black/50 rounded px-3 py-1 backdrop-blur-sm">
            Click to Review
          </span>
        </div>
      </div>

      <CardContent className="p-3">
        <div className="font-medium truncate text-sm mb-1" title={image.filename ?? `Image-${image.id}`}>
          {image.filename ?? `Image-${image.id}`}
        </div>
        <div className="flex items-center text-xs text-muted-foreground mb-1.5">
          <Clock className="w-3 h-3 mr-1" />
          {format(new Date(image.uploadedAt), "MMM d, h:mm a")}
        </div>
        <div className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded w-fit">
          Phase #{image.phaseId}
        </div>
      </CardContent>
    </Card>
  );
}
