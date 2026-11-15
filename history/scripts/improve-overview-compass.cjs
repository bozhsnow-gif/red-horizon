const fs=require('fs');let p='dist/renderer.js',s=fs.readFileSync(p,'utf8');s=s.replace('uniform float ground;uniform vec3 contacts','uniform float ground;uniform float overview;uniform vec3 contacts');
s=s.replace('float diffuse=max(dot(normal,sun),0.);',`vec3 reliefNormal=normalize(vec3(normal.xy*mix(1.,4.,overview*step(.5,ground)),normal.z));float diffuse=max(dot(reliefNormal,sun),0.);`);
s=s.replace('  vec3 halfDir=',`  if(ground>.5&&overview>0.){
   float elevation=world.z/18.-4500.;
   vec3 low=vec3(.48,.43,.35),middle=vec3(.73,.64,.48),high=vec3(.91,.80,.61);
   float t=clamp((elevation+4500.)/6000.,0.,1.);
   vec3 elevationColor=t<.5?mix(low,middle,t*2.):mix(middle,high,(t-.5)*2.);
   albedo=mix(albedo,elevationColor,overview*.65);
   float contourDistance=abs(fract(elevation/250.+.5)-.5)*250.;
   float pixelHeight=max(fwidth(elevation),1.);
   float contour=(1.-smoothstep(0.,max(5.,pixelHeight*1.2),contourDistance))*(1.-smoothstep(70.,180.,pixelHeight));
   albedo*=1.-contour*.16*overview;
  }
  vec3 halfDir=`);
s=s.replace('lit=mix(lit,vec3(.77,.59,.46),fog);','fog*=mix(1.,.025,overview);lit=mix(lit,vec3(.77,.59,.46),fog);');s=s.replace("'ground','shadowMap'","'ground','overview','shadowMap'");
s=s.replace('  this.yaw=0;',"  this.compass=document.querySelector('#compass-rose');this.compassHeading=document.querySelector('#compass-heading');this.compassTime=0;\n  this.yaw=0;");
s=s.replace('  let vp=mul(perspective(',`  const altitude=Math.max(0,eye[2]-this.height(eye[0],eye[1]))/Gale.unitsPerMeter;
  const overview=birdsEye&&!freeFlight?1:Math.max(0,Math.min(1,(altitude-1500)/6500));
  if(time-this.compassTime>100){let heading=((birdsEye&&!freeFlight?this.yaw:angle)*180/Math.PI%360+360)%360;this.compass.style.setProperty('--compass-angle',heading+'deg');this.compassHeading.textContent=Math.round(heading%360).toString().padStart(3,'0')+'°';this.compassTime=time}
  let vp=mul(perspective(`);
s=s.replace('gl.uniform3fv(this.uniforms.eye,eye);','gl.uniform3fv(this.uniforms.eye,eye);gl.uniform1f(this.uniforms.overview,overview);');
fs.writeFileSync(p,s);new Function(s);
p='dist/index.html';s=fs.readFileSync(p,'utf8');s=s.replace('</style>',`.compass{position:absolute;z-index:3;top:78px;left:24px;width:82px;text-align:center;pointer-events:none;color:#fff0d8;font:10px 'DM Mono',monospace}.compass-dial{position:relative;height:82px;border:1px solid #e6c3a777;border-radius:50%;background:#29221bb3;box-shadow:0 2px 12px #25171033}.compass-rose{position:absolute;inset:0;transform:rotate(calc(-1 * var(--compass-angle,0deg)))}.compass-label{position:absolute;transform:rotate(var(--compass-angle,0deg));width:16px;height:16px;line-height:16px;text-align:center}.compass-n{left:32px;top:4px;color:#ffbc77;font-weight:bold}.compass-s{left:32px;bottom:4px}.compass-e{right:4px;top:32px;color:#c7b59c}.compass-w{left:4px;top:32px;color:#c7b59c}.compass-pointer{position:absolute;top:27px;left:34px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:18px solid #f4e4c9}.compass-heading{display:block;margin-top:6px;text-shadow:0 1px 3px #221911} @media(max-width:560px){.compass{left:14px;top:64px;transform:scale(.85);transform-origin:top left}}
</style>`);
s=s.replace('<div class="toast" id="toast">',`<div class="compass" role="img" aria-label="Compass: north, south, east and west relative to the current camera"><div class="compass-dial"><div class="compass-rose" id="compass-rose"><span class="compass-label compass-n">N</span><span class="compass-label compass-s">S</span><span class="compass-label compass-e">E</span><span class="compass-label compass-w">W</span></div><span class="compass-pointer"></span></div><span class="compass-heading" id="compass-heading">000°</span></div><div class="toast" id="toast">`);
s=s.replace('02 / Calibrated topography','02 / Calibrated topography');s=s.replace('Crater overview</span>','Crater overview · relief</span>');
s=s.replace('Image shading, compression and a roughly 0.9 km grid limit accuracy.','Image shading, compression and a roughly 0.9 km grid limit accuracy. High-altitude views enhance shading and show 250 m contours without changing terrain heights. Compass north follows the top of the supplied map.');
fs.writeFileSync(p,s);new Function(s.match(/<script>\n([\s\S]*)<\/script>/)[1]);console.log('Overview haze reduced; relief lighting/contours enabled; camera-relative compass installed.');
