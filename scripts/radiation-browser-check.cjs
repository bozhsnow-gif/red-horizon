const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => graphics?.astronautView?.loaded, null, { timeout: 120000 });
    await page.click('#begin');
    await page.click('#intro-skip');
    await page.waitForFunction(() => !document.querySelector('#health-panel').hidden);
    assert.match(await page.locator('#health-exposure').textContent(), /ROVER SHIELDING/);
    assert.equal(await page.locator('#radiation-panel').isVisible(), false);
    await page.keyboard.press('f');
    await page.keyboard.press('Shift+1');
    await page.waitForFunction(() => !document.querySelector('#radiation-panel').hidden);
    assert.match(await page.locator('#health-exposure').textContent(), /EVA EXPOSURE/);
    const initial = await page.locator('#radiation-plastic').textContent();
    await page.evaluate(() => {
      RadiationHealth.advance(60, elapsed, true);
      elapsed += 60;
      render();
    });
    assert.notEqual(await page.locator('#radiation-plastic').textContent(), initial);
    assert(await page.evaluate(() => RadiationHealth.health < 100 && RadiationHealth.health > 99));
    const displayedHealth = Number(await page.locator('#health-bar').getAttribute('aria-valuenow'));
    assert(displayedHealth < 100 && displayedHealth > 99);
    await page.screenshot({ path: 'artifacts/radiation-monitor.png' });
    await page.evaluate(() => {
      elapsed = (30 - 9.25) * 60;
      render();
    });
    assert.match(await page.locator('#radiation-status').textContent(), /NO SOURCE DATA/);
    await page.keyboard.press('Shift+1');
    await page.waitForFunction(() => document.querySelector('#radiation-panel').hidden);
    assert.equal(await page.locator('#health-panel').isVisible(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      firstPerson = true;
      render();
    });
    for (const width of [390, 320, 768]) {
      await page.setViewportSize({ width, height: 844 });
      const box = await page.locator('#health-panel').boundingBox(),
        chartBox = await page.locator('#radiation-panel').boundingBox(),
        coordinatesBox = await page.locator('.coordinates').boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width);
      for (const other of [chartBox, coordinatesBox])
        assert(
          box.x + box.width <= other.x ||
            other.x + other.width <= box.x ||
            box.y + box.height <= other.y ||
            other.y + other.height <= box.y,
          `Health must not overlap the chart or coordinates at ${width}px`,
        );
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'artifacts/radiation-health-mobile.png' });
    await page.evaluate(() => {
      resetMission();
      render();
    });
    assert.equal(await page.locator('#health-value').textContent(), '100.0%');
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => graphics.gl.getError()), 0);
    console.log(
      'PASS radiation replay, cumulative health loss, persistent health HUD, reset and mobile layout',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
