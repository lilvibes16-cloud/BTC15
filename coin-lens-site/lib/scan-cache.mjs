import {validScan} from './scan-contract.mjs';
export const SCAN_CACHE_SECONDS=60;
export async function readScanCache(db,key,now=Date.now()){
 const row=await db.prepare('SELECT at,payload FROM radar_market_cache WHERE key=?').bind(key).first();
 if(!row||row.at>now||now-row.at>86400000)return null;
 try{const result=JSON.parse(row.payload);return validScan(result)&&result.coins.length?{...result,cached:true}:null}catch{return null}
}
export async function saveScanCache(db,key,result){
 if(!validScan(result)||!result.coins.length)return;
 await db.prepare('INSERT INTO radar_market_cache (key,at,payload) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET at=excluded.at,payload=excluded.payload WHERE excluded.at>=radar_market_cache.at').bind(key,Date.parse(result.fetchedAt),JSON.stringify(result)).run();
 await db.prepare('DELETE FROM radar_market_cache WHERE at<?').bind(Date.now()-86400000).run();
}
export function cacheFallback(cached,error,retryAt=null){return {...cached,cached:true,stale:true,feedError:error,retryAt,warnings:[...cached.warnings,'Market refresh failed. Showing the saved snapshot at its original time; assessments are paused.'],logging:{state:'cached',snapshots:0}};}
