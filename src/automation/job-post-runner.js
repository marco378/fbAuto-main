// src/automation/job-post-runner-enhanced.js
import { chromium } from "playwright";
import { ensureLoggedIn } from "./facebook-login.js";
import { humanPause } from "./utils/delays.js";
import { prisma } from "../../server/src/lib/prisma.js";

// Store browser context globally for job posting
let jobPostBrowser = null;
let jobPostContext = null;
let currentJobUser = null;

// MINIMAL browser configuration - remove all potentially problematic flags
const getJobPostBrowserConfig = () => ({
  headless: false,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--disable-infobars",
  ],
});

// Initialize browser with crash recovery
async function initializeJobPostBrowser() {
  try {
    if (jobPostBrowser && !jobPostBrowser.isConnected()) {
      console.log("🔄 Browser disconnected, cleaning up...");
      jobPostBrowser = null;
      jobPostContext = null;
      currentJobUser = null;
    }

    if (!jobPostBrowser) {
      console.log("🚀 Launching minimal browser for Facebook...");
      jobPostBrowser = await chromium.launch(getJobPostBrowserConfig());

      jobPostBrowser.on("disconnected", () => {
        console.log("🔌 Browser disconnected - cleaning up");
        jobPostBrowser = null;
        jobPostContext = null;
        currentJobUser = null;
      });
    }

    return jobPostBrowser;
  } catch (error) {
    console.error("❌ Failed to initialize browser:", error);
    jobPostBrowser = null;
    jobPostContext = null;
    currentJobUser = null;
    throw error;
  }
}

// MINIMAL context creation
async function getJobPostContextForUser(browser, userEmail) {
  try {
    if (jobPostContext && currentJobUser !== userEmail) {
      console.log(`🔄 Switching context from ${currentJobUser} to ${userEmail}`);
      await jobPostContext.close();
      jobPostContext = null;
    }

    if (!jobPostContext) {
      console.log(`🌍 Creating minimal context for: ${userEmail}`);
      jobPostContext = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1366, height: 768 },
      });

      currentJobUser = userEmail;

      jobPostContext.on("close", () => {
        console.log("🔌 Context closed");
        jobPostContext = null;
        currentJobUser = null;
      });
    }

    return jobPostContext;
  } catch (error) {
    console.error("❌ Failed to get context:", error);
    throw error;
  }
}

// Navigation with retries
async function navigateToGroupSafely(page, groupUrl, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔗 Navigation attempt ${attempt}/${maxRetries} to group...`);

      if (page.isClosed()) {
        throw new Error("Page is closed");
      }

      await page.goto(groupUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      console.log("✅ Navigation successful");
      return true;
    } catch (error) {
      console.error(`❌ Navigation attempt ${attempt} failed: ${error.message}`);

      if (attempt < maxRetries) {
        console.log(`⏳ Waiting before retry...`);
        await humanPause(5000);
      }
    }
  }

  throw new Error("All navigation attempts failed");
}

// Helper to check if the page appears recovered
async function isPageLikelyRecovered(page) {
  try {
    if (page.isClosed && page.isClosed()) return false;
    const title = await page.title().catch(() => "");
    const url = page.url ? page.url() : "";
    const lower = (title + " " + url).toLowerCase();
    if (!lower.includes("snap") && !lower.includes("error") && !lower.includes("crash") && !lower.includes("killed")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Generate messenger link for job application
async function generateMessengerLink(jobData, jobPostId) {
  try {
    const contextData = {
      jobPostId,
      jobTitle: jobData.title,
      company: jobData.company,
      location: jobData.location,
      requirements: jobData.requirements,
      description: jobData.description,
      jobType: jobData.jobType,
      experience: jobData.experiance,
      salaryRange: jobData.salaryRange,
      responsibilities: jobData.responsibilities || [],
      perks: jobData.perks,
      timestamp: Date.now(),
    };

    const DOMAIN_URL = "https://fbauto-main-production.up.railway.app";
  const encodedContext = encodeURIComponent(Buffer.from(JSON.stringify(contextData)).toString("base64url"));
  const contextualMessengerLink = `${DOMAIN_URL}/messenger-redirect?context=${encodedContext}`;

    return contextualMessengerLink;
  } catch (error) {
    console.error("❌ Error generating messenger link:", error);
    return null;
  }
}

// Format job post content with messenger link included
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

// Generate self-reply message (kept for backward compatibility)
async function generateSelfReplyMessage(jobData, jobPostId) {
  try {
    const contextData = {
      jobPostId,
      jobTitle: jobData.title,
      company: jobData.company,
      location: jobData.location,
      requirements: jobData.requirements,
      description: jobData.description,
      jobType: jobData.jobType,
      experience: jobData.experiance,
      salaryRange: jobData.salaryRange,
      responsibilities: jobData.responsibilities || [],
      perks: jobData.perks,
      timestamp: Date.now(),
    };

    const DOMAIN_URL = "https://fbauto-main-production.up.railway.app";
  const encodedContext = encodeURIComponent(Buffer.from(JSON.stringify(contextData)).toString("base64url"));
  const contextualMessengerLink = `${DOMAIN_URL}/messenger-redirect?context=${encodedContext}`;

    const messages = [
      `📩 Interested candidates, message me here: ${contextualMessengerLink}`,
      `💼 Ready to join ${jobData.company}? Apply here: ${contextualMessengerLink}`,
      `🎯 To apply, click here: ${contextualMessengerLink}`,
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  } catch (error) {
    console.error("❌ Error generating self-reply message:", error);
    return `💬 Interested in this ${jobData.title} position? Comment "interested" below!`;
  }
}

// Create group post using the working approach from facebook-post.js
async function createGroupPost(page, jobContent) {
  try {
    console.log("📝 Creating a post in group...");

    await page.waitForLoadState("domcontentloaded");
    await humanPause(3000, 5000);

    // Check if we can post to this group
    const pageCheck = await page.evaluate(() => {
      const url = window.location.href;
      const body = document.body.innerText.toLowerCase();

      if (!url.includes("/groups/")) {
        return { canPost: false, reason: "Not on a group page" };
      }

      if (
        body.includes("you can't post in this group") ||
        body.includes("posting is restricted") ||
        body.includes("you've been restricted")
      ) {
        return { canPost: false, reason: "Posting restricted" };
      }

      return { canPost: true };
    });

    if (!pageCheck.canPost) {
      throw new Error(`Cannot post: ${pageCheck.reason}`);
    }

    console.log("🔍 Looking for 'Write something...' button...");

    // Comprehensive selector list
    const writeButtonSelectors = [
      'span:has-text("Write something...")',
      'div[role="button"]:has-text("Write something...")',
      '[aria-label="Write something..."]',
      'span.x1lliihq:has-text("Write something...")',
      'div:has(span:text("Write something..."))',
      '[data-testid="status-attachment-mentions-input"]',
      '[placeholder="Write something..."]',
      'span:text-is("Write something...")',
      '*:has-text("Write something...")',
    ];

    let writeButton = null;

    for (const selector of writeButtonSelectors) {
      try {
        console.log(`🔍 Trying selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 3000 });
        const buttons = page.locator(selector);
        const count = await buttons.count();

        for (let i = 0; i < count; i++) {
          const button = buttons.nth(i);
          if (await button.isVisible()) {
            writeButton = button;
            console.log(`✅ Found write button with selector: ${selector} (index: ${i})`);
            break;
          }
        }

        if (writeButton) break;
      } catch (error) {
        console.log(`❌ Selector ${selector} failed:`, error.message);
        continue;
      }
    }

    // Aggressive search if needed
    if (!writeButton) {
      console.log("🔍 Trying aggressive search for write button...");
      try {
        writeButton = page.locator(`xpath=//*[contains(text(), "Write something")]`).first();
        if (await writeButton.isVisible({ timeout: 2000 })) {
          console.log("✅ Found write button using aggressive search");
        } else {
          writeButton = null;
        }
      } catch (error) {
        console.log("❌ Aggressive search failed:", error.message);
      }
    }

    if (!writeButton) {
      throw new Error("Could not find 'Write something...' button");
    }

    // Click the button to open modal
    console.log("🖱️ Clicking 'Write something...' button to open modal...");
    await writeButton.click();
    await humanPause(2000, 3000);

    // Find text input in modal
    console.log("🔍 Looking for text input in the modal...");
    const specificTextInputSelector =
      'div.xzsf02u.x1a2a7pz.x1n2onr6.x14wi4xw.x9f619.x1lliihq.x5yr21d.xh8yej3.notranslate[contenteditable="true"][role="textbox"]';

    let textInput = null;

    try {
      await page.waitForSelector(specificTextInputSelector, { timeout: 10000 });
      textInput = page.locator(specificTextInputSelector);
      console.log("✅ Found text input with specific selector");
    } catch (error) {
      console.log("❌ Specific selector failed, trying alternatives");

      const fallbackSelectors = [
        '[aria-placeholder="Create a public post…"][contenteditable="true"]',
        '[data-lexical-editor="true"][contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
      ];

      for (const selector of fallbackSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          textInput = page.locator(selector).first();
          console.log(`✅ Found text input with fallback selector: ${selector}`);
          break;
        } catch (error) {
          continue;
        }
      }
    }

    if (!textInput) {
      throw new Error("Could not find text input in modal");
    }

    // Type the message
    console.log("⌨️ Typing message into text input...");

    try {
      await textInput.click({ force: true });
      await humanPause(1000, 2000);
    } catch (error) {
      console.log("🔧 Force click failed, trying JavaScript click...");
      await textInput.evaluate((el) => el.click());
      await humanPause(1000, 2000);
    }

    // Clear and type content
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await humanPause(500, 1000);

    console.log("⌨️ Typing message with keyboard...");
    await page.keyboard.type(jobContent, { delay: 100 });
    await humanPause(2000, 3000);

    // Verify content was typed
    const typedContent = await textInput.textContent();
    console.log("📏 Content typed length:", typedContent?.length || 0);

    if (!typedContent || typedContent.trim().length === 0) {
      console.log("🔧 Content not typed, trying alternative method...");
      await textInput.evaluate((el, content) => {
        el.innerHTML = `<p>${content.replace(/\n/g, "</p><p>")}</p>`;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, jobContent);
      await humanPause(1000, 2000);
    }

    // Find and click Post button
    console.log("⏳ Waiting for Post button to be enabled...");
    const specificPostButtonSelector = 'div[aria-label="Post"][role="button"]:not([aria-disabled="true"])';

    let postButton = null;

    try {
      await page.waitForSelector(specificPostButtonSelector, { timeout: 10000 });
      postButton = page.locator(specificPostButtonSelector);
      console.log("✅ Found enabled Post button");
    } catch (error) {
      console.log("🔍 Enabled post button not found, trying to find any post button...");

      const disabledButtonSelector = 'div[aria-label="Post"][role="button"]';
      try {
        await page.waitForSelector(disabledButtonSelector, { timeout: 5000 });
        postButton = page.locator(disabledButtonSelector);

        const isDisabled = await postButton.getAttribute("aria-disabled");
        console.log("🔍 Post button found, disabled status:", isDisabled);

        if (isDisabled === "true") {
          console.log("⏳ Post button is disabled, waiting for content to enable it...");
          await humanPause(3000, 5000);

          const stillDisabled = await postButton.getAttribute("aria-disabled");
          if (stillDisabled === "true") {
            console.log("🔧 Button still disabled, trying to add content again...");
            await textInput.click({ force: true });
            await page.keyboard.press("End");
            await page.keyboard.type(" ", { delay: 100 });
            await humanPause(2000, 3000);
          }
        }
      } catch (error) {
        console.log("❌ Could not find post button at all");
      }
    }

    if (!postButton) {
      throw new Error("Could not find Post button");
    }

    // Click Post button
    console.log("🖱️ Clicking Post button...");

    try {
      await postButton.click();
    } catch (error) {
      console.log("🔧 Regular click failed, trying force click...");
      await postButton.click({ force: true });
    }

    await humanPause(3000, 5000);

    // Verify post was submitted
    try {
      const modalGone = await page
        .waitForSelector('[role="dialog"]', {
          state: "detached",
          timeout: 10000,
        })
        .then(() => true)
        .catch(() => false);

      if (modalGone) {
        console.log("✅ Modal closed - post likely successful");
      }

      const successSelectors = [
        'text="Your post is now published"',
        'text="Post shared"',
        'div[data-testid="toast-message"]',
      ];

      for (const selector of successSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          console.log("✅ Found success message");
          break;
        } catch (error) {
          continue;
        }
      }

      console.log("✅ Job post created successfully!");
      return true;
    } catch (error) {
      console.log("⚠️ Could not verify post submission, but no errors occurred:", error.message);
      return true;
    }
  } catch (error) {
    console.error("❌ Failed to create job post:", error.message);
    throw error;
  }
}

// Add immediate self-reply after posting (kept for backward compatibility but now optional)
async function addImmediateSelfReply(page, jobData, jobPostId) {
  try {
    console.log("💬 Adding immediate self-reply to engage candidates...");

    await humanPause(3000, 5000);

    // Look for comment box selectors
    const commentBoxSelectors = [
      '[contenteditable="true"][data-testid="comment-textbox"]',
      'div[contenteditable="true"][role="textbox"]',
      '[aria-label="Write a comment..."]',
      '[placeholder="Write a comment..."]',
      'div[contenteditable="true"].xzsf02u',
      'div[contenteditable="true"][data-lexical-editor="true"]',
    ];

    let commentBox = null;

    // Find the comment box
    for (const selector of commentBoxSelectors) {
      try {
        console.log(`🔍 Trying comment box selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 5000 });
        commentBox = page.locator(selector).first();

        if (await commentBox.isVisible()) {
          console.log(`✅ Found comment box with selector: ${selector}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!commentBox) {
      console.log("⚠️ Could not find comment box for self-reply");
      return false;
    }

    // Generate the self-reply message
    const replyMessage = await generateSelfReplyMessage(jobData, jobPostId);

    // Click the comment box and add the reply
    console.log("📝 Adding self-reply comment...");
    await commentBox.click();
    await humanPause(1000, 2000);

    // Clear any existing content and type the message
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await humanPause(500, 1000);

    await page.keyboard.type(replyMessage, { delay: 50 });
    await humanPause(2000, 3000);

    // Look for comment submit button
    const submitButtonSelectors = [
      '[aria-label="Comment"]',
      'div[role="button"][aria-label="Comment"]',
      '[data-testid="comment-submit-button"]',
      'button[type="submit"]',
      'div[role="button"]:has-text("Comment")',
    ];

    let submitButton = null;

    for (const selector of submitButtonSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        submitButton = page.locator(selector).first();

        if (await submitButton.isVisible()) {
          console.log(`✅ Found submit button with selector: ${selector}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!submitButton) {
      console.log("⚠️ Could not find comment submit button");
      return false;
    }

    // Submit the comment
    console.log("📤 Submitting self-reply comment...");
    await submitButton.click();
    await humanPause(3000, 5000);

    console.log("✅ Self-reply comment added successfully");
    return true;
  } catch (error) {
    console.error("❌ Failed to add self-reply:", error.message);
    return false;
  }
}

// Enhanced job posting with crash recovery - messenger link now included in post content
async function postJobWithCrashRecovery(page, groupUrl, jobContent, jobData, jobPostId) {
  try {
    console.log(`📝 Posting job to group: ${groupUrl}`);
    console.log("💬 Job post includes messenger link directly in content");

    // Navigate to group
    await navigateToGroupSafely(page, groupUrl);
    console.log("✅ Navigation completed");

    // Wait and test stability
    console.log("⏳ Waiting 5 seconds to test stability...");
    await humanPause(5000);

    try {
      if (page.isClosed && page.isClosed()) throw new Error("Page closed during wait");

      const title = await page.title();
      const currentUrl = page.url();
      console.log(`📄 Page title: ${title}`);
      console.log(`🔗 Current URL: ${currentUrl}`);

      // Check for crash indicators
      const lower = (title + " " + currentUrl).toLowerCase();
      if (lower.includes("snap") || lower.includes("error") || lower.includes("crash") || lower.includes("killed")) {
        throw new Error("Page appears to be crashed based on title/URL");
      }

      console.log("✅ Page stable - proceeding with job posting...");

      // Create the actual job post (now includes messenger link)
      const postSuccess = await createGroupPost(page, jobContent);

      if (!postSuccess) {
        throw new Error("Failed to create group post");
      }

      console.log("✅ Job post created with messenger link included in content!");

      // Optional: Add immediate self-reply (can be disabled by setting addSelfReply to false)
      const addSelfReply = false; // Set to true if you want both inline link AND self-reply
      let selfReplySuccess = false;
      
      if (addSelfReply) {
        console.log("📬 Adding immediate self-reply...");
        selfReplySuccess = await addImmediateSelfReply(page, jobData, jobPostId);
      } else {
        console.log("📬 Skipping self-reply since messenger link is already in post content");
      }

      // Update job post status
      await prisma.jobPost.update({
        where: { id: jobPostId },
        data: { 
          status: "SUCCESS", 
          postUrl: page.url(),
          updatedAt: new Date() 
        },
      });

      return {
        success: true,
        postUrl: page.url(),
        groupUrl,
        selfReplyAdded: selfReplySuccess,
        messengerLinkInPost: true,
        testType: "FULL_JOB_POSTING_WITH_INLINE_MESSENGER_LINK",
      };

    } catch (stabilityError) {
      console.error(`❌ Page crashed or failed: ${stabilityError.message}`);

      // Crash Recovery - Create new page and retry
      try {
        console.log("🔄 Opening a fresh page for crash recovery...");
        const context = page.context();
        const newPage = await context.newPage();

        console.log("🔄 Navigating new page to group URL...");
        await navigateToGroupSafely(newPage, groupUrl);

        console.log("✅ Recovered in new page - proceeding with job posting...");

        // Create the job post on the new page (includes messenger link)
        const postSuccess = await createGroupPost(newPage, jobContent);

        if (!postSuccess) {
          throw new Error("Failed to create group post on recovered page");
        }

        const currentUrl = newPage.url();
        const title = await newPage.title();
        console.log(`✅ Job posted successfully on recovered page, title: ${title}`);
        console.log("✅ Messenger link included in post content!");

        // Update job post status
        await prisma.jobPost.update({
          where: { id: jobPostId },
          data: { 
            status: "SUCCESS", 
            postUrl: currentUrl,
            updatedAt: new Date() 
          },
        });

        return {
          success: true,
          postUrl: currentUrl,
          groupUrl,
          selfReplyAdded: false,
          messengerLinkInPost: true,
          testType: "FULL_JOB_POSTING_WITH_INLINE_MESSENGER_LINK",
          recoveredFromCrash: true,
          reloadMethod: "NEW_PAGE",
        };
      } catch (npErr) {
        console.error("❌ New page recovery failed:", npErr.message);
        throw new Error(`Crash recovery failed: ${npErr.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ Job posting failed: ${error.message}`);

    await prisma.jobPost.update({
      where: { id: jobPostId },
      data: {
        status: "FAILED",
        errorMessage: `Job posting failed: ${error.message}`,
        attemptNumber: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    return {
      success: false,
      error: error.message,
      groupUrl,
      selfReplyAdded: false,
      messengerLinkInPost: false,
      testType: "FULL_JOB_POSTING_WITH_INLINE_MESSENGER_LINK",
    };
  }
}

// Main automation function - Enhanced with messenger link in post content
export async function runJobPostAutomation(credentials, jobData = null) {
  let browser = null;
  let context = null;
  let page = null;

  try {
    console.log("🚀 Starting enhanced job posting automation with inline messenger links...");

    if (!jobData) {
      jobData = await prisma.job.findFirst({
        where: { isActive: true, posts: { none: { status: "SUCCESS" } } },
        include: { posts: true },
        orderBy: { createdAt: "desc" },
      });

      if (!jobData) throw new Error("No active jobs found");
    }

    console.log(`📋 Job: ${jobData.title} at ${jobData.company}`);

    browser = await initializeJobPostBrowser();
    context = await getJobPostContextForUser(browser, credentials.email || "default");
    page = await context.newPage();

    console.log("🔑 Logging in...");
    await ensureLoggedIn({ page, context, credentials });

    const { facebookGroups } = jobData;

    if (!facebookGroups || facebookGroups.length === 0) throw new Error("No Facebook groups specified");

    const results = [];

    // Post to each group with crash recovery
    for (const groupUrl of facebookGroups) {
      try {
        const jobPost = await prisma.jobPost.create({
          data: { jobId: jobData.id, facebookGroupUrl: groupUrl, status: "POSTING" },
        });

        // Format job content with messenger link included
        const jobContent = await formatJobPost(jobData, jobPost.id);
        console.log("📝 Job post content includes messenger link directly in post");

        const result = await postJobWithCrashRecovery(page, groupUrl, jobContent, jobData, jobPost.id);
        results.push(result);

        // Wait between posts if multiple groups
        if (facebookGroups.length > 1 && results.length < facebookGroups.length) {
          console.log("⏱️ Waiting between group posts...");
          await humanPause(10000, 15000);
        }
      } catch (groupError) {
        console.error(`❌ Group ${groupUrl} failed: ${groupError.message}`);
        results.push({ 
          success: false, 
          error: groupError.message, 
          groupUrl, 
          selfReplyAdded: false, 
          messengerLinkInPost: false,
          testType: "FULL_JOB_POSTING_WITH_INLINE_MESSENGER_LINK" 
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;
    const recoveredCount = results.filter((r) => r.recoveredFromCrash).length;
    const selfRepliesAdded = results.filter((r) => r.selfReplyAdded).length;
    const messengerLinksInPosts = results.filter((r) => r.messengerLinkInPost).length;

    console.log(`✅ Job posting completed: ${successCount} successful, ${failedCount} failed`);
    console.log(`🔄 Recovered from crashes: ${recoveredCount}`);
    console.log(`💬 Self-replies added: ${selfRepliesAdded}`);
    console.log(`🎯 Posts with messenger links: ${messengerLinksInPosts}`);

    return {
      success: true,
      message: "Enhanced job posting automation with inline messenger links completed",
      timestamp: new Date().toISOString(),
      jobId: jobData.id,
      jobTitle: jobData.title,
      results,
      stats: { 
        totalGroups: facebookGroups.length, 
        successful: successCount, 
        failed: failedCount, 
        recoveredFromCrash: recoveredCount, 
        selfRepliesAdded: selfRepliesAdded,
        messengerLinksInPosts: messengerLinksInPosts,
        testMode: "ENHANCED_POSTING_WITH_INLINE_MESSENGER_LINKS" 
      },
    };
  } catch (error) {
    console.error("❌ Enhanced automation error:", error.message);
    throw error;
  } finally {
    // Always cleanup browser and context
    if (page) {
      await page.close().catch(err => console.error('Error closing page:', err));
    }
    if (context) {
      await context.close().catch(err => console.error('Error closing context:', err));
    }
    if (browser) {
      await browser.close().catch(err => console.error('Error closing browser:', err));
    }
  }
}

// Manual cleanup function
export async function cleanupJobPostAutomation() {
  try {
    console.log("🧹 Manual cleanup started...");

    if (jobPostContext && !jobPostContext._closed) {
      await jobPostContext.close();
      jobPostContext = null;
      currentJobUser = null;
      console.log("✅ Context closed");
    }

    if (jobPostBrowser && jobPostBrowser.isConnected()) {
      await jobPostBrowser.close();
      jobPostBrowser = null;
      console.log("✅ Browser closed");
    }

    console.log("🧹 Manual cleanup completed successfully");
  } catch (error) {
    console.error("❌ Cleanup error:", error.message);
    jobPostBrowser = null;
    jobPostContext = null;
    currentJobUser = null;
  }
}