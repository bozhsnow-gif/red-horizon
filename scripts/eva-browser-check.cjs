const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const assert = require('node:assert/strict');
(async () => {
  const server = spawn(process.execPath, ['scripts/serve.cjs'], {
    env: { ...process.env, PORT: '4197' },
    windowsHide: true,
  });
  let browser;
  try {
    await new Promise((r) => server.stdout.once('data', r));
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.on('response', (r) => {
      if (r.status() >= 400) console.log(r.status(), r.url());
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('CONSOLE', m.text());
    });
    await page.goto('http://127.0.0.1:4197');
    await page.waitForTimeout(3000);
    console.log(
      await page.evaluate(() => ({
        data: { ...document.documentElement.dataset },
        view: !!graphics?.astronautView,
        module: !!window.AstronautView,
      })),
    );
    await page.waitForFunction(() => document.documentElement.dataset.astronaut === 'ready', null, {
      timeout: 15000,
    });
    console.log('loaded');
    await page.click('#begin');
    await page.click('#intro-skip');
    await page.keyboard.press('f');
    await page.waitForFunction(() => astronaut !== null);
    console.log(
      await page.evaluate(() => ({
        state: astronaut.state,
        bounds: graphics.astronautView.model.scale.x,
        gl: graphics.gl.getError(),
      })),
    );
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => graphics.astronautView.state === 'Walk');
    console.log('WALK CONFIRMED', await page.evaluate(() => graphics.astronautView.action.time));
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowUp');
    await page.screenshot({ path: 'artifacts/astronaut-walk.png' });
    console.log(
      await page.evaluate(() => ({
        state: astronaut.state,
        view: graphics.astronautView.state,
        gl: graphics.gl.getError(),
        x: astronaut.x,
      })),
    );
    await page.keyboard.press('Space');
    await page.waitForFunction(() => graphics.astronautView.state === 'Jump');
    console.log(
      'jump',
      await page.evaluate(() => ({
        state: astronaut.state,
        view: graphics.astronautView.state,
        gl: graphics.gl.getError(),
      })),
    );
    await page.screenshot({ path: 'artifacts/astronaut-jump.png' });
    await page.waitForFunction(() => !astronaut.airborne, null, { timeout: 30000 });
    await page.keyboard.press('ArrowUp');
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => graphics.astronautView.state === 'Run');
    console.log('RUN CONFIRMED');
    await page.keyboard.up('ArrowUp');
    await page.evaluate(() => {
      const r = rocks.find((r) => r.r <= 12);
      astronaut.x = r.x;
      astronaut.y = r.y;
      astronaut.z = graphics.surface(r.x, r.y);
    });
    await page.keyboard.press('p');
    await page.waitForFunction(() => graphics.astronautView.state === 'Pick Up');
    console.log('PICKUP CONFIRMED');
    await page.waitForFunction(() => rockSamples === 1);
    console.log('ROCK COLLECTED');
    await page.evaluate(() => {
      astronaut.x = rover.x + 70;
      astronaut.y = rover.y;
    });
    await page.keyboard.press('f');
    await page.waitForFunction(() => astronaut === null);
    assert.equal(await page.evaluate(() => graphics.gl.getError()), 0);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: animated walk, run, jump, pickup, collection, boarding and shared WebGL depth.',
    );
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
