const fs=require('fs');let p='dist/gale.js',s=fs.readFileSync(p,'utf8');const target='return rolling+foothill+ripples';if(!s.includes(target))throw Error('Height target missing');s=s.replace(target,`let radius=Math.hypot(x-1200,y-4900),q=Math.max(0,1-radius/2700);let mountain=1120*q*q*(3-2*q);return rolling+foothill+ripples+mountain`);fs.writeFileSync(p,s);
p='dist/renderer.js';s=fs.readFileSync(p,'utf8');let a=s.indexOf('  // Compressed, illustrative Mount Sharp'),b=s.indexOf('  this.wheels=',a);if(a<0||b<0)throw Error('Separate mountain mesh missing');s=s.slice(0,a)+`  // Distant ground uses the same height field, stitched exactly to the near mesh.
  this.landmark=this.mesh(buildDistantGround(height));data=[];
`+s.slice(b);s=s.replace('this.draw(this.landmark,identity,false,2)','this.draw(this.landmark,identity,false,1)');s=s.replace('(ground>1.5?7000.:2400.)','4000.');
s+=`
// Coarse terrain keeps distant rendering inexpensive. At the inner boundary,
// each coarse edge is split at all 22-unit near-grid vertices to prevent cracks.
function buildDistantGround(height){
 const data=[],nearMin=-1000,nearMax=3400,farMin=-5400,farMax=7800,step=176;
 function vertex(x,y){let n=unit([-(height(x+1,y)-height(x-1,y))/2,-(height(x,y+1)-height(x,y-1))/2,1]);return [x,y,height(x,y),...n,...Gale.materialAt(x,y).color]}
 for(let x=farMin;x<farMax;x+=step)for(let y=farMin;y<farMax;y+=step){
  if(x>=nearMin&&x<nearMax&&y>=nearMin&&y<nearMax)continue;
  let corners=[[x,y],[x+step,y],[x+step,y+step],[x,y+step]],ring=[];
  for(let i=0;i<4;i++){let a=corners[i],b=corners[(i+1)%4];let vertical=a[0]===b[0]&&(a[0]===nearMin||a[0]===nearMax)&&Math.min(a[1],b[1])>=nearMin&&Math.max(a[1],b[1])<=nearMax;let horizontal=a[1]===b[1]&&(a[1]===nearMin||a[1]===nearMax)&&Math.min(a[0],b[0])>=nearMin&&Math.max(a[0],b[0])<=nearMax;let divisions=vertical||horizontal?8:1;for(let j=0;j<divisions;j++)ring.push(vertex(a[0]+(b[0]-a[0])*j/divisions,a[1]+(b[1]-a[1])*j/divisions))}
  let center=vertex(x+step/2,y+step/2);for(let i=0;i<ring.length;i++)data.push(...center,...ring[i],...ring[(i+1)%ring.length]);
 }return data;
}
`;
new Function(s);fs.writeFileSync(p,s);console.log('Unified mountain elevation with ground; stitched coarse and fine terrain boundaries.');
