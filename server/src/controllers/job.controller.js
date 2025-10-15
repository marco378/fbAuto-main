// controllers/jobController.js
import { prisma } from "../lib/prisma.js";
import { runJobPostAutomation } from "../../../src/automation/job-post-runner.js";

// Create a new job
export const createJob = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      title,
      company,
      location,
      jobType,
      experience,
      salaryRange,
      description,
      requirements = [],
      responsibilities = [],
      perks,
      facebookGroups = [],
      autoPost = false,
    } = req.body;

    if (!title || !company || !location || !jobType || !description) {
      return res.status(400).json({
        error:
          "Missing required fields: title, company, location, jobType, description",
      });
    }

    // Create the job
    const job = await prisma.job.create({
      data: {
        userId,
        title,
        company,
        location,
        jobType,
        experiance: experience,
        salaryRange,
        description,
        requirements: Array.isArray(requirements)
          ? requirements
          : [requirements].filter(Boolean),
        responsibities: Array.isArray(responsibilities)
          ? responsibilities
          : [responsibilities].filter(Boolean),
        perks,
        facebookGroups: Array.isArray(facebookGroups)
          ? facebookGroups
          : [facebookGroups].filter(Boolean),
        isActive: true,
      },
      include: {
        posts: true,
      },
    });

    console.log(`Job created: ${job.title} at ${job.company} (ID: ${job.id})`);

    res.status(201).json({
      message: "Job created successfully",
      job,
    });
  } catch (error) {
    console.error("Create job error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all jobs for a user
export const getUserJobs = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { includeInactive = false, limit = 50, offset = 0 } = req.query;

    const whereClause = { userId };
    if (!includeInactive) {
      whereClause.isActive = true;
    }

    const jobs = await prisma.job.findMany({
      where: whereClause,
      include: {
        posts: {
          include: {
            comments: true,
            metrics: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    // Add posting status to each job
    const jobsWithStatus = jobs.map((job) => ({
      ...job,
      postingStatus: {
        totalGroups: job.facebookGroups.length,
        posted: job.posts.filter((p) => p.status === "SUCCESS").length,
        failed: job.posts.filter((p) => p.status === "FAILED").length,
        pending: job.posts.filter((p) => p.status === "PENDING").length,
        posting: job.posts.filter((p) => p.status === "POSTING").length,
      },
    }));

    res.json({
      jobs: jobsWithStatus,
      total: jobs.length,
    });
  } catch (error) {
    console.error("Get user jobs error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get a specific job
export const getJob = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        userId,
      },
      include: {
        posts: {
          include: {
            comments: {
              include: {
                candidate: true,
              },
            },
            metrics: true,
          },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Add posting status
    const jobWithStatus = {
      ...job,
      postingStatus: {
        totalGroups: job.facebookGroups.length,
        posted: job.posts.filter((p) => p.status === "SUCCESS").length,
        failed: job.posts.filter((p) => p.status === "FAILED").length,
        pending: job.posts.filter((p) => p.status === "PENDING").length,
        posting: job.posts.filter((p) => p.status === "POSTING").length,
      },
    };

    res.json({ job: jobWithStatus });
  } catch (error) {
    console.error("Get job error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update a job
export const updateJob = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;
    const updateData = req.body;

    // Remove non-updatable fields
    delete updateData.id;
    delete updateData.userId;
    delete updateData.createdAt;

    // Handle array fields
    if (updateData.requirements && !Array.isArray(updateData.requirements)) {
      updateData.requirements = [updateData.requirements].filter(Boolean);
    }
    if (
      updateData.responsibilities &&
      !Array.isArray(updateData.responsibilities)
    ) {
      updateData.responsibities = [updateData.responsibilities].filter(Boolean); // Note: typo in schema
      delete updateData.responsibilities;
    }
    if (
      updateData.facebookGroups &&
      !Array.isArray(updateData.facebookGroups)
    ) {
      updateData.facebookGroups = [updateData.facebookGroups].filter(Boolean);
    }

    const job = await prisma.job.updateMany({
      where: {
        id: jobId,
        userId,
      },
      data: {
        ...updateData,
        upddatedAt: new Date(), // Note: typo in schema
      },
    });

    if (job.count === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Get the updated job
    const updatedJob = await prisma.job.findFirst({
      where: { id: jobId, userId },
      include: {
        posts: true,
      },
    });

    res.json({
      message: "Job updated successfully",
      job: updatedJob,
    });
  } catch (error) {
    console.error("Update job error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Delete a job
export const deleteJob = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    const deletedJob = await prisma.job.deleteMany({
      where: {
        id: jobId,
        userId,
      },
    });

    if (deletedJob.count === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json({ message: "Job deleted successfully" });
  } catch (error) {
    console.error("Delete job error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Post a specific job to Facebook groups
export const postJobToFacebook = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    // Check if job exists and belongs to user
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        userId,
        isActive: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found or inactive" });
    }

    if (!job.facebookGroups || job.facebookGroups.length === 0) {
      return res
        .status(400)
        .json({ error: "No Facebook groups specified for this job" });
    }

    // Use hardcoded credentials for local automation
    const credentials = {
      email: "airecuritement@gmail.com",
      password: "Varunsh@123",
    };

    // Run job posting automation
    const result = await runJobPostAutomation(credentials, job);

    res.json({
      message: "Job posting completed successfully",
      result,
    });
  } catch (error) {
    console.error("Post job to Facebook error:", error);
    res.status(500).json({ error: error.message });
  }
};

// NEW: Get pending jobs (jobs that haven't been posted successfully)
export const getPendingJobs = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { includeAll = false } = req.query;

    const whereClause = {
      userId,
      isActive: true,
      facebookGroups: {
        isEmpty: false,
      },
    };

    // Only get truly pending jobs unless includeAll is true
    if (!includeAll) {
      whereClause.posts = {
        none: { status: "SUCCESS" },
      };
    }

    const pendingJobs = await prisma.job.findMany({
      where: whereClause,
      include: {
        posts: {
          include: {
            comments: true,
            metrics: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Add processing status to each job
    const jobsWithStatus = pendingJobs.map((job) => {
      const successfulPosts = job.posts.filter(
        (p) => p.status === "SUCCESS"
      ).length;
      const totalGroups = job.facebookGroups.length;

      return {
        ...job,
        processingStatus: {
          isPending: successfulPosts < totalGroups,
          completed: successfulPosts,
          total: totalGroups,
          percentage:
            totalGroups > 0
              ? Math.round((successfulPosts / totalGroups) * 100)
              : 0,
        },
      };
    });

    res.json({
      pendingJobs: jobsWithStatus,
      count: jobsWithStatus.length,
    });
  } catch (error) {
    console.error("Get pending jobs error:", error);
    res.status(500).json({ error: error.message });
  }
};

// NEW: Process specific pending job
export const processPendingJob = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    // Get job
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        userId,
        isActive: true,
      },
      include: {
        posts: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found or inactive" });
    }

    if (!job.facebookGroups || job.facebookGroups.length === 0) {
      return res
        .status(400)
        .json({ error: "No Facebook groups specified for this job" });
    }

    // Check if already fully processed
    const successfulPosts = job.posts.filter(
      (p) => p.status === "SUCCESS"
    ).length;
    if (successfulPosts >= job.facebookGroups.length) {
      return res.status(400).json({
        error: "Job has already been fully processed",
        status: `${successfulPosts}/${job.facebookGroups.length} groups completed`,
      });
    }

    // Process the job
    console.log(`Manual processing requested for job: ${jobId}`);

    const credentials = {
      email: "airecuritement@gmail.com",
      password: "Varunsh@123",
    };

    const result = await runJobPostAutomation(credentials, job);

    res.json({
      success: true,
      message: "Job processing completed",
      result,
      jobId: job.id,
      jobTitle: job.title,
    });
  } catch (error) {
    console.error("Process pending job error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// NEW: Batch process all pending jobs for a user
export const processAllPendingJobs = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get all pending jobs for this user
    const pendingJobs = await prisma.job.findMany({
      where: {
        userId,
        isActive: true,
        facebookGroups: {
          isEmpty: false,
        },
        posts: {
          none: { status: "SUCCESS" },
        },
      },
      include: {
        posts: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 5, // Limit to 5 jobs at a time
    });

    if (pendingJobs.length === 0) {
      return res.json({
        success: true,
        message: "No pending jobs found",
        processedJobs: [],
      });
    }

    const credentials = {
      email: "airecuritement@gmail.com",
      password: "Varunsh@123",
    };

    console.log(`Batch processing ${pendingJobs.length} pending jobs...`);

    const results = [];
    for (const job of pendingJobs) {
      try {
        console.log(`Processing job: ${job.title} (${job.id})`);
        const result = await runJobPostAutomation(credentials, job);
        results.push({
          jobId: job.id,
          jobTitle: job.title,
          success: result.success,
          stats: result.stats,
        });

        // Delay between jobs
        await new Promise((resolve) => setTimeout(resolve, 10000));
      } catch (error) {
        console.error(`Failed to process job ${job.id}:`, error.message);
        results.push({
          jobId: job.id,
          jobTitle: job.title,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    res.json({
      success: true,
      message: `Batch processing completed: ${successCount}/${results.length} jobs successful`,
      processedJobs: results,
    });
  } catch (error) {
    console.error("Batch process error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get job posting analytics
export const getJobAnalytics = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        userId,
      },
      include: {
        posts: {
          include: {
            comments: {
              include: {
                candidate: true,
              },
            },
            metrics: true,
          },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Calculate analytics
    const analytics = {
      jobId: job.id,
      jobTitle: job.title,
      totalPosts: job.posts.length,
      successfulPosts: job.posts.filter((p) => p.status === "SUCCESS").length,
      failedPosts: job.posts.filter((p) => p.status === "FAILED").length,
      totalComments: job.posts.reduce(
        (sum, post) => sum + post.comments.length,
        0
      ),
      interestedCandidates: job.posts.reduce(
        (sum, post) => sum + post.comments.filter((c) => c.isInterested).length,
        0
      ),
      eligibleCandidates: job.posts.reduce(
        (sum, post) =>
          sum +
          post.comments.filter(
            (c) => c.candidate && c.candidate.eligibility === "ELIGIBLE"
          ).length,
        0
      ),
      totalViews: job.posts.reduce(
        (sum, post) => sum + (post.metrics ? post.metrics.views : 0),
        0
      ),
      totalReactions: job.posts.reduce(
        (sum, post) => sum + (post.metrics ? post.metrics.reactions : 0),
        0
      ),
      postDetails: job.posts.map((post) => ({
        id: post.id,
        groupUrl: post.facebookGroupUrl,
        status: post.status,
        postUrl: post.postUrl,
        comments: post.comments.length,
        interestedComments: post.comments.filter((c) => c.isInterested).length,
        metrics: post.metrics,
        createdAt: post.createdAt,
        updatedAt: post.upddatedAt,
      })),
    };

    res.json({ analytics });
  } catch (error) {
    console.error("Get job analytics error:", error);
    res.status(500).json({ error: error.message });
  }
};
