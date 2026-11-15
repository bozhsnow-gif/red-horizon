const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173');
    await page.click('#shield-open');
    assert(await page.locator('#shield-dialog').isVisible());
    assert(await page.locator('.charged-bent').first().isVisible());
    assert(!(await page.locator('.charged-straight').first().isVisible()));
    await page.uncheck('#shield-magnet');
    assert(!(await page.locator('.charged-bent').first().isVisible()));
    assert(await page.locator('.charged-straight').first().isVisible());
    await page.uncheck('#shield-water');
    assert(await page.locator('.neutron-through').first().isVisible());
    await page.screenshot({ path: 'artifacts/shield-visualization.png' });
    await page.keyboard.press('Escape');
    assert(!(await page.locator('#shield-dialog').isVisible()));
    assert.deepEqual(errors, []);
    console.log('PASS shield dialog and interactive layers');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
