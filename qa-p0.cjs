const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'qa-map-p0-mapbox.png', fullPage: false });
  const result = await page.evaluate(() => ({
    canvasCount: document.querySelectorAll('canvas').length,
    hasMapStyle: document.body.innerText.includes('地图样式'),
    hasWeather: document.body.innerText.includes('18°C') || document.body.innerText.includes('多云'),
    hasMeasure: document.body.innerText.includes('测量工具'),
    text: document.body.innerText.slice(0, 500)
  }));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
