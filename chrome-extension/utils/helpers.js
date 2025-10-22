// Helper functions

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function updateStats(updates) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['stats'], (data) => {
      const stats = data.stats || {};
      const newStats = { ...stats, ...updates };
      chrome.storage.sync.set({ stats: newStats }, resolve);
    });
  });
}

async function getStats() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['stats'], (data) => {
      resolve(data.stats || {});
    });
  });
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

function logMessage(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    'info': 'ℹ️',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️'
  }[type] || 'ℹ️';
  
  console.log(`[${timestamp}] ${prefix} ${message}`);
}
