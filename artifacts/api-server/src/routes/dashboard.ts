import { Router, type IRouter } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db, projectsTable, sitesTable, locationsTable, phasesTable, imagesTable, issuesTable, decisionsTable, documentsTable } from "@workspace/db";
import {
  GetDashboardSummaryQueryParams,
  GetDashboardSummaryResponse,
  GetPhaseStatusesQueryParams,
  GetPhaseStatusesResponse,
  GetRecentActivityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const queryParams = GetDashboardSummaryQueryParams.safeParse(req.query);
  const projectId = queryParams.success ? queryParams.data.projectId : undefined;

  const [totalProjects] = await db.select({ count: sql<number>`count(*)::int` }).from(projectsTable);
  const [totalSites] = await db.select({ count: sql<number>`count(*)::int` }).from(sitesTable);
  const [totalPhases] = await db.select({ count: sql<number>`count(*)::int` }).from(phasesTable);
  const [totalImagesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(imagesTable);
  const [pendingImagesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(imagesTable).where(eq(imagesTable.reviewStatus, "pending"));
  const [approvedImagesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(imagesTable).where(eq(imagesTable.reviewStatus, "approved"));
  const [rejectedImagesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(imagesTable).where(eq(imagesTable.reviewStatus, "rejected"));
  const [completedPhasesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(phasesTable).where(eq(phasesTable.status, "complete"));
  const [incompletePhasesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(phasesTable).where(eq(phasesTable.status, "incomplete"));
  const [needsReviewPhasesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(phasesTable).where(eq(phasesTable.status, "needs_review"));
  const [criticalIssuesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(issuesTable).where(and(eq(issuesTable.severity, "critical"), eq(issuesTable.resolved, false)));
  const [openIssuesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(issuesTable).where(eq(issuesTable.resolved, false));
  const [docsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(documentsTable);

  const summary = {
    totalProjects: totalProjects?.count ?? 0,
    totalSites: totalSites?.count ?? 0,
    totalPhases: totalPhases?.count ?? 0,
    totalImages: totalImagesRow?.count ?? 0,
    pendingImages: pendingImagesRow?.count ?? 0,
    approvedImages: approvedImagesRow?.count ?? 0,
    rejectedImages: rejectedImagesRow?.count ?? 0,
    completedPhases: completedPhasesRow?.count ?? 0,
    incompletePhases: incompletePhasesRow?.count ?? 0,
    needsReviewPhases: needsReviewPhasesRow?.count ?? 0,
    criticalIssues: criticalIssuesRow?.count ?? 0,
    openIssues: openIssuesRow?.count ?? 0,
    documentsGenerated: docsRow?.count ?? 0,
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/phase-statuses", async (req, res): Promise<void> => {
  const queryParams = GetPhaseStatusesQueryParams.safeParse(req.query);
  const phases = await db.select({ status: phasesTable.status }).from(phasesTable);
  const breakdown = {
    complete: phases.filter((p) => p.status === "complete").length,
    incomplete: phases.filter((p) => p.status === "incomplete").length,
    needsReview: phases.filter((p) => p.status === "needs_review").length,
    pending: phases.filter((p) => p.status === "pending").length,
  };
  res.json(GetPhaseStatusesResponse.parse(breakdown));
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const decisions = await db.select().from(decisionsTable).orderBy(sql`${decisionsTable.createdAt} desc`).limit(20);
  res.json(GetRecentActivityResponse.parse(decisions));
});

export default router;
