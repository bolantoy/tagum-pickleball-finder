// ─── Route Index ───────────────────────────────────────────────────────────────
import { Router } from "express";
import courtsRouter from "./courts";
import availabilityRouter from "./availability";
import healthRouter from "./health";
import paddleSessionsRouter from "./paddleSessions";

const router = Router();

// Mount all route groups
router.use("/health", healthRouter);
router.use("/courts", courtsRouter);
router.use("/court", courtsRouter);       // alias: /court/:id
router.use("/availability", availabilityRouter);
router.use("/paddle-sessions", paddleSessionsRouter);

export default router;
