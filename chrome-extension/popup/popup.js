// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  const { token } = await chrome.storage.sync.get('token');
  
  if (token) {
    await showActiveView();
  } else {
    showSetupView();
  }
});

// Show setup view
function showSetupView() {
  document.getElementById('setupView').style.display = 'block';
  document.getElementById('activeView').style.display = 'none';
  document.getElementById('loadingView').style.display = 'none';
}

// Show active view
async function showActiveView() {
  document.getElementById('setupView').style.display = 'none';
  document.getElementById('activeView').style.display = 'block';
  document.getElementById('loadingView').style.display = 'none';
  
  // Update stats
  await updateStatusDisplay();
}

// Show loading view
function showLoadingView() {
  document.getElementById('setupView').style.display = 'none';
  document.getElementById('activeView').style.display = 'none';
  document.getElementById('loadingView').style.display = 'block';
}

// Update status display
async function updateStatusDisplay() {
  const { stats } = await chrome.storage.sync.get('stats');
  
  if (stats) {
    document.getElementById('lastCheck').textContent = 
      stats.lastCheck ? new Date(stats.lastCheck).toLocaleString() : 'Never';
    
    document.getElementById('nextRun').textContent = 
      stats.nextRun ? new Date(stats.nextRun).toLocaleString() : 'Soon';
    
    document.getElementById('totalPosts').textContent = stats.totalPosts || 0;
  }
}

// Activate button
document.getElementById('activateBtn')?.addEventListener('click', async () => {
  const token = document.getElementById('tokenInput').value.trim();
  const errorDiv = document.getElementById('setupError');
  const activateBtn = document.getElementById('activateBtn');
  
  if (!token) {
    errorDiv.textContent = 'Please enter a token';
    errorDiv.style.display = 'block';
    return;
  }
  
  activateBtn.disabled = true;
  activateBtn.textContent = 'Verifying...';
  errorDiv.style.display = 'none';
  
  try {
    // Verify token with backend
    // Use CONFIG.API_URL from ../utils/config.js when available, fall back to dev default
  const API_URL = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : 'http://localhost:5000/api';
    const response = await fetch(`${API_URL}/api/extension/jobs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error('Invalid token');
    }
    
    // Save token
    await chrome.storage.sync.set({ token });
    
    // Notify background worker
    chrome.runtime.sendMessage({ type: 'TOKEN_ACTIVATED' });
    
    // Show success and switch view
    await showActiveView();
    
  } catch (error) {
    errorDiv.textContent = 'Invalid token. Please check and try again.';
    errorDiv.style.display = 'block';
    activateBtn.disabled = false;
    activateBtn.textContent = 'Activate Extension';
  }
});

// Run now button
document.getElementById('runNowBtn')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RUN_NOW' });
  showLoadingView();
  
  // Close popup after 2 seconds
  setTimeout(() => window.close(), 2000);
});

// View logs button
document.getElementById('viewLogsBtn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/' });
});

// Deactivate button
document.getElementById('deactivateBtn')?.addEventListener('click', () => {
  if (confirm('Are you sure you want to deactivate the extension?')) {
    chrome.storage.sync.clear();
    chrome.alarms.clearAll();
    showSetupView();
  }
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATS_UPDATED') {
    updateStatusDisplay();
  }
});
