import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tournamentsRouter from "./tournaments";
import scoreboardRouter from "./scoreboard";
import poolMembersRouter from "./pool-members";
import adminRouter from "./admin";
import meRouter from "./me";
import cronRouter from "./cron";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tournamentsRouter);
router.use(scoreboardRouter);
router.use(poolMembersRouter);
router.use(adminRouter);
router.use(meRouter);
router.use(cronRouter);
router.use(historyRouter);

export default router;
