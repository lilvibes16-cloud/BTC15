import {env} from 'cloudflare:workers';
import {validAddress} from '../../../lib/wallets.mjs';
import {collectOwnership} from '../../../lib/ownership/collect.mjs';
import {analyzeOwnership} from '../../../lib/ownership/analyze.mjs';
import {OWNERSHIP_CONFIG} from '../../../lib/radar-config.mjs';
export const dynamic='force-dynamic';
const active=new Map<string,Promise<any>>();
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,token=p.get('token')||'',pair=p.get('pair')||'';
 if(!validAddress(token)||(pair&&!validAddress(pair)))return Response.json({error:'Enter a valid Solana token mint and optional pair address.'},{status:400});
 const db=env.DB;if(!db)return Response.json({error:'Persistent storage unavailable'},{status:503});
 const key=token+':'+pair;
 try{
  const cached:any=await db.prepare('SELECT id,at,report FROM radar_ownership_reports WHERE address=? AND pair=? ORDER BY at DESC LIMIT 1').bind(token,pair).first();
  if(cached&&JSON.parse(cached.report).version===OWNERSHIP_CONFIG.version&&Date.now()-cached.at<OWNERSHIP_CONFIG.cacheSeconds*1000)return Response.json({...JSON.parse(cached.report),id:cached.id,cached:true},{headers:{'Cache-Control':'no-store'}});
  let job=active.get(key);
  if(!job){job=(async()=>{
   const hint:any=await db.prepare("SELECT creator,signature FROM radar_launches WHERE address=? AND kind='create' ORDER BY first_seen LIMIT 1").bind(token).first();
   const evidence=await collectOwnership(token,{pair:pair||null,launchHint:hint,rpcUrl:process.env.SOLANA_RPC_URL} as any);
   const report=analyzeOwnership(evidence),id=crypto.randomUUID();
   await db.prepare('INSERT INTO radar_ownership_reports (id,address,pair,at,state,config,evidence,report) VALUES (?,?,?,?,?,?,?,?)').bind(id,token,pair,report.at,report.coverage.state,JSON.stringify(OWNERSHIP_CONFIG),JSON.stringify(evidence),JSON.stringify(report)).run();
   return {...report,id,cached:false};
  })();active.set(key,job);job.finally(()=>active.delete(key)).catch(()=>{});}
  return Response.json(await job,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Inspection could not be saved. Existing observations were preserved.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
