// extension/background/service-worker.js
// Fixed: No overlapping tabs, proper line breaks, wait for complete typing

importScripts(
  '../utils/config.js',
  '../utils/helpers.js',
  '../utils/messenger-link.js'
);

const API_URL = 'https://fbauto-main-production-5d2d.up.railway.app/api';
const FRONTEND_URL = 'https://fbauto-main-production-5d2d.up.railway.app';

// CRITICAL: Global flag to prevent overlapping posting cycles
let isPostingInProgress = false;

chrome.runtime.onInstalled.addListener(() => {
  logMessage('Extension installed', 'success');
  checkTokenAndSchedule();
});

chrome.runtime.onStartup.addListener(() => {
  logMessage('Browser started', 'info');
  checkTokenAndSchedule();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoPost') {
    logMessage('Alarm triggered - starting posting cycle', 'info');
    runPostingCycle();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOKEN_ACTIVATED') {
    checkTokenAndSchedule();
  } else if (message.type === 'RUN_NOW') {
    runPostingCycle();
  }
});

async function checkTokenAndSchedule() {
  const { token } = await chrome.storage.sync.get('token');
  
  if (token) {
    chrome.alarms.create('autoPost', {
      periodInMinutes: 360,
      delayInMinutes: 1
    });
    
    logMessage('Alarm scheduled - will run every 6 hours', 'success');
  }
}

// FIXED: Prevent overlapping posting cycles
async function runPostingCycle() {
  // Check if already posting
  if (isPostingInProgress) {
    logMessage('⚠️ Posting cycle already in progress, skipping...', 'warning');
    return;
  }
  
  // Set flag to prevent overlaps
  isPostingInProgress = true;
  logMessage('🚀 Starting posting cycle', 'info');
  
  try {
    const { token } = await chrome.storage.sync.get('token');
    
    if (!token) {
      logMessage('No token found', 'error');
      return;
    }
    
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
    
    // Post each job SEQUENTIALLY (not in parallel)
    for (const job of jobs) {
      const posted = await postJobToGroups(job, token);
      totalPosts += posted;
    }
    
    const { stats = {} } = await chrome.storage.sync.get('stats');
    await updateStats({
      lastCheck: new Date().toISOString(),
      totalPosts: (stats.totalPosts || 0) + totalPosts,
      nextRun: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    });
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../assets/icon-128.png',
      title: 'Job Posting Complete',
      message: `Successfully posted ${totalPosts} jobs`
    });
    
    logMessage(`✅ Posting cycle complete - ${totalPosts} posts`, 'success');
    
  } catch (error) {
    logMessage(`Error in posting cycle: ${error.message}`, 'error');
  } finally {
    // Always release the lock
    isPostingInProgress = false;
    logMessage('🔓 Posting cycle lock released', 'info');
  }
}

async function fetchJobs(token) {
  const response = await fetch(`${API_URL}/extension/jobs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch jobs');
  }
  
  return response.json();
}

// FIXED: Post groups SEQUENTIALLY, not in parallel
async function postJobToGroups(job, token) {
  logMessage(`📝 Posting: ${job.title}`, 'info');
  
  let successCount = 0;
  const groups = job.facebookGroups || [];
  
  // Post to each group ONE AT A TIME
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    
    try {
      logMessage(`Posting to group ${i + 1}/${groups.length}: ${group.name}`, 'info');
      
      // 1. Create JobPost record
      const { jobPost } = await createJobPost(job.id, group.url, token);
      
      // 2. Format post content with messenger link
      const postContent = await formatJobPost(job, jobPost.id);
      
      // 3. Post to Facebook (BLOCKS until complete)
      const result = await postToFacebook(group.url, postContent);
      
      // 4. Update JobPost record
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
      
      // Human-like delay BETWEEN groups (not if it's the last one)
      if (i < groups.length - 1) {
        const delayMs = randomBetween(30000, 60000);
        logMessage(`⏱️ Waiting ${delayMs/1000}s before next group...`, 'info');
        await sleep(delayMs);
      }
      
    } catch (error) {
      logMessage(`❌ Exception posting to ${group.name}: ${error.message}`, 'error');
    }
  }
  
  return successCount;
}

// Format job post content with PROPER LINE BREAKS
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

// Update JobPost in DB (with detailed logging)
async function updateJobPost(jobPostId, updates, token) {
  try {
    console.log('🔄 Updating JobPost:', jobPostId);
    console.log('📝 Updates:', JSON.stringify(updates, null, 2));
    
    const response = await fetch(`${API_URL}/extension/jobpost/${jobPostId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    
    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Update failed:', response.status, errorText);
      throw new Error(`Update failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Update successful:', result);
    
    return result;
  } catch (error) {
    console.error('❌ updateJobPost exception:', error.message);
    throw error;
  }
}

// FIXED: Wait for complete typing before allowing Post button click
async function postToFacebook(groupUrl, postContent) {
  return new Promise(async (resolve) => {
    let tabId = null;
    
    try {
      logMessage(`Opening tab for: ${groupUrl}`, 'info');
      
      const tab = await chrome.tabs.create({
        url: groupUrl,
        active: false
      });
      
      tabId = tab.id;
      
      await waitForTabLoad(tabId);
      await sleep(5000); // Wait for Facebook to initialize
      
      logMessage('Injecting posting script...', 'info');
      
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: facebookPosterScript,
        args: [postContent]
      });
      
      const scriptResult = result.result;
      
      logMessage(`Script result: ${scriptResult.success ? 'SUCCESS' : 'FAILED'}`, 
                 scriptResult.success ? 'success' : 'error');
      
      if (scriptResult.success) {
        await sleep(10000); // 10 seconds to see the post
      } else {
        await sleep(5000); // 5 seconds to debug
      }
      
      if (tabId) {
        await chrome.tabs.remove(tabId);
        logMessage('Tab closed', 'info');
      }
      
      resolve(scriptResult);
      
    } catch (error) {
      logMessage(`postToFacebook error: ${error.message}`, 'error');
      await sleep(3000);
      
      if (tabId) {
        try {
          await chrome.tabs.remove(tabId);
        } catch (e) {
          // Tab already closed
        }
      }
      resolve({ success: false, error: error.message });
    }
  });
}

// FIXED: Proper line break handling and wait for typing to complete
function facebookPosterScript(postContent) {
  return new Promise((resolve) => {
    console.log('🚀 Facebook poster script started');
    console.log('📝 Content length:', postContent.length, 'chars');
    
    const timeout = setTimeout(() => {
      console.log('❌ Timeout after 90 seconds');
      resolve({ success: false, error: 'Timeout after 90 seconds' });
    }, 90000); // Increased timeout for longer content
    
    try {
      // Check login
      const loggedInIndicators = [
        document.querySelector('[data-pagelet="LeftRail"]'),
        document.querySelector('[role="navigation"]'),
        document.querySelector('[aria-label*="Your profile"]'),
        document.querySelector('[aria-label*="profile"]')
      ];
      
      const isLoggedIn = loggedInIndicators.some(el => el !== null);
      
      if (!isLoggedIn) {
        clearTimeout(timeout);
        return resolve({ success: false, error: 'Not logged into Facebook' });
      }
      
      console.log('✅ Logged in, waiting for page to settle...');
      
      setTimeout(() => {
        console.log('🔍 Looking for create post button...');
        
        const createBtn = 
          document.querySelector('[aria-label*="Write something"]') ||
          Array.from(document.querySelectorAll('[role="button"]')).find(btn => 
            btn.textContent.includes('Write something') || 
            btn.textContent.includes('Start a post')
          );
        
        if (!createBtn) {
          clearTimeout(timeout);
          return resolve({ success: false, error: 'Create post button not found' });
        }
        
        console.log('✅ Found button, clicking...');
        createBtn.click();
        
        setTimeout(() => {
          console.log('🔍 Looking for text composer...');
          
          let composer = document.querySelector(
            'div.xzsf02u.x1a2a7pz.x1n2onr6.x14wi4xw.x9f619.x1lliihq.x5yr21d.xh8yej3.notranslate[contenteditable="true"][role="textbox"]'
          );
          
          if (!composer) {
            const fallbacks = [
              '[data-lexical-editor="true"][contenteditable="true"]',
              'div[contenteditable="true"][role="textbox"]',
              '[aria-label*="Create a"][contenteditable="true"]'
            ];
            
            for (const selector of fallbacks) {
              composer = document.querySelector(selector);
              if (composer) break;
            }
          }
          
          if (!composer) {
            clearTimeout(timeout);
            return resolve({ success: false, error: 'Text input not found' });
          }
          
          console.log('✅ Found composer, starting to type...');
          
          // CRITICAL: Async function that COMPLETES typing before continuing
          (async () => {
            try {
              composer.focus();
              await new Promise(r => setTimeout(r, 500));
              
              // Type each character with line break handling
              let typedChars = 0;
              
              for (let i = 0; i < postContent.length; i++) {
                const char = postContent[i];
                
                // Handle line breaks properly
                if (char === '\n') {
                  // Insert a line break in Lexical editor
                  const event = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    bubbles: true,
                    cancelable: true
                  });
                  composer.dispatchEvent(event);
                  
                  // Also use insertText for compatibility
                  document.execCommand('insertText', false, '\n');
                  
                  await new Promise(r => setTimeout(r, 50));
                } else {
                  // Insert regular character
                  document.execCommand('insertText', false, char);
                  typedChars++;
                }
                
                // Dispatch input event
                composer.dispatchEvent(new Event('input', { bubbles: true }));
                
                // Random delay for human-like typing (faster for long content)
                await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
                
                // Progress logging every 100 chars
                if (typedChars > 0 && typedChars % 100 === 0) {
                  console.log(`⌨️ Typed ${typedChars}/${postContent.length} chars...`);
                }
              }
              
              console.log(`✅ Typing complete! (${postContent.length} chars)`);
              
              // Dispatch final events
              composer.dispatchEvent(new Event('change', { bubbles: true }));
              composer.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
              
              // Wait for content to be processed
              await new Promise(r => setTimeout(r, 2000));
              
              // Verify content was typed
              const finalContent = composer.textContent || composer.innerText || '';
              console.log('📏 Final content length:', finalContent.length);
              
              if (finalContent.length < postContent.length * 0.8) {
                console.log('⚠️ Content seems incomplete, trying fallback method...');
                
                // Fallback: Set innerHTML with proper line breaks
                const htmlContent = postContent
                  .split('\n')
                  .map(line => `<p>${line || '<br>'}</p>`)
                  .join('');
                
                composer.innerHTML = htmlContent;
                composer.dispatchEvent(new Event('input', { bubbles: true }));
                
                await new Promise(r => setTimeout(r, 1500));
              }
              
              // NOW look for Post button (only after typing is complete)
              console.log('🔍 Looking for Post button...');
              
              // Wait a bit more for button to enable
              await new Promise(r => setTimeout(r, 2000));
              
              const postBtn = 
                document.querySelector('div[aria-label="Post"][role="button"]:not([aria-disabled="true"])') ||
                Array.from(document.querySelectorAll('[role="button"]')).find(btn => 
                  btn.textContent.trim() === 'Post' && 
                  btn.getAttribute('aria-disabled') !== 'true'
                );
              
              if (!postBtn) {
                clearTimeout(timeout);
                return resolve({ success: false, error: 'Post button not found' });
              }
              
              const isDisabled = postBtn.getAttribute('aria-disabled') === 'true';
              
              if (isDisabled) {
                console.log('⚠️ Post button still disabled, waiting more...');
                await new Promise(r => setTimeout(r, 3000));
                
                const stillDisabled = postBtn.getAttribute('aria-disabled') === 'true';
                if (stillDisabled) {
                  clearTimeout(timeout);
                  return resolve({ 
                    success: false, 
                    error: 'Post button remained disabled' 
                  });
                }
              }
              
              console.log('✅ Post button enabled, clicking...');
              postBtn.click();
              
              // Wait for post to complete
              setTimeout(() => {
                const postLink = 
                  document.querySelector('[href*="/posts/"]') ||
                  document.querySelector('[href*="permalink"]');
                
                const postUrl = postLink?.href || window.location.href;
                
                console.log('✅ Post successful!');
                clearTimeout(timeout);
                resolve({ success: true, postUrl });
              }, 6000);
              
            } catch (error) {
              console.error('❌ Error in typing:', error);
              clearTimeout(timeout);
              resolve({ success: false, error: error.message });
            }
          })();
          
        }, 3000); // Wait for modal
      }, 2000); // Wait for page
      
    } catch (error) {
      console.error('❌ Script error:', error);
      clearTimeout(timeout);
      resolve({ success: false, error: error.message });
    }
  });
}