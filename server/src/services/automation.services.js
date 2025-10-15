// src/services/automation.services.js
import { runAutomation, cleanup } from "../../../src/automation/runner.js";
import {
  runJobPostAutomation,
  cleanupJobPostAutomation,
} from "../../../src/automation/job-post-runner.js";
import { prisma } from "../lib/prisma.js";

class AutomationService {
  constructor() {
    this.runningAutomations = new Map();
    this.runningJobPosts = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log("🚀 Initializing Local Automation Service...");

    // Setup cleanup handlers
    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());

    console.log("✅ Local Automation Service initialized");
    console.log("📋 Ready to process jobs manually or via API calls");
    this.isInitialized = true;
  }

  async runAutomationForUser(userId, customTasks = null) {
    try {
      console.log(`🤖 Starting automation for user: ${userId}`);

      if (this.runningAutomations.has(userId)) {
        throw new Error("Automation is already running for this user");
      }

      // Use hardcoded credentials for local automation
      const credentials = {
        email: "airecuritement@gmail.com",
        password: "Varunsh@123",
      };

      this.runningAutomations.set(userId, {
        startTime: new Date(),
        status: "running",
      });

      const result = await runAutomation(credentials, customTasks);

      this.runningAutomations.set(userId, {
        startTime: this.runningAutomations.get(userId).startTime,
        endTime: new Date(),
        status: "completed",
        result,
      });

      console.log(`✅ Automation completed for user: ${userId}`);
      return result;
    } catch (error) {
      console.error(`❌ Automation failed for user ${userId}:`, error.message);

      this.runningAutomations.set(userId, {
        startTime: this.runningAutomations.get(userId)?.startTime || new Date(),
        endTime: new Date(),
        status: "failed",
        error: error.message,
      });

      throw error;
    }
  }

  async runJobPostAutomationForUser(userId, jobId = null) {
    try {
      console.log(`📝 Starting job post automation for user: ${userId}`);

      if (this.runningJobPosts.has(userId)) {
        const current = this.runningJobPosts.get(userId);
        if (current.status === "running") {
          throw new Error(
            "Job post automation is already running for this user"
          );
        }
      }

      // Use hardcoded credentials for local automation
      const credentials = {
        email: "airecuritement@gmail.com",
        password: "Varunsh@123",
      };

      let jobData = null;
      if (jobId) {
        jobData = await prisma.job.findFirst({
          where: {
            id: jobId,
            userId: userId,
            isActive: true,
          },
          include: {
            posts: true,
          },
        });

        if (!jobData) {
          throw new Error("Job not found or not accessible");
        }
      }

      this.runningJobPosts.set(userId, {
        startTime: new Date(),
        status: "running",
        jobId: jobId,
      });

      const result = await runJobPostAutomation(credentials, jobData);

      this.runningJobPosts.set(userId, {
        startTime: this.runningJobPosts.get(userId).startTime,
        endTime: new Date(),
        status: "completed",
        jobId: result.jobId,
        result,
      });

      console.log(`✅ Job post automation completed for user: ${userId}`);
      return result;
    } catch (error) {
      console.error(
        `❌ Job post automation failed for user ${userId}:`,
        error.message
      );

      this.runningJobPosts.set(userId, {
        startTime: this.runningJobPosts.get(userId)?.startTime || new Date(),
        endTime: new Date(),
        status: "failed",
        jobId: jobId,
        error: error.message,
      });

      // Clean up failed job post from tracking
      setTimeout(() => {
        this.runningJobPosts.delete(userId);
      }, 60000); // Remove after 1 minute

      throw error;
    }
  }

  // NEW: Process all pending jobs for all users (manual trigger)
  async processAllPendingJobs() {
    try {
      console.log("🔄 Processing all pending jobs...");

      // Get all users who have pending jobs
      const pendingJobs = await prisma.job.findMany({
        where: {
          isActive: true,
          facebookGroups: {
            not: { equals: [] }
          },
          posts: {
            none: { status: "SUCCESS" }
          }
        },
        include: {
          posts: true,
          user: {
            select: {
              id: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        },
        take: 10 // Process max 10 jobs at once
      });

      if (pendingJobs.length === 0) {
        console.log("✅ No pending jobs found");
        return {
          success: true,
          message: "No pending jobs found",
          processedJobs: []
        };
      }

      console.log(`📋 Found ${pendingJobs.length} pending jobs`);

      const credentials = {
        email: "airecuritement@gmail.com",
        password: "Varunsh@123",
      };

      const results = [];
      
      for (const job of pendingJobs) {
        try {
          // Skip if user already has a running job post automation
          if (this.runningJobPosts.has(job.userId)) {
            console.log(`⏭️ Skipping job ${job.id} - user ${job.userId} already has running automation`);
            continue;
          }

          console.log(`🔄 Processing job: ${job.title} (${job.id}) for user: ${job.userId}`);
          
          this.runningJobPosts.set(job.userId, {
            startTime: new Date(),
            status: "running",
            jobId: job.id,
          });

          const result = await runJobPostAutomation(credentials, job);
          
          results.push({
            jobId: job.id,
            jobTitle: job.title,
            userId: job.userId,
            success: result.success,
            stats: result.stats
          });

          this.runningJobPosts.set(job.userId, {
            startTime: this.runningJobPosts.get(job.userId).startTime,
            endTime: new Date(),
            status: "completed",
            jobId: result.jobId,
            result,
          });

          console.log(`✅ Job ${job.id} processed successfully`);

          // Delay between jobs to avoid overwhelming Facebook
          if (pendingJobs.length > 1) {
            console.log("⏱️ Waiting 30 seconds before next job...");
            await new Promise(resolve => setTimeout(resolve, 30000));
          }

        } catch (error) {
          console.error(`❌ Failed to process job ${job.id}:`, error.message);
          
          results.push({
            jobId: job.id,
            jobTitle: job.title,
            userId: job.userId,
            success: false,
            error: error.message
          });

          this.runningJobPosts.set(job.userId, {
            startTime: this.runningJobPosts.get(job.userId)?.startTime || new Date(),
            endTime: new Date(),
            status: "failed",
            jobId: job.id,
            error: error.message,
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      console.log(`✅ Batch processing completed: ${successCount}/${results.length} jobs successful`);

      return {
        success: true,
        message: `Processed ${results.length} jobs: ${successCount} successful, ${results.length - successCount} failed`,
        processedJobs: results,
        stats: {
          total: results.length,
          successful: successCount,
          failed: results.length - successCount
        }
      };

    } catch (error) {
      console.error("❌ Batch processing failed:", error.message);
      throw error;
    }
  }

  // NEW: Get count of pending jobs
  async getPendingJobsCount() {
    try {
      const count = await prisma.job.count({
        where: {
          isActive: true,
          facebookGroups: {
            not: { equals: [] }
          },
          posts: {
            none: { status: "SUCCESS" }
          }
        }
      });

      return { pendingCount: count };
    } catch (error) {
      console.error("Error getting pending jobs count:", error.message);
      return { pendingCount: 0, error: error.message };
    }
  }

  getAutomationStatus(userId) {
    return this.runningAutomations.get(userId) || { status: "idle" };
  }

  getJobPostStatus(userId) {
    return this.runningJobPosts.get(userId) || { status: "idle" };
  }

  getAllJobPostStatuses() {
    const statuses = {};
    for (const [userId, status] of this.runningJobPosts.entries()) {
      statuses[userId] = status;
    }
    return statuses;
  }

  getServiceStatus() {
    return {
      isInitialized: this.isInitialized,
      runningAutomations: this.runningAutomations.size,
      runningJobPosts: this.runningJobPosts.size,
      automationUsers: Array.from(this.runningAutomations.keys()),
      jobPostUsers: Array.from(this.runningJobPosts.keys()),
      type: "LOCAL_AUTOMATION_SERVICE"
    };
  }

  async getSystemStats() {
    try {
      const stats = await this.getPendingJobsCount();
      
      return {
        pendingJobs: stats.pendingCount,
        activeAutomations: this.runningJobPosts.size,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: "Failed to get system stats",
        timestamp: new Date().toISOString()
      };
    }
  }

  async shutdown() {
    console.log("🛑 Shutting down Automation Service...");
    
    try {
      // Stop all running automations gracefully
      console.log(`Stopping ${this.runningAutomations.size} running automations...`);
      console.log(`Stopping ${this.runningJobPosts.size} running job posts...`);

      // Clean up automation resources
      await cleanup();
      await cleanupJobPostAutomation();

      // Clear tracking maps
      this.runningAutomations.clear();
      this.runningJobPosts.clear();

      console.log("✅ Automation Service shutdown completed");
    } catch (error) {
      console.error("❌ Error during automation service shutdown:", error.message);
    }
  }
}

export const automationService = new AutomationService();