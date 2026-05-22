const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const extensionPath = path.resolve('/Users/sc/github/sc/browser-zzz/.output/chrome-mv3');
  console.log("Building extension...");
  const { execSync } = require('child_process');
  execSync('npm run build', { cwd: '/Users/sc/github/sc/browser-zzz', stdio: 'inherit' });

  console.log("Launching browser with extension...");
  const browserContext = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  const page = await browserContext.newPage();
  await page.goto('chrome://extensions');
  
  // Try finding background page
  let background = browserContext.backgroundPages()[0];
  let extensionId;
  if (background) {
    extensionId = background.url().split('/')[2];
  } else {
    // If mv3, there might be a service worker instead
    let sw = browserContext.serviceWorkers()[0];
    if (sw) {
      extensionId = sw.url().split('/')[2];
    } else {
      sw = await browserContext.waitForEvent('serviceworker');
      extensionId = sw.url().split('/')[2];
    }
  }
  
  const sidepanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
  console.log(`Navigating to ${sidepanelUrl}`);
  await page.goto(sidepanelUrl);
  
  // Wait to render
  await page.waitForTimeout(3000);
  
  const html = await page.evaluate(() => document.body.innerHTML);
  fs.writeFileSync('/Users/sc/github/sc/browser-zzz/sidepanel_dom.html', html);
  console.log("DOM saved to sidepanel_dom.html");
  
  await browserContext.close();
})();
