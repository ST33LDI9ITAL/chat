import { chromium } from 'playwright';

const BASE = 'https://st33ldi9ital.github.io/chat';

async function run() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    const text = msg.text();
    // Filter to relevant logs
    if (text.includes('initApp') || text.includes('Msg rcvd') || text.includes('EVENT dedup') || 
        text.includes('Claimed') || text.includes('Owner loaded') || text.includes('REQ:') ||
        text.includes('_seenEvents') || text.includes('sent hello') ||
        text.includes('ws.onopen') || text.includes('decryptPayload')) {
      console.log(`  [${msg.type()}] ${text.substring(0, 200)}`);
    }
  });
  page.on('pageerror', err => console.log('  [PAGE_ERROR]', err.message.substring(0, 200)));

  // Track all messages in the page
  const getMsgCount = () => page.evaluate(() => {
    try {
      return document.querySelectorAll('[class*="break-words"]').length;
    } catch(e) { return -1; }
  });

  const log = (s) => console.log('=== ' + s + ' ===');

  // STEP 1: Open the app
  log('STEP 1: Open app');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  // STEP 2: Send a message to the personal room
  log('STEP 2: Send hello message');
  const input = page.locator('input[x-model="newMessageText"]');
  await input.fill('hello from playwright');
  await input.press('Enter');
  await page.waitForTimeout(3000);
  
  let count = await getMsgCount();
  console.log('Messages after sending:', count);

  // STEP 3: Hard refresh
  log('STEP 3: Hard refresh (Ctrl+Shift+R equivalent)');
  const url = page.url();
  // Clear cache and reload
  await page.evaluate(() => window.location.reload(true));
  await page.waitForTimeout(5000);

  count = await getMsgCount();
  console.log('Messages after hard refresh:', count);

  // STEP 4: Clear storage and refresh again
  log('STEP 4: Clear storage + refresh');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.evaluate(() => window.location.reload(true));
  await page.waitForTimeout(5000);

  count = await getMsgCount();
  console.log('Messages after clear + refresh:', count);

  await page.waitForTimeout(2000);
  await browser.close();
}

run().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
