'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./helpers/game.cjs');

test('Route mesh detail matches native heights near the actor and joins coarse triangles at its edge', () => {
  const game = createGame({ renderer: true });
  const result = game.evaluate(`(()=>{
    const route = { bounds:{minX:0,minY:0,maxX:28800,maxY:28800}, columns:161, rows:161,
      height:(x,y)=>500+18*Math.sin(x/650)*Math.cos(y/710) };
    const grid=createRouteGrid(route);
    const patch={x0:4,y0:4,x1:156,y1:156};
    const mesh=buildRouteGround(grid,patch);
    let interiorError=0,edgeError=0,nonfinite=0;
    for(let i=0;i<mesh.length;i+=9){
      const x=mesh[i],y=mesh[i+1],h=mesh[i+2];
      if(x>9000&&x<19000&&y>9000&&y<19000)interiorError=Math.max(interiorError,Math.abs(h-route.height(x,y)));
      if(x===720||y===720||x===28080||y===28080)edgeError=Math.max(edgeError,Math.abs(h-coarseRouteHeight(grid,x,y)));
      if(!Number.isFinite(h)||!Number.isFinite(mesh[i+5]))nonfinite++;
    }
    return {interiorError,edgeError,nonfinite,vertices:mesh.length/9};
  })()`);
  assert(
    result.interiorError < 0.001,
    'Native surface at actor must match wheel collision heights',
  );
  assert(result.edgeError < 0.001, 'Dense patch edge must join the coarse mesh');
  assert.equal(result.nonfinite, 0);
  assert.equal(result.vertices, 152 * 152 * 6);
});
