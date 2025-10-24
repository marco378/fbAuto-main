// extension/utils/messenger-link.js
// Browser-compatible version (no Node.js Buffer)

const DOMAIN_URL = "https://fbauto-main-production-5d2d.up.railway.app";

/**
 * Generate a contextual messenger link for a job posting
 * Browser-compatible - uses btoa() instead of Buffer
 */
async function generateMessengerLink(jobData, jobPostId) {
  try {
    console.log('Generating messenger link for:', jobData.title);
    
    // Create context data object (matching Playwright exactly)
    const contextData = {
      jobPostId,
      jobTitle: jobData.title,
      company: jobData.company,
      location: jobData.location,
      requirements: jobData.requirements || [],
      description: jobData.description,
      jobType: jobData.jobType,
      experience: jobData.experiance || jobData.experience, // Handle both spellings
      salaryRange: jobData.salaryRange,
      responsibilities: jobData.responsibilities || [],
      perks: jobData.perks,
      timestamp: Date.now(),
    };

    // Convert to JSON string
    const jsonString = JSON.stringify(contextData);
    
    // Browser-compatible base64 encoding
    const base64 = btoa(unescape(encodeURIComponent(jsonString)));
    
    // Make it URL-safe (base64url encoding)
    const base64url = base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // URL encode it
    const encodedContext = encodeURIComponent(base64url);
    
    // Generate final messenger link
    const contextualMessengerLink = `${DOMAIN_URL}/messenger-redirect?context=${encodedContext}`;

    console.log('✅ Messenger link generated successfully');
    console.log('Link preview:', contextualMessengerLink.substring(0, 100) + '...');

    return contextualMessengerLink;
  } catch (error) {
    console.error("❌ Error generating messenger link:", error);
    return null;
  }
}

/**
 * Decode a messenger link context (for debugging)
 */
function decodeMessengerContext(encodedContext) {
  try {
    // Decode URL encoding
    const base64url = decodeURIComponent(encodedContext);
    
    // Convert base64url back to regular base64
    let base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    
    // Browser-compatible base64 decoding
    const jsonString = decodeURIComponent(escape(atob(base64)));
    
    // Parse JSON
    const contextData = JSON.parse(jsonString);
    
    console.log('✅ Decoded context:', contextData);
    return contextData;
  } catch (error) {
    console.error("❌ Error decoding messenger context:", error);
    return null;
  }
}

/**
 * Validate messenger link format
 */
function isValidMessengerLink(link) {
  try {
    const url = new URL(link);
  return url.hostname.includes('fbauto-main-production-5d2d.up.railway.app') &&
           url.pathname === '/messenger-redirect' &&
           url.searchParams.has('context');
  } catch (e) {
    return false;
  }
}

/**
 * Get shortened version for display
 */
function getShortenedMessengerLink(fullLink) {
  try {
    const url = new URL(fullLink);
    const context = url.searchParams.get('context');
    
    if (context && context.length > 20) {
      return `${url.origin}${url.pathname}?context=${context.substring(0, 20)}...`;
    }
    
    return fullLink;
  } catch (e) {
    return fullLink;
  }
}

// Make functions available globally for service worker
if (typeof self !== 'undefined' && self.importScripts) {
  // Running in service worker context
  self.generateMessengerLink = generateMessengerLink;
  self.decodeMessengerContext = decodeMessengerContext;
  self.isValidMessengerLink = isValidMessengerLink;
  self.getShortenedMessengerLink = getShortenedMessengerLink;
}