'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./helpers/game.cjs');

test('Terrain, coordinates, wheel contact and GPU motion agree', async (t) => {
  const game = createGame({ renderer: true }),
    run = game.evaluate;
  assert.equal(game.sandbox.document.documentElement.dataset.renderer, 'ready');
  await t.test('Fallback grid uses the source map scale and matches collision heights', () => {
    assert(Math.abs(run('GALE_TOPOGRAPHY.metersPerSourcePixel*112') - 50000) < 1e-8);
    for (const [ix, iy] of [
      [0, 0],
      [216, 195],
      [83, 50],
      [112, 109],
    ]) {
      const values = run(
        `(()=>{const m=GALE_TOPOGRAPHY,x=${ix}/(m.columns-1)*Gale.widthUnits,y=${iy}/(m.rows-1)*Gale.heightUnits;return [Gale.elevationMeters(x,y),m.heights[${iy}*m.columns+${ix}],graphics.surface(x,y),Gale.height(x,y)]})()`,
      );
      assert(Math.abs(values[0] - values[1]) < 1e-8);
      assert.equal(values[2], values[3]);
    }
    const geometry = run('buildMappedGround()');
    assert.equal(Object.prototype.toString.call(geometry), '[object Float32Array]');
    assert.equal(
      geometry.length / 9,
      run('(GALE_TOPOGRAPHY.columns-1)*(GALE_TOPOGRAPHY.rows-1)*6'),
    );
    for (let i = 0; i < geometry.length; i += 9 * 301) {
      const expected = run(`Gale.height(${geometry[i]},${geometry[i + 1]})`);
      assert(
        Math.abs(geometry[i + 2] - expected) < 0.3,
        'Mesh and collision differ only by Float32 upload quantization',
      );
    }
  });
  await t.test('Spawn, directions and inverse geographic conversion remain consistent', () => {
    const point = run('Gale.coordinates(rover.x,rover.y)');
    assert(Math.abs(point.latitude - -4.589466996) < 1e-9);
    assert(Math.abs(point.longitude - 137.441633) < 1e-9);
    for (const [lat, lon] of [
      [-4.6, 137.4],
      [-5.44, 137.7],
      [-6.1, 138.2],
    ]) {
      const result = run(
        `(()=>{const p=Gale.fromCoordinates(${lat},${lon});return Gale.coordinates(p.x,p.y)})()`,
      );
      assert(Math.abs(result.latitude - lat) < 1e-9);
      assert(Math.abs(result.longitude - lon) < 1e-9);
    }
    assert(run('Gale.coordinates(rover.x+100,rover.y).longitude>Gale.spawnCoordinates.longitude'));
    assert(run('Gale.coordinates(rover.x,rover.y+100).latitude<Gale.spawnCoordinates.latitude'));
    const max = run('Gale.drivingBounds.maxX');
    run('Gale.terrainScale=.7');
    assert(Math.abs(run('Gale.drivingBounds.maxX') - ((max + 30) * 0.7 - 30)) < 1e-7);
    run('Gale.terrainScale=1');
  });
  await t.test('Travel destinations keep each wheel touching the displayed terrain', () => {
    for (const name of ['landing', 'summit', 'rim']) {
      run(`travelTo('${name}');render()`);
      assert.equal(
        run('rover.x'),
        run(
          name === 'landing' ? 'Gale.spawnPoint.x' : `Gale.mapPoint(...Gale.locations.${name}).x`,
        ),
      );
      assert(
        run(
          'graphics.wheels.every(w=>Math.abs(graphics.surface(w.model[12],w.model[13])+w.radius*Math.sqrt(Math.max(0,1-w.model[2]**2))-w.model[14])<.2)',
        ),
      );
    }
  });
  await t.test(
    'Wheel motion is signed, stationary tires leave no marks, teleport leaves no connecting trail',
    () => {
      run('init();graphics.resetMotion();rover.a=0;graphics.pose(rover)');
      const idleCount = run('graphics.trackCount');
      run('graphics.pose(rover)');
      assert.equal(run('graphics.trackCount'), idleCount);
      run('rover.y-=10;graphics.pose(rover)');
      assert(run('graphics.wheels.every(w=>w.spin>0)'));
      assert(run('graphics.trackCount') > idleCount);
      run('rover.y+=10;graphics.pose(rover)');
      assert(run('graphics.wheels.every(w=>Math.abs(w.spin)<.01)'));
      const tracks = run('graphics.trackCount'),
        spins = run('JSON.stringify(graphics.wheels.map(w=>w.spin))');
      run('rover.x+=100000;graphics.pose(rover);graphics.pose(rover)');
      assert.equal(run('graphics.trackCount'), tracks);
      assert.equal(run('JSON.stringify(graphics.wheels.map(w=>w.spin))'), spins);
      run('graphics.resetPose();graphics.pose(rover)');
      assert.equal(run('graphics.trackCount'), tracks);
      run('graphics.resetMotion()');
      assert.equal(run('graphics.trackCount'), 0);
      assert(run('graphics.wheels.every(w=>w.spin===0&&w.previous===null&&w.stamp===null)'));
    },
  );
  await t.test(
    'Settling chassis invalidates the rover shadow without redrawing an identical pose',
    () => {
      run(
        'init();graphics.pose(rover);globalThis.shadowTestModel=graphics.pose(rover);globalThis.shadowTestLight=transform(0,0,0,0);graphics.lastShadow=""',
      );
      const before = game.draws.length;
      run('graphics.renderShadow(shadowTestModel,shadowTestLight)');
      assert(game.draws.length > before);
      const after = game.draws.length;
      run('graphics.renderShadow(shadowTestModel,shadowTestLight)');
      assert.equal(game.draws.length, after);
      run('shadowTestModel[14]+=.5;graphics.renderShadow(shadowTestModel,shadowTestLight)');
      assert(game.draws.length > after);
    },
  );
  await t.test('Simulation speed stays within 0.04 m/s and collisions stop the rover', () => {
    run(
      'globalThis.physicsProbe={...rover,a:0,v:0};for(let i=0;i<600;i++)Gale.step(physicsProbe,{forward:true},1/60,()=>0,true,[])',
    );
    assert(run('Math.abs(physicsProbe.v)/Gale.unitsPerMeter') <= 0.04);
    run(
      'globalThis.collisionProbe={...rover,a:0,v:50};Gale.step(collisionProbe,{forward:true},.05,()=>0,false,[{x:rover.x,y:rover.y-30,r:15}])',
    );
    assert.equal(run('collisionProbe.v'), 0);
  });
  await t.test('Overview camera, free flight and compass retain finite matrices', () => {
    run('init();running=true;birdsEye=true;orbitZoom=Gale.overviewZoom;render()');
    assert.equal(game.uniforms.overview, 1);
    run('birdsEye=false;firstPerson=true;orbitZoom=185;graphics.zoom=185;render()');
    assert.equal(game.uniforms.overview, 0);
    run('toggleFlight();keys={e:true,w:true};render()');
    const rover = run('JSON.stringify(rover)');
    for (let i = 0; i < 30; i++) {
      game.setTime(1100 + i * 17);
      run(`tick(${1100 + i * 17})`);
    }
    assert.equal(run('JSON.stringify(rover)'), rover);
    game.setTime(2000);
    run(
      'freeFlight=false;birdsEye=false;firstPerson=false;rover.a=Math.PI;orbitYaw=0;graphics.yaw=0;orbitZoom=185;render()',
    );
    assert.equal(game.element('#compass-heading').textContent, '180°');
  });
});
