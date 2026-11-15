const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173');
    await page.waitForFunction(() => graphics?.routeDetailMesh, {}, { timeout: 90000 });
    await page.click('#begin');
    await page.click('#intro-skip');
    const result = await page.evaluate(() => {
      const d = GroundIndents.cell(-4, -2) || GroundIndents.cell(-5, -2);
      if (!d) throw Error('Expected deterministic indent');
      rover.x = Gale.spawnPoint.x + d.x * Gale.unitsPerMeter;
      rover.y = Gale.spawnPoint.y + d.y * Gale.unitsPerMeter;
      rover.a = 0;
      orbitZoom = 500;
      graphics.zoom = 500;
      orbitPitch = -0.3;
      graphics.pitch = -0.3;
      graphics.referenceCamera = false;
      graphics.resetPose();
      render();
      return {
        depth: -GroundIndents.offset(rover.x, rover.y) / Gale.unitsPerMeter,
        gl: graphics.gl.getError(),
      };
    });
    assert(result.depth >= 0.2 && result.depth <= 0.45);
    assert.equal(result.gl, 0);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'artifacts/ground-indents.png' });
    assert.deepEqual(errors, []);
    console.log('PASS indent geometry and WebGL', result);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
