import "express-session";

declare module "express-session" {
  interface SessionData {
    // Admin/staff user fields
    userId?: number;
    username?: string;
    displayName?: string;
    accessLevel?: string;
    // Worker portal fields
    sessionType?: "worker";
    workerId?: number;
    workerName?: string;
  }
}
