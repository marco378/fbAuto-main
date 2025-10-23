// Import utilities
importScripts(
  '../utils/config.js',
  '../utils/helpers.js',
  '../utils/messenger-link.js'
);

const API_URL = 'http://localhost:5000/api';
const FRONTEND_URL = 'http://localhost:3000';

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
  const response = await fetch(`${API_URL}/extension/jobs`, {
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
      
  // 3. Format post content (EXACTLY as in job-post-runner.js, async)
  const postContent = await formatJobPost(job, jobPost.id);

// Format job post content exactly as in job-post-runner.js (async, with awaited messenger link)
async function formatJobPost(job, jobPostId) {
  const {
    title,
    company,
    location,
    jobType,
    salaryRange,
    description,
    requirements = [],
    responsibilities = [],
    perks,
  } = job;

  let postContent = `${title} at ${company}\n\n`;
  postContent += `Location: ${location}\n`;
  postContent += `Type: ${jobType}\n`;

  if (salaryRange) postContent += `Salary: ${salaryRange}\n`;

  postContent += `\nAbout the Role:\n${description}\n\n`;

  if (requirements.length > 0) {
    postContent += `Requirements:\n`;
    requirements.forEach((req) => (postContent += `• ${req}\n`));
    postContent += `\n`;
  }

  if (responsibilities.length > 0) {
    postContent += `Responsibilities:\n`;
    responsibilities.forEach((resp) => (postContent += `• ${resp}\n`));
    postContent += `\n`;
  }

  if (perks) postContent += `Perks: ${perks}\n\n`;

  // Generate and include messenger link directly in the post
  if (jobPostId) {
    const messengerLink = await generateMessengerLink(job, jobPostId);
    if (messengerLink) {
      postContent += `🎯 Interested? Apply directly here: ${messengerLink}\n\n`;
    } else {
      postContent += `Interested? send me a "hello" by clicking the link !\n\n`;
    }
  } else {
    postContent += `Interested? send me a "hello" by clicking the link !\n\n`;
  }

  postContent += `#hiring #jobs #${jobType.toLowerCase()} #${location.toLowerCase().replace(/\s+/g, "")}`;

  return postContent;
}
      
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
  const response = await fetch(`${API_URL}/extension/jobpost`, {
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
  await fetch(`${API_URL}/extension/jobpost/${jobPostId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
}

// Post to Facebook group - FIXED VERSION
async function postToFacebook(groupUrl, postContent) {
  return new Promise(async (resolve) => {
    let tabId = null;
    
    try {
      // Create VISIBLE tab for debugging
      const tab = await chrome.tabs.create({
        url: groupUrl,
        active: true  // Make it visible so you can see what's happening
      });
      
      tabId = tab.id;
      
      // Wait for tab to load
      await waitForTabLoad(tabId);
      
      // Add extra delay for Facebook to fully initialize
      await new Promise(r => setTimeout(r, 5000)); // Increased to 5 seconds
      
      // Inject posting script
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: facebookPosterScript,
        args: [postContent]
      });
      
      // CRITICAL FIX: Wait for the script result before closing
      const scriptResult = result.result;
      
      console.log('Script result:', scriptResult);
      
      // Give extra time if posting was successful
      if (scriptResult.success) {
        // Increase tab close delay for manual observation
        await new Promise(r => setTimeout(r, 75000)); // 75 seconds
      } else {
        // Keep tab open on failure for debugging
        await new Promise(r => setTimeout(r, 5000));
      }
      
      // Now close the tab
      if (tabId) {
        await chrome.tabs.remove(tabId);
      }
      
      resolve(scriptResult);
      
    } catch (error) {
      console.error('postToFacebook error:', error);
      // Keep tab open on error for debugging
      await new Promise(r => setTimeout(r, 5000));
      
      if (tabId) {
        try {
          await chrome.tabs.remove(tabId);
        } catch (e) {
          // Tab might already be closed
        }
      }
      resolve({ success: false, error: error.message });
    }
  });
}

// This function runs INSIDE the Facebook page
function facebookPosterScript(postContent) {
  return new Promise((resolve) => {
    console.log('🚀 Script started, looking for elements...');
    
    const timeout = setTimeout(() => {
      console.log('❌ Timeout after 45 seconds');
      resolve({ success: false, error: 'Timeout after 45 seconds' });
    }, 45000); // Increased timeout
    
    try {
      // Check if logged in - look for multiple indicators
      console.log('Checking login status...');
      const loggedInIndicators = [
        document.querySelector('[data-pagelet="LeftRail"]'),
        document.querySelector('[role="navigation"]'),
        document.querySelector('[aria-label="Your profile"]'),
        document.querySelector('div[data-visualcompletion="ignore-dynamic"]')
      ];
      
      const isLoggedIn = loggedInIndicators.some(el => el !== null);
      console.log('Login check result:', isLoggedIn);
      
      if (!isLoggedIn) {
        clearTimeout(timeout);
        return resolve({ success: false, error: 'Not logged into Facebook' });
      }
      
      // Wait a bit more for page to settle
      setTimeout(() => {
        console.log('Looking for create post button...');
        
        // Find create post button - try multiple selectors
        const createBtn = 
          document.querySelector('[aria-label*="Write something"]') ||
          document.querySelector('[role="button"][aria-label*="Create"]') ||
          document.querySelector('[placeholder*="Write something"]')?.closest('[role="button"]') ||
          document.querySelector('span:contains("Write something")')?.closest('[role="button"]') ||
          Array.from(document.querySelectorAll('[role="button"]')).find(btn => 
            btn.textContent.includes('Write something') || 
            btn.textContent.includes('Start a post')
          );
        
        console.log('Create button found:', !!createBtn);
        
        if (!createBtn) {
          clearTimeout(timeout);
          return resolve({ success: false, error: 'Create post button not found' });
        }
        
        console.log('Clicking create button...');
        createBtn.click();
        
        // Wait longer for modal and text input to appear
        setTimeout(() => {
          console.log('Looking for text input in the modal...');
          const specificTextInputSelector =
            'div.xzsf02u.x1a2a7pz.x1n2onr6.x14wi4xw.x9f619.x1lliihq.x5yr21d.xh8yej3.notranslate[contenteditable="true"][role="textbox"]';

          let composer = null;
          try {
            composer = document.querySelector(specificTextInputSelector);
            if (composer) {
              console.log('✅ Found text input with specific selector');
            } else {
              throw new Error('Specific selector not found');
            }
          } catch (error) {
            console.log('❌ Specific selector failed, trying alternatives');
            const fallbackSelectors = [
              '[aria-placeholder="Create a public post…"][contenteditable="true"]',
              '[data-lexical-editor="true"][contenteditable="true"]',
              'div[contenteditable="true"][role="textbox"]',
            ];
            for (const selector of fallbackSelectors) {
              try {
                composer = document.querySelector(selector);
                if (composer) {
                  console.log(`✅ Found text input with fallback selector: ${selector}`);
                  break;
                }
              } catch (error) {
                continue;
              }
            }
          }

          if (!composer) {
            clearTimeout(timeout);
            return resolve({ success: false, error: 'Could not find text input in modal' });
          }

          // ...existing code for content insertion and post button...
          
          // Insert content - robust simulated typing for Lexical Editor
          composer.focus();
          (async () => {
            for (const char of postContent) {
              document.execCommand('insertText', false, char);
              composer.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise(res => setTimeout(res, 40 + Math.floor(Math.random() * 60)));
            }
            // Check if content was inserted
            const typedContent = composer.textContent;
            console.log('DEBUG: Content after typing:', typedContent);
            console.log('📏 Content typed length:', typedContent?.length || 0);
            if (!typedContent || typedContent.trim().length === 0) {
              console.log('DEBUG: Content not typed, trying alternative method...');
              composer.innerHTML = `<p>${postContent.replace(/\n/g, "</p><p>")}</p>`;
              composer.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise(res => setTimeout(res, 1000));
              console.log('DEBUG: Content after fallback innerHTML:', composer.textContent);
            }
            composer.dispatchEvent(new Event('change', { bubbles: true }));
            composer.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            composer.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
            console.log('DEBUG: Content insertion complete, waiting for Post button...');

            // Wait for Post button to become enabled (simulate human pause 2-3s, but only after all content is inserted)
            const pause = 2000 + Math.floor(Math.random() * 1000);
            setTimeout(() => {
              const postBtn =
                document.querySelector('div[aria-label="Post"][role="button"]:not([aria-disabled="true"])') ||
                Array.from(document.querySelectorAll('[role="button"]')).find(btn => btn.innerText === 'Post');
              console.log('DEBUG: Post button found:', !!postBtn, postBtn);
              if (!postBtn) {
                clearTimeout(timeout);
                return resolve({ success: false, error: 'Post button not found' });
              }
              const isDisabled = postBtn.getAttribute('aria-disabled') === 'true' || postBtn.hasAttribute('disabled');
              console.log('DEBUG: Post button disabled:', isDisabled);
              if (isDisabled) {
                clearTimeout(timeout);
                return resolve({ success: false, error: 'Post button is disabled - content may not have been inserted properly' });
              }
              console.log('DEBUG: Clicking Post button...');
              postBtn.click();
              // Wait for post to complete
              setTimeout(() => {
                console.log('DEBUG: Looking for post URL...');
                const postLink =
                  document.querySelector('[href*="/posts/"]') ||
                  document.querySelector('[href*="permalink"]') ||
                  document.querySelector('a[href*="' + window.location.pathname + '"]');
                const postUrl = postLink?.href || window.location.href;
                console.log('✅ Post successful!', postUrl);
                clearTimeout(timeout);
                resolve({ success: true, postUrl });
              }, 6000);
            }, pause);
          })();
          
          // Wait longer for Post button to become enabled
          setTimeout(() => {
            console.log('Looking for Post button...');
            
            // Find Post button - try ALL possible selectors
            const postBtn = 
              document.querySelector('[aria-label="Post"]') ||
              document.querySelector('[aria-label*="Post"]') ||
              Array.from(document.querySelectorAll('div[role="button"]'))
                .find(btn => btn.textContent.trim() === 'Post') ||
              Array.from(document.querySelectorAll('[role="button"]'))
                .find(btn => btn.innerText === 'Post');
            
            console.log('Post button found:', !!postBtn);
            
            if (!postBtn) {
              clearTimeout(timeout);
              return resolve({ success: false, error: 'Post button not found' });
            }
            
            // Check if button is disabled
            const isDisabled = postBtn.getAttribute('aria-disabled') === 'true' || 
                             postBtn.hasAttribute('disabled');
            console.log('Post button disabled:', isDisabled);
            
            if (isDisabled) {
              clearTimeout(timeout);
              return resolve({ success: false, error: 'Post button is disabled - content may not have been inserted properly' });
            }
            
            console.log('Clicking Post button...');
            postBtn.click();
            
            // Wait for post to complete
            setTimeout(() => {
              console.log('Looking for post URL...');
              
              // Extract post URL - try multiple methods
              const postLink = 
                document.querySelector('[href*="/posts/"]') ||
                document.querySelector('[href*="permalink"]') ||
                document.querySelector('a[href*="' + window.location.pathname + '"]');
              
              const postUrl = postLink?.href || window.location.href;
              
              console.log('✅ Post successful!', postUrl);
              clearTimeout(timeout);
              resolve({ success: true, postUrl });
            }, 6000); // Increased wait time
          }, 3000); // Increased wait time
        }, 3000); // Increased wait time
      }, 2000); // Increased initial delay
      
    } catch (error) {
      console.error('❌ Script error:', error);
      clearTimeout(timeout);
      resolve({ success: false, error: error.message });
    }
  });
}