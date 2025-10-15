// src/services/comment-scheduler.js
import cron from 'node-cron';
import { runCommentMonitoring, cleanupCommentMonitoring } from '../../../src/automation/comment-runner.js';
import { prisma } from '../lib/prisma.js';

class CommentScheduler {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.credentials = null;
  }

  async initialize() {
    try {
      console.log('🔄 Initializing comment scheduler...');
      
      // Get Facebook credentials from database
      this.credentials = await this.getFacebookCredentials();
      
      if (this.credentials) {
        // Start monitoring every 30 minutes
        this.start('*/30 * * * *');
        console.log('✅ Comment scheduler initialized successfully');
      } else {
        console.log('⚠️ Comment scheduler not started - no Facebook credentials found');
      }
    } catch (error) {
      console.error('❌ Failed to initialize comment scheduler:', error.message);
    }
  }

  async getFacebookCredentials() {
    try {
      const credentials = await prisma.facebookCredentials.findFirst({
        include: {
          user: true
        }
      });

      if (credentials) {
        return {
          email: credentials.email,
          password: credentials.password
        };
      }

      // Fallback to environment variables if available
      if (process.env.FACEBOOK_EMAIL && process.env.FACEBOOK_PASSWORD) {
        return {
          email: process.env.FACEBOOK_EMAIL,
          password: process.env.FACEBOOK_PASSWORD
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Error getting Facebook credentials:', error.message);
      return null;
    }
  }

  start(schedule = '*/30 * * * *') {
    if (this.cronJob) {
      console.log('⚠️ Comment scheduler already running');
      return;
    }

    if (!this.credentials) {
      console.log('⚠️ Cannot start comment scheduler - no credentials');
      return;
    }

    console.log(`🚀 Starting comment monitoring scheduler: ${schedule}`);

    this.cronJob = cron.schedule(schedule, async () => {
      if (this.isRunning) {
        console.log('⏳ Previous comment monitoring still running, skipping...');
        return;
      }

      this.isRunning = true;
      try {
        console.log('🔄 Running scheduled comment monitoring...');
        const result = await runCommentMonitoring(this.credentials);
        
        if (result.success) {
          console.log(`✅ Comment monitoring completed: ${result.stats.totalReplied} replies sent`);
        } else {
          console.log('⚠️ Comment monitoring completed with issues');
        }
      } catch (error) {
        console.error('❌ Scheduled comment monitoring failed:', error.message);
      } finally {
        this.isRunning = false;
      }
    }, {
      scheduled: false,
      timezone: "Asia/Kolkata" // Adjust to your timezone
    });

    this.cronJob.start();
    
    // Run once after 2 minutes of server start (to allow everything to initialize)
    setTimeout(async () => {
      if (!this.isRunning && this.credentials) {
        this.isRunning = true;
        try {
          console.log('🚀 Running initial comment monitoring...');
          const result = await runCommentMonitoring(this.credentials);
          console.log('✅ Initial comment monitoring completed');
        } catch (error) {
          console.error('❌ Initial comment monitoring failed:', error.message);
        } finally {
          this.isRunning = false;
        }
      }
    }, 120000); // 2 minutes delay
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Comment scheduler stopped');
    }
  }

  getStatus() {
    return {
      isScheduled: !!this.cronJob,
      isRunning: this.isRunning,
      hasCredentials: !!this.credentials
    };
  }

  async shutdown() {
    console.log('🧹 Shutting down comment scheduler...');
    this.stop();
    await cleanupCommentMonitoring();
    console.log('✅ Comment scheduler shutdown completed');
  }
}

export const commentScheduler = new CommentScheduler();