// Run with Application Default Credentials in an authorized administrative environment.
// Restoration is restricted to local emulators: it cannot overwrite production.
import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp,GeoPoint,DocumentReference} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [mode,file] = process.argv.slice(2);
if(!['export','verify','restore-test'].includes(mode)||!file)throw new Error('Usage: node scripts/backup.mjs export|verify|restore-test /private/path/backup.json');
const hash=s=>createHash('sha256').update(s).digest('hex');
const projectId=mode==='restore-test'?'demo-equilibrio':process.env.FIREBASE_PROJECT_ID;
const databaseId=mode==='restore-test'?'(default)':process.env.FIRESTORE_DATABASE_ID;
if(mode!=='verify'&&(!projectId||!databaseId))throw new Error('Set FIREBASE_PROJECT_ID and FIRESTORE_DATABASE_ID explicitly.');
if(mode==='export'&&(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST))throw new Error('Export must use the real project.');
if(mode==='restore-test'&&(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST||'')))throw new Error('Local Firestore and Auth emulators are required.');
const app=mode==='verify'?null:initializeApp({projectId});
const db=app?getFirestore(app,databaseId):null;
function encode(v){
 if(v instanceof Timestamp)return ['timestamp',v.seconds,v.nanoseconds];
 if(v instanceof GeoPoint)return ['geo',v.latitude,v.longitude];
 if(v instanceof DocumentReference)return ['ref',v.path];
 if(Buffer.isBuffer(v)||v instanceof Uint8Array)return ['bytes',Buffer.from(v).toString('base64')];
 if(Array.isArray(v))return ['array',v.map(encode)];
 if(v!==null&&typeof v==='object')return ['map',Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,encode(x)]))];
 if(typeof v==='number'&&!Number.isFinite(v))return ['number',String(v)];
 return ['value',v];
}
function decode(v){switch(v[0]){
 case 'timestamp':return new Timestamp(v[1],v[2]);case 'geo':return new GeoPoint(v[1],v[2]);case 'ref':return db.doc(v[1]);case 'bytes':return Buffer.from(v[1],'base64');
 case 'array':return v[1].map(decode);case 'map':return Object.fromEntries(Object.entries(v[1]).map(([k,x])=>[k,decode(x)]));case 'number':return Number(v[1]);case 'value':return v[1];default:throw new Error('Invalid backup value');}}
if(mode==='export'){
 const documents=[];
 async function walk(collection){
  // listDocuments includes missing ancestors, whose subcollections still contain records.
  for(const ref of await collection.listDocuments()){
   const snapshot=await ref.get();if(snapshot.exists)documents.push({path:ref.path,data:encode(snapshot.data())});
   for(const child of await ref.listCollections())await walk(child);
  }
 }
 for(const col of await db.listCollections())await walk(col);
 const users=[];let token;
 do{const page=await getAuth(app).listUsers(1000,token);users.push(...page.users.map(u=>u.toJSON()));token=page.pageToken;}while(token);
 const payload=JSON.stringify({version:1,projectId,databaseId,createdAt:new Date().toISOString(),consistency:'sequential-export',documents,users});
 await writeFile(file,payload,{mode:0o600,flag:'wx'});await writeFile(file+'.sha256',hash(payload)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({documents:documents.length,users:users.length,sha256:hash(payload)}));
}else{
 const raw=await readFile(file,'utf8');if(hash(raw)!=(await readFile(file+'.sha256','utf8')).trim())throw new Error('Checksum mismatch');
 const backup=JSON.parse(raw);if(backup.version!==1)throw new Error('Unsupported format');
 if(mode==='restore-test'){
  for(const doc of backup.documents)await db.doc(doc.path).set(decode(doc.data));
  // This app uses Google accounts. Reject password users rather than restoring unusable credentials.
  if(backup.users.some(u=>u.providerData?.some(p=>p.providerId==='password')))throw new Error('Password-user restoration needs the original hash configuration.');
  for(let i=0;i<backup.users.length;i+=1000){const users=backup.users.slice(i,i+1000).map(u=>({uid:u.uid,email:u.email,emailVerified:u.emailVerified,displayName:u.displayName,photoURL:u.photoURL,disabled:u.disabled,customClaims:u.customClaims,providerData:u.providerData}));const result=await getAuth(app).importUsers(users);if(result.failureCount)throw new Error('User restoration failed');}
  for(const entry of backup.documents){const actual=encode((await db.doc(entry.path).get()).data());if(JSON.stringify(actual)!==JSON.stringify(entry.data))throw new Error('Restored document differs');}
  for(const u of backup.users)if((await getAuth(app).getUser(u.uid)).uid!==u.uid)throw new Error('Restored user differs');
 }
 console.log(JSON.stringify({result:mode==='verify'?'checksum-valid':'restoration-verified',documents:backup.documents.length,users:backup.users.length}));
}
