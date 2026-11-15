const fs=require('fs');let p='dist/index.html',s=fs.readFileSync(p,'utf8');
s=s.replace('birdsEye=false,orbitYaw=0','birdsEye=false,freeFlight=false,lastSpaceTap=-Infinity,orbitYaw=0');
s=s.replace('orbitZoom,birdsEye)','orbitZoom,birdsEye,freeFlight,keys)');
s=s.replace('function init(){if(graphics)', 'function init(){freeFlight=false;lastSpaceTap=-Infinity;keys={};if(graphics)graphics.flight=null;document.querySelector(\'#flight-toggle\').textContent=\'LEAVE ROVER\';if(graphics)');
s=s.replace('dist+=Gale.step(rover,','if(!freeFlight)dist+=Gale.step(rover,');s=s.replace('if(!s.got&&Math.hypot(s.x-rover.x','if(!freeFlight&&!s.got&&Math.hypot(s.x-rover.x');
s=s.replace('function zoomCamera(factor)',`function limitLookPitch(p){return Math.max(freeFlight?-1.45:-.55,Math.min(freeFlight?1.45:.4,p))}
function toggleFlight(){if(!running)return;freeFlight=!freeFlight;rover.v=0;keys={};lastSpaceTap=-Infinity;firstPerson=false;birdsEye=false;if(!freeFlight){orbitPitch=limitLookPitch(orbitPitch);if(graphics)graphics.flight=null}document.querySelector('#flight-toggle').textContent=freeFlight?'RETURN TO ROVER':'LEAVE ROVER';message(freeFlight?'FREE FLIGHT · WASD MOVE · E UP / Q DOWN':'RETURNED TO ROVER');updateUI()}
document.querySelector('#flight-toggle').onclick=toggleFlight;
function zoomCamera(factor)`);
s=s.replace('Math.max(-.55,Math.min(.4,orbitPitch-e.deltaY*units*.003))','limitLookPitch(orbitPitch-e.deltaY*units*.003)').replace('Math.max(-.55,Math.min(.4,orbitPitch-(p.y-touchCenter.y)*.006))','limitLookPitch(orbitPitch-(p.y-touchCenter.y)*.006)').replace('Math.max(-.55,Math.min(.4,orbitPitch-(e.clientY-lookDrag.y)*.006))','limitLookPitch(orbitPitch-(e.clientY-lookDrag.y)*.006)');
s=s.replace("window.addEventListener('keydown',e=>{",`window.addEventListener('keydown',e=>{if(e.code==='Space'){if(['BUTTON','INPUT','TEXTAREA','SELECT','SUMMARY'].includes(e.target?.tagName))return;e.preventDefault();if(!e.repeat&&running){let now=performance.now();if(now-lastSpaceTap<=350)toggleFlight();else lastSpaceTap=now}return}`);
s=s.replace("e.preventDefault();birdsEye=!birdsEye;", "e.preventDefault();if(freeFlight)toggleFlight();birdsEye=!birdsEye;");s=s.replace("e.preventDefault();firstPerson=!firstPerson;", "e.preventDefault();if(freeFlight)toggleFlight();firstPerson=!firstPerson;");
s=s.replace("window.addEventListener('blur',()=>keys={})","window.addEventListener('blur',()=>{keys={};lastSpaceTap=-Infinity;if(graphics?.flight)graphics.flight.velocity=[0,0,0]})");
s=s.replace('<div class="controlrow"><span>Bird’s-eye view</span>',`<div class="controlrow"><span>Double-tap Space</span><button class="reset" id="flight-toggle">LEAVE ROVER</button></div><div class="controlrow"><span>Free flight</span><span class="small">WASD · E ↑ / Q ↓</span></div><div class="controlrow"><span>Bird’s-eye view</span>`);
fs.writeFileSync(p,s);new Function(s.match(/<script>\n([\s\S]*)<\/script>/)[1]);
p='dist/renderer.js';s=fs.readFileSync(p,'utf8');s=s.replace('zoom=185,birdsEye=false){','zoom=185,birdsEye=false,freeFlight=false,keys={}){');
let marker='  let vp=mul(perspective(';if(!s.includes(marker))throw Error('camera projection missing');s=s.replace(marker,`  if(freeFlight){
   if(!this.flight){let delta=sub(target,eye);this.flight={position:eye.slice(),velocity:[0,0,0],pitchOffset:Math.max(-1.35,Math.min(1.35,Math.atan2(delta[2],Math.hypot(delta[0],delta[1]))))-this.pitch}}
   let flyPitch=Math.max(-1.45,Math.min(1.45,this.pitch+this.flight.pitchOffset));
   updateFreeFlight(this.flight,keys,angle,flyPitch,dt,(x,y)=>this.height(x,y));eye=this.flight.position.slice();
   target=[eye[0]+Math.sin(angle)*Math.cos(flyPitch)*100,eye[1]-Math.cos(angle)*Math.cos(flyPitch)*100,eye[2]+Math.sin(flyPitch)*100];
  }else this.flight=null;
`+marker);
s=s.replace('lookAt(eye,target,birdsEye?', 'lookAt(eye,target,birdsEye&&!freeFlight?');s=s.replace('if(!firstPerson){this.draw(this.rover','if(!firstPerson||freeFlight){this.draw(this.rover');
s+=`
// Free-flight movement is frame-rate independent and never changes rover state.
function updateFreeFlight(flight,keys,yaw,pitch,dt,height){
 let forward=(keys.w||keys.W||keys.ArrowUp?1:0)-(keys.s||keys.S||keys.ArrowDown?1:0),right=(keys.d||keys.D||keys.ArrowRight?1:0)-(keys.a||keys.A||keys.ArrowLeft?1:0),up=(keys.e||keys.E?1:0)-(keys.q||keys.Q?1:0);
 let direction=[Math.sin(yaw)*Math.cos(pitch)*forward+Math.cos(yaw)*right,-Math.cos(yaw)*Math.cos(pitch)*forward+Math.sin(yaw)*right,Math.sin(pitch)*forward+up];let length=Math.max(1,Math.hypot(...direction)),rate=1-Math.exp(-10*dt);
 for(let i=0;i<3;i++){let speed=direction[i]/length*320;flight.velocity[i]+=(speed-flight.velocity[i])*rate;flight.position[i]+=flight.velocity[i]*dt}
 flight.position[0]=Math.max(-4500,Math.min(6900,flight.position[0]));flight.position[1]=Math.max(-4500,Math.min(6900,flight.position[1]));let floor=height(flight.position[0],flight.position[1])+12;
 if(flight.position[2]<floor){flight.position[2]=floor;flight.velocity[2]=Math.max(0,flight.velocity[2])}flight.position[2]=Math.min(4200,flight.position[2]);
}
`;
fs.writeFileSync(p,s);new Function(s);console.log('Double-space free flight, E/Q vertical flight, parked rover and two-finger camera controls added.');
