// utils/browser-config.js - Improved version
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __fileName = fileURLToPath(import.meta.url);
const __dirName = path.dirname(__fileName);

const AUTH_DIR = path.resolve(__dirName, '../../../.auth/chromium-web');

export const launchWeb = async ({ headless = true, slowMo = 360 } = {}) => {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(AUTH_DIR, {
    headless,
    slowMo,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    locale: "en-US",
    ignoreHTTPSErrors: true,
    permissions: [] // don't grant any notifications
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  
  // Add error handlers
  page.on('error', (error) => {
    console.log('Page error:', error.message);
  });
  
  page.on('pageerror', (error) => {
    console.log('Page JavaScript error:', error.message);
  });
  
  return { context, page };
};

export const tearDown = async (context) => {
  try {
    if (context && !context.isClosed && typeof context.close === 'function') {
      await context.close();
      console.log('✅ Browser context closed successfully');
    }
  } catch (error) {
    console.log('⚠️ Error closing browser context (this is usually fine):', error.message);
  }
};

export const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export const randomBetween = (min, max) => 
    Math.floor(Math.random() * (max - min)) + min;

export const humanPause = async (min = 250, max = 600) => {
    await sleep(randomBetween(min, max))
}