// controllers/facebookController.js
import { prisma } from "../lib/prisma.js";
import { decrypt, encrypt } from "../lib/encrypt.js";
import { automationService } from "../services/automation.services.js";

export const facebookCredentials = async (req, res) => {
  try {
    console.log("userid: ", req.user);
    console.log("controller");
    
    const { email, password } = req.body;
    const userId = req.user.userId;

    const encryptedPassword = encrypt(password);

    await prisma.facebookCredentials.upsert({
      where: { userId },
      update: {
        email,
        password: encryptedPassword,
      },
      create: {
        userId,
        email,
        password: encryptedPassword,
      },
    });

    res.json({ message: "Facebook credentials saved successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getFacebookCredentials = async (req, res) => {
  try {
    console.log("user: ", req.user.userId);
    
    const userId = req.user.userId;

    const credentials = await prisma.facebookCredentials.findUnique({
      where: { userId },
      select: { email: true, password: true },
    });

    res.json({
      hasCredentials: !!credentials,
      email: credentials?.email,
      password: credentials ? decrypt(credentials.password) : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Regular automation controller
export const runFacebookAutomation = async (req, res) => {
  try {
    console.log("🚀 Starting Facebook automation for user:", req.user.userId);
    
    const userId = req.user.userId;

    // Check if automation is already running
    const status = automationService.getAutomationStatus(userId);
    if (status.status === 'running') {
      return res.status(400).json({ 
        error: "Automation is already running for this user",
        status: status
      });
    }

    // Run automation using the service
    const result = await automationService.runAutomationForUser(userId);

    res.json({ 
      message: "Automation completed successfully", 
      result 
    });

  } catch (error) {
    console.error("Automation error:", error);
    res.status(500).json({ error: error.message });
  }
};

// NEW: Job posting automation controller
export const runJobPostAutomation = async (req, res) => {
  try {
    console.log("📝 Starting job post automation for user:", req.user.userId);
    
    const userId = req.user.userId;
    const { jobId } = req.body; // Optional: specific job ID

    // Check if job post automation is already running
    const status = automationService.getJobPostStatus(userId);
    if (status.status === 'running') {
      return res.status(400).json({ 
        error: "Job post automation is already running for this user",
        status: status
      });
    }

    // Run job post automation
    const result = await automationService.runJobPostAutomationForUser(userId, jobId);

    res.json({ 
      message: "Job post automation completed successfully", 
      result 
    });

  } catch (error) {
    console.error("Job post automation error:", error);
    res.status(500).json({ error: error.message });
  }
};

// NEW: Auto-post all pending jobs for all users
export const runJobPostForAllUsers = async (req, res) => {
  try {
    console.log("📝 Starting job post automation for all users");

    // Only allow admin users to trigger this (you might want to add auth check)
    // if (req.user.role !== 'admin') {
    //   return res.status(403).json({ error: "Unauthorized" });
    // }

    const result = await automationService.runJobPostForAllUsers();

    res.json({ 
      message: "Job post automation completed for all users", 
      result 
    });

  } catch (error) {
    console.error("Bulk job post automation error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get automation status
export const getAutomationStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const status = automationService.getAutomationStatus(userId);
    
    res.json({ status });
  } catch (error) {
    console.error("Status check error:", error);
    res.status(500).json({ error: error.message });
  }
};

// NEW: Get job post automation status
export const getJobPostStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const status = automationService.getJobPostStatus(userId);
    
    res.json({ status });
  } catch (error) {
    console.error("Job post status check error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Stop running automation
export const stopFacebookAutomation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const stopped = await automationService.stopAutomationForUser(userId);
    
    if (stopped) {
      res.json({ message: "Automation stopped successfully" });
    } else {
      res.status(400).json({ error: "No running automation found for user" });
    }
  } catch (error) {
    console.error("Stop automation error:", error);
    res.status(500).json({ error: error.message });
  }
};

// NEW: Stop job post automation
export const stopJobPostAutomation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const stopped = await automationService.stopJobPostForUser(userId);
    
    if (stopped) {
      res.json({ message: "Job post automation stopped successfully" });
    } else {
      res.status(400).json({ error: "No running job post automation found for user" });
    }
  } catch (error) {
    console.error("Stop job post automation error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Schedule automation - REMOVED
// export const scheduleAutomation - REMOVED 

// Unschedule automation - REMOVED  
// export const unscheduleAutomation - REMOVED

// Run automation with custom tasks
export const runCustomAutomation = async (req, res) => {
  try {
    console.log("🚀 Starting custom Facebook automation for user:", req.user.userId);
    
    const userId = req.user.userId;
    const { taskType } = req.body;

    // Check if automation is already running
    const status = automationService.getAutomationStatus(userId);
    if (status.status === 'running') {
      return res.status(400).json({ 
        error: "Automation is already running for this user",
        status: status
      });
    }

    // Define custom task based on taskType
    let customTasks = null;
    
    switch (taskType) {
      case 'profile_check':
        customTasks = async (page, context) => {
          await page.goto("https://www.facebook.com/me", {
            waitUntil: "domcontentloaded",
            timeout: 30000
          });
          
          await page.waitForTimeout(3000);
          
          const profileInfo = await page.evaluate(() => {
            const nameElement = document.querySelector('h1');
            return {
              name: nameElement ? nameElement.textContent.trim() : 'Not found',
              url: window.location.href,
              timestamp: new Date().toISOString()
            };
          });
          
          return { task: 'profile_check', data: profileInfo };
        };
        break;
        
      case 'homepage_check':
        customTasks = async (page, context) => {
          await page.goto("https://www.facebook.com", {
            waitUntil: "domcontentloaded",
            timeout: 60000
          });
          
          await page.waitForTimeout(3000);
          
          const pageInfo = await page.evaluate(() => {
            const posts = document.querySelectorAll('[data-testid="fb-feed-story"]');
            return {
              postCount: posts.length,
              pageTitle: document.title,
              url: window.location.href,
              timestamp: new Date().toISOString()
            };
          });
          
          return { task: 'homepage_check', data: pageInfo };
        };
        break;
        
      default:
        return res.status(400).json({ 
          error: "Invalid task type. Supported types: profile_check, homepage_check" 
        });
    }

    // Run automation with custom tasks
    const result = await automationService.runAutomationForUser(userId, customTasks);

    res.json({ 
      message: `Custom automation (${taskType}) completed successfully`, 
      result 
    });

  } catch (error) {
    console.error("Custom automation error:", error);
    res.status(500).json({ error: error.message });
  }
};