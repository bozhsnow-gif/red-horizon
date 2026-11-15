'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const artifactDir = path.join(root, 'artifacts');
fs.mkdirSync(artifactDir, { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.cjs'], {
  cwd: root,
  env: { ...process.env, PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let browser;
async function run() {
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview server startup timed out')), 15000);
    server.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    server.once('error', reject);
    server.once('exit', (code) => {
      if (code) reject(new Error(`Preview server exited: ${code}`));
    });
  });
  const installedChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const executablePath =
    process.env.BROWSER_PATH || (fs.existsSync(installedChrome) ? installedChrome : undefined);
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(address, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'ready', null, {
    timeout: 30000,
  });
  assert.equal(await page.evaluate('running'), false);
  const spawnPosition = await page.evaluate('({x:rover.x,y:rover.y})');
  const image = await page.evaluate(async () => {
    const i = new Image();
    i.src = 'intro-background.png';
    await i.decode();
    return [i.naturalWidth, i.naturalHeight];
  });
  assert(image[0] > 1000 && image[1] > 500);
  await page.click('#begin');
  await page.waitForFunction(() => document.querySelector('#intro-video').currentTime > 0.8, null, {
    timeout: 15000,
  });
  assert.equal(await page.evaluate('running'), false);
  await page.click('#intro-play');
  assert.equal(await page.$eval('#intro-video', (v) => v.paused), true);
  await page.screenshot({ path: path.join(artifactDir, 'intro.png') });
  await page.keyboard.press('Shift+2');
  assert.equal(await page.evaluate('birdsEye'), false);
  assert.deepEqual(await page.evaluate('({x:rover.x,y:rover.y})'), spawnPosition);
  await page.click('#intro-play');
  await page.waitForFunction('running && !missionIntro.active', null, { timeout: 20000 });
  assert.equal(await page.$eval('#mission-intro', (d) => d.open), false);
  await page.keyboard.down('w');
  await page.waitForFunction('rover.v > 0');
  await page.keyboard.up('w');
  await page.keyboard.press('Shift+1');
  assert.equal(await page.evaluate('firstPerson'), true);
  await page.keyboard.press('Shift+2');
  assert.equal(await page.evaluate('birdsEye && !firstPerson'), true);
  await page.click('#reset');
  assert.deepEqual(await page.evaluate('({x:rover.x,y:rover.y})'), spawnPosition);
  assert.equal(await page.evaluate('birdsEye || firstPerson || freeFlight'), false);
  assert.equal(
    await page.$eval('#game', (canvas) => {
      const r = canvas.getBoundingClientRect();
      return r.top >= -1 && r.bottom <= innerHeight + 1;
    }),
    true,
    'Reset must bring the game back into view',
  );
  await page.screenshot({ path: path.join(artifactDir, 'rover.png') });
  assert.equal(await page.evaluate('graphics.gl.getError()'), 0, 'WebGL reported an error');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'ready');
  await page.click('#begin');
  await page.click('#intro-skip');
  assert.equal(await page.evaluate('running && !missionIntro.active'), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#game').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifactDir, 'mobile.png') });
  assert.equal(
    await page.evaluate('document.documentElement.scrollWidth > innerWidth'),
    false,
    'Mobile layout has horizontal overflow',
  );
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  console.log(
    'PASS: real Chromium/WebGL startup, video decode and completion, generated backdrop, pause/resume, intro input lock, driving, cameras, reset, Skip and mobile layout.',
  );
  console.log('Screenshots: artifacts/intro.png, artifacts/rover.png, artifacts/mobile.png');
}
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    server.kill();
  });
