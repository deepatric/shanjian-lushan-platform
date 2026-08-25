const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const results = [];
  page.on('console', msg => { if (msg.type() === 'error') results.push(`console:${msg.text()}`); });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'qa-map-page.png', fullPage: true });
  await page.getByText('卫星参照').click();
  await page.getByRole('button', { name: /交通线隐蔽转移/ }).click();
  await page.getByText('旧址见证建筑群').first().click();
  results.push(`map-title=${await page.getByText('旧址见证建筑群').count()}`);
  await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'qa-login-page.png', fullPage: true });
  await page.goto('http://127.0.0.1:5173/me', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'qa-me-page.png', fullPage: true });
  await page.goto('http://127.0.0.1:5173/admin/dashboard', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'qa-admin-dashboard.png', fullPage: true });
  await page.goto('http://127.0.0.1:5173/admin/review', { waitUntil: 'networkidle' });
  await page.getByText('通过').first().click();
  await page.screenshot({ path: 'qa-admin-review.png', fullPage: true });
  await browser.close();
  console.log(results.join('\n'));
})();

