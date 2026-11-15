'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('dist/index.html','utf8');
function fixture(){
 const elements=new Map(),events=new Map();
 const context2d=new Proxy({measureText:s=>({width:s.length*5.5})},{get:(o,k)=>k in o?o[k]:()=>{}});
 let focused=null,playCalls=0,playResult=()=>Promise.resolve();
 function element(id){
  if(!elements.has(id)){
   const listeners=new Map(),classes=new Set();
   const el={style:{setProperty(){}},textContent:'',hidden:false,paused:true,currentTime:0,
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
    addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)},
    emit:(name,event={})=>{for(const fn of listeners.get(name)||[])fn(event)},
    focus(){focused=id},showModal(){this.open=true},close(){this.open=false},
    play(){playCalls++;const result=playResult();result.then(()=>{this.paused=false;this.emit('playing')},()=>{});return result},
    pause(){this.paused=true;this.emit('pause')},
    getContext:()=>context2d,getBoundingClientRect:()=>({width:1000,height:650}),setPointerCapture(){},setAttribute(){},files:[]};
   elements.set(id,el);
  }return elements.get(id);
 }
 const s={console,performance:{now:()=>1000},requestAnimationFrame(){},setTimeout(){},clearTimeout(){},
  document:{querySelector:element,querySelectorAll:()=>[],documentElement:{dataset:{}},body:{style:{overflow:'auto'}}},
  window:{addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn)},location:{reload(){}}},
  localStorage:{getItem:()=>null},devicePixelRatio:1};
 vm.createContext(s);
 for(const script of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)){
  let source=script[1]?fs.readFileSync('dist/'+script[1],'utf8'):script[2];
  if(script[1]==='ares4-mesh.js')source='const ARES4_MESH=[];';
  if(script[1]==='renderer.js')source='class MarsRenderer {constructor(){this.frames=0;this.wheels=[]}resize(){}resetMotion(){}render(){this.frames++}surface(x,y){return Gale.height(x,y)}}';
  vm.runInContext(source,s,{filename:script[1]||'index.html'});
 }
 return {s,element,events,evaluate:source=>vm.runInContext(source,s),get playCalls(){return playCalls},get focused(){return focused},setPlay:fn=>playResult=fn};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve()};
(async()=>{
 const f=fixture(),run=f.evaluate;
 assert.equal(f.playCalls,0,'No autoplay before Begin Exploring');
 assert.equal(run('running'),false);
 f.element('#intro-video').emit('error');assert.equal(run('running'),false,'Preload failure must not start the rover');
 const start=run('JSON.stringify(rover)');
 f.element('#begin').onclick();await flush();
 assert.equal(f.playCalls,1);assert.equal(run('missionIntro.active'),true);assert.equal(run('running'),false);
 assert.equal(f.element('#mission-intro').open,true);
 assert.equal(f.s.document.body.style.overflow,'hidden');
 f.element('#begin').onclick();assert.equal(f.playCalls,1,'Double clicks do not restart playback');
 run('keys={w:true};tick(5000)');
 assert.equal(run('JSON.stringify(rover)'),start);assert.equal(run('elapsed'),0);assert.equal(run('graphics.frames'),0,'Video does not compete with WebGL rendering');
 for(const fn of f.events.get('keydown'))fn({code:'Digit2',shiftKey:true,preventDefault(){}});
 assert.equal(run('birdsEye'),false,'Camera keys are blocked during the intro');
 f.element('#intro-play').emit('click');assert.equal(f.element('#intro-video').paused,true);
 f.element('#intro-play').emit('click');await flush();assert.equal(f.element('#intro-video').paused,false);
 f.element('#intro-video').emit('ended');
 assert.equal(run('running'),true);assert.equal(run('missionIntro.active'),false);
 assert.equal(f.element('#mission-intro').open,false);assert.equal(f.focused,'#game');
 assert.equal(f.s.document.body.style.overflow,'auto');assert.equal(run('Object.keys(keys).length'),0);
 assert(f.element('#start').classList.contains('hidden'));
 run('keys={w:true};tick(1017)');assert(run('rover.v')>0,'Driving works after the intro');
 f.element('#reset').onclick();assert.equal(f.playCalls,2,'Reset does not replay the intro');
 assert.equal(run('rover.v'),0);assert.equal(run('Gale.coordinates(rover.x,rover.y).latitude'),-4.6);
 const skip=fixture();let rejectPlay;skip.setPlay(()=>new Promise((_,reject)=>rejectPlay=reject));
 skip.element('#begin').onclick();skip.element('#intro-skip').emit('click');
 rejectPlay(Object.assign(new Error('Interrupted'),{name:'AbortError'}));await flush();
 assert.equal(skip.evaluate('running'),true);assert.equal(skip.evaluate('missionIntro.active'),false);
 skip.element('#intro-video').emit('error');assert.equal(skip.evaluate('running'),true,'Late media events do not reopen the intro');
 const blocked=fixture();blocked.setPlay(()=>Promise.reject(Object.assign(new Error('Gesture needed'),{name:'NotAllowedError'})));
 blocked.element('#begin').onclick();await flush();assert.equal(blocked.evaluate('running'),false);
 assert.equal(blocked.element('#intro-play').hidden,false);assert.equal(blocked.focused,'#intro-play');
 blocked.setPlay(()=>Promise.resolve());blocked.element('#intro-play').emit('click');await flush();
 assert.equal(blocked.element('#intro-video').paused,false);
 let cancelled=false;blocked.element('#mission-intro').emit('cancel',{preventDefault(){cancelled=true}});
 assert(cancelled);assert.equal(blocked.evaluate('running'),true,'Escape skips safely');
 const failure=fixture();failure.setPlay(()=>Promise.reject(new Error('Decode failed')));
 failure.element('#begin').onclick();await flush();assert.equal(failure.evaluate('running'),true);
 assert(failure.element('#toast').textContent.includes('INTRO UNAVAILABLE'));
 for(const file of ['intro.js','intro.css','intro.mp4','intro-background.png'])assert(fs.statSync('dist/'+file).size>0);
 const video=fs.readFileSync('dist/intro.mp4');assert.equal(video.toString('ascii',4,8),'ftyp');assert.equal(video.toString('ascii',8,12),'mp42');
 console.log('PASS: Begin → clip → rover, paused gameplay/rendering, camera lock, play/pause, Skip, Escape, blocked playback retry, decode failure, late events, reset and local assets.');
 console.log('Video decoded separately through Windows Media Foundation; browser playback is not covered by this DOM harness.');
})().catch(error=>{console.error(error);process.exitCode=1});
