// @ts-check
import { test } from '@playwright/test';

test('open facebook and wait until closed', async ({ page }) => {
  // Open Facebook
  await page.goto('https://facebook.com/');

  console.log("✅ Facebook is open. Close the browser window manually to end the test.");

  // Keep the browser open indefinitely until you close it
  await page.waitForEvent('close');
});
