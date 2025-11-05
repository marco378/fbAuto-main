import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { PORT } from './credentials.js';
import router from './routes/index.js';
import { automationService } from './services/automation.services.js';
import { messengerRedirectWithContext } from './routes/messanger-redirect.js';
import contextRouter from './routes/job-context.js';
import { handleMessengerWebhook } from './controllers/messanger-webhook.js';
import { prisma } from './lib/prisma.js';

// ...existing code...

app.use((req, res, next) => {
  console.log(`Request Method: ${req.method}, Request URL: ${req.url}`);
  next();
});

// Context session API endpoints
// GET /api/context-session/:sessionId
app.get('/api/context-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const contextSession = await prisma.jobContextSession.findUnique({
      where: { sessionToken: sessionId },
    });
    if (!contextSession || !contextSession.isActive || new Date(contextSession.expiresAt) < new Date()) {
      return res.status(404).json({ error: 'Context not found or expired' });
    }
    res.json({ contextSession });
  } catch (error) {
    console.error('Error fetching context session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/context-session/:sessionId/link
app.put('/api/context-session/:sessionId/link', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { facebookUserId, conversationStarted } = req.body;
    const updated = await prisma.jobContextSession.update({
      where: { sessionToken: sessionId },
      data: {
        facebookUserId,
        conversationStarted,
        lastAccessedAt: new Date()
      }
    });
    res.json({ success: true, contextSession: updated });
  } catch (error) {
    console.error('Error updating context session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/context-session/by-user/:facebookUserId
app.get('/api/context-session/by-user/:facebookUserId', async (req, res) => {
  try {
    const { facebookUserId } = req.params;
    const contextSession = await prisma.jobContextSession.findFirst({
      where: {
        facebookUserId,
        isActive: true,
        expiresAt: { gt: new Date() }
      },
      orderBy: { lastAccessedAt: 'desc' }
    });
    if (!contextSession) {
      return res.status(404).json({ error: 'No active context found' });
    }
    res.json({ contextSession });
  } catch (error) {
    console.error('Error fetching context by user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
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

// ...existing code...

app.use((req, res, next) => {
  console.log(`Request Method: ${req.method}, Request URL: ${req.url}`);
  next();
});

app.use(
  cors({
    origin: [
      "https://fb-auto-frontend.vercel.app",
      "https://fbauto-main-production-5d2d.up.railway.app",
      "chrome-extension://dnmdpnpoigoheodnbdigodkmlhnehiik", // <-- your extension ID
  "https://fb-auto-frontend-gm60scb53-audaces-projects-907ed43e.vercel.app" // <-- new vercel deployment domain
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
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
app.get('/messenger-redirect', messengerRedirectWithContext);

// Facebook Messenger webhook
app.get('/webhook/messenger', handleMessengerWebhook);  // For verification
app.post('/webhook/messenger', handleMessengerWebhook); // For receiving events

async function startServer() {
  try {
    console.log('Starting optimized server...');
    
    // Initialize the automation service (now with optimized job posting)
    await automationService.initialize();
    
    // Start the server
      server = app.listen(PORT, "0.0.0.0", () => {
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