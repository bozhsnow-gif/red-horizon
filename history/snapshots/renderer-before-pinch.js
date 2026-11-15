'use strict';
// GPU terrain, rover, lighting and shadow renderer. No network dependencies.
class MarsRenderer {
 constructor(canvas,parts,rocks,height){
  this.canvas=canvas;this.height=height;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
  if(!this.gl)throw Error('WebGL 2 is required. Enable hardware acceleration in your browser.');
  const gl=this.gl;
  const vs=`#version 300 es
  precision highp float;
  layout(location=0) in vec3 position;layout(location=1) in vec3 normal;layout(location=2) in vec3 color;
  uniform mat4 model,viewProjection,lightProjection;out vec3 world,n,c;out vec4 shadowCoord;
  void main(){vec4 p=model*vec4(position,1.);world=p.xyz;n=mat3(model)*normal;c=color;shadowCoord=lightProjection*p;gl_Position=viewProjection*p;}`;
  const fs=`#version 300 es
  precision highp float;in vec3 world,n,c;in vec4 shadowCoord;uniform sampler2D shadowMap;uniform vec3 eye;uniform float ground;out vec4 outColor;
  void main(){vec3 normal=normalize(n);if(!gl_FrontFacing)normal=-normal;vec3 sun=normalize(vec3(.7,-.45,.95));float diffuse=max(dot(normal,sun),0.);vec3 sc=shadowCoord.xyz/shadowCoord.w*.5+.5;float shade=0.;
  if(sc.x>0.&&sc.x<1.&&sc.y>0.&&sc.y<1.&&sc.z<1.){float bias=max(.00025,.001*(1.-diffuse));for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float z=texture(shadowMap,sc.xy+vec2(float(x),float(y))*1.65/1024.).r;shade+=sc.z-bias>z?1.:0.;}shade/=9.;}
  vec3 albedo=c;if(ground>.5){
   // Broad tonal variations stay stable at distance; no high-frequency moire.
   float duneTint=sin(world.x*.012+world.y*.006)*sin(world.y*.01)*.018;
   float footprint=max(length(dFdx(world.xy)),length(dFdy(world.xy)));
   float ripple=sin(world.x*.18+sin(world.y*.025)*2.);
   float rippleFade=1.-smoothstep(.5,3.,footprint);
   albedo*=1.+duneTint+ripple*.004*rippleFade;
  }
  vec3 halfDir=normalize(sun+normalize(eye-world));float spec=pow(max(dot(normal,halfDir),0.),42.)*(ground>.5?.008:.17)*(1.-shade);
  vec3 fill=vec3(.42,.405,.38);
  vec3 direct=vec3(.64,.61,.55)*diffuse*(1.-shade*.8);
  vec3 lit=albedo*(fill+direct)+vec3(1.,.94,.8)*spec;
  float fog=1.-exp(-pow(distance(eye,world)/1850.,1.5));lit=mix(lit,vec3(.77,.59,.46),fog);outColor=vec4(lit,1.);}`;
  const depthVs=`#version 300 es
  layout(location=0) in vec3 position;uniform mat4 model,viewProjection;void main(){gl_Position=viewProjection*model*vec4(position,1.);}`;
  const depthFs=`#version 300 es
  precision highp float;void main(){}`;
  this.program=this.programFrom(vs,fs);this.depthProgram=this.programFrom(depthVs,depthFs);
  this.uniforms={};for(const name of ['model','viewProjection','lightProjection','eye','ground','shadowMap'])this.uniforms[name]=gl.getUniformLocation(this.program,name);
  this.du={model:gl.getUniformLocation(this.depthProgram,'model'),viewProjection:gl.getUniformLocation(this.depthProgram,'viewProjection')};
  this.shadow=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.shadow);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,1024,1024,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  this.fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadow,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Shadow framebuffer could not be created');gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  let data=[];const step=22;
  const vert=(x,y)=>{let dx=(height(x+1,y)-height(x-1,y))/2,dy=(height(x,y+1)-height(x,y-1))/2;return {p:[x,y,height(x,y)],n:unit([-dx,-dy,1])}};
  for(let x=-1000;x<3400;x+=step)for(let y=-1000;y<3400;y+=step){let a=vert(x,y),b=vert(x+step,y),c=vert(x+step,y+step),d=vert(x,y+step);for(let v of [a,b,c,a,c,d])data.push(...v.p,...v.n,.91,.755,.55)}
  this.terrain=this.mesh(data);data=[];
  this.wheels=ARES4_RIG.wheels.map(w=>{let d=[],center=[w.center[0]*18,-w.center[1]*18,w.center[2]*18];for(let p of w.parts)this.polygon(d,p.slice(0,-1).map(v=>[v[0]*18-center[0],-v[1]*18-center[1],v[2]*18-center[2]]),p[p.length-1].map(c=>c/255));return {mesh:this.mesh(d),center,radius:w.radius*18,spin:0,previous:null,stamp:null,model:null}});
  this.trackCapacity=6000;this.trackCursor=0;this.trackCount=0;this.trackMesh=this.mesh(new Float32Array(this.trackCapacity*54));this.trackMesh.count=0;

  for(const p of parts){let points=p.slice(0,-1).map(v=>[v[0]*18,-v[1]*18,v[2]*18]),rgb=p[p.length-1].map(c=>c/255);this.polygon(data,points,rgb)}this.rover=this.mesh(data);data=[];
  for(const r of rocks){
   // Uneven, bevelled silhouettes rather than pointed pyramids.
   let z=height(r.x,r.y),rr=r.r,lower=[],upper=[];
   for(let i=0;i<6;i++){let a=r.a+i*Math.PI/3,k=.86+.12*Math.sin(i*9+r.x);lower.push([r.x+Math.cos(a)*rr*k,r.y+Math.sin(a)*rr*k,z-1]);upper.push([r.x+Math.cos(a)*rr*k*.65+rr*.08,r.y+Math.sin(a)*rr*k*.65,z+rr*(.64+.12*Math.sin(i*3+r.y))])}
   for(let i=0;i<6;i++)this.polygon(data,[lower[i],lower[(i+1)%6],upper[(i+1)%6],upper[i]],[.48,.245,.135]);
   this.polygon(data,upper,[.54,.285,.16]);
  }this.rocks=this.mesh(data);
  data=[];let peak=[0,0,15],bottom=[0,0,-5],ring=[[8,0,5],[0,8,5],[-8,0,5],[0,-8,5]];for(let i=0;i<4;i++){this.polygon(data,[ring[i],ring[(i+1)%4],peak],[1,.8,.38]);this.polygon(data,[ring[(i+1)%4],ring[i],bottom],[.9,.6,.22])}this.sample=this.mesh(data);
  this.yaw=0;this.pitch=0;this.last=0;this.mapTime=0;this.fpsFrames=0;this.fpsTime=0;this.scale=Math.min(devicePixelRatio||1,2);this.slow=0;this.lastShadow='';gl.enable(gl.DEPTH_TEST);this.resize();
 }
 programFrom(vs,fs){let gl=this.gl;function shader(type,src){let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}let p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p}
 polygon(data,p,c){for(let i=1;i<p.length-1;i++){let a=p[0],b=p[i],d=p[i+1],n=unit(cross(sub(b,a),sub(d,a)));for(let v of [a,b,d])data.push(...v,...n,...c)}}
 mesh(data){let gl=this.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);let buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);for(let i=0;i<3;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,36,i*12)}return {vao,buffer,count:data.length/9}}
 resize(){let r=this.canvas.getBoundingClientRect();this.canvas.width=Math.round(r.width*this.scale);this.canvas.height=Math.round(r.height*this.scale);this.aspect=r.width/r.height}
 draw(mesh,model,depth=false,ground=0){let gl=this.gl;gl.uniformMatrix4fv(depth?this.du.model:this.uniforms.model,false,model);if(!depth)gl.uniform1f(this.uniforms.ground,ground);gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.count)}

 surface(x,y){const step=22,ox=Math.floor((x+1000)/step)*step-1000,oy=Math.floor((y+1000)/step)*step-1000,u=(x-ox)/step,v=(y-oy)/step,a=this.height(ox,oy),b=this.height(ox+step,oy),c=this.height(ox+step,oy+step),d=this.height(ox,oy+step);return u>=v?a+(b-a)*u+(c-b)*v:a+(c-d)*u+(d-a)*v}
 resetMotion(){for(let w of this.wheels){w.spin=0;w.previous=null;w.stamp=null}this.trackCursor=0;this.trackCount=0;this.trackMesh.count=0;this.lastShadow=''}
 stampTrack(x,y,heading){let right=[Math.cos(heading),Math.sin(heading)],forward=[Math.sin(heading),-Math.cos(heading)],p=[];for(let [side,along] of [[-4.8,-.7],[4.8,-.7],[4.8,.7],[-4.8,.7]]){let px=x+right[0]*side+forward[0]*along,py=y+right[1]*side+forward[1]*along;p.push([px,py,this.surface(px,py)+.09])}let data=[];this.polygon(data,p,[.53,.37,.24]);let gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.trackMesh.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,this.trackCursor*54*4,new Float32Array(data));this.trackCursor=(this.trackCursor+1)%this.trackCapacity;this.trackCount=Math.min(this.trackCount+1,this.trackCapacity);this.trackMesh.count=this.trackCount*6}
 pose(rover){let ca=Math.cos(rover.a),sa=Math.sin(rover.a),heights=this.wheels.map(w=>this.surface(rover.x+w.center[0]*ca-w.center[1]*sa,rover.y+w.center[0]*sa+w.center[1]*ca));
  let sx=0,sy=0,xx=0,yy=0;for(let i=0;i<4;i++){let c=this.wheels[i].center;sx+=c[0]*heights[i];sy+=c[1]*heights[i];xx+=c[0]*c[0];yy+=c[1]*c[1]}sx/=xx;sy/=yy;
  let right=unit([ca,sa,sx]),back=unit([-sa,ca,sy]),up=unit(cross(right,back));back=unit(cross(up,right));let z=heights.reduce((a,b)=>a+b,0)/4+this.wheels[0].radius-this.wheels[0].center[2];
  let model=new Float32Array([...right,0,...back,0,...up,0,rover.x,rover.y,z,1]);
  for(let w of this.wheels){let x=rover.x+right[0]*w.center[0]+back[0]*w.center[1]+up[0]*w.center[2],y=rover.y+right[1]*w.center[0]+back[1]*w.center[1]+up[1]*w.center[2],ground=this.surface(x,y),point=[x,y,ground],wheelZ=ground+w.radius*Math.sqrt(Math.max(0,1-right[2]*right[2]));
   if(w.previous){let dx=x-w.previous[0],dy=y-w.previous[1],dz=ground-w.previous[2],distance=Math.hypot(dx,dy,dz),sign=Math.sign(dx*sa-dy*ca);w.spin=(w.spin+distance*sign/w.radius)%(Math.PI*2)}w.previous=point;
   if(!w.stamp)w.stamp=point.slice();let dx=x-w.stamp[0],dy=y-w.stamp[1],length=Math.hypot(dx,dy);if(length>=2.6){let count=Math.min(100,Math.floor(length/2.6));for(let i=1;i<=count;i++)this.stampTrack(w.stamp[0]+dx*i*2.6/length,w.stamp[1]+dy*i*2.6/length,rover.a);w.stamp=[w.stamp[0]+dx*count*2.6/length,w.stamp[1]+dy*count*2.6/length,ground]}
   let basis=new Float32Array(model);basis[12]=x;basis[13]=y;basis[14]=wheelZ;let c=Math.cos(w.spin),s=Math.sin(w.spin);w.model=mul(basis,new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]));
  }return model;
 }
 render(rover,samples,firstPerson,orbitYaw,orbitPitch,time){
  let gl=this.gl,dt=Math.min(.05,(time-this.last)/1000||.016);this.last=time;let smooth=1-Math.exp(-14*dt);this.yaw+=(orbitYaw-this.yaw)*smooth;this.pitch+=(orbitPitch-this.pitch)*smooth;
  let model=this.pose(rover),base=model[14],angle=rover.a+this.yaw,elevation=Math.max(.16,Math.min(1.1,.59-this.pitch)),target=[rover.x,rover.y,base+25],eye;
  if(firstPerson){eye=[rover.x+Math.sin(rover.a)*15,rover.y-Math.cos(rover.a)*15,base+65];let p=this.pitch;target=[eye[0]+Math.sin(angle)*Math.cos(p)*100,eye[1]-Math.cos(angle)*Math.cos(p)*100,eye[2]+Math.sin(p)*100]}
  else {eye=[target[0]-Math.sin(angle)*Math.cos(elevation)*185,target[1]+Math.cos(angle)*Math.cos(elevation)*185,target[2]+Math.sin(elevation)*185];eye[2]=Math.max(eye[2],this.height(eye[0],eye[1])+15)}
  let vp=mul(perspective((firstPerson?60:52)*Math.PI/180,this.aspect,2,3600),lookAt(eye,target)),identity=transform(0,0,0,0);
  let light=mul(ortho(-190,190,-190,190,1,900),lookAt([rover.x+350,rover.y-225,base+475],[rover.x,rover.y,base]));
  let shadowKey=[rover.x,rover.y,rover.a].join(',');if(shadowKey!==this.lastShadow){gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,1024,1024);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(this.depthProgram);gl.uniformMatrix4fv(this.du.viewProjection,false,light);this.draw(this.terrain,identity,true);this.draw(this.rocks,identity,true);this.draw(this.rover,model,true);for(let w of this.wheels)this.draw(w.mesh,w.model,true);this.lastShadow=shadowKey}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.77,.59,.46,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.uniformMatrix4fv(this.uniforms.viewProjection,false,vp);gl.uniformMatrix4fv(this.uniforms.lightProjection,false,light);gl.uniform3fv(this.uniforms.eye,eye);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shadow);gl.uniform1i(this.uniforms.shadowMap,0);this.draw(this.terrain,identity,false,1);this.draw(this.rocks,identity);if(this.trackMesh.count)this.draw(this.trackMesh,identity,false,1);if(!firstPerson){this.draw(this.rover,model);for(let w of this.wheels)this.draw(w.mesh,w.model)}
  for(let s of samples)if(!s.got)this.draw(this.sample,transform(s.x,s.y,this.height(s.x,s.y)+24+Math.sin(time*.002+s.id)*3,time*.0005));
  this.fpsFrames++;if(time-this.fpsTime>1000){let fps=Math.round(this.fpsFrames*1000/(time-this.fpsTime));document.querySelector('#fps').textContent=fps+' FPS';if(fps<42&&time>3000){this.slow++;if(this.slow>=2&&this.scale>1){this.scale=Math.max(1,this.scale-.25);this.resize();this.slow=0}}else this.slow=0;this.fpsFrames=0;this.fpsTime=time}
 }
}
function sub(a,b){return a.map((x,i)=>x-b[i])}function unit(v){let l=Math.hypot(...v)||1;return v.map(x=>x/l)}function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}function dot(a,b){return a.reduce((n,x,i)=>n+x*b[i],0)}
function transform(x,y,z,a){let c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,x,y,z,1])}
function lookAt(eye,target){let z=unit(sub(eye,target)),x=unit(cross([0,0,1],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1])}
function perspective(fov,aspect,n,f){let k=1/Math.tan(fov/2);return new Float32Array([k/aspect,0,0,0,0,k,0,0,0,0,(f+n)/(n-f),-1,0,0,2*f*n/(n-f),0])}
function ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1])}
function mul(a,b){let o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o}
