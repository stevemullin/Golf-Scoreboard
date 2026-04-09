import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tournamentsRouter from "./tournaments";
import scoreboardRouter from "./scoreboard";
import poolMembersRouter from "./pool-members";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tournamentsRouter);
router.use(scoreboardRouter);
router.use(poolMembersRouter);
router.use(adminRouter);

export default router;
