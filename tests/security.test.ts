import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {makeRequireUser,validateAIRequest,requestSchemas,parsedLeadSchema,aiRateLimit} from '../server/security';
import {businessDate,daysBetween,calendarDateTime} from '../src/lib/dates';
import {csvCell} from '../src/lib/csv';

test('the business day remains Paraguay time around UTC midnight',()=>{
 assert.equal(businessDate(new Date('2026-09-10T01:30:00Z')),'2026-09-09');
 assert.equal(businessDate(new Date('2026-09-10T03:00:00Z')),'2026-09-10');
 assert.equal(daysBetween('2026-09-09','2026-09-08'),1);
 assert.equal(new Date(calendarDateTime('2026-09-09','22:30')).toISOString(),'2026-09-10T01:30:00.000Z');
});
test('CSV neutralizes formulas and quotes without losing accents or hash',()=>{
 assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell('  @SUM(A1)'),'"\'  @SUM(A1)"');
 assert.equal(csvCell('José "A" #20'),'"José ""A"" #20"');
});
test('AI contracts reject injection via extra fields, oversized text and invalid model JSON',()=>{
 assert.equal(requestSchemas['/parse-lead'].safeParse({text:'hola',userId:'other'}).success,false);
 assert.equal(requestSchemas['/parse-lead'].safeParse({text:'x'.repeat(8001)}).success,false);
 assert.equal(requestSchemas['/sos-advice'].safeParse({block:{value:'x'}}).success,false);
 assert.equal(requestSchemas['/report'].safeParse({leads:[null],metricsHistory:[]}).success,false);
 assert.equal(parsedLeadSchema.safeParse({name:{script:'bad'}}).success,false);
});
test('HTTP middleware denies missing/invalid identity and enforces validation and user limits',async()=>{
 const app=express();
 const verify=async(token:string)=>{if(!['test-A','test-B'].includes(token))throw new Error('invalid signature');return {uid:token,email_verified:true,firebase:{sign_in_provider:'google.com'}};};
 app.use('/api/gemini',makeRequireUser(verify),aiRateLimit,express.json(),validateAIRequest);
 app.post('/api/gemini/parse-lead',(_req,res)=>res.json({ok:true,uid:res.locals.uid}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const port=(server.address() as any).port;
 const post=(token?:string,body:any={text:'Prueba'})=>fetch(`http://127.0.0.1:${port}/api/gemini/parse-lead`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 try{
  assert.equal((await post()).status,401);assert.equal((await post('forged')).status,401);
  assert.equal((await post('test-A',{text:[] })).status,400);
  for(let i=0;i<9;i++)assert.equal((await post('test-A')).status,200);
  assert.equal((await post('test-A')).status,429);
  assert.equal((await post('test-B')).status,200);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
