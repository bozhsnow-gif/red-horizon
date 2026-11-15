'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGame, flush, sourceRoot } = require('./helpers/game.cjs');

test('Begin Exploring plays once, pauses the mission, and returns control on completion', async () => {
  const game = createGame(),
    run = game.evaluate;
  assert.equal(game.playCalls, 0);
  assert.equal(run('running'), false);
  await game.element('#intro-video').emit('error');
  assert.equal(run('running'), false, 'A preload error cannot start the mission');
  const start = run('JSON.stringify(rover)'),
    frames = run('graphics.frames');
  await game.element('#begin').click();
  await flush();
  assert.equal(game.playCalls, 1);
  assert.equal(run('missionIntro.active'), true);
  assert.equal(run('running'), false);
  assert.equal(game.element('#mission-intro').open, true);
  assert.equal(game.sandbox.document.body.style.overflow, 'hidden');
  await game.element('#begin').click();
  assert.equal(game.playCalls, 1, 'Repeated clicks must not restart the clip');
  run('keys={w:true};tick(5000)');
  assert.equal(run('JSON.stringify(rover)'), start);
  assert.equal(run('elapsed'), 0);
  assert.equal(run('graphics.frames'), frames, 'WebGL work is suspended during playback');
  await game.windowEvent('keydown', {
    code: 'Digit2',
    key: '@',
    shiftKey: true,
    target: game.element('#game'),
  });
  assert.equal(run('birdsEye'), false);
  await game.element('#intro-play').click();
  assert.equal(game.element('#intro-video').paused, true);
  await game.element('#intro-play').click();
  await flush();
  assert.equal(game.element('#intro-video').paused, false);
  await game.element('#intro-video').emit('ended');
  assert.equal(run('running'), true);
  assert.equal(run('missionIntro.active'), false);
  assert.equal(game.element('#mission-intro').open, false);
  assert.equal(game.focused, '#game');
  assert.equal(game.sandbox.document.body.style.overflow, 'auto');
  assert.equal(run('Object.keys(keys).length'), 0);
  assert(game.element('#start').classList.contains('hidden'));
  run('keys={w:true};tick(1017)');
  assert(run('rover.v') > 0);
  const plays = game.playCalls;
  await game.element('#reset').click();
  assert.equal(game.playCalls, plays, 'Mission reset does not replay the intro');
  assert.equal(run('rover.v'), 0);
  assert(Math.abs(run('Gale.coordinates(rover.x,rover.y).latitude') - -4.589466996) < 1e-9);
});

test('Skip and late media errors cannot leave the game blocked', async () => {
  const game = createGame();
  let rejectPlay;
  game.setPlay(() => new Promise((_, reject) => (rejectPlay = reject)));
  await game.element('#begin').click();
  await game.element('#intro-skip').click();
  rejectPlay(Object.assign(new Error('Interrupted'), { name: 'AbortError' }));
  await flush();
  assert.equal(game.evaluate('running'), true);
  assert.equal(game.evaluate('missionIntro.active'), false);
  await game.element('#intro-video').emit('error');
  assert.equal(game.evaluate('running'), true);
});

test('Browser gesture rejection offers a retry, and Escape safely skips', async () => {
  const game = createGame();
  game.setPlay(() =>
    Promise.reject(Object.assign(new Error('Gesture needed'), { name: 'NotAllowedError' })),
  );
  await game.element('#begin').click();
  await flush();
  assert.equal(game.evaluate('running'), false);
  assert.equal(game.element('#intro-play').hidden, false);
  assert.equal(game.focused, '#intro-play');
  game.setPlay(() => Promise.resolve());
  await game.element('#intro-play').click();
  await flush();
  assert.equal(game.element('#intro-video').paused, false);
  let cancelled = false;
  await game.element('#mission-intro').emit('cancel', {
    preventDefault() {
      cancelled = true;
    },
  });
  assert(cancelled);
  assert.equal(game.evaluate('running'), true);
});

test('Decode failure falls back to the rover with an explanation', async () => {
  const game = createGame();
  game.setPlay(() => Promise.reject(new Error('Decode failed')));
  await game.element('#begin').click();
  await flush();
  assert.equal(game.evaluate('running'), true);
  assert.match(game.element('#toast').textContent, /INTRO UNAVAILABLE/);
});

test('Native dialog closure and unavailable modal APIs cannot strand the mission', async () => {
  const closed = createGame();
  await closed.element('#begin').click();
  await flush();
  closed.element('#mission-intro').close();
  assert.equal(closed.evaluate('running'), true);
  assert.equal(closed.evaluate('missionIntro.active'), false);
  const unsupported = createGame();
  unsupported.element('#mission-intro').showModal = () => {
    throw new Error('No dialog API');
  };
  await unsupported.element('#begin').click();
  assert.equal(unsupported.evaluate('running'), true);
  assert.equal(unsupported.sandbox.document.body.style.overflow, 'auto');
});

test('A stale play rejection cannot override a newer playback attempt', async () => {
  const game = createGame();
  let rejectFirst;
  game.setPlay(() => new Promise((_, reject) => (rejectFirst = reject)));
  await game.element('#begin').click();
  game.setPlay(() => Promise.resolve());
  await game.evaluate('missionIntro.play()');
  await flush();
  rejectFirst(new Error('Old decode attempt'));
  await flush();
  assert.equal(game.evaluate('missionIntro.active'), true);
  assert.equal(game.evaluate('running'), false);
  assert.equal(game.element('#intro-video').paused, false);
});

test('Required intro media is packaged beside the source', () => {
  for (const file of ['intro.js', 'intro.css', 'intro.mp4', 'intro-background.png'])
    assert(fs.statSync(path.join(sourceRoot, file)).size > 0);
  const video = fs.readFileSync(path.join(sourceRoot, 'intro.mp4'));
  assert.equal(video.toString('ascii', 4, 8), 'ftyp');
  assert.equal(video.toString('ascii', 8, 12), 'mp42');
});
