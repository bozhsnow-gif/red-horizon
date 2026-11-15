const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 780 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => graphics?.routeMesh && graphics?.routeDetailMesh, null, {
      timeout: 60000,
    });
    await page.click('#begin');
    await page.click('#intro-skip');
    console.log(
      'landing',
      await page.evaluate(() => ({
        elevation: Gale.elevationMeters(rover.x, rover.y),
        gl: graphics.gl.getError(),
        coarse: graphics.routeMesh.count,
        fine: graphics.routeDetailMesh.count,
      })),
    );
    await page.keyboard.press('Shift+1');
    await page.waitForTimeout(1000);
    await page.screenshot({path:'artifacts/mars-ground.png'});
    await page.keyboard.press('Shift+1');
    await page.evaluate(() => {
      const p = Gale.fromCoordinates(-4.8, 137.38);
      rover.x = p.x;
      rover.y = p.y;
      rover.a = 2.2;
      graphics.resetPose();
      orbitZoom = 40000;
      orbitPitch = -0.35;
      graphics.zoom = 40000;
      graphics.pitch = -0.35;
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'artifacts/route-ridges.png' });
    assert.equal(await page.evaluate(() => graphics.gl.getError()), 0);
    assert.deepEqual(errors, []);
    console.log('PASS route DEM rendering, terrain travel and WebGL');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
