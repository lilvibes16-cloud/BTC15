// Shared across browser scans and collector jobs; respect provider Retry-After.
export function retryAt(value,now=Date.now()){
 const seconds=value==null?NaN:Number(value);
 const parsed=Number.isFinite(seconds)?now+seconds*1000:Date.parse(value);
 return Math.max(now+60000,Number.isFinite(parsed)?parsed:now+60000);
}
export async function marketCooldown(db,now=Date.now()){
 const row=await db.prepare('SELECT until FROM radar_leases WHERE name=?').bind('dex_rate_limit').first();
 return row?.until>now?row.until:null;
}
export function marketFetch(db,fetcher=fetch){return async(url,options)=>{
 const until=await marketCooldown(db);
 if(until){const e=Error('Market provider cooldown until '+new Date(until).toISOString());e.retryAt=until;throw e;}
 const r=await fetcher(url,options);
 if(r.status===429){const until=retryAt(r.headers.get('Retry-After'));
  await db.prepare('INSERT INTO radar_leases (name,owner,until) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET until=MAX(radar_leases.until,excluded.until)').bind('dex_rate_limit','provider',until).run();
 }
 return r;
};}
