const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://audace.app.n8n.cloud/webhook/webhook-test';
const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || 'EAAUNrA8WQrUBPz29u8U86C7HkZCRZCKZAw1LjPDkKMZBu9ariwIWFS1ozdhdY4UnD0Lv2GCjTcaHVwZCM3fGXvC0yZCIgr96zfaBxNJk3rZAB4pCAFjmbgotmrMK14ezXFz0jjadfeCQuZBSafDNfD7tA5LQ5Hj3dCsRmHDQtXiinL7fh1rk4hTl5eLf3EjS3RKt1bSfZAgZDZD'

export const handleMessengerWebhook = async (req, res) => {
  console.log('📥 Received webhook:', JSON.stringify(req.body, null, 2));

  // Verify webhook
  if (req.method === 'GET') {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
      console.log('✅ Webhook verified');
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.sendStatus(403);
  }

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

async function handleReferral(referral, senderId) {
  try {
    console.log('📦 Raw referral data:', referral);
    
    if (!referral.ref) {
      console.log('⚠️ No ref parameter in referral');
      return;
    }

    // NEW: ref is now a plain session ID string, not base64 JSON
    const sessionId = referral.ref;
    console.log('🔍 Session ID from referral:', sessionId);

    // Fetch job context from database using session ID
    const contextSession = await fetchContextFromDatabase(sessionId);

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
    await updateContextSession(sessionId, senderId);

    const payload = {
      type: 'messenger_referral',
      timestamp: new Date().toISOString(),
      senderId,
      sessionId,
      jobContext: contextSession.contextData, // Full job context from database
      contextSessionId: contextSession.id,
      source: 'facebook_messenger'
    };

    console.log('📤 Sending payload to N8N with retrieved context');
    await sendToN8N(payload);

  } catch (error) {
    console.error('❌ Error handling referral:', error);
  }
}

// NEW: Add these helper functions
async function fetchContextFromDatabase(sessionId) {
  try {
    const response = await fetch(`${process.env.API_URL || 'https://fbauto-main-production-5d2d.up.railway.app/api'}/context-session/${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log('Context session not found or expired');
      return null;
    }

    const data = await response.json();
    return data.contextSession;
  } catch (error) {
    console.error('Error fetching context from database:', error);
    return null;
  }
}

async function updateContextSession(sessionId, facebookUserId) {
  try {
    await fetch(`${process.env.API_URL || 'https://fbauto-main-production-5d2d.up.railway.app/api'}/context-session/${sessionId}/link`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        facebookUserId,
        conversationStarted: true 
      })
    });
  } catch (error) {
    console.error('Error updating context session:', error);
  }
// ...existing code...
}

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

// Handle regular messages
async function handleMessage(event, senderId) {
  console.log('💬 Message received from:', senderId);
  console.log('📝 Text:', event.message.text);
  
  let jobContext = null;
  let sessionId = null;

  // Check if this message has referral data (first message scenario)
  if (event.message.referral && event.message.referral.ref) {
    console.log('🎯 First message with referral data!');
    sessionId = event.message.referral.ref; // Now it's a plain session ID
    
    // Fetch context from database
    const contextSession = await fetchContextFromDatabase(sessionId);

    if (contextSession) {
      jobContext = contextSession.contextData;
      console.log('✅ Job context retrieved from database:', jobContext.jobTitle);
      
      // Update with Facebook user ID if not already set
      await updateContextSession(sessionId, senderId);
    }
  } else {
    // For subsequent messages, try to find context by Facebook user ID
    try {
      const response = await fetch(`${process.env.API_URL || 'https://fbauto-main-production-5d2d.up.railway.app/api'}/context-session/by-user/${senderId}`, {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.contextSession) {
          jobContext = data.contextSession.contextData;
          sessionId = data.contextSession.sessionToken;
          console.log('✅ Retrieved existing context for user:', jobContext.jobTitle);
        }
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
    jobContext: jobContext, // Will be null if no context found
    source: 'facebook_messenger_message'
  };
  
  await sendToN8N(webhookPayload);
  console.log('📤 Message data sent to N8N with context');
}

// Handle button clicks (postbacks)
async function handlePostback(event, senderId) {
  console.log('📮 Postback received from:', senderId);
  console.log('🎯 Payload:', event.postback.payload);
  
  // Check if this postback also has referral data (first interaction)
  let jobContext = null;
  if (event.postback.referral && event.postback.referral.ref) {
    console.log('🎯 Postback with referral data!');
    try {
      const decodedRef = JSON.parse(Buffer.from(event.postback.referral.ref, 'base64url').toString());
      jobContext = {
        jobPostId: decodedRef.jid,
        jobTitle: decodedRef.jt,
        company: decodedRef.c,
        timestamp: decodedRef.ts
      };
      console.log('✅ Job context from postback:', jobContext);
    } catch (error) {
      console.error('❌ Failed to decode postback referral:', error);
    }
  }
  
  const webhookPayload = {
    type: 'messenger_postback',
    timestamp: new Date().toISOString(),
    senderId: senderId,
    postback: {
      title: event.postback.title,
      payload: event.postback.payload
    },
    jobContext: jobContext,
    source: 'facebook_messenger_postback'
  };
  
  await sendToN8N(webhookPayload);
  console.log('📤 Postback data sent to N8N');
}

// Simple function to send data to N8N
