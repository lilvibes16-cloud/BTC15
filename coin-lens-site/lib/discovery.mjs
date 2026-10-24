import {ADDRESS} from './scanner.mjs';
import {DISCOVERY_CONFIG} from './radar-config.mjs';
export {DISCOVERY_CONFIG};
const rows=async(db,q,...v)=>(await db.prepare(q).bind(...v).all()).results||[];
export function normalizeLaunch(e,now=Date.now()){
 if(!e||!ADDRESS.test(e.mint)||!['create','migrate','migration'].includes(e.txType))return null;
 const kind=e.txType==='create'?'create':'migration';
 const text=v=>typeof v==='string'?v.slice(0,160):null;
 return {id:e.mint+':'+kind,address:e.mint,kind,name:text(e.name),symbol:text(e.symbol),signature:text(e.signature),
  creator:kind==='create'&&ADDRESS.test(e.traderPublicKey)?e.traderPublicKey:null,
  receivedAt:Number.isFinite(e.receivedAt)&&e.receivedAt<=now+30000&&e.receivedAt>=now-7200000?Math.min(e.receivedAt,now):now};
}
export async function ingestLaunches(db,input,now=Date.now()){
 if(!Array.isArray(input.events)||input.events.length>DISCOVERY_CONFIG.maxBatch)throw Error('Invalid event batch');
 const events=input.events.map(e=>normalizeLaunch(e,now)).filter(Boolean);let inserted=0;
 for(let i=0;i<events.length;i+=60){const result=await db.batch(events.slice(i,i+60).map(e=>db.prepare('INSERT OR IGNORE INTO radar_launches (id,address,kind,first_seen,received_at,name,symbol,creator,signature,source) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(e.id,e.address,e.kind,now,e.receivedAt,e.name,e.symbol,e.creator,e.signature,'PumpPortal')));inserted+=result.reduce((n,r)=>n+(r.meta?.changes||0),0);}
 const h=input.health||{};
 const health={connected:h.connected===true,connectedAt:Number.isFinite(h.connectedAt)?Math.min(h.connectedAt,now):null,dropped:Number.isSafeInteger(h.dropped)&&h.dropped>=0?h.dropped:0,reconnects:Number.isSafeInteger(h.reconnects)&&h.reconnects>=0?h.reconnects:0};
 await db.prepare('INSERT INTO radar_feed_health (id,at,details) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at,details=excluded.details').bind('pumpportal',now,JSON.stringify(health)).run();
 return {received:input.events.length,valid:events.length,inserted,at:now};
}
export async function launchCandidates(db,now=Date.now()){
 return rows(db,'SELECT address,MIN(first_seen) firstSeen,MAX(kind=?) migrated FROM radar_launches WHERE first_seen>=? GROUP BY address ORDER BY COALESCE(MAX(checked_at),0),MIN(first_seen),address LIMIT ?','migration',now-DISCOVERY_CONFIG.lookbackHours*3600000,DISCOVERY_CONFIG.maxCandidates);
}
export async function markLaunchChecks(db,candidates,coins,now=Date.now()){
 if(!candidates.length)return;const found=new Set(coins.map(c=>c.address));
 await db.batch(candidates.map(c=>db.prepare('UPDATE radar_launches SET checked_at=?,indexed_at=CASE WHEN ? THEN COALESCE(indexed_at,?) ELSE indexed_at END WHERE address=?').bind(now,found.has(c.address)?1:0,now,c.address)));
}
export async function discoveryStatus(db,now=Date.now()){
 const totals=await db.prepare('SELECT COUNT(*) events,COUNT(DISTINCT address) tokens,SUM(kind=?) migrations,SUM(indexed_at IS NOT NULL) indexedEvents,MAX(first_seen) latest FROM radar_launches').bind('migration').first();
 const feed=await db.prepare('SELECT * FROM radar_feed_health WHERE id=?').bind('pumpportal').first();
 const health=feed?JSON.parse(feed.details):null;
 return {totals,feed:feed?{at:feed.at,...health,state:now-feed.at>DISCOVERY_CONFIG.heartbeatStaleSeconds*1000?'stale':health.connected?'connected':'disconnected'}:{state:'awaiting_first_batch'},
 recent:await rows(db,'SELECT address,kind,name,symbol,first_seen,indexed_at FROM radar_launches ORDER BY first_seen DESC LIMIT 12'),config:DISCOVERY_CONFIG};
}
