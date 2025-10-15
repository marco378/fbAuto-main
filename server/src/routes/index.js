import express from 'express'
import authRouter from './auth.router.js'
import facebookRouter from './facebook.router.js'
import jobRouter from './job.route.js'
import candidateRouter from './candidate.route.js'
import cookieRouter from './cookie.router.js'
import { automationService } from "../services/automation.services.js";


const router = express.Router()

router.use("/auth", authRouter)
router.use("/facebook", facebookRouter)
router.use("/jobs", jobRouter)
router.use("/candidates", candidateRouter)
router.use("/cookies",cookieRouter)

router.get("/automation/status", async (req, res) => {
  try {
    const serviceStatus = automationService.getServiceStatus();
    const systemStats = await automationService.getSystemStats();
    
    res.json({
      ...serviceStatus,
      systemStats,
      message: "Local automation service status"
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get automation status",
      message: error.message
    });
  }
});

export default router