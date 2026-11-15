const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log(m.text());
    });
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.documentElement.dataset.laboratory === 'ready',
      null,
      { timeout: 90000 },
    );
    await page.click('#begin');
    await page.click('#intro-skip');
    await page.evaluate(() => {
      orbitZoom = 1800;
      graphics.zoom = 1800;
      orbitPitch = -0.3;
      graphics.pitch = -0.3;
    });
    await page.waitForTimeout(1000);
    const result = await page.evaluate(() => {
      const l = graphics.astronautView.laboratory,
        p = Gale.spawnPoint;
      return {
        distance: Math.hypot(l.worldPosition.x - p.x, l.worldPosition.y - p.y) / Gale.unitsPerMeter,
        parts: l.root.children.length,
        size: l.sizeMeters.toArray(),
        contacts: l.groundContacts.length,
        contactError: Math.max(
          ...l.groundContacts.map(([x, y, z]) =>
            Math.abs(
              Gale.height(
                l.worldPosition.x + x * Gale.unitsPerMeter,
                l.worldPosition.y + y * Gale.unitsPerMeter,
              ) -
                Gale.height(l.worldPosition.x, l.worldPosition.y) -
                (z + 0.025) * Gale.unitsPerMeter,
            ),
          ),
        ),
        gl: graphics.gl.getError(),
      };
    });
    console.log(result);
    assert.equal(result.distance, 20);
    assert(result.contacts > 0);
    assert(result.contactError < 0.001);
    assert.equal(result.gl, 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: 'artifacts/laboratory.png' });
    const closed = await page.evaluate(() =>
      graphics.astronautView.laboratory.movingNodes.map((n) => n.quaternion.toArray()),
    );
    await page.keyboard.press('g');
    await page.evaluate(() => {
      const lab = graphics.astronautView.laboratory;
      for (let i = 0; i < 55; i++) lab.update([0, 0, 0], 0.05);
      render();
    });
    const opened = await page.evaluate(() =>
      graphics.astronautView.laboratory.movingNodes.map((n) => n.quaternion.toArray()),
    );
    assert.equal(opened.length, 3);
    for (let i = 0; i < 3; i++) assert.notDeepEqual(opened[i], closed[i]);
    await page.screenshot({ path: 'artifacts/laboratory-doors-open.png' });
    await page.keyboard.press('g');
    await page.evaluate(() => {
      const lab = graphics.astronautView.laboratory;
      for (let i = 0; i < 55; i++) lab.update([0, 0, 0], 0.05);
      render();
    });
    const returned = await page.evaluate(() =>
      graphics.astronautView.laboratory.movingNodes.map((n) => n.quaternion.toArray()),
    );
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 4; k++) assert(Math.abs(returned[i][k] - closed[i][k]) < 0.0001);
    assert.deepEqual(errors, []);
    console.log(
      'PASS laboratory20m placement, three animated hinges, G open/close and pose restoration',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
