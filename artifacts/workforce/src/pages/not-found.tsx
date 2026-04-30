import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <p className="text-6xl font-bold text-muted-foreground/30 mb-4">404</p>
      <h1 className="text-xl font-semibold mb-2">Page not found</h1>
      <p className="text-sm text-muted-foreground mb-6">
        The page you are looking for does not exist.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Go to Dashboard</Link>
      </Button>
    </div>
  );
}
