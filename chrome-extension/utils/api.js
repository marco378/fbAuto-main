// API client for backend communication

async function getStoredToken() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['token'], (data) => {
      resolve(data.token);
    });
  });
}

async function apiCall(endpoint, options = {}) {
  const token = await getStoredToken();
  
  if (!token) {
    throw new Error('No authentication token found');
  }
  
  const API_URL = 'https://fbauto-main-production-5d2d.up.railway.app/api';
  
  const response = await fetch(`${API_URL}${endpoint.replace(/^\/api/, '')}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API Error: ${response.statusText}`);
  }
  
  return response.json();
}

const API = {
  // Fetch jobs to post
  fetchJobs: async () => {
    return apiCall('/extension/jobs');
  },
  
  // Create JobPost record
  createJobPost: async (jobId, groupUrl) => {
    return apiCall('/extension/jobpost', {
      method: 'POST',
      body: JSON.stringify({ 
        jobId, 
        facebookGroupUrl: groupUrl 
      })
    });
  },
  
  // Update JobPost record
  updateJobPost: async (jobPostId, updates) => {
    return apiCall(`/extension/jobpost/${jobPostId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },
  
  // Verify token
  verifyToken: async (token) => {
  const API_URL = 'https://fbauto-main-production-5d2d.up.railway.app/api';
  const response = await fetch(`${API_URL}/extension/jobs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.ok;
  }
};
