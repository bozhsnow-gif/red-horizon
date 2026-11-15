'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./helpers/game.cjs');
const Health = require('../src/gameplay-health.js');

test('Radiation health thresholds and recovery are bounded game mechanics', () => {
  assert.equal(Health.advance(100, 50, false), 80);
  assert.equal(Health.advance(20, 10, true), 30);
  assert.equal(Health.advance(5, 500, false), 0);
  assert.equal(Health.advance(95, 50, true), 100);
  assert.deepEqual([100, 75, 45, 20, 0].map(Health.level), [
    'normal',
    'caution',
    'danger',
    'critical',
    'critical',
  ]);
});

test('EVA exposure warns, shelter requires open doors and restores gameplay health', () => {
  const game = createGame();
  game.evaluate(`running=true; missionIntro.completed=true;
    graphics.astronautView.rocketship={loaded:true,open:false,toggle(){this.open=!this.open;return this.open},reset(){this.open=false}};
    toggleAstronaut(); last=1000; tick(101000); updateUI();`);
  assert.equal(game.evaluate('astronautHealth'), 60);
  assert.match(game.element('#health-status').textContent, /CAUTION/);
  game.evaluate('toggleShelter()');
  assert.equal(game.evaluate('!!astronaut.sheltered'), false, 'distant astronauts cannot enter');
  game.evaluate(
    'astronaut.x=Gale.fromCoordinates(-4.5893,137.4406).x; astronaut.y=Gale.fromCoordinates(-4.5893,137.4406).y; toggleShelter()',
  );
  assert.equal(game.evaluate('!!astronaut.sheltered'), false, 'closed doors block shelter entry');
  game.evaluate('graphics.astronautView.rocketship.toggle(); toggleShelter()');
  assert.equal(game.evaluate('astronaut.sheltered'), true);
  assert.equal(game.evaluate('graphics.astronautView.rocketship.open'), false);
  assert.match(game.element('#health-status').textContent, /SHELTER/);
  const doseBefore = game.evaluate('RadiationHealth.doseMSv');
  const pos = game.evaluate('JSON.stringify({x:astronaut.x,y:astronaut.y})');
  game.evaluate('last=101000;keys.w=true;tick(111000);updateUI()');
  assert.equal(game.evaluate('astronautHealth'), 70);
  assert(game.evaluate('RadiationHealth.doseMSv') > doseBefore, 'shielded dose remains cumulative');
  assert.equal(game.evaluate('JSON.stringify({x:astronaut.x,y:astronaut.y})'), pos);
  game.evaluate('toggleAstronaut()');
  assert.equal(game.evaluate('astronaut.sheltered'), true, 'cannot board from inside the shelter');
  game.evaluate('toggleShelter()');
  assert.equal(game.evaluate('astronaut.sheltered'), false);
  assert.equal(game.evaluate('graphics.astronautView.rocketship.open'), true);
  game.evaluate('astronautHealth=15;updateUI()');
  assert.match(game.element('#health-status').textContent, /CRITICAL/);
  game.evaluate('init()');
  assert.equal(game.evaluate('astronautHealth'), 100);
});
