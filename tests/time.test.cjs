'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./helpers/game.cjs');

test('Mars clock displays selected time and illustrative day and night', async () => {
  const game = createGame();
  const slider = game.element('#time-slider');
  assert.equal(game.element('#mars-clock').textContent, '12:00');
  slider.value = '0';
  await slider.emit('input');
  assert.equal(game.element('#mars-clock').textContent, '00:00');
  assert.match(game.element('#time-phase').textContent, /NIGHT/);
  assert(Number(game.element('#night-overlay').style.opacity) > 0);
  slider.value = '720';
  await slider.emit('input');
  assert.equal(game.element('#mars-clock').textContent, '12:00');
  assert.match(game.element('#time-phase').textContent, /DAY/);
  assert.equal(Number(game.element('#night-overlay').style.opacity), 0);
  game.evaluate('marsTimeMinutes = 1439.9; running = true; tick(1020)');
  assert(game.evaluate('marsTimeMinutes') < 1440);
});

test('Mars clock advances one game minute per second, including at a low frame rate', () => {
  const game = createGame();
  game.evaluate('running=true; last=1000; tick(61000)');
  assert.equal(game.evaluate('marsTimeMinutes'), 780);
  game.evaluate('last=61000; tick(1441000)');
  assert.equal(game.evaluate('marsTimeMinutes'), 720);
  assert.equal(game.evaluate('elapsed'), 1440);
  game.evaluate('updateUI()');
  assert.equal(game.element('#sol').textContent, '002');
  game.evaluate('running=false; last=1441000; tick(1501000)');
  assert.equal(game.evaluate('marsTimeMinutes'), 720);
});
