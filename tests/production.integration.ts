import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const port=3189;
const child=spawn(process.execPath,['dist/server.cjs'],{env:{...process.env,NODE_ENV:'production',PORT:String(port),GEMINI_API_KEY:''},stdio:'ignore'});
try {
 let ready=false;
 for(let n=0;n<100;n++){
  try {await fetch(`http://127.0.0.1:${port}/api/health`);ready=true;break;}
  catch {await new Promise(resolve=>setTimeout(resolve,100));}
 }
 assert.ok(ready,'Production server did not start');
 for(const route of ['/server.cjs','/server.cjs.map','/.env','/firebase-applet-config.json']){
  assert.equal((await fetch(`http://127.0.0.1:${port}${route}`)).status,404,route);
 }
 for(const route of ['parse-lead','draft-message','report','anchor-advice','sos-advice']){
  const response=await fetch(`http://127.0.0.1:${port}/api/gemini/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(response.status,401,route);assert.equal(response.headers.get('cache-control'),'no-store');
 }
 assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,200);
 assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/api/health`)).json(),{status:'ok'});
 console.log('PASS: public UI, private server files, authenticated AI routes and no secret status.');
} finally {child.kill();}
