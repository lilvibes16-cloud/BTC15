import {readScanCache,saveScanCache,cacheFallback,SCAN_CACHE_SECONDS} from '../../../lib/scan-cache.mjs';
import {attachOwnership} from '../../../lib/ownership/snapshots.mjs';
import {launchCandidates,markLaunchChecks} from '../../../lib/discovery.mjs';
import {SCAN_VERSION} from '../../../lib/scan-contract.mjs';
import {marketFetch,marketCooldown} from '../../../lib/market-cooldown.mjs';
import {env} from 'cloudflare:workers';
import {loggingActor} from '../../../lib/logging-auth';
import {logScan} from '../../../lib/logging.mjs';
// @ts-ignore Shared JavaScript module tested with the same fetch path used by production.
import { scan, ADDRESS } from '../../../lib/scanner.mjs';
export const dynamic = 'force-dynamic';
const pending = new Map<string,Promise<any>>();
export async function GET(request:Request) {
 const params = new URL(request.url).searchParams;
 const query = (params.get('q')||'').trim().slice(0,80);
 const watch = [...new Set((params.get('watch')||'').split(',').filter(a=>ADDRESS.test(a)))].slice(0,20);
 const key=JSON.stringify({query,watch:[...watch].sort()});
 const cached=await readScanCache(env.DB,key).catch(()=>null);
 try {
  if(cached&&Date.now()-Date.parse(cached.fetchedAt)<SCAN_CACHE_SECONDS*1000)return Response.json({...cached,logging:{state:'cached',snapshots:0}},{headers:{'Cache-Control':'no-store'}});
  const until=await marketCooldown(env.DB);if(until){const e:any=new Error('Market provider is rate-limiting requests. Next retry '+new Date(until).toISOString());e.retryAt=until;throw e;}
  let job=pending.get(key);
  if(!job){job=(async()=>{const launches=query?[]:await launchCandidates(env.DB);const result=await scan(marketFetch(env.DB),{query,watch,launches});await markLaunchChecks(env.DB,launches,result.coins);await saveScanCache(env.DB,key,result).catch(()=>{});return result})();pending.set(key,job!);}
  let result=await job;
  try{result=await attachOwnership(env.DB,result)}catch{result={...result,warnings:[...result.warnings,'Saved ownership evidence unavailable in this scan.']}}
  const actor=await loggingActor(request);
  let logging:any={state:'sign_in_required',snapshots:0};
  if(actor){try{logging=await logScan(env.DB,result,actor,actor==='collector'?'collector':'browser')}catch{logging={state:'failed',snapshots:0,message:'Scan loaded, but its snapshot was not saved.'}}}
  return Response.json({...result,logging},{headers:{'Cache-Control':'no-store, max-age=0','X-Coin-Lens-Version':String(SCAN_VERSION)}});
 } catch(e:any) { const retryAt=e.retryAt||await marketCooldown(env.DB).catch(()=>null);if(cached)return Response.json(cacheFallback(cached,e.message||'Market data unavailable',retryAt),{headers:{'Cache-Control':'no-store'}});return Response.json({error:e instanceof Error?e.message:'Data unavailable',sources:e.sources||[],retryAt,fetchedAt:null,coins:[],version:SCAN_VERSION},{status:retryAt?503:502,headers:{'Cache-Control':'no-store',...(retryAt?{'Retry-After':String(Math.max(1,Math.ceil((retryAt-Date.now())/1000)))}:{})}}); }
 finally {pending.delete(key)}
}
