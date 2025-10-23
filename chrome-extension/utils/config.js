// Configuration - UPDATE THESE WITH YOUR ACTUAL URLS
const CONFIG = {
  API_URL: 'http://localhost:5000/api',  // ← Your backend
  FRONTEND_URL: 'http://localhost:3000',  // ← Your Next.js frontend
  
  // Posting intervals
  CHECK_INTERVAL_MINUTES: 360,  // 6 hours
  POST_DELAY_MIN: 30000,        // 30 seconds between posts
  POST_DELAY_MAX: 60000,        // 60 seconds
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000,
  
  // Timeouts
  PAGE_LOAD_TIMEOUT: 30000,
  POST_TIMEOUT: 30000
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
