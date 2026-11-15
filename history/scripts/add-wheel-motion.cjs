const fs=require('fs');let p='dist/renderer.js',s=fs.readFileSync(p,'utf8');
s=s.replace('this.terrain=this.mesh(data);data=[];',`this.terrain=this.mesh(data);data=[];
  this.wheels=ARES4_RIG.wheels.map(w=>{let d=[],center=[w.center[0]*18,-w.center[1]*18,w.center[2]*18];for(let p of w.parts)this.polygon(d,p.slice(0,-1).map(v=>[v[0]*18-center[0],-v[1]*18-center[1],v[2]*18-center[2]]),p[p.length-1].map(c=>c/255));return {mesh:this.mesh(d),center,radius:w.radius*18,spin:0,previous:null,stamp:null,model:null}});
  this.trackCapacity=6000;this.trackCursor=0;this.trackCount=0;this.trackMesh=this.mesh(new Float32Array(this.trackCapacity*54));this.trackMesh.count=0;
`);
s=s.replace('gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData', 'let buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData');s=s.replace('return {vao,count:data.length/9}', 'return {vao,buffer,count:data.length/9}');
const methods=`
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
`;
s=s.replace(' render(rover,samples',methods+' render(rover,samples');
s=s.replace('let base=this.height(rover.x,rover.y),angle=', 'let model=this.pose(rover),base=model[14],angle=');
s=s.replace('model=transform(rover.x,rover.y,base,rover.a),identity=', 'identity=');
s=s.replace('this.draw(this.rover,model,true);this.lastShadow', 'this.draw(this.rover,model,true);for(let w of this.wheels)this.draw(w.mesh,w.model,true);this.lastShadow');
s=s.replace('this.draw(this.rocks,identity);if(!firstPerson)this.draw(this.rover,model);','this.draw(this.rocks,identity);if(this.trackMesh.count)this.draw(this.trackMesh,identity,false,1);if(!firstPerson){this.draw(this.rover,model);for(let w of this.wheels)this.draw(w.mesh,w.model)}');
fs.writeFileSync(p,s);new Function(s);
p='dist/index.html';s=fs.readFileSync(p,'utf8');s=s.replace('function init(){rover=', 'function init(){if(graphics)graphics.resetMotion();rover=');
// Remove obsolete random tracks; the renderer emits distance-spaced wheel contact marks.
let start=s.indexOf('if(Math.abs(rover.v)>10&&Math.random()<.35)'),end=s.indexOf('for(const s of samples)',start);if(start<0||end<0)throw Error('track code missing');s=s.slice(0,start)+s.slice(end);
s=s.replace('dist+=Math.hypot(dx,dy);','dist+=Math.hypot(dx,dy);');fs.writeFileSync(p,s);new Function(s.match(/<script>\n([\s\S]*)<\/script>/)[1]);console.log('Terrain pose, four animated wheels and bounded GPU track buffer integrated');
