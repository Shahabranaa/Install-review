import { useListImages } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Image as ImageIcon, Camera, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

export default function Images() {
  const { data: images, isLoading } = useListImages();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white">Pending Review</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Image Review Queue</h1>
          <p className="text-muted-foreground mt-2">Review and process incoming installation photos.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      ) : images?.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center bg-muted/50 border-dashed">
          <Camera className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No images to review</h3>
          <p className="text-muted-foreground mt-1">The review queue is currently empty.</p>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {images?.map(image => (
            <Card key={image.id} className="overflow-hidden hover-elevate cursor-pointer group">
              <div className="aspect-square bg-muted flex items-center justify-center relative">
                {image.imageUrl ? (
                  <img src={image.imageUrl} alt={image.filename || `Image ${image.id}`} className="object-cover w-full h-full" />
                ) : (
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
                )}
                <div className="absolute top-2 right-2">
                  {getStatusBadge(image.reviewStatus)}
                </div>
              </div>
              <CardContent className="p-4">
                <div className="font-medium truncate mb-1" title={image.filename || `Image-${image.id}`}>
                  {image.filename || `Image-${image.id}`}
                </div>
                <div className="flex items-center text-xs text-muted-foreground mb-2">
                  <Clock className="w-3 h-3 mr-1" />
                  {format(new Date(image.uploadedAt), 'MMM d, h:mm a')}
                </div>
                <div className="text-xs font-mono bg-muted px-2 py-1 rounded w-fit">
                  Phase #{image.phaseId}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
