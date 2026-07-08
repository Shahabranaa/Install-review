import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import projectsRouter from "./projects";
import sitesRouter from "./sites";
import locationsRouter from "./locations";
import phasesRouter from "./phases";
import imagesRouter from "./images";
import issuesRouter from "./issues";
import decisionsRouter from "./decisions";
import documentsRouter from "./documents";
import dashboardRouter from "./dashboard";
import driveRouter from "./drive";
import photosRouter from "./photos";
import stringsRouter from "./strings";
import towersRouter from "./towers";
import wasabiRouter from "./wasabi";
import wasabiMirrorRouter from "./wasabi-mirror";
import settingsRouter from "./settings";
import reportsRouter from "./reports";
import cablesRouter from "./cables";
import setupRouter from "./setup";
import complianceRouter from "./compliance";
import fieldReportsRouter from "./field-reports";
import fieldReportImagesRouter from "./field-report-images";
import progressRouter from "./progress";
import phaseTemplatesRouter from "./phase-templates";
import workforceRouter from "./workforce";
import workforceEmailsRouter from "./workforce-emails";
import workerPortalRouter from "./worker-portal";
import dprRouter from "./dpr";

const router: IRouter = Router();

// Public paths that do not require an admin/reviewer session.
// Worker-portal has its own session auth handled within workerPortalRouter.
const PUBLIC_PREFIXES = ["/health", "/auth/", "/worker-portal/"];

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  if (PUBLIC_PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p))) {
    next();
    return;
  }
  if (req.session?.sessionType === "worker" || !req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

router.use(requireAuth);
router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(projectsRouter);
router.use(sitesRouter);
router.use(locationsRouter);
router.use(stringsRouter);
router.use(towersRouter);
router.use(phasesRouter);
router.use(imagesRouter);
router.use(issuesRouter);
router.use(decisionsRouter);
router.use(documentsRouter);
router.use(dashboardRouter);
router.use(driveRouter);
router.use(photosRouter);
router.use(wasabiRouter);
router.use(wasabiMirrorRouter);
router.use(settingsRouter);
router.use(reportsRouter);
router.use(cablesRouter);
router.use(setupRouter);
router.use(complianceRouter);
router.use(fieldReportsRouter);
router.use(fieldReportImagesRouter);
router.use(progressRouter);
router.use(phaseTemplatesRouter);
router.use(workforceRouter);
router.use(workforceEmailsRouter);
router.use(workerPortalRouter);
router.use(dprRouter);

export default router;
