import { Router, type IRouter } from "express";
import healthRouter from "./health";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(sitesRouter);
router.use(locationsRouter);
router.use(phasesRouter);
router.use(imagesRouter);
router.use(issuesRouter);
router.use(decisionsRouter);
router.use(documentsRouter);
router.use(dashboardRouter);
router.use(driveRouter);

export default router;
