// src/automation/runner.js
import { chromium } from "playwright";
import { ensureLoggedIn } from "./facebook-login.js";
import path from "path";

// Store browser context globally to persist across requests
let globalBrowser = null;
let globalContext = null;
let currentUser = null;

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

const getContextConfig = () => ({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  viewport: { width: 1280, height: 720 },
  ignoreHTTPSErrors: true,
  permissions: ["notifications"], // Allow notifications if needed
});

// Initialize browser and context
async function initializeBrowser() {
  try {
    if (!globalBrowser) {
      console.log("🚀 Launching new browser instance...");
      globalBrowser = await chromium.launch(getBrowserConfig());

      // Handle browser close events
      globalBrowser.on("disconnected", () => {
        console.log("🔌 Browser disconnected");
        globalBrowser = null;
        globalContext = null;
        currentUser = null;
      });
    }

    return globalBrowser;
  } catch (error) {
    console.error("❌ Failed to initialize browser:", error);
    throw error;
  }
}

// Get or create context for user
async function getContextForUser(browser, userEmail) {
  try {
    // If we have a context for a different user, close it
    if (globalContext && currentUser !== userEmail) {
      console.log(`🔄 Switching context from ${currentUser} to ${userEmail}`);
      await globalContext.close();
      globalContext = null;
    }

    // Create new context if needed
    if (!globalContext) {
      console.log(`🌍 Creating new context for user: ${userEmail}`);
      globalContext = await browser.newContext(getContextConfig());
      currentUser = userEmail;

      // Handle context close events
      globalContext.on("close", () => {
        console.log("🔌 Context closed");
        globalContext = null;
        currentUser = null;
      });
    }

    return globalContext;
  } catch (error) {
    console.error("❌ Failed to get context:", error);
    throw error;
  }
}

// Main automation function - now with persistent browser
export async function runAutomation(credentials, automationTasks = null) {
  try {
    console.log("🚀 Starting automation runner...");

    if (!credentials || !credentials.email || !credentials.password) {
      throw new Error("❌ No credentials provided to automation runner.");
    }

    console.log(`✅ Running automation for: ${credentials.email}`);

    // Initialize browser and context
    const browser = await initializeBrowser();
    const context = await getContextForUser(browser, credentials.email);
    const page = await context.newPage();

    // Set up page event listeners
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.log(`🔍 Browser console error: ${msg.text()}`);
      }
    });

    page.on("pageerror", (error) => {
      console.log(`🔍 Browser page error: ${error.message}`);
    });

    // 🔐 Ensure login with persistent cookies
    console.log("🔑 Ensuring user is logged in...");
    await ensureLoggedIn({ page, context, credentials });

    console.log("🎉 Facebook login successful → ready for automation.");

    // 👉 Execute automation tasks
    let automationResults = {};

    if (automationTasks && typeof automationTasks === "function") {
      console.log("🤖 Executing custom automation tasks...");
      automationResults = await automationTasks(page, context);
    } else {
      console.log("📌 Running default automation tasks...");

      // Default: Navigate to Facebook homepage and verify
      await page.goto("https://www.facebook.com", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      // Wait for page to fully load
      await page.waitForTimeout(3000);

      // Get current page info
      const pageTitle = await page.title();
      const currentUrl = page.url();

      automationResults = {
        pageTitle,
        currentUrl,
        timestamp: new Date().toISOString(),
        status: "Page loaded successfully",
      };

      console.log("📌 At Facebook homepage. Basic automation completed.");
    }

    const result = {
      success: true,
      message: "Automation tasks completed",
      timestamp: new Date().toISOString(),
      email: credentials.email,
      data: automationResults,
    };

    // Keep page open for manual inspection in development
    // In production, you might want to close it:
    // await page.close();

    console.log("✅ Automation completed successfully");
    return result;
  } catch (err) {
    console.error("❌ Runner error:", err.message);
    console.error(err);

    // Don't close browser on error - keep it for debugging
    throw err;
  }
}

// Cleanup function to gracefully close browser
export async function cleanup() {
  try {
    if (globalContext) {
      await globalContext.close();
      globalContext = null;
      currentUser = null;
    }

    if (globalBrowser) {
      await globalBrowser.close();
      globalBrowser = null;
    }

    console.log("🧹 Cleanup completed");
  } catch (error) {
    console.error("❌ Cleanup error:", error.message);
  }
}

// Graceful shutdown handling
process.on("SIGINT", async () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...");
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  await cleanup();
  process.exit(0);
});

// Example automation tasks function
export const defaultAutomationTasks = async (page, context) => {
  console.log("🤖 Running default automation tasks...");

  try {
    // Example: Check profile
    await page.goto("https://www.facebook.com/me", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

    const profileName = await page.evaluate(() => {
      // Try to find profile name
      const nameSelectors = [
        'h1[data-testid="profile_name"]',
        "h1",
        'span[dir="auto"]',
      ];

      for (const selector of nameSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }
      return "Profile name not found";
    });

    return {
      profileName,
      profileUrl: page.url(),
      taskCompleted: "Profile check",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ Default automation task error:", error);
    return {
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};
