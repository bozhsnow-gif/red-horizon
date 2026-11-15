'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, flush } = require('./helpers/game.cjs');
async function begin(game) {
  await game.element('#begin').click();
  await flush();
  await game.element('#intro-skip').click();
}
function key(game, code, value, extra = {}) {
  return { code, key: value, target: game.element('#game'), repeat: false, ...extra };
}

test('UI actions cannot bypass the intro before the first mission', async () => {
  for (const id of ['#reset', '#travel-summit', '#landing-view']) {
    const game = createGame();
    const before = game.evaluate('JSON.stringify(rover)');
    await game.element(id).click();
    await flush();
    assert.equal(game.evaluate('missionIntro.active'), true, id);
    assert.equal(game.evaluate('running'), false);
    assert.equal(game.evaluate('JSON.stringify(rover)'), before);
    await game.element('#intro-skip').click();
    assert.equal(game.evaluate('running'), true);
    if (id === '#travel-summit')
      assert.equal(
        game.evaluate('rover.x'),
        game.evaluate('Gale.mapPoint(...Gale.locations.summit).x'),
      );
    if (id === '#landing-view')
      assert.equal(game.evaluate('firstPerson&&graphics.referenceCamera'), true);
  }
});

test('Physical movement keys release correctly when Shift changes', async () => {
  const game = createGame();
  await game.windowEvent('keydown', key(game, 'KeyW', 'w'));
  assert.equal(game.evaluate('Object.keys(keys).length'), 0, 'No driving before Begin');
  await begin(game);
  await game.windowEvent('keydown', key(game, 'KeyW', 'W', { shiftKey: true }));
  assert.equal(game.evaluate('keys.w'), true);
  await game.windowEvent('keyup', key(game, 'KeyW', 'w'));
  assert.equal(game.evaluate('keys.w'), false);
  assert.equal(game.evaluate('keys.W'), undefined);
  await game.windowEvent(
    'keydown',
    key(game, 'KeyW', 'w', { target: game.element('#nasa-files') }),
  );
  assert.equal(game.evaluate('keys.w'), false, 'Typing in a file/input control does not drive');
  await game.windowEvent(
    'keydown',
    key(game, 'Digit2', '@', { shiftKey: true, target: game.element('#reset') }),
  );
  assert.equal(
    game.evaluate('birdsEye'),
    false,
    'Button keyboard activation does not change camera',
  );
});

test('Browser Ctrl, Command and Alt shortcuts are not intercepted as driving input', async () => {
  const game = createGame();
  await begin(game);
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    let prevented = false;
    await game.windowEvent(
      'keydown',
      key(game, 'KeyW', 'w', {
        [modifier]: true,
        preventDefault() {
          prevented = true;
        },
      }),
    );
    assert.equal(prevented, false, modifier);
    assert.equal(game.evaluate('keys.w'), undefined, modifier);
  }
});

test('Blur, hidden tabs, form focus and touch cancellation clear movement', async () => {
  const game = createGame();
  await begin(game);
  for (const event of ['blur', 'visibilitychange', 'focusin']) {
    game.evaluate('keys={w:true};graphics.flight={velocity:[1,2,3]};lookDrag={x:2,y:3}');
    if (event === 'blur') await game.windowEvent(event);
    else if (event === 'visibilitychange') {
      game.sandbox.document.hidden = true;
      await game.documentEvent(event);
    } else await game.documentEvent(event, { target: game.element('#nasa-files') });
    assert.equal(game.evaluate('Object.keys(keys).length'), 0, event);
    assert.equal(game.evaluate('lookDrag'), null);
    assert.equal(game.evaluate('JSON.stringify(graphics.flight.velocity)'), '[0,0,0]');
  }
  const button = game.touchButtons.find((b) => b.dataset.key === 'ArrowUp');
  await button.emit('pointerdown', { pointerId: 1 });
  assert.equal(game.evaluate('keys.ArrowUp'), true);
  await button.emit('lostpointercapture');
  assert.equal(game.evaluate('keys.ArrowUp'), false);
});

test('Reset restores spawn, camera, route, samples and displayed driving mode', async () => {
  const game = createGame();
  await begin(game);
  assert.equal(game.element('#drive-mode').textContent, 'EXPLORATION');
  assert.equal(game.element('#drive-mode').getAttribute('aria-pressed'), 'false');
  assert.match(game.element('#mode-note').textContent, /Fast travel/);
  await game.element('#drive-mode').click();
  assert.equal(game.evaluate('simulationMode'), true);
  assert.equal(game.element('#drive-mode').getAttribute('aria-pressed'), 'true');
  game.evaluate(
    'firstPerson=true;birdsEye=true;freeFlight=true;orbitYaw=2;orbitPitch=.4;orbitZoom=50000;climbIndex=3;WaypointRoute.mode="route";collected=2;rover.v=50;graphics.yaw=2;graphics.pitch=.4;graphics.zoom=50000',
  );
  await game.element('#reset').click();
  assert(
    game.evaluate(
      '!firstPerson&&!birdsEye&&!freeFlight&&orbitYaw===0&&orbitPitch===0&&orbitZoom===185',
    ),
  );
  assert(
    game.evaluate(
      'graphics.yaw===0&&graphics.pitch===0&&graphics.zoom===185&&!graphics.referenceCamera',
    ),
  );
  assert.equal(game.evaluate('WaypointRoute.mode'), 'nearby');
  assert.equal(game.evaluate('climbIndex'), 0);
  assert.equal(game.evaluate('collected'), 0);
  assert.equal(game.evaluate('rover.v'), 0);
  assert.equal(game.evaluate('Gale.coordinates(rover.x,rover.y).longitude'), 137.4);
  assert.equal(
    game.element('#drive-mode').textContent,
    'SIMULATION',
    'Reset keeps the selected driving mode and its label in sync',
  );
});

test('Camera shortcuts, trackpad pinch and double Space preserve a parked rover', async () => {
  const game = createGame();
  await begin(game);
  const before = game.evaluate('JSON.stringify(rover)');
  await game.windowEvent('keydown', key(game, 'Digit2', '@', { shiftKey: true }));
  assert(game.evaluate('birdsEye&&orbitZoom===Gale.overviewZoom'));
  await game.element('#game').emit('dblclick');
  assert.equal(game.evaluate('orbitZoom'), game.evaluate('Gale.overviewZoom'));
  await game.windowEvent('keydown', key(game, 'Digit1', '!', { shiftKey: true }));
  assert(game.evaluate('firstPerson&&!birdsEye&&orbitZoom===185'));
  await game
    .element('#game')
    .emit('wheel', { ctrlKey: true, deltaY: -20, deltaX: 0, deltaMode: 0 });
  assert(game.evaluate('orbitZoom>185'), 'The requested spread gesture zooms out');
  await game.element('#game').emit('wheel', { ctrlKey: true, deltaY: 20, deltaX: 0, deltaMode: 0 });
  assert(Math.abs(game.evaluate('orbitZoom') - 185) < 1e-9);
  await game
    .element('#game')
    .emit('wheel', { ctrlKey: false, deltaY: 5, deltaX: 20, deltaMode: 0 });
  assert.notEqual(game.evaluate('orbitYaw'), 0);
  game.setTime(2000);
  await game.windowEvent('keydown', key(game, 'Space', ' '));
  game.setTime(2150);
  await game.windowEvent('keydown', key(game, 'Space', ' '));
  assert.equal(game.evaluate('freeFlight'), true);
  assert.equal(game.evaluate('JSON.stringify(rover)'), before);
});

test('Only the next checkpoint counts, and flying never completes a driving checkpoint', () => {
  const game = createGame();
  assert.equal(game.evaluate('WaypointRoute.advance([{x:100,y:0}],0,{x:0,y:0},{x:200,y:0},10)'), 1);
  assert.equal(
    game.evaluate('WaypointRoute.advance([{x:100,y:30}],0,{x:0,y:0},{x:200,y:0},10)'),
    0,
  );
  game.evaluate(
    'running=true;freeFlight=true;rover.x=Gale.climbRoute[0].x;rover.y=Gale.climbRoute[0].y;tick(1017)',
  );
  assert.equal(game.evaluate('climbIndex'), 0);
  game.evaluate('freeFlight=false;tick(1034)');
  assert.equal(game.evaluate('climbIndex'), 1);
  game.evaluate(
    'init();running=true;rover.x=Gale.climbRoute[1].x;rover.y=Gale.climbRoute[1].y;tick(1051)',
  );
  assert.equal(game.evaluate('climbIndex'), 0);
});
