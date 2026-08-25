const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'qa-map-refined.png', fullPage: true });
  await page.getByText('卫星参照').click();
  await page.locator('.timeline-track .year-node').nth(1).click();
  await page.getByText('旧址见证建筑群').first().click();
  await page.goto('http://127.0.0.1:5173/me', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'qa-me-refined.png', fullPage: true });
  await page.goto('http://127.0.0.1:5173/admin/dashboard', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'qa-admin-refined.png', fullPage: true });
  await browser.close();
  console.log(JSON.stringify({ errors: errors.slice(0, 5) }));
})();

