const fs=require('fs');let p='dist/renderer.js',s=fs.readFileSync(p,'utf8');fs.copyFileSync(p,'renderer-before-gale.js');
s=s.replace('...v.p,...v.n,.91,.755,.55','...v.p,...v.n,...Gale.materialAt(v.p[0],v.p[1]).color');
s=s.replace('  this.terrain=this.mesh(data);data=[];',`  this.terrain=this.mesh(data);data=[];
  // Compressed, illustrative Mount Sharp silhouette; not a sampled elevation map.
  const summit=(r,a)=>{let x=1200+Math.cos(a)*r,y=4900+Math.sin(a)*r;return [x,y,80+1120*Math.pow(Math.max(0,1-r/2700),1.45)+Math.sin(a*5+r*.004)*r*.018]};
  for(let r=0;r<2700;r+=150)for(let i=0;i<48;i++){let a=i*Math.PI/24,b=(i+1)*Math.PI/24;this.polygon(data,[summit(r,a),summit(r+150,a),summit(r+150,b),summit(r,b)],[.69,.53,.4])}this.landmark=this.mesh(data);data=[];`);
s=s.replace('this.draw(this.terrain,identity,false,1);this.draw(this.rocks,identity);','this.draw(this.terrain,identity,false,1);this.draw(this.landmark,identity,false,2);this.draw(this.rocks,identity);');
s=s.replace('this.aspect,2,3600','this.aspect,2,16000');
s=s.replace('distance(eye,world)/1850.','distance(eye,world)/(ground>1.5?7000.:2400.)');
s=s.replace('albedo*=1.+duneTint+ripple*.004*rippleFade;',`albedo*=1.+duneTint+ripple*.004*rippleFade;
   if(c.r<.46){float sandRipple=sin(world.x*.12+world.y*.05);albedo*=1.+sandRipple*.035*rippleFade;}
   else if(c.r>.76||ground>1.5){float layers=sin(world.z*.85+world.x*.003);albedo*=1.+layers*.055;}
   else if(c.b/c.r>.68){vec2 cell=abs(fract(world.xy*.045)-.5);float edge=min(.5-cell.x,.5-cell.y);float aa=max(fwidth(edge),.005);albedo*=.91+.09*smoothstep(.015-aa,.015+aa,edge);}`);
s=s.replace('resetMotion(){for(let w', 'resetMotion(){this.bodyZ=null;this.bodyV=0;for(let w');
s=s.replace('stampTrack(x,y,heading){let right=', 'stampTrack(x,y,heading){let material=Gale.materialAt(x,y);if(!material.tracks)return;let right=');
s=s.replace('this.polygon(data,p,[.53,.37,.24]);','this.polygon(data,p,material.color.map(c=>c*.73));');
s=s.replace('w.spin+distance*sign/w.radius','w.spin+distance*sign/w.radius/Math.max(.45,1-(rover.slip||0))');
s=s.replace('  let model=new Float32Array([...right',`  // Damped vertical chassis suspension under Mars gravity; wheels retain contact.
  let targetZ=z;if(this.bodyZ==null){this.bodyZ=z;this.bodyV=0}let dt=this.physicsDt||1/60;
  let gravity=Gale.gravity*Gale.unitsPerMeter,k=100,rest=targetZ+gravity/k;
  this.bodyV+=((rest-this.bodyZ)*k-20*this.bodyV-gravity)*dt;
  this.bodyZ+=this.bodyV*dt;this.bodyZ=Math.max(targetZ-2,Math.min(targetZ+2,this.bodyZ));z=this.bodyZ;
  let model=new Float32Array([...right`);
s=s.replace('let model=this.pose(rover),','this.physicsDt=dt;let model=this.pose(rover),');
fs.writeFileSync(p,s);new Function(s);
p='dist/index.html';s=fs.readFileSync(p,'utf8');fs.copyFileSync(p,'index-before-gale.html');
s=s.replace('<script src="renderer.js">','<script src="gale.js"></script><script src="renderer.js">');
s=s.replace('orbitZoom=185,uiTimer=0','orbitZoom=185,uiTimer=0,simulationMode=false');
s=s.replaceAll('Jezero','Gale').replace('18.44° N','GALE RECONSTRUCTION');s=s.replace('Explore the rusty terrain of Gale Crater. Follow the signals and drive close to each glowing sample to collect it.','Explore a reconstruction inspired by Curiosity: dark dunes, ancient lakebed rocks and layered foothills. Drive to five science stops.');
s=s.replace('Navigate the crater and collect geological samples to complete your survey.','Explore Gale through Curiosity’s discoveries. Stop at each beacon to read about the geology.');
s=s.replace('samples=[{x:1200,y:850},{x:1570,y:1050},{x:1650,y:1510},{x:1050,y:1660},{x:760,y:1100}].map((p,i)=>({...p,id:i,got:false}))','samples=Gale.observations.map((p,i)=>({...p,id:i,got:false}))');
s=s.replace("Math.abs(rover.v)/30).toFixed(1)","Math.abs(rover.v)/Gale.unitsPerMeter).toFixed(simulationMode?3:1)").replace('Math.floor(dist/10)','(dist/Gale.unitsPerMeter).toFixed(1)');
s=s.replace("document.querySelector('#sol').textContent", "document.querySelector('#surface').textContent=Gale.materialAt(rover.x,rover.y).name;document.querySelector('#traction').textContent=Math.round((rover.traction||Gale.materialAt(rover.x,rover.y).traction)*100)+'%';document.querySelector('#sol').textContent");
s=s.replace('<div class="statlabel">Atmosphere</div><div class="value">−63 <small>°C</small></div>','<div class="statlabel">Traction model</div><div class="value" id="traction">—</div>');
let a=s.indexOf('function terrain(x,y){'),b=s.indexOf('\nfunction render()',a);s=s.slice(0,a)+'function terrain(x,y){return Gale.height(x,y)}'+s.slice(b);
a=s.indexOf('rover.v+=(forward?');b=s.indexOf('for(const s of samples)',a);if(a<0||b<0)throw Error('physics not found');s=s.slice(0,a)+`dist+=Gale.step(rover,{forward,back,left,right},dt,(x,y)=>graphics?graphics.surface(x,y):terrain(x,y),simulationMode,rocks);`+s.slice(b);
s=s.replace("s.got=true;collected++;message(","s.got=true;collected++;document.querySelector('#science-title').textContent=s.name;document.querySelector('#science-text').textContent=s.text;message(");
s=s.replace('<div class="controlrow"><span>Drive & reverse</span>',`<div class="controlrow"><span>Driving mode</span><button class="reset" id="drive-mode" aria-pressed="false">EXPLORATION</button></div><p class="small" id="mode-note">Fast travel · simplified traction</p><div class="controlrow"><span>Drive & reverse</span>`);
s=s.replace('</aside>',`<section class="panel mission"><div class="label">Curiosity field notes</div><p id="surface">Gravel plain</p><h2 id="science-title" style="font-size:18px">Explore five geology stops</h2><p id="science-text">The ARES rover remains your vehicle. The landscape combines features studied by Curiosity, whose real rover uses six wheels.</p><details><summary style="cursor:pointer;font-size:12px">Scientific basis &amp; sources</summary><p style="margin-top:12px">Illustrative, compressed landscape — not a downloaded elevation map or Curiosity’s exact route. Terrain traction and suspension are simplified. Simulation mode caps speed at 0.04 m/s; exploration mode is faster. Physics uses 3.71 m/s² gravity and 18 scene units per metre.</p><p><a href="https://science.nasa.gov/blog/recap-of-the-bagnold-dune-investigation/" target="_blank" rel="noopener">NASA: Bagnold, Murray &amp; Stimson geology</a><br><a href="https://science.nasa.gov/photojournal/wide-angle-panorama-from-ridge-in-mars-gale-crater/" target="_blank" rel="noopener">NASA: Mount Sharp and Gale panorama</a><br><a href="https://www.jpl.nasa.gov/videos/building-curiosity-rover-rocks-rocker-bogie/" target="_blank" rel="noopener">JPL: Curiosity speed and suspension</a><br><a href="https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=PSP_010573_1755" target="_blank" rel="noopener">HiRISE: Gale elevation data (not loaded)</a></p></details></section></aside>`);
s=s.replace('a{','a{');s=s.replace('</style>','a{color:#e3b78f}summary{color:#dfb68c}</style>');
s=s.replace("document.querySelector('#zoom-in').onclick",`document.querySelector('#drive-mode').onclick=()=>{simulationMode=!simulationMode;rover.v=0;document.querySelector('#drive-mode').textContent=simulationMode?'SIMULATION':'EXPLORATION';document.querySelector('#drive-mode').setAttribute('aria-pressed',String(simulationMode));document.querySelector('#mode-note').textContent=simulationMode?'Curiosity speed limit: 0.04 m/s':'Fast travel · simplified traction';updateUI()};
document.querySelector('#zoom-in').onclick`);
fs.writeFileSync(p,s);new Function(s.match(/<script>\n([\s\S]*)<\/script>/)[1]);console.log('Gale environment, material traction, suspension, simulation toggle and source notes integrated');
