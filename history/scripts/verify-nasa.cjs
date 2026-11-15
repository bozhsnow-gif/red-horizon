'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const dem=require('./dist/mola-import.js');
// Deliberately synthetic fixtures, held only in memory. Never used by the game.
const label=`PDS_VERSION_ID = PDS3
^IMAGE = "MEGT00N090HB.IMG"
DATA_SET_ID = "MGS-M-MOLA-5-MEGDR-L3-V1.0"
INSTRUMENT_ID = MOLA
TARGET_NAME = MARS
LINES = 5632
LINE_SAMPLES = 11520
SAMPLE_TYPE = MSB_INTEGER
SAMPLE_BITS = 16
MAP_RESOLUTION = 128 <PIXEL/DEGREE>
UNIT = METER
MAP_PROJECTION_TYPE = "SIMPLE CYLINDRICAL"
POSITIVE_LONGITUDE_DIRECTION = "EAST"
COORDINATE_SYSTEM_NAME = "PLANETOCENTRIC"
MAXIMUM_LATITUDE = 0 <DEGREE>
MINIMUM_LATITUDE = -44 <DEGREE>
WESTERNMOST_LONGITUDE = 90 <DEGREE>
EASTERNMOST_LONGITUDE = 180 <DEGREE>
A_AXIS_RADIUS = 3396 <KM>
SCALING_FACTOR = 1
OFFSET = 0
END`;
function fixture(invalid=false){return {name:'megt00n090hb.img',size:129761280,slice:(start,end)=>({arrayBuffer:async()=>{
 const a=new ArrayBuffer(end-start),v=new DataView(a);
 for(let off=0;off<a.byteLength;off+=2){const sample=(start+off)/2,row=Math.floor(sample/11520),col=sample%11520;
   const height=-4500+(row-dem.row0)*3+(col-dem.col0)*2;
   v.setInt16(off,invalid?32767:height,false);
 }return a;
}})}}
function game(data) {
 const events={},elements=new Map(),uniforms={};let next=1;
 const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,checkFramebufferStatus:()=>1,FRAMEBUFFER_COMPLETE:1,
  getUniformLocation:(_,name)=>name,uniform3fv:(name,value)=>uniforms[name]=Array.from(value),
  uniformMatrix4fv:(_,t,arr)=>assert(Array.from(arr).every(Number.isFinite))},
  {get:(o,k)=>k in o?o[k]:k.startsWith('create')?()=>next++:()=>{}});
 const ctx=new Proxy({},{get:()=>()=>{}});
 function element(id){if(!elements.has(id))elements.set(id,{textContent:'',files:[],style:{setProperty(){}},classList:{add(){},remove(){}},setAttribute(){},getContext:t=>t==='webgl2'?gl:ctx,getBoundingClientRect:()=>({width:1000,height:650}),addEventListener:(n,f)=>events[id+':'+n]=f,setPointerCapture(){}});return elements.get(id)}
 const saved=data?JSON.stringify(data):null;
 const storage={getItem:()=>saved,setItem(){}};
 const s={document:{querySelector:element,querySelectorAll:()=>[],documentElement:{dataset:{}}},window:{addEventListener:(n,f)=>events[n]=f,location:{reload(){}}},localStorage:storage,devicePixelRatio:1,performance:{now:()=>1000},console,requestAnimationFrame(){},setTimeout(){},clearTimeout(){},Float32Array,Math,Map};
 vm.createContext(s);
 const html=fs.readFileSync('dist/index.html','utf8');
 for(const script of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g))vm.runInContext(script[1]?fs.readFileSync('dist/'+script[1],'utf8'):script[2],s);
 assert.equal(s.document.documentElement.dataset.renderer,'ready');
 const evaluate=code=>vm.runInContext(code,s);
 assert.equal(evaluate('Gale.terrainScale'),1);
 assert.equal(evaluate('Gale.measured'),!!data);
 assert.equal(evaluate('simulationMode'),false);
 assert(Math.abs(evaluate('Math.hypot(Gale.climbRoute[0].x-rover.x,Gale.climbRoute[0].y-rover.y)/18')-150)<1e-7);
 evaluate('drawMap()');
 assert(evaluate('WaypointRoute.mapMarkers.some(p=>p.index===0)'));
 assert(evaluate('WaypointRoute.pick(WaypointRoute.mapMarkers[0].x,WaypointRoute.mapMarkers[0].y)===WaypointRoute.mapMarkers[0].index'));
 evaluate('running=true;freeFlight=true;rover.x=Gale.climbRoute[0].x;rover.y=Gale.climbRoute[0].y;tick(1000)');
 assert.equal(evaluate('climbIndex'),0,'Flying must not complete driving waypoints');
 evaluate('freeFlight=false;tick(1017)');assert.equal(evaluate('climbIndex'),1);
 assert(elements.get('#route-progress').textContent.startsWith('1 /'));
 evaluate('init();running=true;rover.x=Gale.climbRoute[1].x;rover.y=Gale.climbRoute[1].y;tick(1034)');
 assert.equal(evaluate('climbIndex'),0,'Later waypoints cannot skip the next waypoint');
 assert.equal(evaluate('WaypointRoute.advance([{x:100,y:0}],0,{x:0,y:0},{x:200,y:0},10)'),1,'A drive that crosses a marker must count');
 assert.equal(evaluate('WaypointRoute.advance([{x:100,y:30}],0,{x:0,y:0},{x:200,y:0},10)'),0,'Driving past outside the arrival radius must not count');
 evaluate('init()');assert.equal(evaluate('climbIndex'),0);
 evaluate('showLandingReference()');
 const referenceCoordinates=evaluate('Gale.coordinates(rover.x,rover.y)');
 assert(Math.abs(referenceCoordinates.latitude+4.6)<1e-10);
 assert(Math.abs(referenceCoordinates.longitude-137.4)<1e-10);
 assert.equal(evaluate('graphics.referenceCamera&&firstPerson'),true);
 assert(Math.abs(uniforms.eye[2]-evaluate('Gale.height(rover.x,rover.y)+36'))<.02);
 assert.equal(evaluate('rocks.filter(r=>r.illustrative).length'),2100);
 assert(evaluate('rocks.filter(r=>r.illustrative).every(r=>r.r>0&&r.r<3&&Math.hypot(r.x-Gale.spawnPoint.x,r.y-Gale.spawnPoint.y)>3.3*18)'));
 assert.equal(elements.get('#landing-photo').open,true);
 for(const name of ['landing','summit','rim']) {
  evaluate(`travelTo('${name}');render()`);
  assert.equal(evaluate('graphics.referenceCamera'),false);
  assert.equal(evaluate('rover.x'),evaluate(`Gale.mapPoint(...Gale.locations.${name}).x`));
  assert(evaluate(`graphics.wheels.every(w=>Math.abs(graphics.surface(w.model[12],w.model[13])+w.radius*Math.sqrt(1-w.model[2]**2)-w.model[14])<.1)`));
 }
 assert.deepEqual(uniforms.terrainElevation,Array.from(evaluate('[18,GALE_TOPOGRAPHY.minLegend,GALE_TOPOGRAPHY.maxLegend]')), 'GPU uses dataset datum');
 evaluate('travelTo("landing");let probe={...rover};for(let i=0;i<180;i++)Gale.step(probe,{forward:true},1/60,(x,y)=>Gale.height(x,y),true,[])');
 assert(evaluate('Math.abs(probe.v)/18<=.04'));
 evaluate('birdsEye=true;orbitZoom=Gale.overviewZoom;render()');
 evaluate('toggleFlight();render();updateUI()');
 if(data){
  const actual=evaluate('Gale.coordinates(...Object.values(Gale.mapPoint(...Gale.locations.landing)))');
  assert(Math.abs(actual.latitude+4.5895)<1e-10);assert(Math.abs(actual.longitude-137.4417)<1e-10);
  const corner=evaluate('Gale.coordinates(0,0)');
  assert.equal(corner.latitude,-(Math.floor(3.7*128)+.5)/128);
  assert.equal(corner.longitude,90+(Math.floor((135.9-90)*128)+.5)/128);
  // Independent expected affine surface at a fractional grid location.
  assert(Math.abs(evaluate('Gale.elevationMeters(Gale.mapPoint(12.25,17.75).x,Gale.mapPoint(12.25,17.75).y)')-(-4500+12.25*2+17.75*3))<1e-8);
  assert(elements.get('#terrain-source-status').textContent.startsWith('NASA MOLA crop loaded'));
 } else assert(elements.get('#terrain-source-status').textContent.startsWith('NASA elevation data not loaded'));
 return {events,elements,s};
}
(async()=>{
 dem.validateLabel(label);
 for(const [from,to] of [['MSB_INTEGER','LSB_INTEGER'],['MEGT00N090HB.IMG','MEGR00N090HB.IMG'],['OFFSET = 0','OFFSET = 3396000'],['128 <PIXEL/DEGREE>','64 <PIXEL/DEGREE>'],['PLANETOCENTRIC','PLANETOGRAPHIC']]) assert.throws(()=>dem.validateLabel(label.replace(from,to)));
 await assert.rejects(()=>dem.importTile({...fixture(),size:42},label));
 await assert.rejects(()=>dem.importTile(fixture(true),label));
 const data=await dem.importTile(fixture(),label);
 assert.equal(data.heights[0],-4500);
 assert.equal(data.heights[1],-4498);
 assert.equal(data.heights[data.columns],-4497);
 assert.throws(()=>dem.validateGrid({...data,geo:{...data.geo,north:data.geo.north+1/128}}));
 assert.throws(()=>dem.validateGrid({...data,heights:data.heights.slice(1)}));
 assert(data.widthMeters>200000&&data.widthMeters<220000);
 assert(data.heightMeters>200000&&data.heightMeters<215000);
 console.log('PASS: synthetic binary endian/stride/cell-center fixtures; wrong product, wrong coordinate system, truncation, sentinel and invalid cache rejected.');
 const fallback=game();game(data);
 const input=fallback.elements.get('#nasa-files'),status=fallback.elements.get('#nasa-import-status');
 input.files=[{name:'wrong.txt'}];await fallback.events['#nasa-files:change']();assert(status.textContent.startsWith('Select'));
 input.files=[fixture(),{name:'megt00n090hb.lbl',text:async()=>label}];
 fallback.s.localStorage.setItem=()=>{throw Error('Storage quota exceeded')};
 await fallback.events['#nasa-files:change']();assert(status.textContent.includes('Storage quota exceeded'));assert.equal(input.disabled,false);
 console.log('PASS: image fallback and imported grid boot, exact Bradbury coordinate registration, physical scale, mesh/collision heights, wheel contact, real-speed cap, overview/free-flight, shader datum, provenance and import errors.');
 console.log('NASA binary data is NOT downloaded by these synthetic fixture tests. Browser/WebGL visuals require separate verification.');
})().catch(e=>{console.error(e);process.exitCode=1});
