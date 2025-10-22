import express from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Generate extension token
router.post('/tokens/generate', verifyToken, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.userId;

    const token = crypto.randomBytes(32).toString('hex');

    const extensionToken = await prisma.extensionToken.create({
      data: {
        token,
        name: name || 'Browser Extension',
        userId,
        deviceInfo: req.headers['user-agent'],
        ipAddress: req.ip
      }
    });

    res.json({ 
      success: true, 
      token: extensionToken 
    });

  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Get user's tokens
router.get('/tokens', verifyToken, async (req, res) => {
  try {
    const tokens = await prisma.extensionToken.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ tokens });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

// Revoke token
router.delete('/tokens/:id', verifyToken, async (req, res) => {
  try {
    await prisma.extensionToken.updateMany({
      where: { id: req.params.id, userId: req.user.userId },
      data: { isActive: false }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke token' });
  }
});

// Middleware to verify extension token
async function authenticateExtension(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const extensionToken = await prisma.extensionToken.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!extensionToken || !extensionToken.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive token' });
    }

    await prisma.extensionToken.update({
      where: { id: extensionToken.id },
      data: { lastUsedAt: new Date() }
    });

    req.extensionUser = extensionToken.user;
    req.extensionTokenId = extensionToken.id;
    next();

  } catch (error) {
    console.error('Extension auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// Get jobs to post (used by extension)
router.get('/jobs', authenticateExtension, async (req, res) => {
  try {
    const userId = req.extensionUser.id;

    const jobs = await prisma.job.findMany({
      where: {
        userId,
        isActive: true,
        posts: { none: { status: 'SUCCESS' } }
      },
      include: { posts: true }
    });

    res.json({ 
      jobs: jobs.map(job => ({
        ...job,
        facebookGroups: job.facebookGroups.map((url, index) => ({
          id: `${job.id}-${index}`,
          url,
          name: url.split('/groups/')[1]?.split('/')[0] || 'Unknown'
        }))
      }))
    });

  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Create JobPost record
router.post('/jobpost', authenticateExtension, async (req, res) => {
  try {
    const { jobId, facebookGroupUrl } = req.body;

    const job = await prisma.job.findFirst({ where: { id: jobId, userId: req.extensionUser.id } });

    if (!job) return res.status(404).json({ error: 'Job not found' });

    const jobPost = await prisma.jobPost.create({
      data: { jobId, facebookGroupUrl, status: 'POSTING', attemptNumber: 1 }
    });

    res.json({ jobPost });
  } catch (error) {
    console.error('Error creating job post:', error);
    res.status(500).json({ error: 'Failed to create job post' });
  }
});

// Update JobPost record
router.put('/jobpost/:id', authenticateExtension, async (req, res) => {
  try {
    const { status, postUrl, errorMessage } = req.body;

    const jobPost = await prisma.jobPost.update({
      where: { id: req.params.id },
      data: { status, postUrl, errorMessage, updatedAt: new Date() }
    });

    res.json({ success: true, jobPost });
  } catch (error) {
    console.error('Error updating job post:', error);
    res.status(500).json({ error: 'Failed to update job post' });
  }
});

// Heartbeat endpoint
router.post('/heartbeat', authenticateExtension, async (req, res) => {
  const { status, lastActivity } = req.body;
  console.log(`Extension heartbeat from user ${req.extensionUser.id}:`, status);
  res.json({ success: true });
});

export default router;
