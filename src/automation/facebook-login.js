// src/automation/facebook-login.js
console.log('✅ facebook-login.js loaded');
import { FB } from "../config/facebook-config.js";
import { LoginSelectors } from "./utils/selectors.js";
import { humanPause } from "./utils/delays.js";
import fs from "fs";
import path from "path";

// DEBUG: force hasFacebookSession log on module load (remove after debugging)
// (You can comment this out after confirming logs appear)
// import { chromium } from 'playwright';
// (async () => { const browser = await chromium.launch(); const context = await browser.newContext(); await hasFacebookSession(context); await browser.close(); })();

const COOKIES_DIR = path.join(process.cwd(), "cookies");
const getCookiePath = (email) =>
  path.join(COOKIES_DIR, `${email.replace("@", "_").replace(/\./g, "_")}.json`);

const ensureCookiesDir = () => {
  if (!fs.existsSync(COOKIES_DIR)) {
    fs.mkdirSync(COOKIES_DIR, { recursive: true });
  }
};

// ✅ Normalize cookies for Playwright
const normalizeCookies = (cookies) => {
  return cookies.map((cookie) => {
    if (!["Strict", "Lax", "None"].includes(cookie.sameSite)) {
      cookie.sameSite = "None"; // safe default
    }
    return cookie;
  });
};

// ✅ Save cookies
const saveCookiesToStorage = async (context, email) => {
  try {
    const cookies = await context.cookies();
    const facebookCookies = cookies.filter((c) =>
      c.domain.includes("facebook.com")
    );

    if (facebookCookies.length === 0) return;

    ensureCookiesDir();
    const cookiePath = getCookiePath(email);
    fs.writeFileSync(cookiePath, JSON.stringify(facebookCookies, null, 2));
    console.log(`🍪 Saved ${facebookCookies.length} cookies for ${email}`);
  } catch (error) {
    console.warn("⚠️ Failed to save cookies:", error.message);
  }
};

// ✅ Load cookies
const loadCookiesFromStorage = async (context, email) => {
  try {
    const cookiePath = getCookiePath(email);
    if (!fs.existsSync(cookiePath)) {
      console.log(`[DEBUG] No cookie file found at ${cookiePath}`);
      return false;
    }

    const cookiesData = fs.readFileSync(cookiePath, "utf8");
    const cookies = JSON.parse(cookiesData);

    if (!cookies || cookies.length === 0) {
      console.log('[DEBUG] Cookie file is empty or invalid');
      return false;
    }

    const now = Date.now() / 1000;
    const validCookies = cookies.filter(
      (cookie) => !cookie.expires || cookie.expires > now
    );

    console.log(`[DEBUG] Loaded ${cookies.length} cookies from file, ${validCookies.length} are valid (not expired)`);
    validCookies.forEach(c => {
      if (c.expires) {
        console.log(`[DEBUG] Cookie ${c.name} expires at ${new Date(c.expires * 1000).toISOString()} (now: ${new Date(now * 1000).toISOString()})`);
      }
    });

    if (validCookies.length === 0) {
      console.log('[DEBUG] No valid cookies after expiration check');
      return false;
    }

    const normalized = normalizeCookies(validCookies);
    await context.addCookies(normalized);

    console.log(`🍪 Applied ${normalized.length} valid cookies`);
    return true;
  } catch (error) {
    console.warn("⚠️ Failed to load cookies:", error.message);
    return false;
  }
};

// ✅ Check for valid FB session
const hasFacebookSession = async (context) => {
  try {
    const cookies = await context.cookies();
    const facebookCookies = cookies.filter((c) =>
      c.domain.includes("facebook.com")
    );

    const hasUserCookie = facebookCookies.some(
      (c) => c.name === "c_user" && c.value
    );
    const hasSessionCookie = facebookCookies.some(
      (c) => c.name === "xs" && c.value
    );

  console.log('🔍 Facebook cookies in context:', facebookCookies.map(c => ({ name: c.name, value: c.value, domain: c.domain, expires: c.expires })));
  console.log('🔍 hasUserCookie:', hasUserCookie, 'hasSessionCookie:', hasSessionCookie);

    if (!(hasUserCookie && hasSessionCookie)) {
      console.error('❌ Not logged in: missing c_user or xs cookie');
    }

    return hasUserCookie && hasSessionCookie;
  } catch (err) {
    console.error('❌ Error in hasFacebookSession:', err.message);
    return false;
  }
};

// 🔒 Detect checkpoint / 2FA
const detectChallenges = async (page) => {
  const content = await page.content();
  if (content.includes("checkpoint") || content.includes("two_factor")) {
    console.log("⚠️ Facebook is asking for checkpoint or 2FA");
    return true;
  }
  return false;
};

// ✅ Main login flow with cookie validation
export const ensureLoggedIn = async ({ page, context }) => {
  const credentials = {
    email: "airecuritement@gmail.com",
    password: "Varunsh@123",
  };

  const { email, password } = credentials;
  console.log(`🔑 Attempting login for: ${email}`);

  // Try loading cookies
  const cookiesLoaded = await loadCookiesFromStorage(context, email);

  if (cookiesLoaded) {
    await page.goto(FB.base, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(2000);

    const sessionOk = await hasFacebookSession(context);
    if (sessionOk) {
      console.log("✅ Already logged in via cookies!");
      await saveCookiesToStorage(context, email); // refresh
      return true;
    } else {
      console.error('❌ Login check failed after loading cookies.');
    }

    console.warn(
      "⚠️ Cookies expired or invalid → falling back to fresh login..."
    );
    await context.clearCookies();
  }

  // Fresh login
  console.log("🔐 Proceeding with fresh login...");
  await page.goto(FB.base, { waitUntil: "load", timeout: 30000 });

  const sessionOk2 = await hasFacebookSession(context);
  if (sessionOk2) {
    console.log("✅ Session already active, no login form needed");
    await saveCookiesToStorage(context, email);
    return true;
  } else {
    console.error('❌ Login check failed after fresh login page load.');
  }

  // Fill login form
  await page.locator(LoginSelectors.email).first().fill(email);
  await humanPause(800);
  await page.locator(LoginSelectors.password).first().fill(password);
  await humanPause(800);
  await page.locator(LoginSelectors.loginButton).first().click();

  await page.waitForTimeout(4000);

  if (await detectChallenges(page)) {
    console.log("⚠️ Challenge detected, waiting for manual completion...");
    console.log("🔧 Please complete the 2FA/checkpoint in the browser window");
    console.log("🔧 The automation will automatically continue once completed");

    // Wait up to 5 minutes for manual completion
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(10000); // Wait 10 seconds

      if (await hasFacebookSession(context)) {
        console.log("✅ Challenge completed, continuing...");
        break;
      }

      if (i === 29) {
        throw new Error("❌ 2FA timeout - please complete verification faster");
      }
    }
  }

  // Re-check session
  await page.goto(FB.base, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2000);

  const sessionOk3 = await hasFacebookSession(context);
  if (!sessionOk3) {
    console.error('❌ Login check failed after all login attempts.');
    throw new Error("❌ Login failed - no valid session found");
  }

  console.log("✅ Login successful!");
  await saveCookiesToStorage(context, email);
  return true;
};

// Export wrapper (for compatibility)
export const ensureLoggedInWithStore = async ({ page, context }) => {
  return ensureLoggedIn({ page, context });
};
