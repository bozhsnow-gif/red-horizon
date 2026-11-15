// Usage: node import-nasa.cjs path/to/megt00n090hb.img path/to/megt00n090hb.lbl
// Offline importer: preserves the original map and bundles the validated NASA crop.
const fs=require('fs'),path=require('path');
const dem=require('./dist/mola-import.js');
(async()=>{
  const [img,label]=process.argv.slice(2);
  if(!img||!label) throw Error('Usage: node import-nasa.cjs <megt00n090hb.img> <megt00n090hb.lbl>');
  const handle=await fs.promises.open(img,'r');
  let data;
  try {
    const stat=await handle.stat();
    const source={name:path.basename(img),size:stat.size,slice:(start,end)=>({arrayBuffer:async()=>{
      const bytes=Buffer.alloc(end-start);const {bytesRead}=await handle.read(bytes,0,bytes.length,start);
      return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytesRead);
    }})};
    data=await dem.importTile(source,fs.readFileSync(label,'utf8'));
  } finally {await handle.close();}
  const target=path.join(__dirname,'dist/gale-topography.js');
  const backup=path.join(__dirname,'dist/gale-topography-before-nasa.js');
  if(!fs.existsSync(backup)) fs.copyFileSync(target,backup);
  fs.writeFileSync(target,'let GALE_TOPOGRAPHY='+JSON.stringify(data)+';\n');
  fs.writeFileSync(path.join(__dirname,'dist/mola-source.lbl'),fs.readFileSync(label));
  console.log(JSON.stringify({product:data.product,grid:[data.columns,data.rows],km:[data.widthMeters/1000,data.heightMeters/1000],output:target}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
