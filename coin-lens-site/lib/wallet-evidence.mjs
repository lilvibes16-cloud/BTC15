export function compareCallout(snapshot,record,now=Date.now()){
 const time=Date.parse(record.time);
 if(!Number.isFinite(time)||time>now)return {error:'Enter a valid past public-post time.'};
 if(!snapshot||Date.parse(snapshot.fetchedAt)<time)return {error:'Refresh this wallet after the recorded public-post time.'};
 const sampled=snapshot.transactions.filter(t=>t.detailsLoaded&&!t.failed&&t.timestamp!=null&&t.timestamp*1000>=time);
 const outflows=sampled.filter(t=>t.changes.some(c=>c.mint===record.token&&c.direction==='Outflow'));
 return {count:outflows.length,sampled:sampled.length,outflows,verdict:outflows.length?'Review · token outflow after entered time':'Inconclusive · limited sample',note:'The post time and wallet attribution are user-entered, not independently verified. Outflows may be transfers, liquidity actions or sales. This does not establish dumping on followers, insider access, or an absence of earlier sales.'};
}
