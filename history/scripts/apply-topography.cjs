const fs=require('fs');let p='dist/gale.js',s=fs.readFileSync(p,'utf8');let a=s.indexOf(' drivingBounds:'),b=s.indexOf(' unitsPerMeter:',a);s=s.slice(0,a)+` drivingBounds:{minX:30,maxX:GALE_TOPOGRAPHY.widthMeters*18-30,minY:30,maxY:GALE_TOPOGRAPHY.heightMeters*18-30},
 climbRoute:[[166,100],[175,135],[195,155],[215,180],[225,217]].map(p=>({x:p[0]*GALE_TOPOGRAPHY.metersPerSourcePixel*18,y:p[1]*GALE_TOPOGRAPHY.metersPerSourcePixel*18})),
 locations:{landing:[166,100],summit:[225,217],rim:[205,363]},
 mapPoint(x,y){return {x:x*GALE_TOPOGRAPHY.metersPerSourcePixel*this.unitsPerMeter,y:y*GALE_TOPOGRAPHY.metersPerSourcePixel*this.unitsPerMeter}},
 get overviewZoom(){return Math.max(GALE_TOPOGRAPHY.widthMeters,GALE_TOPOGRAPHY.heightMeters)*this.unitsPerMeter*.52},
`+s.slice(b);
a=s.indexOf(' materialAt(');b=s.indexOf(' observations:',a);
s=s.slice(0,a)+` materialAt(x,y){let origin=this.mapPoint(166,100),lx=x-origin.x+1200,ly=y-origin.y+1200;let sand=Math.exp(-(((lx-1570)/290)**2+((ly-1050)/370)**2));if(sand>.28)return this.materials.sand;if(this.elevationMeters(x,y)>-1500)return this.materials.sandstone;if(lx<1050+75*Math.cos(ly/160))return this.materials.mudstone;return this.materials.gravel},
 elevationMeters(x,y){const m=GALE_TOPOGRAPHY,gx=Math.max(0,Math.min(m.columns-1,x/(m.widthMeters*this.unitsPerMeter)*(m.columns-1))),gy=Math.max(0,Math.min(m.rows-1,y/(m.heightMeters*this.unitsPerMeter)*(m.rows-1))),ix=Math.min(m.columns-2,Math.floor(gx)),iy=Math.min(m.rows-2,Math.floor(gy)),u=gx-ix,v=gy-iy,a=m.heights[iy*m.columns+ix],b=m.heights[iy*m.columns+ix+1],c=m.heights[(iy+1)*m.columns+ix+1],d=m.heights[(iy+1)*m.columns+ix];return u>=v?a+(b-a)*u+(c-b)*v:a+(c-d)*u+(d-a)*v},
 height(x,y){return (this.elevationMeters(x,y)-GALE_TOPOGRAPHY.minLegend)*this.unitsPerMeter},
`+s.slice(b);fs.writeFileSync(p,s);new Function(s);
p='dist/renderer.js';s=fs.readFileSync(p,'utf8');a=s.indexOf('  let data=[];const step=22;');b=s.indexOf('  this.wheels=',a);s=s.slice(0,a)+`  let data=buildMappedGround();this.terrain=this.mesh(data);data=[];
`+s.slice(b);
a=s.indexOf(' surface(x,y){');b=s.indexOf('\n resetMotion()',a);s=s.slice(0,a)+` surface(x,y){return this.height(x,y)}
`+s.slice(b);
s=s.replace('this.draw(this.landmark,identity,false,1);','');s=s.replace('this.aspect,2,16000','this.aspect,2,Math.max(GALE_TOPOGRAPHY.widthMeters,GALE_TOPOGRAPHY.heightMeters)*Gale.unitsPerMeter*3');
s=s.replace('target=[rover.x,rover.y,base];eye=[rover.x,rover.y,base+this.zoom*2.8]', 'target=[GALE_TOPOGRAPHY.widthMeters*Gale.unitsPerMeter/2,GALE_TOPOGRAPHY.heightMeters*Gale.unitsPerMeter/2,4500*Gale.unitsPerMeter];eye=[target[0],target[1],target[2]+this.zoom*2.8]');
s=s.replace('distance(eye,world)/4000.','distance(eye,world)/1500000.');
// Rebase the perspective camera to reduce jitter at hundred-kilometre coordinates.
s=s.replace('uniform mat4 model,viewProjection,lightProjection;out vec3','uniform mat4 model,viewProjection,lightProjection;uniform vec3 eye;out vec3');s=s.replace('gl_Position=viewProjection*p;','gl_Position=viewProjection*vec4(p.xyz-eye,1.);');
s=s.replace('lookAt(eye,target,birdsEye&&!freeFlight?', 'lookAt([0,0,0],sub(target,eye),birdsEye&&!freeFlight?');
a=s.indexOf('// Coarse terrain keeps');b=s.indexOf('// Free-flight movement',a);if(a<0||b<0)throw Error('mesh helper not found');s=s.slice(0,a)+`// Image-derived terrain at real horizontal and vertical scale (18 units/metre).
function buildMappedGround(){const m=GALE_TOPOGRAPHY,data=[],vertices=[];for(let y=0;y<m.rows;y++)for(let x=0;x<m.columns;x++){let px=x/(m.columns-1)*m.widthMeters*Gale.unitsPerMeter,py=y/(m.rows-1)*m.heightMeters*Gale.unitsPerMeter,h=(m.heights[y*m.columns+x]-m.minLegend)*Gale.unitsPerMeter;let dx=(Gale.height(px+100,py)-Gale.height(px-100,py))/200,dy=(Gale.height(px,py+100)-Gale.height(px,py-100))/200;vertices.push([px,py,h,...unit([-dx,-dy,1]),...Gale.materialAt(px,py).color])}for(let y=0;y<m.rows-1;y++)for(let x=0;x<m.columns-1;x++){let a=y*m.columns+x,b=a+1,c=a+m.columns+1,d=a+m.columns;for(let i of [a,b,c,a,c,d])data.push(...vertices[i])}return data}
`+s.slice(b);
s=s.replace('direction[i]/length*320','direction[i]/length*320*Math.max(1,Math.min(3000,(flight.position[2]-height(flight.position[0],flight.position[1]))/300))');
s=s.replace('Math.max(-4500,Math.min(6900,flight.position[0]))','Math.max(30,Math.min(Gale.drivingBounds.maxX,flight.position[0]))').replace('Math.max(-4500,Math.min(6900,flight.position[1]))','Math.max(30,Math.min(Gale.drivingBounds.maxY,flight.position[1]))');s=s.replace('Math.min(4200,flight.position[2])','Math.min(Gale.overviewZoom*3,flight.position[2])');
fs.writeFileSync(p,s);new Function(s);console.log('Map-derived height field and full-scale GPU geometry integrated.');
