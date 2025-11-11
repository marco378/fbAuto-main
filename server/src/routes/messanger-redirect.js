import { prisma } from "../lib/prisma.js";

const MESSENGER_LINK = "https://m.me/61579236676817";
const N8N_WEBHOOK_URL = process.env.N8N_JOB_CONTEXT_WEBHOOK_URL || 'https://audace.app.n8n.cloud/webhook/webhook-test';
const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || 'EAAUNrA8WQrUBPc75RtQwhCQiZAgmG8yHhmJdT6CVluVcS7JK2BVnntUFtyAq9DUYMx2ScZCl4FVYr2PxbVfZAvM4TZBlJPo49YNmrPKI9SVjSCFk28Wsdzp0ZCry5BPuOxuV4EPYOuZCrvmz9V99NkqbEXhPWZBDhGDbfMVPGAUNuHkWMgbP7d52gxj1RVEZCcyBMxjX2gZDZD';

// Reusable Job Closed HTML
const getJobClosedHTML = () => `
  <!DOCTYPE html>
  <html>
  <head>
      <title>Job Closed</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
          body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              margin: 50px; 
              background-color: #f5f5f5; 
          }
          .container { 
              background: white; 
              padding: 40px; 
              border-radius: 10px; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
              max-width: 400px; 
              margin: 0 auto; 
          }
          h1 { color: #333; margin-bottom: 20px; }
          p { color: #666; font-size: 16px; }
      </style>
  </head>
  <body>
      <div class="container">
          <h1>Job Closed</h1>
          <p>This job position is no longer available.</p>
          <p>Thank you for your interest!</p>
      </div>
  </body>
  </html>
`;

// ============================================
// MAIN REDIRECT HANDLER - MINIMAL CONTEXT VERSION
// ============================================
export const messengerRedirectWithContext = async (req, res) => {
  try {
    const { context } = req.query;
    console.log('🔗 Messenger redirect triggered');
    console.log('📦 Full query params:', JSON.stringify(req.query));
    console.log('📦 Raw context param:', context);
    console.log('📦 Context length:', context ? context.length : 0);
    console.log('📦 Full URL:', req.url);
    
    // If no context provided, show job closed page
    if (!context) {
      console.log('❌ No context provided in query params');
      console.log('❌ Available params:', Object.keys(req.query));
      return res.status(400).send(getJobClosedHTML());
    }
    
    // Decode context - HANDLE BOTH OLD AND NEW FORMATS
    let jobPostId;
    let decodedContext = null;
    
    try {
      const decoded = Buffer.from(context, 'base64url').toString();
      console.log('🔓 Decoded string:', decoded);
      console.log('🔓 Decoded length:', decoded.length);
      
      // Parse the JSON
      const parsed = JSON.parse(decoded);
      console.log('✅ Parsed object keys:', Object.keys(parsed));
      
      // Handle both formats:
      // New format: {"jobPostId":"xxx"}
      // Old format: {"jobPostId":"xxx", "jobTitle":"...", "company":"...", ...}
      jobPostId = parsed.jobPostId;
      decodedContext = parsed; // Keep the full context in case it has everything
      
      console.log('✅ Extracted jobPostId:', jobPostId);
    } catch (e) {
      console.log('❌ Failed to decode context:', e.message);
      console.log('❌ Context value:', context);
      console.log('❌ Context length:', context.length);
      
      // Try to decode just to see what we got
      try {
        const rawDecoded = Buffer.from(context, 'base64url').toString();
        console.log('❌ Raw decoded (even if invalid JSON):', rawDecoded);
      } catch (decodeErr) {
        console.log('❌ Could not even decode base64:', decodeErr.message);
      }
      
      return res.status(400).send(getJobClosedHTML());
    }
    
    // Validate jobPostId exists
    if (!jobPostId) {
      console.log('❌ No job post ID in context');
      return res.status(400).send(getJobClosedHTML());
    }
    
    // Look up the job post and parent job WITH ALL DATA
    console.log('🔎 Looking up jobPostId:', jobPostId);
    const jobPost = await prisma.jobPost.findFirst({
      where: {
        id: jobPostId
      },
      include: {
        job: true // Get ALL job fields
      }
    });
    
    console.log('🔎 jobPost from DB:', jobPost ? 'Found' : 'Not found');
    
    // Check if job post doesn't exist
    if (!jobPost) {
      console.log(`❌ Job post not found - JobPost ID: ${jobPostId}`);
      return res.status(404).send(getJobClosedHTML());
    }
    
    // Check if parent job doesn't exist
    if (!jobPost.job) {
      console.log(`❌ Parent job not found - JobPost ID: ${jobPostId}`);
      return res.status(404).send(getJobClosedHTML());
    }
    
    // Check if parent job is inactive
    if (!jobPost.job.isActive) {
      console.log(`❌ Job is inactive - Job ID: ${jobPost.job.id}, Title: ${jobPost.job.title}`);
      return res.status(410).send(getJobClosedHTML());
    }
    
    // Check if job has expired (only if expiresAt field exists and is set)
    if (jobPost.job.expiresAt && new Date() > new Date(jobPost.job.expiresAt)) {
      console.log(`❌ Job expired - Job ID: ${jobPost.job.id}, Expired at: ${jobPost.job.expiresAt}`);
      return res.status(410).send(getJobClosedHTML());
    }
    
    // ✅ Job exists, is active, and not expired - proceed with normal flow
    console.log(`✅ Valid job access - JobPost ID: ${jobPostId}, Job: ${jobPost.job.title}`);
    
    // Create unique session ID
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Build FULL context data from database
    // If the context already had full data (old format), use that as fallback
    const fullContextData = {
      jobPostId: jobPost.id,
      jobId: jobPost.job.id,
      jobTitle: jobPost.job.title,
      company: jobPost.job.company,
      location: jobPost.job.location,
      jobType: jobPost.job.jobType,
      experience: jobPost.job.experiance, // Note: typo in your schema
      salaryRange: jobPost.job.salaryRange,
      description: jobPost.job.description,
      requirements: jobPost.job.requirements,
      responsibilities: jobPost.job.responsibities, // Note: typo in your schema
      perks: jobPost.job.perks,
      facebookGroupUrl: jobPost.facebookGroupUrl,
      postUrl: jobPost.postUrl,
      // Include any extra fields from old context format
      ...(decodedContext || {})
    };
    
    // Store context in database with FULL data
    const contextSession = await prisma.jobContextSession.create({
      data: {
        sessionToken: sessionId,
        jobPostId: jobPostId,
        contextData: fullContextData,
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        lastAccessedAt: new Date()
      }
    });
    
    console.log(`✅ Stored full context with session ID: ${sessionId}`);
    
    // Send webhook payload to N8N with FULL context
    const webhookPayload = {
      type: 'messenger_context_trigger',
      timestamp: new Date().toISOString(),
      sessionId: sessionId,
      contextSessionId: contextSession.id,
      jobContext: fullContextData,  // ✅ Send FULL context like before
      jobTitle: jobPost.job.title,  // Keep for backward compatibility
      company: jobPost.job.company, // Keep for backward compatibility
      messengerInfo: {
        pageId: MESSENGER_LINK.split('/').pop(),
        redirectUrl: `${MESSENGER_LINK}?ref=${sessionId}`
      }
    };
    
    // Send webhook asynchronously (don't wait for it)
    sendWebhookToN8N(webhookPayload).catch(error => {
      console.error('❌ Webhook sending failed:', error.message);
    });
    
    console.log('✅ Webhook triggered, redirecting to messenger...');
    
    // Redirect user to messenger with session reference
    return res.redirect(`${MESSENGER_LINK}?ref=${sessionId}`);
    
  } catch (error) {
    console.error('❌ Error in messenger redirect:', error);
    console.error('❌ Stack trace:', error.stack);
    
    // On any unexpected error, show job closed page
    return res.status(500).send(getJobClosedHTML());
  }
};

// ============================================
// WEBHOOK VERIFICATION & EVENT HANDLER
// ============================================
export const handleMessengerWebhook = async (req, res) => {
  console.log('📥 Received webhook:', JSON.stringify(req.body, null, 2));

  // Verify webhook (GET request from Facebook)
  if (req.method === 'GET') {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
      console.log('✅ Webhook verified');
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.sendStatus(403);
  }

  // Handle webhook events (POST request from Facebook)
  if (req.body.object === 'page') {
    for (const entry of req.body.entry) {
      for (const event of entry.messaging) {
        console.log('📨 Processing event:', JSON.stringify(event, null, 2));
        
        const senderId = event.sender.id;
        console.log('👤 Sender ID:', senderId);

        if (event.referral) {
          console.log('🎯 Referral event detected');
          await handleReferral(event.referral, senderId);
        }
        else if (event.postback?.referral) {
          console.log('🎯 Postback referral detected');
          await handleReferral(event.postback.referral, senderId);
        }
        else if (event.message) {
          console.log('💬 Message event detected');
          await handleMessage(event, senderId);
        }
        else {
          console.log('ℹ️ Other event type:', Object.keys(event));
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
};

// ============================================
// REFERRAL HANDLER
// ============================================
async function handleReferral(referral, senderId) {
  try {
    console.log('📦 Raw referral data:', referral);
    
    if (!referral.ref) {
      console.log('⚠️ No ref parameter in referral');
      return;
    }

    const sessionId = referral.ref;
    console.log('🔍 Session ID from referral:', sessionId);

    // Fetch job context from database using session ID
    const contextSession = await prisma.jobContextSession.findUnique({
      where: { 
        sessionToken: sessionId,
        isActive: true,
        expiresAt: { gt: new Date() }
      }
    });

    if (!contextSession) {
      console.log('❌ No active context found for session:', sessionId);
      // Send webhook anyway but with no job context
      const payload = {
        type: 'messenger_referral',
        timestamp: new Date().toISOString(),
        senderId,
        sessionId,
        error: 'Context not found or expired',
        source: 'facebook_messenger'
      };
      await sendToN8N(payload);
      return;
    }

    // Link this Facebook user to the context session
    await prisma.jobContextSession.update({
      where: { id: contextSession.id },
      data: { 
        facebookUserId: senderId,
        conversationStarted: true,
        lastAccessedAt: new Date()
      }
    });

    const payload = {
      type: 'messenger_referral',
      timestamp: new Date().toISOString(),
      senderId,
      sessionId,
      jobContext: contextSession.contextData,
      contextSessionId: contextSession.id,
      source: 'facebook_messenger'
    };

    console.log('📤 Sending payload to N8N with retrieved context');
    await sendToN8N(payload);

  } catch (error) {
    console.error('❌ Error handling referral:', error);
  }
}

// ============================================
// MESSAGE HANDLER
// ============================================
async function handleMessage(event, senderId) {
  console.log('💬 Message received from:', senderId);
  console.log('📝 Text:', event.message.text);
  
  let jobContext = null;
  let sessionId = null;

  // Check if this message has referral data (first message scenario)
  if (event.message.referral && event.message.referral.ref) {
    console.log('🎯 First message with referral data!');
    sessionId = event.message.referral.ref;
    
    // Fetch context from database
    try {
      const contextSession = await prisma.jobContextSession.findUnique({
        where: { 
          sessionToken: sessionId,
          isActive: true,
          expiresAt: { gt: new Date() }
        }
      });

      if (contextSession) {
        jobContext = contextSession.contextData;
        console.log('✅ Job context retrieved from database:', jobContext.jobTitle);
        
        // Update with Facebook user ID if not already set
        if (!contextSession.facebookUserId) {
          await prisma.jobContextSession.update({
            where: { id: contextSession.id },
            data: { 
              facebookUserId: senderId,
              conversationStarted: true,
              lastAccessedAt: new Date()
            }
          });
        }
      }
    } catch (error) {
      console.error('❌ Failed to retrieve context from database:', error);
    }
  } else {
    // For subsequent messages, try to find context by Facebook user ID
    try {
      const contextSession = await prisma.jobContextSession.findFirst({
        where: { 
          facebookUserId: senderId,
          isActive: true,
          expiresAt: { gt: new Date() }
        },
        orderBy: { lastAccessedAt: 'desc' }
      });

      if (contextSession) {
        jobContext = contextSession.contextData;
        sessionId = contextSession.sessionToken;
        console.log('✅ Retrieved existing context for user:', jobContext.jobTitle);
        
        // Update last accessed time
        await prisma.jobContextSession.update({
          where: { id: contextSession.id },
          data: { lastAccessedAt: new Date() }
        });
      }
    } catch (error) {
      console.error('❌ Failed to retrieve context by user ID:', error);
    }
  }
  
  const webhookPayload = {
    type: 'messenger_message',
    timestamp: new Date().toISOString(),
    senderId: senderId,
    sessionId: sessionId,
    message: {
      text: event.message.text || '',
      attachments: event.message.attachments || []
    },
    jobContext: jobContext,
    source: 'facebook_messenger_message'
  };
  
  await sendToN8N(webhookPayload);
  console.log('📤 Message data sent to N8N with context');
}

// ============================================
// HELPER FUNCTIONS
// ============================================
async function sendToN8N(payload) {
  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'messenger-webhook'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`N8N webhook failed: ${response.status}`);
    }

    console.log('✅ Successfully sent to N8N');
  } catch (error) {
    console.error('❌ Error sending to N8N:', error);
  }
}

async function sendWebhookToN8N(payload) {
  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'messenger-webhook'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`N8N webhook failed: ${response.status}`);
    }

    console.log('✅ Successfully sent to N8N');
  } catch (error) {
    console.error('❌ Error sending to N8N:', error);
    throw error;
  }
}