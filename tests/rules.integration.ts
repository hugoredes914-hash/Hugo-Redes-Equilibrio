import {test,before,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds,RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,arrayUnion} from 'firebase/firestore';
let env:RulesTestEnvironment;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-equilibrio',firestore:{host:'127.0.0.1',port:8085,rules:readFileSync('firestore.rules','utf8')}});});
after(async()=>{await env?.cleanup();});
const entries:any={metrics:{date:'2026-09-09'},tasks:{type:'mit',text:'test',done:false},activityLogs:{date:'2026-09-09'},reframings:{situation:'s',automaticThought:'t',emotion:'e',emotionIntensity:5,evidenceFor:'f',evidenceAgainst:'a',rationalResponse:'r'},gratitudes:{items:['one','two']},leads:{name:'Test',stage:'Prospección',history:[]}};
for(const [name,fields] of Object.entries(entries))test(`owner-only CRUD and queries: ${name}`,async()=>{
 const a=env.authenticatedContext('user_A').firestore(),b=env.authenticatedContext('user_B').firestore(),anon=env.unauthenticatedContext().firestore();
 const path=`users/user_A/${name}/record_1`;const data={userId:'user_A',createdAt:1,...(['metrics','tasks','leads'].includes(name)?{updatedAt:1}:{}),...fields as any};
 await assertSucceeds(setDoc(doc(a,path),data));await assertSucceeds(getDoc(doc(a,path)));await assertSucceeds(getDocs(collection(a,`users/user_A/${name}`)));
 for(const db of [b,anon]){
  await assertFails(getDoc(doc(db,path)));await assertFails(getDocs(collection(db,`users/user_A/${name}`)));
  await assertFails(setDoc(doc(db,path+'other'),data));await assertFails(updateDoc(doc(db,path),{updatedAt:2}));await assertFails(deleteDoc(doc(db,path)));
 }
 await assertFails(setDoc(doc(a,`users/user_B/${name}/forged`),{...data,userId:'user_B'}));
 await assertFails(setDoc(doc(a,path+'invalid'),{...data,secretAdmin:true}));
});
test('agenda fields update, immutable owner, recoverable deletion and atomic history',async()=>{
 const db=env.authenticatedContext('user_A').firestore(),ref=doc(db,'users/user_A/leads/calendar_test');
 await assertSucceeds(setDoc(ref,{userId:'user_A',name:'Test',stage:'Seguimiento',createdAt:1,updatedAt:1,history:[]}));
 await assertSucceeds(updateDoc(ref,{nextActionTime:'10:00',calendarDurationMinutes:45,calendarNotificationMinutes:0,googleCalendarSyncEnabled:true,updatedAt:2}));
 await assertSucceeds(updateDoc(ref,{history:arrayUnion({id:'a',type:'test',description:'A',timestamp:2}),updatedAt:2}));
 await assertSucceeds(updateDoc(ref,{history:arrayUnion({id:'b',type:'test',description:'B',timestamp:3}),updatedAt:3}));
 const snap=await getDoc(ref);if(snap.data()!.history.length!==2)throw new Error('History lost');
 await assertFails(updateDoc(ref,{userId:'user_B'}));await assertFails(updateDoc(ref,{createdAt:2}));await assertFails(updateDoc(ref,{propertyValue:-1}));
 await assertSucceeds(updateDoc(ref,{deletedAt:Date.now()}));await assertFails(deleteDoc(ref));
 await assertSucceeds(updateDoc(ref,{deletedAt:0}));
});
test('day completion without comment persists and invalid metrics are rejected',async()=>{
 const db=env.authenticatedContext('user_A').firestore(),ref=doc(db,'users/user_A/metrics/day');
 await assertSucceeds(setDoc(ref,{userId:'user_A',createdAt:1,date:'2026-09-09',dayEnded:false}));
 await assertSucceeds(updateDoc(ref,{dayEnded:true,checkoutCause:'',updatedAt:2}));
 await assertFails(updateDoc(ref,{checkinAnxiety:100,updatedAt:3}));
});
