// Import utilities
importScripts(
  '../utils/config.js',
  '../utils/helpers.js',
  '../utils/messenger-link.js'
);

const API_URL = 'http://localhost:3000'; // UPDATE THIS
const FRONTEND_URL = 'http://localhost:5173'; // UPDATE THIS

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  logMessage('Extension installed', 'success');
  checkTokenAndSchedule();
});

// On startup
chrome.runtime.onStartup.addListener(() => {
  logMessage('Browser started', 'info');
  checkTokenAndSchedule();
});

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoPost') {
    logMessage('Alarm triggered - starting posting cycle', 'info');
    runPostingCycle();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOKEN_ACTIVATED') {
    checkTokenAndSchedule();
  } else if (message.type === 'RUN_NOW') {
    runPostingCycle();
  }
});

// Check if token exists and schedule alarm
async function checkTokenAndSchedule() {
  const { token } = await chrome.storage.sync.get('token');
  
  if (token) {
    // Create recurring alarm (6 hours)
    chrome.alarms.create('autoPost', {
      periodInMinutes: 360,
      delayInMinutes: 1
    });
    
    logMessage('Alarm scheduled - will run every 6 hours', 'success');
  }
}

// Main posting cycle
async function runPostingCycle() {
  logMessage('🚀 Starting posting cycle', 'info');
  
  try {
    const { token } = await chrome.storage.sync.get('token');
    
    if (!token) {
      logMessage('No token found', 'error');
      return;
    }
    
    // Fetch jobs from backend
    const { jobs } = await fetchJobs(token);
    
    if (!jobs || jobs.length === 0) {
      logMessage('No jobs to post', 'info');
      await updateStats({ 
        lastCheck: new Date().toISOString() 
      });
      return;
    }
    
    logMessage(`Found ${jobs.length} jobs to post`, 'success');
    
    let totalPosts = 0;
    
    // Post each job
    for (const job of jobs) {
      const posted = await postJobToGroups(job, token);
      totalPosts += posted;
    }
    
    // Update stats
    const { stats = {} } = await chrome.storage.sync.get('stats');
    await updateStats({
      lastCheck: new Date().toISOString(),
      totalPosts: (stats.totalPosts || 0) + totalPosts,
      nextRun: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    });
    
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../assets/icon-128.png',
      title: 'Job Posting Complete',
      message: `Successfully posted ${totalPosts} jobs`
    });
    
    logMessage(`✅ Posting cycle complete - ${totalPosts} posts`, 'success');
    
  } catch (error) {
    logMessage(`Error in posting cycle: ${error.message}`, 'error');
  }
}

// Fetch jobs from API
async function fetchJobs(token) {
  const response = await fetch(`${API_URL}/api/extension/jobs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch jobs');
  }
  
  return response.json();
}

// Post job to all groups
async function postJobToGroups(job, token) {
  logMessage(`📝 Posting: ${job.title}`, 'info');
  
  let successCount = 0;
  
  for (const group of job.facebookGroups) {
    try {
      // 1. Create JobPost record
      const { jobPost } = await createJobPost(job.id, group.url, token);
      
      // 2. Generate messenger link
      const messengerLink = generateMessengerLink(job, jobPost.id);
      
      // 3. Format post content
      const postContent = formatJobPost(job, messengerLink);
      
      // 4. Post to Facebook
      const result = await postToFacebook(group.url, postContent);
      
      // 5. Update JobPost record
      await updateJobPost(jobPost.id, {
        status: result.success ? 'SUCCESS' : 'FAILED',
        postUrl: result.postUrl,
        errorMessage: result.error
      }, token);
      
      if (result.success) {
        successCount++;
        logMessage(`✅ Posted to ${group.name}`, 'success');
      } else {
        logMessage(`❌ Failed to post to ${group.name}: ${result.error}`, 'error');
      }
      
      // Human-like delay
      await sleep(randomBetween(30000, 60000));
      
    } catch (error) {
      logMessage(`❌ Exception posting to ${group.name}: ${error.message}`, 'error');
    }
  }
  
  return successCount;
}

// Create JobPost in DB
async function createJobPost(jobId, groupUrl, token) {
  const response = await fetch(`${API_URL}/api/extension/jobpost`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      jobId, 
      facebookGroupUrl: groupUrl 
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to create job post');
  }
  
  return response.json();
}

// Update JobPost in DB
async function updateJobPost(jobPostId, updates, token) {
  await fetch(`${API_URL}/api/extension/jobpost/${jobPostId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
}

// Post to Facebook group
async function postToFacebook(groupUrl, postContent) {
  return new Promise(async (resolve) => {
    try {
      // Create hidden tab
      const tab = await chrome.tabs.create({
        url: groupUrl,
        active: false
      });
      
      // Wait for tab to load
      await waitForTabLoad(tab.id);
      
      // Inject posting script
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: facebookPosterScript,
        args: [postContent]
      });
      
      // Close tab
      await chrome.tabs.remove(tab.id);
      
      resolve(result.result);
      
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

// This function runs INSIDE the Facebook page
function facebookPosterScript(postContent) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Timeout after 30 seconds' });
    }, 30000);
    
    try {
      // Check if logged in
      if (!document.querySelector('[data-pagelet="LeftRail"]')) {
        clearTimeout(timeout);
        return resolve({ success: false, error: 'Not logged into Facebook' });
      }
      
      // Find create post button
      const createBtn = document.querySelector('[aria-label*="Write something"]') 
        || document.querySelector('[role="button"][aria-label="Create a post"]');
      
      if (!createBtn) {
        clearTimeout(timeout);
        return resolve({ success: false, error: 'Create post button not found' });
      }
      
      createBtn.click();
      
      setTimeout(() => {
        // Find composer
        const composer = document.querySelector('[contenteditable="true"][role="textbox"]');
        
        if (!composer) {
          clearTimeout(timeout);
          return resolve({ success: false, error: 'Composer not found' });
        }
        
        // Insert content
        composer.focus();
        composer.textContent = postContent;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        
        setTimeout(() => {
          // Find Post button
          const postBtn = document.querySelector('[aria-label="Post"]');
          
          if (!postBtn) {
            clearTimeout(timeout);
            return resolve({ success: false, error: 'Post button not found' });
          }
          
          postBtn.click();
          
          setTimeout(() => {
            // Extract post URL
            const postLink = document.querySelector('[href*="/posts/"]') 
              || document.querySelector('[href*="permalink"]');
            
            const postUrl = postLink?.href || window.location.href;
            
            clearTimeout(timeout);
            resolve({ success: true, postUrl });
          }, 4000);
        }, 2000);
      }, 1500);
      
    } catch (error) {
      clearTimeout(timeout);
      resolve({ success: false, error: error.message });
    }
  });
}
