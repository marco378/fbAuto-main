// src/automation/messenger-comment-runner.js
import { chromium } from "playwright";
import { ensureLoggedIn } from "./facebook-login.js";
import { humanPause } from "./utils/delays.js";
import { prisma } from "../../server/src/lib/prisma.js";

// Store browser context globally
let commentBrowser = null;
let commentContext = null;
let currentUser = null;

// Hardcoded messenger link (replace with your Facebook Page ID)
const MESSENGER_LINK = "https://m.me/61579236676817"; // Replace with actual page ID

// Keywords to look for in comments
const INTEREST_KEYWORDS = [
  "interested",
  "hire me",
  "i am interested",
  "i'm interested",
  "looking for job",
  "need job",
  "available",
  "apply",
  "contact me",
  "dm me",
  "message me",
];

// Updated comment selectors with the exact structure you provided
const CommentSelectors = {
  // Comment container selector
  commentContainer: "div.xwib8y2.xpdmqnj.x1g0dm76.x1y1aw1k",

  // Comment text selectors with fallbacks
  commentText: [
    "span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.x1xmvt09.x1lliihq.x1s928wv.xhkezso.x1gmr53x.x1cpjm7i.x1fgarty.x1943h6x.xudqn12.x3x7a5m.x6prxxf.xvq8zen.xo1l8bm.xzsf02u",
    'div[dir="auto"]',
    'span[dir="auto"]',
    ".x193iq5w",
    'div[style*="text-align"]',
  ],

  // Comment author selector
  commentAuthor:
    "span.x3nfvp2 span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.x1xmvt09.x1lliihq.x1s928wv.xhkezso.x1gmr53x.x1cpjm7i.x1fgarty.x1943h6x.x4zkp8e.x676frb.x1nxh6w3.x1sibtaa.x1s688f.xzsf02u",

  // Updated reply button selectors based on your inspection
  replyButton: [
    // Exact structure from your inspection
    'li.html-li div.html-div div.x1i10hfl.xjbqb8w.x1ejq31n.x18oe1m7.x1sy0etr.xstzfhl.x972fbf.x10w94by.x1qhh985.x14e42zd.x9f619.x1ypdohk.xt0psk2.x3ct3a4.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x16tdsg8.x1hl2dhg.xggy1nq.x1a2a7pz.xkrqix3.x1sur9pj.xi81zsa.x1s688f[role="button"]:has-text("Reply")',

    // More specific variations
    'li.html-li.xdj266r.xat24cr.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1rg5ohu.x1xegmmw.x13fj5qh div[role="button"]:has-text("Reply")',

    // Target the button element directly with Reply text
    'div.x1i10hfl.xjbqb8w.x1ejq31n.x18oe1m7.x1sy0etr.xstzfhl.x972fbf.x10w94by.x1qhh985.x14e42zd.x9f619.x1ypdohk.xt0psk2.x3ct3a4.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x16tdsg8.x1hl2dhg.xggy1nq.x1a2a7pz.xkrqix3.x1sur9pj.xi81zsa.x1s688f[role="button"]:has-text("Reply")',

    // Fallback selectors
    'li.html-li div[role="button"]:has-text("Reply")',
    'div[role="button"]:has-text("Reply")',
    '[role="button"]:has-text("Reply")',

    // Generic fallbacks
    'li.html-li div.html-div div[role="button"]',
    'li.html-li div[role="button"]',
    'li div.html-div div[role="button"]',
    'li div[role="button"]',
    'div[role="button"][tabindex="0"]',
    'div[role="button"]',
  ],

  replyTextArea:
    '[contenteditable="true"][data-testid="comment-textbox"], div[contenteditable="true"][role="textbox"]',

  // Submit button selectors with fallbacks
  replySubmitButton: [
    'div.x1i10hfl.x1qjc9v5.xjqpnuy.xc5r6h4.xqeqjp1.x1phubyo.x9f619.x1ypdohk.xdl72j9.x2lah0s.x3ct3a4.x2lwn1j.xeuugli.x16tdsg8.x1hl2dhg.xggy1nq.x1ja2u2z.x1t137rt.x1fmog5m.xu25z0z.x140muxe.xo1y3bh.x1q0g3np.x87ps6o.x1lku1pv.x1a2a7pz.xjyslct.xjbqb8w.x13fuv20.x18b5jzi.x1q0q8m5.x1t7ytsu.x972fbf.x10w94by.x1qhh985.x14e42zd.x3nfvp2.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1n2onr6.x3ajldb.xrw4ojt.xg6frx5.xw872ko.xhgbb2x.x1xhcax0.x1s928wv.x1o8326s.x56lyyc.x1j6awrg.x1tfg27r.xitxdhh[role="button"][aria-label="Comment"]',
    'div[role="button"][aria-label="Comment"]',
    '[aria-label="Comment"]',
    'button[type="submit"]',
    '[data-testid="comment-submit-button"]',
  ],
};

// Browser configuration
const getBrowserConfig = () => ({
  headless: true, // Set true for production
  args: [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
]

});

// Initialize browser
async function initializeCommentBrowser() {
  try {
    if (!commentBrowser) {
      console.log("🚀 Launching comment monitoring browser...");
      commentBrowser = await chromium.launch(getBrowserConfig());

      commentBrowser.on("disconnected", () => {
        console.log("🔌 Comment browser disconnected");
        commentBrowser = null;
        commentContext = null;
        currentUser = null;
      });
    }

    return commentBrowser;
  } catch (error) {
    console.error("❌ Failed to initialize comment browser:", error);
    throw error;
  }
}

// Get or create context
async function getCommentContextForUser(browser, userEmail) {
  try {
    if (commentContext && currentUser !== userEmail) {
      console.log(`🔄 Switching context from ${currentUser} to ${userEmail}`);
      await commentContext.close();
      commentContext = null;
    }

    if (!commentContext) {
      console.log(`🌍 Creating new context for user: ${userEmail}`);
      commentContext = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        permissions: ["notifications"],
      });
      currentUser = userEmail;
    }

    return commentContext;
  } catch (error) {
    console.error("❌ Failed to get comment context:", error);
    throw error;
  }
}

// Generate reply message - FIXED: Made async and return string
async function generateReplyMessage(currentJobPost, jobPostId, jobContext) {
  try {
    // Always fetch the LATEST active job instead of using the post's original job
    const latestJob = await prisma.job.findFirst({
      where: {
        isActive: true,
        // Add any other conditions like user ownership if needed
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!latestJob) {
      console.log(
        "⚠️ No active jobs found, falling back to current job context"
      );
      // Fall back to the original job context if no active jobs
    }

    // Use latest job data instead of the old post's job data
    const jobToUse = latestJob || currentJobPost.job;

    // Create context data with the LATEST job information
    const contextData = {
      jobPostId: latestJob ? null : jobPostId, // null for latest job, specific ID for old post
      jobTitle: jobToUse.title,
      company: jobToUse.company,
      location: jobToUse.location,
      requirements: jobToUse.requirements,
      description: jobToUse.description,
      jobType: jobToUse.jobType,
      experience: jobToUse.experiance, // Note: keeping your typo
      salaryRange: jobToUse.salaryRange,
      responsibilities: jobToUse.responsibilities || [],
      perks: jobToUse.perks,
      timestamp: Date.now(),
      isLatestJob: !!latestJob, // Flag to indicate if this is latest job
    };

    const DOMAIN_URL = process.env.DOMAIN_URL || "http://localhost:8000";
    const encodedContext = Buffer.from(JSON.stringify(contextData)).toString(
      "base64url"
    );
    const contextualMessengerLink = `${DOMAIN_URL}/api/messenger-redirect?context=${encodedContext}`;

    const messages = [
      `Hi! Thanks for your interest in ${jobToUse.title}. Let's chat about the details: ${contextualMessengerLink}`,
      `Hello! I'd love to discuss ${jobToUse.title} with you. Please message me here: ${contextualMessengerLink}`,
      `Hi! Great to see your interest in ${jobToUse.title}. Drop me a message so we can talk: ${contextualMessengerLink}`,
    ];

    console.log(
      `📋 Generated reply with ${latestJob ? "LATEST" : "ORIGINAL"} job: ${
        jobToUse.title
      }`
    );
    const selectedMessage =
      messages[Math.floor(Math.random() * messages.length)];
    return selectedMessage; // Now returns a string, not the array
  } catch (error) {
    console.error("❌ Error generating reply message:", error);
    // Fallback to original implementation with a simple string return
    return `Hi! Thanks for your interest in ${currentJobPost.job.title}. Let's chat about the details!`;
  }
}

// Enhanced function to check if comment contains interest keywords
function containsInterestKeywords(commentText) {
  const lowerText = commentText.toLowerCase().trim();

  // First check if this comment contains any messenger link (not just ours)
  if (
    lowerText.includes("m.me/") ||
    lowerText.includes("messenger.com/") ||
    lowerText.includes("facebook.com/messages/")
  ) {
    console.log("   📋 Detected messenger link in comment - skipping");
    return false;
  }

  // Check for bot-like phrases that we generate
  const botPhrases = [
    "great to see your interest",
    "thanks for your interest",
    "i'd love to discuss",
    "drop me a message so we can talk",
    "let's chat about the details",
    "please message me here",
  ];

  for (const phrase of botPhrases) {
    if (lowerText.includes(phrase.toLowerCase())) {
      console.log(`   🤖 Detected bot-generated reply (contains: "${phrase}")`);
      return false;
    }
  }

  // Now check for genuine interest keywords
  const hasInterestKeyword = INTEREST_KEYWORDS.some((keyword) =>
    lowerText.includes(keyword.toLowerCase())
  );

  if (hasInterestKeyword) {
    console.log("   🎯 Contains genuine interest keywords");
  } else {
    console.log("   ⏭️ No interest keywords found");
  }

  return hasInterestKeyword;
}

// Get comment text with fallback selectors
async function getCommentText(commentContainer) {
  for (const selector of CommentSelectors.commentText) {
    try {
      const textElement = commentContainer.locator(selector).first();
      const text = await textElement.textContent({ timeout: 2000 });
      if (text && text.trim()) {
        return text.trim();
      }
    } catch (error) {
      continue;
    }
  }
  return null;
}

// Improved reply button finder that stays within the comment's context
async function findReplyButton(commentContainer, page) {
  console.log("🔍 Searching for reply button within comment context...");

  // Strategy 1: Look for reply button within the immediate comment container and its siblings
  try {
    // First, try to find the reply button in the same container or immediate siblings
    const parentElement = commentContainer.locator("..").first();

    // Look for Like, Reply, Share buttons structure that should be near this comment
    const actionButtons = parentElement
      .locator('*:has-text("Reply")')
      .filter({ hasText: /^Reply$/ });
    const actionButtonCount = await actionButtons.count();

    console.log(
      `   Found ${actionButtonCount} Reply buttons in parent context`
    );

    if (actionButtonCount > 0) {
      // Get the comment's position to find the closest reply button
      const commentBox = await commentContainer.boundingBox();

      for (let i = 0; i < actionButtonCount; i++) {
        try {
          const replyButton = actionButtons.nth(i);
          const isVisible = await replyButton.isVisible({ timeout: 1000 });

          if (isVisible) {
            const buttonBox = await replyButton.boundingBox();

            if (commentBox && buttonBox) {
              // Check if the reply button is close to this specific comment
              const verticalDistance = Math.abs(
                buttonBox.y - (commentBox.y + commentBox.height)
              );
              const horizontalOverlap = !(
                buttonBox.x > commentBox.x + commentBox.width ||
                commentBox.x > buttonBox.x + buttonBox.width
              );

              console.log(
                `   Reply button ${
                  i + 1
                }: vertical distance = ${verticalDistance}px, horizontal overlap = ${horizontalOverlap}`
              );

              // Reply button should be within 100px vertically and have some horizontal overlap
              if (verticalDistance < 100 && horizontalOverlap) {
                console.log(
                  `✅ Found associated reply button for this comment`
                );
                return replyButton;
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  } catch (error) {
    console.log(`   Parent context search failed: ${error.message}`);
  }

  // Strategy 2: Look for the specific structure within the comment's DOM tree
  try {
    console.log("🔍 Searching for reply button in comment's DOM tree...");

    // Navigate up the DOM tree to find the container that includes both comment and actions
    let currentElement = commentContainer;

    for (let level = 0; level < 5; level++) {
      // Try up to 5 levels up
      try {
        const replyButtons = currentElement
          .locator('*:has-text("Reply")')
          .filter({ hasText: /^Reply$/ });
        const count = await replyButtons.count();

        if (count > 0) {
          console.log(`   Found ${count} reply buttons at DOM level ${level}`);

          // Check each reply button at this level
          for (let i = 0; i < count; i++) {
            try {
              const button = replyButtons.nth(i);
              const isVisible = await button.isVisible({ timeout: 1000 });

              if (isVisible) {
                // Verify this button is associated with our comment by checking if it's in the same article/post section
                const buttonInSameArticle =
                  (await button
                    .locator(
                      'xpath=ancestor::div[@role="article" or contains(@class, "x1lliihq")]'
                    )
                    .count()) > 0;
                const commentInSameArticle =
                  (await commentContainer
                    .locator(
                      'xpath=ancestor::div[@role="article" or contains(@class, "x1lliihq")]'
                    )
                    .count()) > 0;

                if (buttonInSameArticle && commentInSameArticle) {
                  console.log(
                    `✅ Found reply button in same article context at level ${level}`
                  );
                  return button;
                }
              }
            } catch (error) {
              continue;
            }
          }
        }

        // Move up one level in the DOM
        currentElement = currentElement.locator("..").first();
      } catch (error) {
        break;
      }
    }
  } catch (error) {
    console.log(`   DOM tree search failed: ${error.message}`);
  }

  // Strategy 3: Use the original selectors but with better context filtering
  for (let i = 0; i < CommentSelectors.replyButton.length; i++) {
    const selector = CommentSelectors.replyButton[i];
    try {
      console.log(
        `🔍 Trying contextual selector ${i + 1}: ${selector.substring(
          0,
          50
        )}...`
      );

      // Try to find the button within a reasonable scope around the comment
      const nearbyButtons = page.locator(selector);
      const buttonCount = await nearbyButtons.count();

      if (buttonCount > 0) {
        const commentBox = await commentContainer.boundingBox();

        // Check each button to see if it's near our specific comment
        for (let j = 0; j < buttonCount; j++) {
          try {
            const button = nearbyButtons.nth(j);
            const isVisible = await button.isVisible({ timeout: 1000 });

            if (isVisible) {
              const buttonBox = await button.boundingBox();

              if (commentBox && buttonBox) {
                // Calculate distance between comment and button
                const distance = Math.sqrt(
                  Math.pow(buttonBox.x - commentBox.x, 2) +
                    Math.pow(buttonBox.y - commentBox.y, 2)
                );

                console.log(
                  `   Button ${j + 1} distance from comment: ${distance}px`
                );

                // If button is within reasonable distance (300px), it's likely the right one
                if (distance < 300) {
                  const buttonText = await button
                    .textContent({ timeout: 1000 })
                    .catch(() => "");

                  if (
                    buttonText.toLowerCase().includes("reply") ||
                    buttonText === "Reply" ||
                    i >= 6
                  ) {
                    console.log(
                      `✅ Found nearby reply button with selector ${i + 1}`
                    );
                    return button;
                  }
                }
              }
            }
          } catch (error) {
            continue;
          }
        }
      }
    } catch (error) {
      continue;
    }
  }

  console.log("❌ Could not find reply button for this specific comment");
  return null;
}

// Enhanced current user detection
async function getCurrentUserName(page) {
  try {
    // Try to get current user name from profile or navigation
    const userNameSelectors = [
      '[data-testid="nav_account_switcher"] span',
      '[aria-label*="Your profile"] span',
      'div[role="banner"] span[dir="auto"]',
      // Additional selectors for better user identification
      '[data-testid="blue_bar_profile_link"] span',
      'div[data-testid="left_nav_menu_list"] a[href*="/me"] span',
      'a[href*="/profile.php"] span',
      'div[role="navigation"] a[aria-label*="Profile"] span',
    ];

    for (const selector of userNameSelectors) {
      try {
        const element = page.locator(selector).first();
        const userName = await element.textContent({ timeout: 3000 });
        if (userName && userName.trim() && userName.trim() !== "Find friends") {
          console.log(`👤 Current user identified as: ${userName.trim()}`);
          return userName.trim();
        }
      } catch (error) {
        continue;
      }
    }

    // Try to get user name from page title or URL
    try {
      const pageTitle = await page.title();
      if (
        pageTitle &&
        !pageTitle.includes("Facebook") &&
        !pageTitle.includes("Find friends")
      ) {
        console.log(`👤 Current user identified from page title: ${pageTitle}`);
        return pageTitle;
      }
    } catch (error) {
      // Continue to next method
    }

    console.log(
      "⚠️ Could not identify current user name, will rely on content filtering"
    );
    return "Unknown User";
  } catch (error) {
    console.error("❌ Error getting current user name:", error.message);
    return "Unknown User";
  }
}

// Enhanced function to check if we should skip this comment
async function shouldSkipComment(
  commentContainer,
  commentText,
  currentUserName
) {
  // Check if comment contains our automated reply patterns
  if (!containsInterestKeywords(commentText)) {
    return {
      skip: true,
      reason: "no interest keywords or automated reply detected",
    };
  }

  // Check if comment author is current user
  try {
    const commentAuthorElement = commentContainer
      .locator(CommentSelectors.commentAuthor)
      .first();
    const commentAuthor = await commentAuthorElement.textContent({
      timeout: 2000,
    });

    if (
      commentAuthor &&
      currentUserName &&
      (commentAuthor.trim() === currentUserName ||
        (currentUserName !== "Unknown User" &&
          commentAuthor.trim().includes(currentUserName)))
    ) {
      return {
        skip: true,
        reason: `comment from current user: ${commentAuthor.trim()}`,
      };
    }
  } catch (error) {
    console.log(`⚠️ Could not get comment author, continuing...`);
  }

  return { skip: false, reason: null };
}

// Check if comment already has replies from current user
async function hasUserAlreadyReplied(page, commentContainer, currentUserName) {
  try {
    // Look for replies within this comment container
    const replyContainers = commentContainer.locator(
      'div[role="article"], div.x1lliihq'
    );
    const replyCount = await replyContainers.count();

    if (replyCount === 0) {
      return false;
    }

    // Check each reply for current user's name
    for (let i = 0; i < replyCount; i++) {
      try {
        const reply = replyContainers.nth(i);
        const replyAuthor = reply
          .locator(CommentSelectors.commentAuthor)
          .first();
        const authorName = await replyAuthor.textContent({ timeout: 2000 });

        if (
          authorName &&
          currentUserName &&
          authorName.trim() === currentUserName
        ) {
          console.log(
            `✅ Found existing reply from current user: ${authorName.trim()}`
          );
          return true;
        }
      } catch (error) {
        continue;
      }
    }

    return false;
  } catch (error) {
    console.error("❌ Error checking for existing replies:", error.message);
    return false;
  }
}

// Reply to a comment using reply button with multiple submit button fallbacks - FIXED: await the reply message
async function replyToComment(
  page,
  commentContainer,
  replyButton,
  replyMessage,
  index
) {
  try {
    console.log(`💬 Replying to comment ${index}...`);

    // Make sure the reply button is still visible and clickable
    await replyButton.waitFor({ state: "visible", timeout: 5000 });

    // Scroll the reply button into view if needed
    await replyButton.scrollIntoViewIfNeeded();
    await humanPause(500, 1000);

    // Click the reply button
    console.log(`🖱️ Clicking reply button for comment ${index}`);
    await replyButton.click();
    await humanPause(1500, 2500);

    // Find reply text area
    console.log(`📝 Looking for reply text area...`);
    const replyTextArea = page.locator(CommentSelectors.replyTextArea).first();
    await replyTextArea.waitFor({ state: "visible", timeout: 5000 });

    // Type the reply - FIXED: Ensure replyMessage is a string
    console.log(`⌨️ Typing reply message...`);
    await replyTextArea.click();
    await humanPause(500, 1000);

    // Make sure replyMessage is a string
    const messageToType =
      typeof replyMessage === "string" ? replyMessage : String(replyMessage);
    await replyTextArea.fill(messageToType);
    await humanPause(1000, 2000);

    // Try to find submit button with multiple selectors
    console.log(`🔍 Looking for submit button...`);
    let submitButton = null;

    for (const selector of CommentSelectors.replySubmitButton) {
      try {
        console.log(
          `🔍 Trying submit button selector: ${selector.substring(0, 50)}...`
        );
        submitButton = page.locator(selector).first();

        // Check if button is visible
        await submitButton.waitFor({ state: "visible", timeout: 3000 });
        console.log(
          `✅ Found submit button with selector: ${selector.substring(
            0,
            50
          )}...`
        );
        break;
      } catch (error) {
        console.log(`❌ Submit button not found with this selector`);
        submitButton = null;
        continue;
      }
    }

    if (!submitButton) {
      console.error(`❌ Could not find submit button for comment ${index}`);
      return false;
    }

    // Submit the reply
    console.log(`📤 Submitting reply...`);
    await submitButton.click();

    await humanPause(2000, 3000);
    console.log(`✅ Successfully replied to comment ${index}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to reply to comment ${index}:`, error.message);
    return false;
  }
}

// Process comments on a single post - FIXED: await the generateReplyMessage call
async function processPostComments(page, postUrl, jobPost) {
  try {
    console.log(`📝 Processing comments for post: ${postUrl}`);
    console.log(`📋 Job: ${jobPost.job.title} at ${jobPost.job.company}`);

    // Navigate to the post
    await page.goto(postUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await humanPause(3000, 5000);

    // Get current user name to avoid replying to own comments
    const currentUserName = await getCurrentUserName(page);

    // Find all comment containers
    const commentContainers = page.locator(CommentSelectors.commentContainer);
    const commentCount = await commentContainers.count();

    console.log(`📊 Found ${commentCount} total comments`);

    if (commentCount === 0) {
      return {
        success: true,
        totalComments: 0,
        eligibleComments: 0,
        repliedCount: 0,
      };
    }

    let eligibleComments = 0;
    let repliedCount = 0;

    // Create job context object from jobPost
    const jobContext = {
      title: jobPost.job.title,
      company: jobPost.job.company,
      location: jobPost.job.location,
      description: jobPost.job.description,
      requirements: jobPost.job.requirements || [],
      jobType: jobPost.job.jobType,
      experience: jobPost.job.experiance, // Note: your schema has 'experiance' (typo)
      salaryRange: jobPost.job.salaryRange,
    };

    // Generate reply message with job context - FIXED: await the Promise
    const replyMessage = await generateReplyMessage(
      jobPost,
      jobPost.id,
      jobContext
    );

    // Process each comment
    for (let i = 0; i < commentCount; i++) {
      try {
        console.log(`\n🔄 Processing comment ${i + 1}/${commentCount}`);
        const commentContainer = commentContainers.nth(i);

        // Get comment text using fallback selectors
        const commentText = await getCommentText(commentContainer);

        if (!commentText) {
          console.log(`⏭️ Skipping comment ${i + 1} - no text found`);
          continue;
        }

        console.log(`📖 Comment ${i + 1}: "${commentText}"`);

        // Check if we should skip this comment (combines all skip conditions)
        const skipCheck = await shouldSkipComment(
          commentContainer,
          commentText,
          currentUserName
        );
        if (skipCheck.skip) {
          console.log(`⏭️ Skipping comment ${i + 1} - ${skipCheck.reason}`);
          continue;
        }

        console.log(`🎯 Comment ${i + 1} is eligible for reply`);
        eligibleComments++;

        // Check if we already replied to this comment
        const alreadyReplied = await hasUserAlreadyReplied(
          page,
          commentContainer,
          currentUserName
        );
        if (alreadyReplied) {
          console.log(`⏭️ Skipping comment ${i + 1} - already replied`);
          continue;
        }

        // Find reply button using improved finder
        console.log(`🔍 Looking for reply button on comment ${i + 1}...`);
        const replyButton = await findReplyButton(commentContainer, page);

        if (!replyButton) {
          console.log(`⏭️ Skipping comment ${i + 1} - reply button not found`);
          continue;
        }

        // Reply to the comment
        const replySuccess = await replyToComment(
          page,
          commentContainer,
          replyButton,
          replyMessage,
          i + 1
        );

        if (replySuccess) {
          repliedCount++;
        }

        // Wait between replies to avoid being flagged
        await humanPause(3000, 5000);
      } catch (error) {
        console.error(`❌ Error processing comment ${i + 1}:`, error.message);
        continue;
      }
    }

    console.log(
      `✅ Processed ${commentCount} comments, ${eligibleComments} eligible, ${repliedCount} replied`
    );

    return {
      success: true,
      totalComments: commentCount,
      eligibleComments,
      repliedCount,
    };
  } catch (error) {
    console.error(
      `❌ Failed to process comments for post ${postUrl}:`,
      error.message
    );
    return {
      success: false,
      error: error.message,
    };
  }
}

// Navigate to "my posted content" and get post URLs
async function getMyPostedContent(page, groupUrl) {
  try {
    const myContentUrl = `${groupUrl}my_posted_content`;
    console.log(`📂 Navigating to: ${myContentUrl}`);

    await page.goto(myContentUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await humanPause(3000, 5000);

    // Look for "View in Group" buttons
    const viewInGroupButtons = page.locator(
      'a:has-text("View in Group"), button:has-text("View in Group")'
    );
    const buttonCount = await viewInGroupButtons.count();

    console.log(`📊 Found ${buttonCount} posts to process`);

    const postUrls = [];

    // Get URLs from "View in Group" buttons (process recent posts)
    const maxPostsToProcess = Math.min(buttonCount, 5); // Process recent 5 posts

    for (let i = 0; i < maxPostsToProcess; i++) {
      try {
        const button = viewInGroupButtons.nth(i);
        const href = await button.getAttribute("href");
        if (href) {
          const fullUrl = href.startsWith("http")
            ? href
            : `https://facebook.com${href}`;
          postUrls.push(fullUrl);
        }
      } catch (error) {
        console.log(`❌ Could not get URL for post ${i}:`, error.message);
      }
    }

    return postUrls;
  } catch (error) {
    console.error(
      `❌ Failed to get posted content from ${groupUrl}:`,
      error.message
    );
    return [];
  }
}

// Main comment monitoring function
export async function runCommentMonitoring(credentials) {
  try {
    console.log("🚀 Starting comment monitoring...");

    if (!credentials || !credentials.email || !credentials.password) {
      throw new Error("❌ No credentials provided for comment monitoring.");
    }

    // Get all successful job posts that need comment monitoring
    const jobPosts = await prisma.jobPost.findMany({
      where: {
        status: "SUCCESS",
        postUrl: { not: null },
      },
      include: {
        job: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10, // Process only recent 10 posts to avoid overload
    });

    if (jobPosts.length === 0) {
      console.log("📭 No successful posts found to monitor");
      return { success: true, message: "No posts to monitor", processed: 0 };
    }

    console.log(`📋 Found ${jobPosts.length} posts to monitor for comments`);

    // Initialize browser and context
    const browser = await initializeCommentBrowser();
    const context = await getCommentContextForUser(browser, credentials.email);
    const page = await context.newPage();

    // Set up page event listeners
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.log(`🔍 Browser console error: ${msg.text()}`);
      }
    });

    // Ensure login
    console.log("🔑 Ensuring user is logged in...");
    await ensureLoggedIn({ page, context, credentials });

    const results = [];

    // Group posts by Facebook group for efficient processing
    const postsByGroup = {};
    jobPosts.forEach((post) => {
      const groupUrl = post.facebookGroupUrl;
      if (!postsByGroup[groupUrl]) {
        postsByGroup[groupUrl] = [];
      }
      postsByGroup[groupUrl].push(post);
    });

    // Process each group
    for (const [groupUrl, groupPosts] of Object.entries(postsByGroup)) {
      try {
        console.log(`🏢 Processing group: ${groupUrl}`);

        // Get recent posted content URLs for this group
        const postUrls = await getMyPostedContent(page, groupUrl);

        if (postUrls.length === 0) {
          console.log(`📭 No recent posts found in group: ${groupUrl}`);
          continue;
        }

        // Process comments for each post URL - match with job posts by group
        for (let i = 0; i < Math.min(postUrls.length, groupPosts.length); i++) {
          const postUrl = postUrls[i];
          const jobPost = groupPosts[i]; // Get the corresponding job post

          // Pass the full jobPost object, not just the title
          const result = await processPostComments(
            page,
            postUrl,
            jobPost // Pass the full jobPost object
          );

          results.push({
            groupUrl,
            jobPostId: jobPost.id,
            jobTitle: jobPost.job.title,
            postUrl,
            ...result,
          });

          // Wait between posts
          await humanPause(5000, 8000);
        }

        // Wait between groups
        await humanPause(10000, 15000);
      } catch (error) {
        console.error(`❌ Error processing group ${groupUrl}:`, error.message);
        results.push({
          groupUrl,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const totalReplied = results.reduce(
      (sum, r) => sum + (r.repliedCount || 0),
      0
    );
    const totalEligible = results.reduce(
      (sum, r) => sum + (r.eligibleComments || 0),
      0
    );

    console.log(
      `✅ Comment monitoring completed: ${successCount}/${results.length} successful`
    );
    console.log(
      `📊 Total eligible comments: ${totalEligible}, Total replied: ${totalReplied}`
    );

    return {
      success: true,
      message: "Comment monitoring completed",
      timestamp: new Date().toISOString(),
      results: results,
      stats: {
        totalPosts: results.length,
        successful: successCount,
        failed: results.length - successCount,
        totalEligible,
        totalReplied,
      },
    };
  } catch (error) {
    console.error("❌ Comment monitoring error:", error.message);
    throw error;
  }
}

// Cleanup function
export async function cleanupCommentMonitoring() {
  try {
    if (commentContext) {
      await commentContext.close();
      commentContext = null;
      currentUser = null;
    }

    if (commentBrowser) {
      await commentBrowser.close();
      commentBrowser = null;
    }

    console.log("🧹 Comment monitoring cleanup completed");
  } catch (error) {
    console.error("❌ Comment monitoring cleanup error:", error.message);
  }
}
