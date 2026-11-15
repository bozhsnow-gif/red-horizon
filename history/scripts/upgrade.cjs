const fs=require('fs');let p='dist/index.html',s=fs.readFileSync(p,'utf8');
s=s.replace('<script src="ares4-mesh.js"></script>','<script src="ares4-mesh.js"></script><script src="renderer.js"></script>');s=s.replace("ctx=canvas.getContext('2d'),",'');s=s.replace('let W,H,dpr,keys={}', 'let graphics=null,W,H,dpr,keys={}');
let a=s.indexOf('// Index shared vertices'),b=s.indexOf('function drawMap()',a);s=s.slice(0,a)+`function terrain(x,y){return 24*Math.sin(x/240)*Math.cos(y/310)+12*Math.sin((x+y)/135)+5*Math.cos(y/78+x/140)+2.2*Math.sin(x/27)*Math.cos(y/34)}
function render(){if(graphics)graphics.render(rover,samples,firstPerson,orbitYaw,orbitPitch,performance.now())}
`+s.slice(b);
a=s.indexOf('function resize()');b=s.indexOf("window.addEventListener('resize',resize);",a);s=s.slice(0,a)+"function resize(){if(graphics)graphics.resize()}"+s.slice(b);
s=s.replace('forward?90:0','forward?117:0').replace('back?65:0','back?84.5:0').replace('Math.max(-45,Math.min(95,rover.v))','Math.max(-58.5,Math.min(123.5,rover.v))');
s=s.replace('updateUI();uiTimer=0','updateUI();drawMap();uiTimer=0');
s=s.replace("'OVERHEAD CAMERA'","'ORBIT CAMERA'");s=s.replace("e.button===2||e.button===1","e.button===0||e.button===2||e.button===1");
s=s.replace("'TWO-FINGER DRAG'","'TWO-FINGER DRAG'");s=s.replace('TWO-FINGER DRAG</span>','DRAG / TWO FINGERS</span>');
s=s.replace('NAV CAM<br>','<span id="fps">GPU RENDERER</span><br>');
s=s.replace('init();resize();requestAnimationFrame(tick);',`init();drawMap();try{graphics=new MarsRenderer(canvas,ARES4_MESH,rocks,terrain);resize();requestAnimationFrame(tick);document.documentElement.dataset.renderer='ready'}catch(e){document.documentElement.dataset.renderer='failed';document.querySelector('.startbox p').textContent=e.message;document.querySelector('#begin').disabled=true;console.error(e)}`);
fs.writeFileSync(p,s);new Function(s.match(/<script>\n([\s\S]*)<\/script>/)[1]);new Function(fs.readFileSync('dist/renderer.js','utf8'));console.log('GPU rendering integrated; scripts parse');
