// extension/utils/config.js
// Configuration for the extension

const CONFIG = {
  // API endpoints
  API_URL: 'https://fbauto-main-production-5d2d.up.railway.app/api',
  FRONTEND_URL: 'https://fbauto-main-production-5d2d.up.railway.app',
  DOMAIN_URL: 'https://fbauto-main-production-5d2d.up.railway.app',
  
  // Timing configurations
  POSTING_INTERVAL_MINUTES: 360, // 6 hours
  INITIAL_DELAY_MINUTES: 1,
  
  // Delays between posts (milliseconds)
  MIN_POST_DELAY: 30000,  // 30 seconds
  MAX_POST_DELAY: 60000,  // 60 seconds
  
  // Page load delays
  PAGE_LOAD_WAIT: 5000,    // 5 seconds
  MODAL_WAIT: 3000,        // 3 seconds
  POST_SUBMIT_WAIT: 6000,  // 6 seconds
  
  // Tab management
  TAB_CLOSE_DELAY_SUCCESS: 10000,  // 10 seconds
  TAB_CLOSE_DELAY_FAIL: 5000,      // 5 seconds
  
  // Timeout
  SCRIPT_TIMEOUT: 90000,   // 90 seconds (increased for longer content)
  
  // Typing speed
  MIN_CHAR_DELAY: 20,      // 20ms per character
  MAX_CHAR_DELAY: 50,      // 50ms per character
  
  // Wait times for content processing
  CONTENT_PROCESS_WAIT: 2000,    // 2 seconds after typing
  POST_BUTTON_ENABLE_WAIT: 2000, // 2 seconds for button to enable
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000,       // 5 seconds
};

// Make config available globally
if (typeof self !== 'undefined' && self.importScripts) {
  self.CONFIG = CONFIG;
}