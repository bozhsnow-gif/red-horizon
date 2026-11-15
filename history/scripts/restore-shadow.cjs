const fs=require('fs'),p='dist/renderer.js';let s=fs.readFileSync(p,'utf8');
s=s.replace('normalize(vec3(.7,-.45,.95))','normalize(vec3(.4,-.25,1.))');
const marker='  // Small, soft tire contact shading replaces the oversized cast shadow.';
if(!s.includes(marker))throw Error('Shadow insertion point missing');
s=s.replace(marker,`  // Soft rover-only cast shadow, combined with local tire contact shading.
  if(ground>.5&&sc.x>0.&&sc.x<1.&&sc.y>0.&&sc.y<1.&&sc.z>0.&&sc.z<1.){
   float occlusion=0.;float bias=max(.0003,.001*(1.-diffuse));
   for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
    float depth=texture(shadowMap,sc.xy+vec2(float(x),float(y))*1.65/1024.).r;
    occlusion+=sc.z-bias>depth?1.:0.;
   }shade=occlusion/9.*.72;
  }`);
s=s.replace('if(ground>.5){for(int i=0;i<4;i++){vec2 delta=world.xy-contacts[i].xy;shade+=exp(-dot(delta,delta)/55.)*.38;}shade=min(shade,.46);}', 'if(ground>.5){float contactShade=0.;for(int i=0;i<4;i++){vec2 delta=world.xy-contacts[i].xy;contactShade+=exp(-dot(delta,delta)/55.)*.38;}shade=max(shade,min(contactShade,.46));}');
s=s.replace('[rover.x+350,rover.y-225,base+475]','[rover.x+200,rover.y-125,base+500]');
const target='  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);';
if(!s.includes(target))throw Error('Shadow render insertion missing');
s=s.replace(target,`  let shadowKey=[rover.x,rover.y,rover.a,...this.wheels.map(w=>w.spin)].join(',');
  if(shadowKey!==this.lastShadow){
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,1024,1024);gl.clear(gl.DEPTH_BUFFER_BIT);
   gl.useProgram(this.depthProgram);gl.uniformMatrix4fv(this.du.viewProjection,false,light);
   this.draw(this.rover,model,true);for(let w of this.wheels)this.draw(w.mesh,w.model,true);
   this.lastShadow=shadowKey;
  }
`+target);
new Function(s);fs.writeFileSync(p,s);console.log('Soft rover shadow restored; stationary shadow map is cached.');
