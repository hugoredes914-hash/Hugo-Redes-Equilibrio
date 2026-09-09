import type { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

function adminAuth() {return getAuth(getApps()[0] || initializeApp({projectId:process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0253157680'}));}
const text = (max: number) => z.string().max(max);
const score = z.number().finite().min(0).max(10);
const lead = z.object({ stage:text(30), propertyValue:z.number().finite().min(0).max(1e12), interest:z.enum(['Alto','Medio','Bajo']) });
const metric = z.object({ date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), checkinAnxiety:score, checkinEnergy:score, checkinMood:score });
export const requestSchemas: Record<string, z.ZodType> = {
  '/parse-lead':z.object({text:text(8000).min(1)}).strict(),
  '/draft-message':z.object({name:text(100),property:text(100),stage:text(30),notes:text(2000)}).strict(),
  '/report':z.object({leads:z.array(lead).max(1000),metricsHistory:z.array(metric).max(14)}).strict(),
  '/anchor-advice':z.object({status:z.object({mood:score,energy:score,anxiety:score}),mits:z.array(z.object({text:text(1000),done:z.boolean()})).max(100)}).strict(),
  '/sos-advice':z.object({block:text(200).min(1)}).strict(),
};
export const parsedLeadSchema = z.object({name:text(100),phone:text(50),property:text(100),propertyValue:z.union([text(30),z.number().finite().nonnegative()]),interest:z.enum(['Alto','Medio','Bajo']),notes:text(2000)});
export const adviceSchema = z.object({anchor:text(500),theme:text(100),recommendation:text(1000)});
export const sosSchema = z.array(z.object({role:text(50),advice:text(2000)})).min(1).max(5);

export function makeRequireUser(verify:(token:string)=>Promise<{uid:string;email_verified?:boolean;firebase?:{sign_in_provider?:string}}>) {
 return async function requireUser(req:Request,res:Response,next:NextFunction) {
  const match = /^Bearer ([^\s]+)$/.exec(req.header('Authorization') || '');
  if (!match || match[1].length>8192) return void res.status(401).json({error:'Inicia sesión para continuar.'});
  try {
    const token = await verify(match[1]);
    if (!token.uid || token.email_verified !== true || token.firebase?.sign_in_provider !== 'google.com') throw new Error('invalid user');
    res.locals.uid = token.uid;
    next();
  } catch { res.status(401).json({error:'Tu sesión venció. Vuelve a iniciar sesión.'}); }
 };
}
export const requireUser=makeRequireUser(token=>adminAuth().verifyIdToken(token));

export const aiRateLimit = rateLimit({windowMs:60_000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,
  keyGenerator:(_req,res)=>res.locals.uid,
  message:{error:'Espera un minuto antes de solicitar más respuestas.'},
});
export const aiDailyLimit = rateLimit({windowMs:24*60*60_000,limit:100,standardHeaders:'draft-7',legacyHeaders:false,
  keyGenerator:(_req,res)=>res.locals.uid,message:{error:'Alcanzaste el límite diario de solicitudes.'},
});
const running = new Map<string,number>();
let totalRunning = 0;
export function limitConcurrency(_req:Request,res:Response,next:NextFunction) {
  const uid = res.locals.uid;
  if ((running.get(uid)||0)>=2 || totalRunning>=8) return void res.status(429).json({error:'Hay solicitudes en curso. Intenta en unos segundos.'});
  running.set(uid,(running.get(uid)||0)+1); totalRunning++;
  let released=false;
  const release=()=>{if(released)return;released=true;const left=(running.get(uid)||1)-1;if(left)running.set(uid,left);else running.delete(uid);totalRunning--;};
  res.once('finish',release); res.once('close',release); next();
}
export function validateAIRequest(req:Request,res:Response,next:NextFunction) {
  const schema=requestSchemas[req.path];
  if (!schema || req.method!=='POST') return void res.status(404).json({error:'Ruta no disponible.'});
  const result=schema.safeParse(req.body);
  if (!result.success) return void res.status(400).json({error:'Los datos enviados no son válidos o exceden el límite.'});
  req.body=result.data; next();
}
