const fs=require('fs');
let file='dist/renderer.js',s=fs.readFileSync(file,'utf8');
// A subdued brown palette based on unobscured ground in the user-provided JPEG.
// Approximate afternoon illumination. Do not infer a surveyed Sun angle from the mosaic.
s=s.replace('vec3(.72,.69,.56),vec3(.70,.69,.565)','vec3(.77,.725,.64),vec3(.735,.695,.62)');
s=s.replace('normalize(vec3(.4,-.25,1.))','normalize(vec3(-.82,-.18,.55))');
s=s.replace('vec3(.57,.515,.405),stone=vec3(.63,.57,.455)','vec3(.595,.49,.395),stone=vec3(.64,.555,.465)');
s=s.replace('let z=height(r.x,r.y),rr=r.r,lower=[],upper=[];','let z=height(r.x,r.y),rr=r.r,lower=[],upper=[],burial=r.lowProfile?rr*.3:1,rockHeight=r.lowProfile?.48:1;');
s=s.replace('z-1]);upper.push','z-burial]);upper.push');
s=s.replace('z+rr*(.64+.12*Math.sin(i*3+r.y))','z+rr*rockHeight*(.64+.12*Math.sin(i*3+r.y))');
s=s.replace('[.40,.365,.29]);','r.color||[.40,.365,.29]);').replace('this.polygon(data,upper,[.48,.44,.35]);','this.polygon(data,upper,r.color?r.color.map(c=>c*1.12):[.48,.44,.35]);');
s=s.replace('this.lastShadow=\'\';gl.enable',"this.lastShadow='';this.referenceCamera=false;gl.enable");
s=s.replace('else if(firstPerson){eye=[rover.x+Math.sin(rover.a)*15,rover.y-Math.cos(rover.a)*15,base+65];','else if(firstPerson){eye=this.referenceCamera?[rover.x,rover.y,this.height(rover.x,rover.y)+LandingReference.cameraHeightMeters*Gale.unitsPerMeter]:[rover.x+Math.sin(rover.a)*15,rover.y-Math.cos(rover.a)*15,base+65];');
s=s.replace('[rover.x+200,rover.y-125,base+500]','[rover.x-410,rover.y-90,base+275]');
s=s.replace('gl.clearColor(.72,.69,.56,1)','gl.clearColor(.77,.725,.64,1)');
s=s.replace('for(let waypoint of Gale.climbRoute)this.draw','if(!this.referenceCamera)for(let waypoint of Gale.climbRoute)this.draw');
s=s.replace('for(let s of samples)if(!s.got)this.draw','if(!this.referenceCamera)for(let s of samples)if(!s.got)this.draw');
new Function(s);fs.writeFileSync(file,s);
file='dist/index.html';s=fs.readFileSync(file,'utf8');
s=s.replace('<script src="renderer.js"></script>','<script src="landing-reference.js"></script><script src="renderer.js"></script>');
s=s.replace('}});tracks=[];dist=0;', '}});rocks.push(...LandingReference.rocks(spawn));tracks=[];dist=0;');
// Existing reference mode uses the rover's live position, so movement/telemetry still agree.
s=s.replace('function resize(){',`function showLandingReference(){
 init();running=true;document.querySelector('#start').classList.add('hidden');firstPerson=true;birdsEye=false;freeFlight=false;orbitYaw=0;orbitPitch=-.06;orbitZoom=185;rover.a=Math.PI;
 if(graphics){graphics.referenceCamera=true;graphics.yaw=0;graphics.pitch=-.06;graphics.zoom=185}
 document.querySelector('#landing-photo').open=true;updateUI();render();message('LANDING VIEW · 4.6° S, 137.4° E · 2 m CAMERA');
}
document.querySelector('#landing-view').onclick=showLandingReference;
function resize(){`);
// Leave the photographic comparison camera when normal camera controls are used.
s=s.replace('function toggleFlight(){if(!running)return;','function toggleFlight(){if(!running)return;if(graphics)graphics.referenceCamera=false;');
s=s.replace('function travelTo(name){','function travelTo(name){if(graphics)graphics.referenceCamera=false;');
s=s.replace("document.querySelector('#reset').onclick=()=>{init();","document.querySelector('#reset').onclick=()=>{if(graphics)graphics.referenceCamera=false;init();");
s=s.replace("if(e.code==='Digit1'&&e.shiftKey&&!e.repeat){","if(e.code==='Digit1'&&e.shiftKey&&!e.repeat){if(graphics)graphics.referenceCamera=false;");
s=s.replace("if(e.code==='Digit2'&&e.shiftKey&&!e.repeat){","if(e.code==='Digit2'&&e.shiftKey&&!e.repeat){if(graphics)graphics.referenceCamera=false;");
const panel=`<section class="panel mission"><div class="label">Landing panorama reference</div><p>4.6° S · 137.4° E</p><button class="reset" id="landing-view">LANDING PHOTO VIEW</button><details id="landing-photo"><summary style="cursor:pointer;margin-top:12px">Compare your reference photo</summary><a href="landing-reference.jpg" target="_blank" rel="noopener"><img src="landing-reference.jpg" alt="Supplied Curiosity landing panorama: brown gravel plain, small stones and distant ridges; black areas are missing imagery" style="width:100%;height:auto;margin-top:10px"></a><p>Appearance reference: muted brown dust, dark embedded stones and pale dusty sky. Small rocks are illustrative. The original panorama has missing image areas and does not provide measured 3D geometry or a calibrated heading for this view.</p><p>Your spawn remains at the requested rounded coordinates. Curiosity’s reconstructed landing position is approximately 4.5895° S, 137.4417° E, about 2.5 km away. Camera height here is an illustrative 2 m; horizon geometry still comes from the active terrain dataset.</p><a href="https://science.nasa.gov/photojournal/gale-crater-vista-in-glorious-color/" target="_blank" rel="noopener">NASA: early landing panorama and processing</a><p class="small">Image reference: NASA/JPL-Caltech/MSSS; supplied by you.</p></details></section>`;
s=s.replace('<section class="panel mission"><div class="label">Travel across Gale',panel+'<section class="panel mission"><div class="label">Travel across Gale');
new Function(s.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);fs.writeFileSync(file,s);
console.log('Landing reference palette, embedded stones, photo panel and 2 m camera added. Source heights and coordinate registration unchanged.');
