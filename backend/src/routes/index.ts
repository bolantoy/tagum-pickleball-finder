// ─── Route Index ───────────────────────────────────────────────────────────────
import { Router } from "express";
import courtsRouter from "./courts";
import availabilityRouter from "./availability";
import healthRouter from "./health";

const router = Router();

// Mount all route groups
router.use("/health", healthRouter);
router.use("/courts", courtsRouter);
router.use("/court", courtsRouter);       // alias: /court/:id
router.use("/availability", availabilityRouter);

export default router;
