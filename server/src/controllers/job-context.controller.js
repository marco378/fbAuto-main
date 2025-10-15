// src/server/routes/job-context.js
import { prisma } from "../lib/prisma.js";

// Store job context (called from N8N webhook)
export const storeJobContext = async (req, res) => {
  try {
    const { sessionId, jobContext, userInfo } = req.body;
    
    console.log(`📋 Storing job context for session: ${sessionId}`);
    console.log(`💼 Job: ${jobContext.jobTitle} at ${jobContext.company}`);
    
    // Store in database
    const contextSession = await prisma.jobContextSession.create({
      data: {
        sessionToken: sessionId,
        jobPostId: jobContext.jobPostId || null,
        contextData: jobContext, // Prisma will handle JSON serialization
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        lastAccessedAt: new Date()
      }
    });
    
    console.log(`✅ Successfully stored context with ID: ${contextSession.id}`);
    
    res.json({ 
      success: true, 
      sessionId,
      contextId: contextSession.id,
      jobTitle: jobContext.jobTitle,
      company: jobContext.company,
      expiresAt: contextSession.expiresAt
    });
    
  } catch (error) {
    console.error('❌ Error storing job context:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Retrieve job context (called when user messages)
export const getJobContext = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`🔍 Looking up job context for session: ${sessionId}`);
    
    const contextSession = await prisma.jobContextSession.findUnique({
      where: { 
        sessionToken: sessionId,
        isActive: true,
        expiresAt: { gt: new Date() } // Not expired
      }
    });
    
    if (!contextSession) {
      console.log(`❌ No active context found for session: ${sessionId}`);
      return res.status(404).json({ 
        success: false, 
        error: 'Context not found or expired' 
      });
    }
    
    // Update last accessed time
    await prisma.jobContextSession.update({
      where: { id: contextSession.id },
      data: { lastAccessedAt: new Date() }
    });
    
    console.log(`✅ Found context for: ${contextSession.contextData.jobTitle}`);
    
    res.json({ 
      success: true, 
      sessionId,
      jobContext: contextSession.contextData,
      createdAt: contextSession.createdAt
    });
    
  } catch (error) {
    console.error('❌ Error retrieving job context:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Update context with Facebook user ID (when user first messages)
export const linkContextToUser = async (req, res) => {
  try {
    const { sessionId, facebookUserId } = req.body;
    
    const updated = await prisma.jobContextSession.updateMany({
      where: { 
        sessionToken: sessionId,
        isActive: true 
      },
      data: { 
        facebookUserId,
        conversationStarted: true,
        lastAccessedAt: new Date()
      }
    });
    
    if (updated.count === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }
    
    console.log(`🔗 Linked session ${sessionId} to Facebook user ${facebookUserId}`);
    
    res.json({ 
      success: true, 
      sessionId, 
      facebookUserId,
      linked: true 
    });
    
  } catch (error) {
    console.error('❌ Error linking context to user:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get all active contexts (for debugging)
export const getAllActiveContexts = async (req, res) => {
  try {
    const contexts = await prisma.jobContextSession.findMany({
      where: { 
        isActive: true,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    const summary = contexts.map(ctx => ({
      sessionId: ctx.sessionToken,
      jobTitle: ctx.contextData.jobTitle,
      company: ctx.contextData.company,
      facebookUserId: ctx.facebookUserId,
      conversationStarted: ctx.conversationStarted,
      createdAt: ctx.createdAt,
      expiresAt: ctx.expiresAt
    }));
    
    res.json({ 
      success: true, 
      count: contexts.length,
      contexts: summary 
    });
    
  } catch (error) {
    console.error('❌ Error getting active contexts:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};