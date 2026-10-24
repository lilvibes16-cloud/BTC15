import {OWNERSHIP_CONFIG} from '../radar-config.mjs';
export async function attachOwnership(db,scan){
 const at=Date.parse(scan.fetchedAt);if(!scan.coins.length)return scan;
 const addresses=scan.coins.map(c=>c.address),rows=[];
 for(let i=0;i<addresses.length;i+=80){const chunk=addresses.slice(i,i+80),placeholders=chunk.map(()=>'?').join(',');
  const result=await db.prepare(`SELECT a.id,a.address,a.at,a.report FROM radar_ownership_reports a WHERE a.address IN (${placeholders}) AND a.at<=? AND a.at>=? AND a.id=(SELECT b.id FROM radar_ownership_reports b WHERE b.address=a.address AND b.at<=? ORDER BY b.at DESC,b.id DESC LIMIT 1)`).bind(...chunk,at,at-OWNERSHIP_CONFIG.cacheSeconds*1000,at).all();rows.push(...(result.results||[]));
 }
 const byAddress=new Map(rows.map(row=>{const r=JSON.parse(row.report);return [row.address,{reportId:row.id,observedAt:row.at,version:r.version,state:r.coverage.state,combined:r.combined,developer:r.developer,bundleRemaining:r.bundle.remaining,sniperRemaining:r.sniper.remaining}]}));
 return {...scan,coins:scan.coins.map(c=>({...c,ownership:byAddress.get(c.address)||null}))};
}
