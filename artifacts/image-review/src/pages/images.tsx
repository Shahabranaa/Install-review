import { useListImages } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Camera, Clock, CheckCircle2, XCircle, HardDrive, Link } from "lucide-react";
import { format } from "date-fns";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Images() {
  const { data: images, isLoading } = useListImages();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600 hover:bg-green-700 text-white"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case "pending":
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const driveImages = images?.filter((img) => img.driveFileId) ?? [];
  const localImages = images?.filter((img) => !img.driveFileId) ?? [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Image Review Queue</h1>
          <p className="text-muted-foreground mt-1">Review and process incoming installation photos.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={`${import.meta.env.BASE_URL}drive`}>
            <HardDrive className="w-4 h-4 mr-2 text-blue-500" />
            Sync from Google Drive
          </a>
        </Button>
      </div>

      {/* Stats row */}
      {!isLoading && images && images.length > 0 && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" />{images.length} total</span>
          <span className="flex items-center gap-1.5 text-green-600">
            <CheckCircle2 className="w-3.5 h-3.5" />{images.filter((i) => i.reviewStatus === "approved").length} approved
          </span>
          <span className="flex items-center gap-1.5 text-amber-600">
            <Clock className="w-3.5 h-3.5" />{images.filter((i) => i.reviewStatus === "pending").length} pending
          </span>
          <span className="flex items-center gap-1.5 text-destructive">
            <XCircle className="w-3.5 h-3.5" />{images.filter((i) => i.reviewStatus === "rejected").length} rejected
          </span>
          {driveImages.length > 0 && (
            <span className="flex items-center gap-1.5 text-blue-600">
              <HardDrive className="w-3.5 h-3.5" />{driveImages.length} from Drive
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
        </div>
      ) : images?.length === 0 ? (
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
      ) : (
        <div className="space-y-8">
          {/* Drive-imported images section */}
          {driveImages.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <HardDrive className="w-4 h-4 text-blue-500" />
                <h2 className="text-base font-semibold">From Google Drive</h2>
                <Badge variant="secondary" className="text-xs">{driveImages.length}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {driveImages.map((image) => (
                  <ImageCard key={image.id} image={image} getStatusBadge={getStatusBadge} isDrive />
                ))}
              </div>
            </div>
          )}

          {/* Local images section */}
          {localImages.length > 0 && (
            <div>
              {driveImages.length > 0 && (
                <div className="flex items-center gap-2 mb-4">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold">Local Images</h2>
                  <Badge variant="secondary" className="text-xs">{localImages.length}</Badge>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {localImages.map((image) => (
                  <ImageCard key={image.id} image={image} getStatusBadge={getStatusBadge} isDrive={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImageCard({
  image,
  getStatusBadge,
  isDrive,
}: {
  image: {
    id: number;
    imageUrl: string | null;
    filename: string | null;
    uploadedAt: string;
    phaseId: number;
    reviewStatus: string;
    driveFileId: string | null;
  };
  getStatusBadge: (status: string) => React.ReactNode;
  isDrive: boolean;
}) {
  const imgSrc = image.imageUrl ?? undefined;

  return (
    <Card className="overflow-hidden cursor-pointer group hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
      <div className="aspect-square bg-muted flex items-center justify-center relative">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={image.filename ?? `Image ${image.id}`}
            className="object-cover w-full h-full transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
        )}
        <div className="absolute top-2 right-2">{getStatusBadge(image.reviewStatus)}</div>
        {isDrive && (
          <div className="absolute top-2 left-2">
            <div className="bg-blue-500 text-white rounded-full p-1" title="From Google Drive">
              <HardDrive className="w-3 h-3" />
            </div>
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <div className="font-medium truncate text-sm mb-1" title={image.filename ?? `Image-${image.id}`}>
          {image.filename ?? `Image-${image.id}`}
        </div>
        <div className="flex items-center text-xs text-muted-foreground mb-2">
          <Clock className="w-3 h-3 mr-1" />
          {format(new Date(image.uploadedAt), "MMM d, h:mm a")}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">Phase #{image.phaseId}</div>
          {isDrive && <div className="text-xs text-blue-500 flex items-center gap-0.5"><HardDrive className="w-3 h-3" /> Drive</div>}
        </div>
      </CardContent>
    </Card>
  );
}
