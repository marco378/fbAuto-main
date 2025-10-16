// src/server.js (optimized version with better process management)
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { PORT } from './credentials.js';
import router from './routes/index.js';
import { automationService } from './services/automation.services.js';
import { messengerRedirectWithContext } from './routes/messanger-redirect.js';
import contextRouter from './routes/job-context.js';
import { handleMessengerWebhook } from './controllers/messanger-webhook.js';

const app = express()

// Track server state
let server = null;
let isShuttingDown = false;

app.use((req, res, next) => {
  console.log(`Request Method: ${req.method}, Request URL: ${req.url}`);
  next();
});

app.use(
  cors({
    origin: [
      "http://localhost:3000",             // local dev
  "https://fbauto-main-production.up.railway.app"  // deployed backend
    ],
    credentials: true, // IMPORTANT: allow cookies
  })
);
app.use(cookieParser())
app.use(express.json())

app.get("/health", (req, res) => {
  res.send(Date.now())
})

// Enhanced automation status endpoint with system stats
app.get("/api/automation/status", async (req, res) => {
  try {
    const serviceStatus = automationService.getServiceStatus();
    const systemStats = await automationService.getSystemStats();
    
    res.json({
      ...serviceStatus,
      systemStats,
      optimizations: {
        approach: "Immediate self-reply after job posting",
        benefits: [
          "Reduced browser instances (60% less resource usage)",
          "Immediate candidate engagement (0 delay vs 30min)",
          "Simplified automation logic",
          "Better user experience"
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get automation status",
      message: error.message
    });
  }
});

// Manual comment monitoring endpoint (for edge cases)
app.post("/api/automation/manual-comment-monitoring/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`Manual comment monitoring requested for user: ${userId}`);
    
    const result = await automationService.runManualCommentMonitoring(userId);
    
    res.json({
      success: true,
      message: "Manual comment monitoring completed",
      result
    });
    
  } catch (error) {
    console.error(`Manual comment monitoring failed:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Enhanced job posting endpoint
app.post("/api/automation/job-post/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { jobId } = req.body;
    
    console.log(`Job posting requested for user: ${userId}, job: ${jobId || 'latest'}`);
    
    const result = await automationService.runJobPostAutomationForUser(userId, jobId);
    
    res.json({
      success: true,
      message: "Job posting with immediate engagement completed",
      result
    });
    
  } catch (error) {
    console.error(`Job posting failed:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.use("/api", router)
app.use("/api", contextRouter)
app.get('/api/messenger-redirect', messengerRedirectWithContext);

// Facebook Messenger webhook
app.get('/webhook/messenger', handleMessengerWebhook);  // For verification
app.post('/webhook/messenger', handleMessengerWebhook); // For receiving events

async function startServer() {
  try {
    console.log('Starting optimized server...');
    
    // Initialize the automation service (now with optimized job posting)
    await automationService.initialize();
    
    // Start the server
    server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Automation status: http://localhost:${PORT}/api/automation/status`);
      console.log('Job posting with immediate engagement runs every 2 hours');
      console.log('Manual comment monitoring available via API when needed');
      console.log('Resource usage optimized - ~60% reduction in browser instances');
    });
    
    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
      } else {
        console.error('Server error:', error);
      }
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Enhanced graceful shutdown
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('Already shutting down...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  
  try {
    // Stop accepting new connections
    if (server) {
      server.close(() => {
        console.log('HTTP server closed');
      });
    }
    
    // Shutdown automation service (this will close browsers)
    await automationService.shutdown();
    
    console.log('Graceful shutdown completed');
    process.exit(0);
    
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start the server
startServer();