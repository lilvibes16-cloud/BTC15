import {weightedScore} from './scoring.mjs';
import {SCORING_CONFIG} from './radar-config.mjs';
import {marketFetch,marketCooldown} from './market-cooldown.mjs';
import {LOGGING_CONFIG} from './logging-config.mjs';
import {RUNNER_RULES,runnerAssessment} from './runners.mjs';
import {summarizeOutcome} from './outcome-math.mjs';
const id=()=>crypto.randomUUID();
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const batch=async(db,statements)=>{for(let i=0;i<statements.length;i+=80)await db.batch(statements.slice(i,i+80));};
export async function logScan(db,data,actor,source='browser'){
 const at=Date.parse(data.fetchedAt),scanId=id();
 const config={...LOGGING_CONFIG,oldGateRules:RUNNER_RULES,scoring:SCORING_CONFIG};const cfg=JSON.stringify(config);
 // A scan and all its snapshots/checkpoints commit atomically. Provider failures never become fake records.
 const statements=[db.prepare('INSERT INTO radar_scans (id,at,actor,source,config,warnings) VALUES (?,?,?,?,?,?)').bind(scanId,at,actor,source,cfg,JSON.stringify(data.warnings||[]))];
 for(const c of data.coins){
  const snapId=scanId+':'+c.address;
  const gate=runnerAssessment(c,at);
  const features={...c,ageMinutes:c.created==null?null:(at-c.created)/60000,transactions5m:c.buys5m==null||c.sells5m==null?null:c.buys5m+c.sells5m,transactions1h:c.buys==null||c.sells==null?null:c.buys+c.sells,
   uniqueBuyers5m:null,uniqueBuyers1h:null,buyVolume5m:null,sellVolume5m:null,buyVolumeShare5m:null,
   missingReasons:{uniqueBuyers5m:'Not supplied by current source',uniqueBuyers1h:'Not supplied by current source',buyVolume5m:'Not supplied by current source',sellVolume5m:'Not supplied by current source'},
   weighted:weightedScore(c,at),gate,gateComparison:'Snapshot-only old gate; session liquidity comparison is not part of the reference gate',retrievedAt:at,providerEventTime:null};
  statements.push(db.prepare('INSERT INTO radar_snapshots (id,scan_id,address,pair,at,price,liquidity,features,old_gate,config) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(snapId,scanId,c.address,c.pairAddress,at,c.price,c.liquidity,JSON.stringify(features),gate.status==='building'?1:0,cfg));
  statements.push(db.prepare('INSERT INTO radar_observations (id,pair,address,at,price,liquidity,status,source) VALUES (?,?,?,?,?,?,?,?)').bind(id(),c.pairAddress,c.address,at,c.price,c.liquidity,'ok','scan'));
  for(const horizon of config.horizonsMinutes)statements.push(db.prepare('INSERT INTO radar_outcomes (id,snapshot_id,horizon,due_at,status) VALUES (?,?,?,?,?)').bind(snapId+':'+horizon,snapId,horizon,at+horizon*60000,'pending'));
 }
 await db.batch(statements);
 return {state:'saved',scanId,snapshots:data.coins.length,checkpoints:data.coins.length*config.horizonsMinutes.length,savedAt:at};
}
export async function collectOutcomes(db,fetcher=fetch,now=Date.now(),source='manual'){
 const cooldown=await marketCooldown(db,now);
 if(cooldown)return {state:'provider_cooldown',retryAt:cooldown};
 fetcher=marketFetch(db,fetcher);
 const jobId=id(),leaseUntil=now+LOGGING_CONFIG.collector.leaseSeconds*1000;
 const lock=await db.prepare('INSERT INTO radar_leases (name,owner,until) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,until=excluded.until WHERE radar_leases.until < ?').bind('collector',jobId,leaseUntil,now).run();
 if(!lock.meta?.changes)return {state:'busy'};
 await db.prepare('INSERT INTO radar_jobs (id,started_at,status,details) VALUES (?,?,?,?)').bind(jobId,now,'running','{}').run();
 const result={jobId,source,pairs:0,missing:0,failedBatches:0,recorded:0,missed:0,errors:[]};
 try{
  // Keep monitoring original pairs even after the token disappears from discovery.
  const pairs=await rows(db,`SELECT p.pair,p.address,COALESCE((SELECT MAX(o.at) FROM radar_observations o WHERE o.pair=p.pair),0) last_at FROM (SELECT pair,MIN(address) address FROM radar_snapshots WHERE at>=? GROUP BY pair) p ORDER BY last_at ASC LIMIT ?`,now-(1440*60+LOGGING_CONFIG.sampling.maxCheckpointLatenessSeconds)*1000,LOGGING_CONFIG.collector.maxPairsPerRun);
  for(let i=0;i<pairs.length;i+=30){
   const group=pairs.slice(i,i+30);let data=[];let failure=null;
   try{const response=await fetcher('https://api.dexscreener.com/latest/dex/pairs/solana/'+group.map(p=>encodeURIComponent(p.pair)).join(','),{signal:AbortSignal.timeout(12000),cache:'no-store'});if(!response.ok)throw Error('Market HTTP '+response.status);const parsed=await response.json();if(!Array.isArray(parsed.pairs))throw Error('Unexpected pair response');data=parsed.pairs;}catch(e){failure=e.message;result.failedBatches++;result.errors.push(failure)}
   const at=Date.now();const statements=[];
   for(const p of group){const c=data.find(c=>c.chainId==='solana'&&c.pairAddress===p.pair&&c.baseToken?.address===p.address);const price=c?.priceUsd!=null&&Number.isFinite(Number(c.priceUsd))?Number(c.priceUsd):null;const liquidity=typeof c?.liquidity?.usd==='number'?c.liquidity.usd:null;const status=failure?'provider_error':!c?'pair_missing':price===null?'incomplete':'ok';
    statements.push(db.prepare('INSERT INTO radar_observations (id,pair,address,at,price,liquidity,status,source) VALUES (?,?,?,?,?,?,?,?)').bind(id(),p.pair,p.address,at,price,liquidity,status,'collector'));result.pairs++;if(status!=='ok')result.missing++;
   }await batch(db,statements);
  }
  const evaluatedAt=Date.now();
  const due=await rows(db,'SELECT o.id outcome_id,o.horizon,s.* FROM radar_outcomes o JOIN radar_snapshots s ON s.id=o.snapshot_id WHERE o.status=? AND o.due_at<=? ORDER BY o.due_at ASC LIMIT ?','pending',evaluatedAt,LOGGING_CONFIG.collector.maxOutcomesPerRun);
  const cache=new Map();const updates=[];const starts=new Map();for(const s of due)starts.set(s.pair,Math.min(starts.get(s.pair)??s.at,s.at));
  for(const s of due){if(!cache.has(s.pair))cache.set(s.pair,await rows(db,'SELECT * FROM radar_observations WHERE pair=? AND at>=? AND at<=? ORDER BY at',s.pair,starts.get(s.pair),evaluatedAt));const outcome=summarizeOutcome(s,cache.get(s.pair),s.horizon,evaluatedAt);if(!outcome)continue;
   updates.push(db.prepare('UPDATE radar_outcomes SET status=?,observed_at=?,result=? WHERE id=? AND status=?').bind(outcome.status,outcome.observedAt,JSON.stringify(outcome),s.outcome_id,'pending'));result[outcome.status]++;
  }await batch(db,updates);
  result.pendingDue=(await db.prepare('SELECT COUNT(*) n FROM radar_outcomes WHERE status=? AND due_at<=?').bind('pending',evaluatedAt).first()).n;
  await db.prepare('UPDATE radar_jobs SET finished_at=?,status=?,details=? WHERE id=?').bind(Date.now(),result.failedBatches?'partial':'completed',JSON.stringify(result),jobId).run();return result;
 }catch(e){await db.prepare('UPDATE radar_jobs SET finished_at=?,status=?,details=? WHERE id=?').bind(Date.now(),'failed',JSON.stringify({source,error:e.message}),jobId).run();throw e;}
 finally{await db.prepare('DELETE FROM radar_leases WHERE name=? AND owner=?').bind('collector',jobId).run();}
}
export async function loggingStatus(db,actor){
 const totals=await db.prepare('SELECT COUNT(*) snapshots,COUNT(DISTINCT s.address) tokens,MIN(s.at) first_at,MAX(s.at) last_at FROM radar_snapshots s JOIN radar_scans c ON c.id=s.scan_id WHERE c.actor=?').bind(actor).first();
 const outcomes=await rows(db,'SELECT o.horizon,o.status,COUNT(*) n FROM radar_outcomes o JOIN radar_snapshots s ON s.id=o.snapshot_id JOIN radar_scans c ON c.id=s.scan_id WHERE c.actor=? GROUP BY o.horizon,o.status',actor);
 const mature=await db.prepare("SELECT COUNT(DISTINCT s.address) n FROM radar_outcomes o JOIN radar_snapshots s ON s.id=o.snapshot_id JOIN radar_scans c ON c.id=s.scan_id WHERE c.actor=? AND o.horizon=120 AND o.status='recorded' AND json_extract(o.result,'$.runnerStatus') IN ('observed_runner','no_observed_runner')").bind(actor).first();
 const job=await db.prepare('SELECT started_at,finished_at,status,details FROM radar_jobs ORDER BY started_at DESC LIMIT 1').first();
 const automated=await db.prepare("SELECT started_at,finished_at,status,details FROM radar_jobs WHERE json_extract(details,'$.source')='github_actions' ORDER BY started_at DESC LIMIT 1").first();
 const recent=await rows(db,'SELECT s.id,s.address,s.at,s.price,s.liquidity,s.old_gate,s.features FROM radar_snapshots s JOIN radar_scans c ON c.id=s.scan_id WHERE c.actor=? ORDER BY s.at DESC LIMIT 10',actor);
 const age=automated?Date.now()-(automated.finished_at||automated.started_at):null;
 const cooldown=await marketCooldown(db);
 return {providerCooldownUntil:cooldown,totals,outcomes,matureDistinctTokens:mature.n,performanceReporting:'locked_until_200_mature_distinct_tokens_and_validated_labels',required:200,latestCollector:job,latestAutomated:automated,backgroundSchedule:cooldown?'provider_cooldown':!automated?'awaiting_first_run':automated.status==='failed'?'failed':age>180000?'stale':automated.status==='partial'?'partial_provider_failure':'recent_activity',config:LOGGING_CONFIG,recent:recent.map(s=>({...s,features:JSON.parse(s.features)}))};
}
