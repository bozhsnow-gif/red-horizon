const fs=require('fs');let f='dist/renderer.js',s=fs.readFileSync(f,'utf8');fs.copyFileSync(f,'renderer-before-pinch.js');
s=s.replace('uniform float ground;out vec4 outColor;','uniform float ground;uniform vec3 contacts[4];out vec4 outColor;');
let a=s.indexOf('  if(sc.x>0.'),b=s.indexOf('  vec3 albedo=c;',a);if(a<0||b<0)throw Error('shadow shader missing');s=s.slice(0,a)+`  // Small, soft tire contact shading replaces the oversized cast shadow.
  if(ground>.5){for(int i=0;i<4;i++){vec2 delta=world.xy-contacts[i].xy;shade+=exp(-dot(delta,delta)/55.)*.38;}shade=min(shade,.46);}
`+s.slice(b);
s=s.replace("'ground','shadowMap'","'ground','shadowMap','contacts[0]'");
a=s.indexOf('  let shadowKey=');b=s.indexOf('  gl.bindFramebuffer(gl.FRAMEBUFFER,null);',a);if(a<0||b<0)throw Error('shadow draw missing');s=s.slice(0,a)+s.slice(b);
s=s.replace('gl.uniform3fv(this.uniforms.eye,eye);','gl.uniform3fv(this.uniforms.eye,eye);gl.uniform3fv(this.uniforms[\'contacts[0]\'],new Float32Array(this.wheels.flatMap(w=>w.previous)));');
s=s.replace('mesh:this.mesh(d),center','mesh:this.mesh(this.smoothNormals(d)),center');s=s.replace('this.rover=this.mesh(data);','this.rover=this.mesh(this.smoothNormals(data));');
s=s.replace(' resize(){',` smoothNormals(data){
  // Blend neighbouring faces at bevels, preserving sharp 90-degree mechanical edges.
  const groups=new Map(),result=new Float32Array(data);
  for(let i=0;i<data.length;i+=9){let key=[data[i],data[i+1],data[i+2],data[i+6],data[i+7],data[i+8]].join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i)}
  for(let indices of groups.values())for(let i of indices){let sum=[0,0,0],base=[data[i+3],data[i+4],data[i+5]];for(let j of indices){let n=[data[j+3],data[j+4],data[j+5]];if(dot(base,n)>.45)for(let k=0;k<3;k++)sum[k]+=n[k]}let n=unit(sum);result.set(n,i+3)}return result;
 }
 resize(){`);
s=s.replace('this.yaw=0;this.pitch=0;','this.yaw=0;this.pitch=0;this.zoom=185;');s=s.replace('orbitPitch,time){','orbitPitch,time,zoom=185){');s=s.replace('this.pitch+=(orbitPitch-this.pitch)*smooth;','this.pitch+=(orbitPitch-this.pitch)*smooth;this.zoom+=(zoom-this.zoom)*smooth;');s=s.replaceAll('Math.cos(elevation)*185','Math.cos(elevation)*this.zoom').replaceAll('Math.sin(elevation)*185','Math.sin(elevation)*this.zoom');s=s.replace('(firstPerson?60:52)*Math.PI/180','(firstPerson?Math.max(38,Math.min(90,60*this.zoom/185)):52)*Math.PI/180');
new Function(s);fs.writeFileSync(f,s);
f='dist/index.html';s=fs.readFileSync(f,'utf8');s=s.replace('orbitPitch=0,uiTimer=0','orbitPitch=0,orbitZoom=185,uiTimer=0');s=s.replace('orbitPitch,performance.now())','orbitPitch,performance.now(),orbitZoom)');s=s.replace('forward?117:0','forward?140.4:0').replace('back?84.5:0','back?101.4:0').replace('Math.max(-58.5,Math.min(123.5,rover.v))','Math.max(-70.2,Math.min(148.2,rover.v))');
a=s.indexOf('// Two-finger trackpad');b=s.indexOf("window.addEventListener('keydown'",a);if(a<0||b<0)throw Error('camera handlers missing');
s=s.slice(0,a)+`// Trackpad pinch is delivered as Ctrl+wheel in Chromium browsers.
function zoomCamera(factor){orbitZoom=Math.max(115,Math.min(420,orbitZoom*factor))}
canvas.addEventListener('wheel',e=>{e.preventDefault();let units=e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight||650:1;if(e.ctrlKey){zoomCamera(Math.exp(Math.max(-.4,Math.min(.4,-e.deltaY*units*.006))));return}orbitYaw-=e.deltaX*units*.004;orbitPitch=Math.max(-.55,Math.min(.4,orbitPitch-e.deltaY*units*.003))},{passive:false});
let lookDrag=null,touchPoints=new Map(),touchCenter=null,touchSpan=0;
function touchPair(){let a=[...touchPoints.values()];return {x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,span:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);if(touchPoints.size===2){let p=touchPair();touchCenter=p;touchSpan=p.span}}else if([0,1,2].includes(e.button)){lookDrag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)}});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&touchPoints.has(e.pointerId)){touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touchPoints.size===2){let p=touchPair();if(touchCenter){orbitYaw-=(p.x-touchCenter.x)*.006;orbitPitch=Math.max(-.55,Math.min(.4,orbitPitch-(p.y-touchCenter.y)*.006))}if(touchSpan>2&&p.span>2)zoomCamera(p.span/touchSpan);touchSpan=p.span;touchCenter=p}}else if(lookDrag){orbitYaw-=(e.clientX-lookDrag.x)*.006;orbitPitch=Math.max(-.55,Math.min(.4,orbitPitch-(e.clientY-lookDrag.y)*.006));lookDrag={x:e.clientX,y:e.clientY}}});
function endLook(e){touchPoints.delete(e.pointerId);if(touchPoints.size<2){touchCenter=null;touchSpan=0}if(e.pointerType!=='touch')lookDrag=null}
for(let event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,endLook);
window.addEventListener('blur',()=>{lookDrag=null;touchPoints.clear();touchCenter=null;touchSpan=0});
canvas.addEventListener('dblclick',()=>{orbitYaw=0;orbitPitch=0;orbitZoom=185;message('CAMERA RECENTERED')});
document.querySelector('#zoom-in').onclick=()=>zoomCamera(.85);document.querySelector('#zoom-out').onclick=()=>zoomCamera(1/.85);
`+s.slice(b);
s=s.replace('<div class="controlrow"><span>Change camera</span>', '<div class="controlrow"><span>Zoom · pinch in / spread out</span><div class="keys"><button class="reset" id="zoom-in" aria-label="Zoom in">+</button><button class="reset" id="zoom-out" aria-label="Zoom out">−</button></div></div><div class="controlrow"><span>Change camera</span>');
new Function(s.match(/<script>\n([\s\S]*)<\/script>/)[1]);fs.writeFileSync(f,s);
let test=fs.readFileSync('verify-gpu.cjs','utf8').replace('newSpeed/oldSpeed-1.3','newSpeed/oldSpeed-1.56').replace('driving speed exactly 1.3x','driving speed exactly 1.56x original (20% above previous)');fs.writeFileSync('verify-gpu.cjs',test);
console.log('Local shadows, smooth bevel normals, 20% speed increase, pinch zoom and zoom buttons integrated.');
