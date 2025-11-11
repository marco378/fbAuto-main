import { prisma } from "../lib/prisma.js";

const MESSENGER_LINK = "https://m.me/61579236676817";
const N8N_WEBHOOK_URL = process.env.N8N_JOB_CONTEXT_WEBHOOK_URL || 'https://audace.app.n8n.cloud/webhook/webhook-test';

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

// Helper function to try extracting jobPostId from partial/corrupted context
function tryExtractJobPostId(contextParam, fullUrl) {
  console.log('🔍 Attempting advanced extraction...');
  
  try {
    // Method 1: Try to remove fbclid pollution
    const cleanContext = contextParam.split('&')[0];
    console.log('  Method 1 - Cleaned context:', cleanContext);
    
    // Method 2: Try decoding the cleaned context
    try {
      const decoded = Buffer.from(cleanContext, 'base64url').toString();
      console.log('  Method 2 - Decoded:', decoded);
      
      // Try regex extraction from partial JSON
      const patterns = [
        /"jobPostId"\s*:\s*"(cm[a-zA-Z0-9]+)"/,
        /jobPostId[:\s]+"(cm[a-zA-Z0-9]+)"/,
        /jobPostId[:\s]+(cm[a-zA-Z0-9]+)/,
      ];
      
      for (const pattern of patterns) {
        const match = decoded.match(pattern);
        if (match) {
          console.log('  ✅ Extracted via regex:', match[1]);
          return match[1];
        }
      }
    } catch (decodeError) {
      console.log('  Method 2 - Decode failed:', decodeError.message);
    }
    
    // Method 3: Look for jobPostId pattern anywhere in the URL
    const urlPattern = /cm[a-zA-Z0-9]{20,}/g;
    const urlMatches = fullUrl.match(urlPattern);
    if (urlMatches && urlMatches.length > 0) {
      console.log('  Method 3 - Found in URL:', urlMatches[0]);
      return urlMatches[0];
    }
    
  } catch (error) {
    console.log('  ❌ Advanced extraction failed:', error.message);
  }
  
  return null;
}

// ============================================
// MAIN REDIRECT HANDLER - ROBUST VERSION
// ============================================
export const messengerRedirectWithContext = async (req, res) => {
  try {
    const fullUrl = req.originalUrl || req.url;
    
    console.log('🔗 Messenger redirect triggered');
    console.log('📦 Full URL:', fullUrl);
    console.log('📦 Query params:', JSON.stringify(req.query));
    
    // Get context - might be truncated by fbclid
    let contextParam = req.query.context;
    
    if (!contextParam) {
      console.log('❌ No context parameter');
      return res.status(400).send(getJobClosedHTML());
    }
    
    console.log('📦 Raw context param:', contextParam);
    console.log('📦 Context length:', contextParam.length);
    
    let jobPostId = null;
    
    // Try standard decoding first
    try {
      const decoded = Buffer.from(contextParam, 'base64url').toString();
      console.log('🔓 Decoded string:', decoded);
      console.log('🔓 Decoded length:', decoded.length);
      
      try {
        // Try parsing as complete JSON
        const parsed = JSON.parse(decoded);
        jobPostId = parsed.jobPostId;
        console.log('✅ Parsed complete JSON, jobPostId:', jobPostId);
      } catch (jsonError) {
        console.log('⚠️ JSON parse failed:', jsonError.message);
        console.log('⚠️ Likely truncated by fbclid parameter');
        
        // Try regex extraction from partial JSON
        const match = decoded.match(/"jobPostId"\s*:\s*"(cm[a-zA-Z0-9]+)"/);
        if (match) {
          jobPostId = match[1];
          console.log('✅ Extracted from partial JSON:', jobPostId);
        }
      }
    } catch (decodeError) {
      console.log('❌ Decode failed:', decodeError.message);
    }
    
    // If still no jobPostId, try advanced extraction
    if (!jobPostId) {
      jobPostId = tryExtractJobPostId(contextParam, fullUrl);
    }
    
    // Give up if we couldn't extract anything
    if (!jobPostId) {
      console.log('❌ Could not extract jobPostId');
      console.log('❌ Context is corrupted or invalid');
      return res.status(400).send(getJobClosedHTML());
    }
    
    console.log('🎯 Final jobPostId:', jobPostId);
    
    // Look up job post with full job data
    const jobPost = await prisma.jobPost.findFirst({
      where: { id: jobPostId },
      include: { job: true }
    });
    
    if (!jobPost) {
      console.log(`❌ Job post not found: ${jobPostId}`);
      return res.status(404).send(getJobClosedHTML());
    }
    
    if (!jobPost.job) {
      console.log(`❌ Parent job not found for post: ${jobPostId}`);
      return res.status(404).send(getJobClosedHTML());
    }
    
    if (!jobPost.job.isActive) {
      console.log(`❌ Job inactive: ${jobPost.job.title}`);
      return res.status(410).send(getJobClosedHTML());
    }
    
    if (jobPost.job.expiresAt && new Date() > new Date(jobPost.job.expiresAt)) {
      console.log(`❌ Job expired: ${jobPost.job.expiresAt}`);
      return res.status(410).send(getJobClosedHTML());
    }
    
    console.log(`✅ Valid job: ${jobPost.job.title} at ${jobPost.job.company}`);
    
    // Create session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Build full context from fresh database data
    const fullContextData = {
      jobPostId: jobPost.id,
      jobId: jobPost.job.id,
      jobTitle: jobPost.job.title,
      company: jobPost.job.company,
      location: jobPost.job.location,
      jobType: jobPost.job.jobType,
      experience: jobPost.job.experiance,
      salaryRange: jobPost.job.salaryRange,
      description: jobPost.job.description,
      requirements: jobPost.job.requirements,
      responsibilities: jobPost.job.responsibities,
      perks: jobPost.job.perks,
      facebookGroupUrl: jobPost.facebookGroupUrl,
      postUrl: jobPost.postUrl,
    };
    
    // Store in database
    const contextSession = await prisma.jobContextSession.create({
      data: {
        sessionToken: sessionId,
        jobPostId: jobPostId,
        contextData: fullContextData,
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastAccessedAt: new Date()
      }
    });
    
    console.log(`✅ Session created: ${sessionId}`);
    
    // Send webhook to N8N
    const webhookPayload = {
      type: 'messenger_context_trigger',
      timestamp: new Date().toISOString(),
      sessionId: sessionId,
      contextSessionId: contextSession.id,
      jobContext: fullContextData,
      jobTitle: jobPost.job.title,
      company: jobPost.job.company,
      messengerInfo: {
        pageId: MESSENGER_LINK.split('/').pop(),
        redirectUrl: `${MESSENGER_LINK}?ref=${sessionId}`
      }
    };
    
    sendWebhookToN8N(webhookPayload).catch(error => {
      console.error('❌ Webhook failed:', error.message);
    });
    
    console.log('✅ Redirecting to Messenger...');
    return res.redirect(`${MESSENGER_LINK}?ref=${sessionId}`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    console.error('Stack:', error.stack);
    return res.status(500).send(getJobClosedHTML());
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================
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

    console.log('✅ Webhook sent to N8N');
  } catch (error) {
    console.error('❌ Webhook error:', error);
    throw error;
  }
}