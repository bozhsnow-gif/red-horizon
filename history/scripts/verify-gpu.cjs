const fs=require('fs'),vm=require('vm'),assert=require('assert');const listeners={},elements=new Map(),uniforms=[],draws=[];let next=1;const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,checkFramebufferStatus:()=>1,FRAMEBUFFER_COMPLETE:1,getUniformLocation:(p,n)=>n,uniformMatrix4fv:(name,t,m)=>uniforms.push({name,m:[...m]}),drawArrays:(mode,start,count)=>draws.push(count)}, {get:(o,k)=>k in o?o[k]:k.startsWith('create')?()=>next++:()=>{}});const ctx=new Proxy({},{get:()=>()=>{}});function el(id){if(!elements.has(id))elements.set(id,{textContent:'',style:{},classList:{add(){},remove(){}},getContext:t=>t==='webgl2'?gl:ctx,getBoundingClientRect:()=>({width:1000,height:650}),addEventListener:(n,f)=>listeners[id+':'+n]=f,setPointerCapture(){}});return elements.get(id)}
const s={document:{querySelector:el,querySelectorAll:()=>[],documentElement:{dataset:{}}},window:{addEventListener:(n,f)=>listeners["window:"+n]=f},devicePixelRatio:1,performance:{now:()=>1000},console,requestAnimationFrame(){},setTimeout(){},clearTimeout(){},Float32Array,Math,Map};vm.createContext(s);const html=fs.readFileSync('dist/index.html','utf8');vm.runInContext(fs.readFileSync('dist/ares4-mesh.js','utf8')+'\n'+fs.readFileSync('dist/gale.js','utf8')+'\n'+fs.readFileSync('dist/renderer.js','utf8')+'\n'+html.match(/<script>\n([\s\S]*)<\/script>/)[1],s);assert.equal(s.document.documentElement.dataset.renderer,'ready');
const before=vm.runInContext('JSON.stringify(rover)',s);listeners['#game:wheel']({preventDefault(){},deltaX:150,deltaY:30,ctrlKey:false});vm.runInContext('render()',s);assert.equal(vm.runInContext('JSON.stringify(rover)',s),before,'orbit input must not alter rover');assert(draws.every(n=>n>=0&&n%3===0));
vm.runInContext(`for(let yaw of [0,.5,1.6,3.14])for(let elevation of [.16,.5,1.1]){let target=[1200,1200,55],eye=[target[0]-Math.sin(yaw)*Math.cos(elevation)*190,target[1]+Math.cos(yaw)*Math.cos(elevation)*190,target[2]+Math.sin(elevation)*190],m=mul(perspective(Math.PI/3,1.5,2,3600),lookAt(eye,target));let x=m[0]*target[0]+m[4]*target[1]+m[8]*target[2]+m[12],y=m[1]*target[0]+m[5]*target[1]+m[9]*target[2]+m[13];if(Math.abs(x)>.001||Math.abs(y)>.001)throw Error('Orbit target moved');}`,s);
vm.runInContext('firstPerson=true;render();firstPerson=false;running=true;keys={w:true};last=1000;tick(1016)',s);let newSpeed=vm.runInContext('rover.v',s),oldSpeed=90*.016*Math.pow(.25,.016);assert(Number.isFinite(newSpeed)&&newSpeed>0,'Exploration advances on gravel');
console.log('PASS: orbit preserves rover pose; target centered across 12 angles; GPU geometry valid; both cameras execute; Gale exploration physics advances.');
// Wheel / terrain integration regressions using the GPU test harness above.
vm.runInContext(`
 graphics.resetMotion();rover={x:1200,y:1200,a:0,v:0};let m=graphics.pose(rover),startSpin=graphics.wheels.map(w=>w.spin);graphics.pose(rover);
 if(graphics.trackCount!==0)throw Error('Stationary rover leaves tracks');
 for(let i=0;i<4;i++)if(graphics.wheels[i].spin!==startSpin[i])throw Error('Idle wheel rotates');
 rover.y-=10;graphics.pose(rover);if(graphics.trackCount<12)throw Error('Moving wheels did not leave tracks');let spins=graphics.wheels.map(w=>w.spin);if(spins.some(s=>s<=0))throw Error('Forward rotation wrong');
 for(let w of graphics.wheels){let model=w.model;let expected=graphics.surface(model[12],model[13])+w.radius*Math.sqrt(1-model[2]*model[2]);if(Math.abs(model[14]-expected)>.0001)throw Error('Wheel not contacting terrain');}
 rover.y+=10;graphics.pose(rover);if(graphics.wheels.some(w=>Math.abs(w.spin)>.0001))throw Error('Reverse must unwind wheel rotation');
 let count=graphics.trackCount;graphics.pose(rover);if(graphics.trackCount!==count)throw Error('Idle track duplicates');
 if(Math.abs(m[2])+Math.abs(m[6])<.00001)throw Error('Body not following slope');
 for(let i=0;i<6050;i++)graphics.stampTrack(1200+(i%10),1200,0);if(graphics.trackCount!==6000||graphics.trackMesh.count!==36000)throw Error('Track buffer not bounded');
 graphics.resetMotion();if(graphics.trackCount||graphics.trackMesh.count||graphics.wheels.some(w=>w.spin||w.previous||w.stamp))throw Error('Mission reset incomplete');
`,s);
console.log('PASS: slope alignment, wheel-ground contact, signed distance-driven wheel spin, no idle marks, reverse, 6000-mark buffer cap and reset.');
const getZoom=()=>vm.runInContext('orbitZoom',s);vm.runInContext('orbitZoom=185',s);const poseBefore=vm.runInContext('JSON.stringify(rover)',s);
listeners['#game:wheel']({preventDefault(){},ctrlKey:true,deltaY:-20,deltaX:0,deltaMode:0});assert(getZoom()>185,'Spread must zoom out');
listeners['#game:wheel']({preventDefault(){},ctrlKey:true,deltaY:20,deltaX:0,deltaMode:0});assert(Math.abs(getZoom()-185)<.001,'Pinch must zoom in');
vm.runInContext('zoomCamera(1000)',s);assert.equal(getZoom(),420);vm.runInContext('zoomCamera(.000001)',s);assert.equal(getZoom(),115);
listeners['#game:dblclick']();assert.equal(getZoom(),185);
const touch=(id,x,y)=>({pointerType:'touch',pointerId:id,clientX:x,clientY:y});listeners['#game:pointerdown'](touch(1,100,100));listeners['#game:pointerdown'](touch(2,200,100));listeners['#game:pointermove'](touch(2,240,100));assert(getZoom()>185,'Touch spread must zoom out');listeners['#game:pointermove'](touch(2,200,100));assert(Math.abs(getZoom()-185)<.001);listeners['#game:pointercancel'](touch(1,100,100));listeners['#game:pointerup'](touch(2,200,100));
assert.equal(vm.runInContext('JSON.stringify(rover)',s),poseBefore,'Zoom must not move rover');
vm.runInContext('orbitZoom=115;render();orbitZoom=420;firstPerson=true;render();firstPerson=false;',s);
console.log('PASS: trackpad/touch pinch direction, zoom limits, recenter, camera-only controls and both camera modes.');
// Gale-specific checks: scientific units, material-dependent motion, note capture and mode switch.
vm.runInContext(`
 let flat=()=>0,drive={forward:true};
 function trial(x,y,simulation){let r={x,y,a:0,v:0};for(let i=0;i<600;i++)Gale.step(r,drive,1/60,flat,simulation,[]);return r}
 let sand=trial(1570,1050,false),rock=trial(760,1100,false);if(!(sand.v<rock.v))throw Error('Sand must reduce mobility');
 let slow=trial(760,1100,true);if(slow.v/Gale.unitsPerMeter>.040001||slow.v/Gale.unitsPerMeter<.039)throw Error('Curiosity speed calibration');
 graphics.resetMotion();graphics.stampTrack(760,1100,0);if(graphics.trackCount!==0)throw Error('Bare bedrock must not record sand tracks');graphics.stampTrack(1570,1050,0);if(graphics.trackCount!==1)throw Error('Sand must record tracks');
 let blocked={x:1200,y:1200,a:0,v:50};Gale.step(blocked,drive,.05,flat,false,[{x:1200,y:1170,r:15}]);if(blocked.v!==0)throw Error('Obstacle collision missing');
 for(let i=0;i<120;i++)graphics.pose({x:1300+i*.1,y:1200,a:0,v:1});if(!Number.isFinite(graphics.bodyZ)||!Number.isFinite(graphics.bodyV))throw Error('Suspension unstable');
`,s);
elements.get('#drive-mode').setAttribute=()=>{};elements.get('#drive-mode').onclick();assert.equal(vm.runInContext('simulationMode',s),true);assert.equal(vm.runInContext('rover.v',s),0);
vm.runInContext('rover.x=samples[0].x;rover.y=samples[0].y;keys={};running=true;last=2000;tick(2016)',s);assert(elements.get('#science-text').textContent.includes('Curiosity'));
const finalHtml=fs.readFileSync('dist/index.html','utf8');assert(!finalHtml.includes('Jezero'));assert(finalHtml.includes('not a downloaded elevation map'));console.log('PASS: Curiosity simulation speed, surface traction, bedrock/sand tracks, collisions, suspension stability, mode toggle, geology notes and provenance.');
const key=(code)=>({code,shiftKey:true,repeat:false,preventDefault(){}});let pose=vm.runInContext('JSON.stringify(rover)',s);
listeners['window:keydown'](key('Digit2'));assert.equal(vm.runInContext('birdsEye&&!firstPerson',s),true);vm.runInContext('render()',s);assert.equal(vm.runInContext('JSON.stringify(rover)',s),pose);
assert(uniforms.every(u=>u.m.every(Number.isFinite)),'Bird view matrix must be finite');
listeners['window:keydown'](key('Digit2'));assert.equal(vm.runInContext('birdsEye',s),false);
listeners['window:keydown'](key('Digit2'));listeners['window:keydown'](key('Digit1'));assert.equal(vm.runInContext('firstPerson&&!birdsEye',s),true);
console.log('PASS: Shift+2 enables and exits bird view; Shift+1 switches to first person; top-down camera renders with finite matrices and preserves rover pose.');
vm.runInContext(`
 const distant=buildDistantGround((x,y)=>Gale.height(x,y)),seams=new Map();
 for(let t=0;t<distant.length;t+=27){let v=[distant.slice(t,t+3),distant.slice(t+9,t+12),distant.slice(t+18,t+21)];for(let i=0;i<3;i++){let a=v[i],b=v[(i+1)%3];let onX=a[0]===b[0]&&[-1000,3400].includes(a[0])&&Math.min(a[1],b[1])>=-1000&&Math.max(a[1],b[1])<=6040,onY=a[1]===b[1]&&[-1000,6040].includes(a[1])&&Math.min(a[0],b[0])>=-1000&&Math.max(a[0],b[0])<=3400;if(onX||onY){let length=Math.hypot(a[0]-b[0],a[1]-b[1]);if(Math.abs(length-22)>.00001)throw Error('Unstitched edge');for(let p of [a,b])if(Math.abs(p[2]-Gale.height(p[0],p[1]))>.00001)throw Error('Height seam');let key=[a.slice(0,2).join(','),b.slice(0,2).join(',')].sort().join(':');seams.set(key,(seams.get(key)||0)+1)}}}
 if(seams.size!==1040||[...seams.values()].some(n=>n!==1))throw Error('Ground perimeter incomplete');
`,s);
console.log('PASS: all 1040 mountain/ground boundary segments align with the near terrain; shared elevation and complete perimeter.');
// Flight controls and parked-rover regressions.
let clock=3000;s.performance.now=()=>clock;vm.runInContext('running=true;keys={};freeFlight=false;lastSpaceTap=-Infinity;',s);
const space=(repeat=false)=>({code:'Space',key:' ',repeat,preventDefault(){}});
listeners['window:keydown'](space());assert.equal(vm.runInContext('freeFlight',s),false,'Single space must not launch');listeners['window:keydown'](space(true));assert.equal(vm.runInContext('freeFlight',s),false,'Held key must not launch');clock+=150;listeners['window:keydown'](space());assert.equal(vm.runInContext('freeFlight',s),true);
vm.runInContext('render()',s);const parked=vm.runInContext('JSON.stringify(rover)',s);const flightStart=vm.runInContext('graphics.flight.position.slice()',s);
vm.runInContext('keys={e:true,w:true}',s);for(let i=0;i<60;i++){clock+=1000/60;vm.runInContext('tick('+clock+')',s)}
const flightEnd=vm.runInContext('graphics.flight.position.slice()',s);assert(flightEnd[2]>flightStart[2]);assert(Math.hypot(flightEnd[0]-flightStart[0],flightEnd[1]-flightStart[1])>10);assert.equal(vm.runInContext('JSON.stringify(rover)',s),parked,'Flying must leave rover parked');
vm.runInContext(`let flying={position:[100,100,13],velocity:[0,0,0]};for(let i=0;i<120;i++)updateFreeFlight(flying,{q:true},0,0,1/60,()=>0);if(flying.position[2]<12)throw Error('Flight crossed ground');`,s);
listeners['#game:wheel']({preventDefault(){},ctrlKey:false,deltaY:20,deltaX:30,deltaMode:0});assert.equal(vm.runInContext('JSON.stringify(rover)',s),parked);
clock+=400;listeners['window:keydown'](space());clock+=150;listeners['window:keydown'](space());assert.equal(vm.runInContext('freeFlight',s),false);vm.runInContext('render()',s);assert.equal(vm.runInContext('graphics.flight',s),null);
assert(uniforms.every(u=>u.m.every(Number.isFinite)));console.log('PASS: double-space toggle, held-key protection, horizontal/vertical flight, parked rover, terrain clearance and return to rover.');
vm.runInContext(`
 let driver={x:1200,y:2050,a:Math.PI,v:0};let routeStart=graphics.surface(driver.x,driver.y);
 for(let point of Gale.climbRoute.slice(1)){let steps=0;while(Math.hypot(point.x-driver.x,point.y-driver.y)>12&&steps++<20000){driver.a=Math.atan2(point.x-driver.x,-(point.y-driver.y));Gale.step(driver,{forward:true},1/60,(x,y)=>graphics.surface(x,y),false,[])}if(steps>=20000)throw Error('Climb route cannot be driven');graphics.pose(driver);for(let w of graphics.wheels){let expected=graphics.surface(w.model[12],w.model[13])+w.radius*Math.sqrt(1-w.model[2]*w.model[2]);if(Math.abs(expected-w.model[14])>.001)throw Error('Climbing wheel lost surface')}}
 if(driver.y<4800||graphics.surface(driver.x,driver.y)-routeStart<900)throw Error('Summit inaccessible');
`,s);
console.log('PASS: physics-driven ascent passes old boundary and reaches summit; wheel contact verified along climb.');
