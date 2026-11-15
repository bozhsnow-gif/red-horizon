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
    await page.waitForFunction(
      () => document.documentElement.dataset.rocketship === 'ready',
      null,
      { timeout: 120000 },
    );
    await page.click('#begin');
    await page.click('#intro-skip');
    const result = await page.evaluate(() => {
      orbitZoom = 1800;
      graphics.zoom = 1800;
      orbitPitch = -0.3;
      graphics.pitch = -0.3;
      render();
      const r = graphics.astronautView.rocketship,
        p = Gale.spawnPoint;
      return {
        distance: Math.hypot(r.worldPosition.x - p.x, r.worldPosition.y - p.y) / Gale.unitsPerMeter,
        east: (r.worldPosition.x - p.x) / Gale.unitsPerMeter,
        south: (r.worldPosition.y - p.y) / Gale.unitsPerMeter,
        coordinates: Gale.coordinates(r.worldPosition.x, r.worldPosition.y),
        size: r.sizeMeters.toArray(),
        clips: r.actions.length,
        contacts: r.groundContacts.length,
        scale: r.root.scale.x / Gale.unitsPerMeter,
        contactError: Math.max(
          ...r.groundContacts.map(([x, y, z]) =>
            Math.abs(
              Gale.height(
                r.worldPosition.x - x * r.root.scale.x,
                r.worldPosition.y - y * r.root.scale.x,
              ) -
                Gale.height(r.worldPosition.x, r.worldPosition.y) -
                z * r.root.scale.x -
                0.025 * Gale.unitsPerMeter,
            ),
          ),
        ),
        gl: graphics.gl.getError(),
      };
    });
    console.log(result);
    assert(Math.abs(result.coordinates.latitude + 4.5893) < 1e-9);
    assert(Math.abs(result.coordinates.longitude - 137.4406) < 1e-9);
    assert.equal(result.clips, 1);
    assert.equal(result.scale, 3);
    assert(result.contacts > 0 && result.contactError < 0.001);
    assert.equal(result.gl, 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: 'artifacts/rocketship.png' });
    console.log('PASS rocketship load and placement');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
