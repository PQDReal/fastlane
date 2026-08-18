import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const apiUrls = new Set();
  
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('omapi.vinfastauto.com')) {
      apiUrls.add(url);
      console.log('Found API:', url);
      // Try to get JSON body to understand structure
      if (response.request().resourceType() === 'fetch' || response.request().resourceType() === 'xhr') {
        try {
          const json = await response.json();
          fs.writeFileSync(`scripts/api_${url.replace(/[^a-zA-Z0-9]/g, '_')}.json`, JSON.stringify(json, null, 2));
        } catch (e) {}
      }
    }
  });

  await page.goto('https://om.vinfastauto.com/', { waitUntil: 'networkidle' });
  
  // Wait a bit to let it load
  await page.waitForTimeout(5000);

  fs.writeFileSync('scripts/api_urls.txt', Array.from(apiUrls).join('\n'));
  
  await browser.close();
})();
