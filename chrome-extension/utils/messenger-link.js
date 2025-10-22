// Generate messenger link (copied from your backend logic)

function generateMessengerLink(job, jobPostId) {
  const FRONTEND_URL = 'http://localhost:5173'; // UPDATE THIS
  
  const context = {
    jobPostId,
    jobTitle: job.title,
    company: job.company,
    location: job.location
  };
  
  // Browser-compatible base64url encoding
  const jsonStr = JSON.stringify(context);
  const base64 = btoa(jsonStr)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  const encoded = encodeURIComponent(base64);
  
  return `${FRONTEND_URL}/messenger-redirect?context=${encoded}`;
}

function formatJobPost(job, messengerLink) {
  // Format job post content (matching your backend formatJobPost)
  let post = `🚀 ${job.title}\n\n`;
  post += `🏢 Company: ${job.company}\n`;
  post += `📍 Location: ${job.location}\n`;
  post += `💼 Type: ${job.jobType.replace(/_/g, ' ')}\n`;
  
  if (job.salaryRange) {
    post += `💰 Salary: ${job.salaryRange}\n`;
  }
  
  post += `\n${job.description}\n\n`;
  
  if (job.requirements && job.requirements.length > 0) {
    post += `📋 Requirements:\n`;
    job.requirements.forEach(req => {
      post += `• ${req}\n`;
    });
    post += `\n`;
  }
  
  if (job.responsibities && job.responsibities.length > 0) {
    post += `✅ Responsibilities:\n`;
    job.responsibities.forEach(resp => {
      post += `• ${resp}\n`;
    });
    post += `\n`;
  }
  
  if (job.perks) {
    post += `🎁 Perks: ${job.perks}\n\n`;
  }
  
  post += `💬 Interested? Apply here:\n${messengerLink}\n\n`;
  post += `#hiring #jobs #${job.location.replace(/\s/g, '')} #${job.jobType.toLowerCase()}`;
  
  return post;
}
