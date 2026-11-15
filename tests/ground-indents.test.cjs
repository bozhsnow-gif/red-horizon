'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./helpers/game.cjs');

test('Decorative indents are shallow, separated, and leave source elevations and the lab untouched', () => {
  const run = createGame().evaluate;
  const result = run(`(()=>{
    const p=Gale.spawnPoint,u=Gale.unitsPerMeter,out=[];
    for(let y=-6;y<6;y++)for(let x=-6;x<6;x++) {
      const d=GroundIndents.cell(x,y);if(!d)continue;
      const px=p.x+d.x*u,py=p.y+d.y*u;
      const measured=(Gale.elevationMeters(px,py)-GALE_TOPOGRAPHY.minLegend)*u*Gale.terrainScale;
      out.push([d.depth,(Gale.height(px,py)-measured)/u,GroundIndents.offset(px+d.radius*u,py)]);
    }
    return out;
  })()`);
  assert(result.length > 40 && result.length < 120);
  for (const [depth, offset, rim] of result) {
    assert(depth >= 0.2 && depth <= 0.45);
    assert(Math.abs(offset + depth) < 1e-6);
    assert(Math.abs(rim) < 1e-6);
  }
  assert(run('GroundIndents.offset(Gale.spawnPoint.x,Gale.spawnPoint.y)===0'));
  assert(
    run(
      '(()=>{const p=Gale.spawnPoint,u=Gale.unitsPerMeter;for(let y=6;y<=34;y+=2)for(let x=-51;x<=51;x+=2)if(GroundIndents.offset(p.x+x*u,p.y+y*u)!==0)return false;return true})()',
    ),
  );
  assert(
    run('GroundIndents.offset(Gale.spawnPoint.x+200*Gale.unitsPerMeter,Gale.spawnPoint.y)===0'),
  );
});
