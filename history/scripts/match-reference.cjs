const fs=require('fs');const file='dist/renderer.js';let s=fs.readFileSync(file,'utf8');fs.copyFileSync(file,'renderer-before-reference.js');
function change(a,b){if(!s.includes(a))throw Error('Missing target: '+a.slice(0,70));s=s.replace(a,b)}
change('vec3 sun=normalize(vec3(-.5,-.35,1.))','vec3 sun=normalize(vec3(.7,-.45,.95))');
change('vec2(float(x),float(y))/1024.','vec2(float(x),float(y))*1.65/1024.');
change(`vec3 albedo=c;if(ground>.5){float ripple=sin(world.x*1.3+sin(world.y*.17)*3.)*sin(world.y*.8);float grain=fract(sin(dot(floor(world.xy*9.),vec2(12.9898,78.233)))*43758.5453);float fade=1.-smoothstep(90.,350.,distance(eye,world));albedo*=1.+(ripple*.025+(grain-.5)*.065)*fade;}`,`vec3 albedo=c;if(ground>.5){
   // Broad tonal variations stay stable at distance; no high-frequency moire.
   float duneTint=sin(world.x*.012+world.y*.006)*sin(world.y*.01)*.018;
   float footprint=max(length(dFdx(world.xy)),length(dFdy(world.xy)));
   float ripple=sin(world.x*.18+sin(world.y*.025)*2.);
   float rippleFade=1.-smoothstep(.5,3.,footprint);
   albedo*=1.+duneTint+ripple*.004*rippleFade;
  }`);
change("float spec=pow(max(dot(normal,halfDir),0.),32.)*(ground>.5?.015:.12)*(1.-shade);", "float spec=pow(max(dot(normal,halfDir),0.),42.)*(ground>.5?.008:.17)*(1.-shade);");
change('vec3 lit=albedo*(.56+.44*diffuse*(1.-shade*.8))+vec3(1.,.9,.72)*spec;',`vec3 fill=vec3(.42,.405,.38);
  vec3 direct=vec3(.64,.61,.55)*diffuse*(1.-shade*.8);
  vec3 lit=albedo*(fill+direct)+vec3(1.,.94,.8)*spec;`);
change('distance(eye,world)/1450.','distance(eye,world)/1850.');
change('...v.p,...v.n,.79,.61,.42','...v.p,...v.n,.91,.755,.55');
let a=s.indexOf('  for(const r of rocks){'),b=s.indexOf('this.rocks=this.mesh(data);',a);if(a<0||b<0)throw Error('rocks missing');
s=s.slice(0,a)+`  for(const r of rocks){
   // Uneven, bevelled silhouettes rather than pointed pyramids.
   let z=height(r.x,r.y),rr=r.r,lower=[],upper=[];
   for(let i=0;i<6;i++){let a=r.a+i*Math.PI/3,k=.86+.12*Math.sin(i*9+r.x);lower.push([r.x+Math.cos(a)*rr*k,r.y+Math.sin(a)*rr*k,z-1]);upper.push([r.x+Math.cos(a)*rr*k*.65+rr*.08,r.y+Math.sin(a)*rr*k*.65,z+rr*(.64+.12*Math.sin(i*3+r.y))])}
   for(let i=0;i<6;i++)this.polygon(data,[lower[i],lower[(i+1)%6],upper[(i+1)%6],upper[i]],[.48,.245,.135]);
   this.polygon(data,upper,[.54,.285,.16]);
  }`+s.slice(b);
change('Math.min(1.1,.38-this.pitch)','Math.min(1.1,.59-this.pitch)');
change('target=[rover.x,rover.y,base+34]','target=[rover.x,rover.y,base+25]');
change('Math.cos(elevation)*190','Math.cos(elevation)*185');change('Math.cos(elevation)*190','Math.cos(elevation)*185');change('Math.sin(elevation)*190','Math.sin(elevation)*185');
change('perspective(Math.PI/3,this.aspect,2,3600)','perspective((firstPerson?60:52)*Math.PI/180,this.aspect,2,3600)');
change('[rover.x-250,rover.y-175,base+500]','[rover.x+350,rover.y-225,base+475]');
fs.writeFileSync(file,s);new Function(s);
let p='dist/index.html';s=fs.readFileSync(p,'utf8');let old='return 24*Math.sin(x/240)*Math.cos(y/310)+12*Math.sin((x+y)/135)+5*Math.cos(y/78+x/140)+2.2*Math.sin(x/27)*Math.cos(y/34)';if(!s.includes(old))throw Error('terrain missing');s=s.replace(old,'return 29*Math.sin(x/310)*Math.cos(y/380)+12*Math.sin((x+y)/185)+3.5*Math.cos(y/110+x/210)');
s=s.replace('box-shadow:inset 0 0 100px #39201855','box-shadow:inset 0 0 70px #39201818');
fs.writeFileSync(p,s);new Function(s.match(/<script>\n([\s\S]*)<\/script>/)[1]);console.log('Reference styling applied: smooth sand, warm key light, soft shadows, faceted rocks, elevated chase camera');
