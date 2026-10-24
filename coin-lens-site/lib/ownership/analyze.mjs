import {OWNERSHIP_CONFIG as CONFIG} from '../radar-config.mjs';
const integer=v=>typeof v==='string'&&/^\d+$/.test(v)?BigInt(v):null;
const ratio=(n,d)=>d>0n?Number(n*1000000n/d)/10000:null;
const unique=values=>[...new Set(values.filter(Boolean))];
export function supplyUnion(addresses,holdings,totalRaw,circulatingRaw=null){
 const wallets=unique(addresses),byWallet=new Map();
 // Duplicate owner rows are not added. Conflicting snapshots become unknown.
 for(const h of holdings||[]){const amount=integer(h.raw);if(byWallet.has(h.wallet)&&byWallet.get(h.wallet)!==amount)byWallet.set(h.wallet,null);else byWallet.set(h.wallet,amount);}
 let raw=0n;const unknown=[];for(const a of wallets){const n=byWallet.get(a);if(n==null)unknown.push(a);else raw+=n;}
 const noBalances=wallets.length>0&&unknown.length===wallets.length;const total=integer(totalRaw),circulating=integer(circulatingRaw),invalid=total!=null&&raw>total;
 return {wallets,knownWallets:wallets.length-unknown.length,unknownWallets:unknown,raw:invalid||noBalances?null:raw.toString(),totalPct:!invalid&&!noBalances&&total>0n?ratio(raw,total):null,circulatingPct:!invalid&&!noBalances&&circulating>0n&&circulating<=total&&raw<=circulating?ratio(raw,circulating):null,
 status:invalid?'inconsistent':noBalances?'unknown':unknown.length?'lower_bound':'complete_for_identified_wallets',note:'Wallet union, not a sum of category percentages. Unidentified wallets are outside this sample.'};
}
export function simulateSale(pool,sellRaw,now=Date.now(),config=CONFIG){
 if(!pool?.verified||pool.model!=='constant_product'||pool.unsupportedReason)return {status:'unavailable',reason:pool?.unsupportedReason||'Verified supported pool reserves are required.'};
 if(!Number.isFinite(pool.at)||now-pool.at>config.maxPoolAgeSeconds*1000||pool.at>now)return {status:'unavailable',reason:'Pool reserve snapshot is stale or has an invalid time.'};
 const b=integer(pool.baseRaw),q=integer(pool.quoteRaw),s=integer(sellRaw);if(b==null||q==null||s==null||b<=0n||q<=0n)return {status:'unavailable',reason:'Invalid or missing reserves/holdings.'};
 const output=q*s/(b+s),scale=1000000n,post=b*b*scale/((b+s)*(b+s));
 return {status:'scenario',sellRaw:s.toString(),quoteOutRaw:output.toString(),quoteMint:pool.quoteMint,quoteDecimals:pool.quoteDecimals,spotPriceDropPct:Number(scale-post)/10000,averageSlippagePct:Number(s*scale/(b+s))/10000,
 reserveSlot:pool.slot,at:pool.at,model:'Gross constant-product, fees excluded',limitations:'One pool, one immediate sale; no fees, MEV, routing, arbitrage, liquidity changes or execution guarantee. Not a prediction of selling intent.'};
}
export function analyzeOwnership(input,config=CONFIG,now=Date.now()){
 const seen=new Set();const trades=(input.trades||[]).filter(t=>{const key=t.signature+':'+t.eventIndex;if(seen.has(key)||t.mint!==input.mint||integer(t.raw)==null)return false;seen.add(key);return true;}).sort((a,b)=>(a.slot??Infinity)-(b.slot??Infinity)||(a.transactionIndex??Infinity)-(b.transactionIndex??Infinity)||(a.eventIndex??0)-(b.eventIndex??0));
 const launch=input.launch?.verified?input.launch:null;
 const roots=launch?unique([launch.creator,launch.deployer]):[];
 const early=t=>{if(!launch||t.side!=='buy'||t.slot<launch.slot)return false;const slots=t.slot-launch.slot;const seconds=Number.isFinite(t.timestamp)&&Number.isFinite(launch.timestamp)?t.timestamp-launch.timestamp:null;return slots<=config.sniperSlots||(seconds!==null&&seconds>=0&&seconds<=config.sniperSeconds);};
 const launchBuys=launch?trades.filter(t=>t.side==='buy'&&t.slot===launch.slot):[];
 const sameSlot=unique(launchBuys.map(t=>t.wallet));const bundleCandidates=new Set(sameSlot.length>=config.coordinatedMinWallets?sameSlot:[]);
 const groups=[];if(bundleCandidates.size)groups.push({kind:'same_launch_slot',confidence:'low',wallets:sameSlot,signatures:unique(launchBuys.map(t=>t.signature)),note:'Same slot is timing evidence, not proof of a Jito bundle.'});
 const byTx=new Map();for(const t of trades.filter(early)){const a=byTx.get(t.signature)||[];a.push(t.wallet);byTx.set(t.signature,a);}
 for(const [signature,addresses]of byTx){const wallets=unique(addresses);if(wallets.length>=config.coordinatedMinWallets){wallets.forEach(a=>bundleCandidates.add(a));groups.push({kind:'shared_transaction',confidence:'medium',wallets,signatures:[signature],note:'Multiple buyers in one transaction; shared control remains unverified.'});}}
 const snipers=unique(trades.filter(early).map(t=>t.wallet));
 const edgeMap=new Map();for(const t of input.transfers||[]){if(!t.from||!t.to||t.from===t.to||integer(t.raw)==null)continue;const key=[t.kind,t.from,t.to,t.signature].join(':');edgeMap.set(key,{...t,confidence:t.kind==='token_transfer'?'medium':'low',interpretation:t.kind==='token_transfer'?'Token movement verified; ownership relationship unproven.':'Observed funding transfer; may be a service, payment or unrelated transfer.'});}
 const transfers=[...edgeMap.values()];const funded=unique(transfers.filter(e=>e.kind==='funding'&&roots.includes(e.from)&&!roots.includes(e.to)).map(e=>e.to));const linked=unique(transfers.filter(e=>e.kind==='token_transfer'&&roots.includes(e.from)&&!roots.includes(e.to)).map(e=>e.to));
 const funders=new Map();for(const e of transfers.filter(e=>e.kind==='funding')){const a=funders.get(e.from)||new Set();a.add(e.to);funders.set(e.from,a);}
 for(const [funder,recipients]of funders){
  if(recipients.size>config.commonFunderMaxRecipients)continue;
  const buys=trades.filter(t=>early(t)&&recipients.has(t.wallet)&&transfers.some(e=>e.kind==='funding'&&e.from===funder&&e.to===t.wallet&&Number.isFinite(e.slot)&&e.slot<=t.slot));
  const wallets=unique(buys.map(t=>t.wallet));
  if(wallets.length>=config.coordinatedMinWallets&&Math.max(...buys.map(t=>t.slot))-Math.min(...buys.map(t=>t.slot))<=config.synchronizedSlots){wallets.forEach(w=>bundleCandidates.add(w));groups.push({kind:'funding_and_synchronized_buys',confidence:'low',wallets,signatures:unique(buys.map(t=>t.signature)),note:'Shared observed funding plus synchronized early buys. A common service can produce this pattern; bundle and common-control status are unverified.'});}
 }
 const graphEdges=[...transfers];for(const [from,recipients]of funders){if(recipients.size<2)continue;graphEdges.push({kind:'common_funding',from,targets:[...recipients],confidence:'low',signatures:unique(transfers.filter(e=>e.kind==='funding'&&e.from===from).map(e=>e.signature)),interpretation:recipients.size>config.commonFunderMaxRecipients?'High fan-out source: service/confounder warning; no ownership inference.':'Shared funding source alone does not establish common control.'});}
 for(let i=0;i<Math.min(snipers.length,config.maxGraphWallets);i++)for(let j=i+1;j<Math.min(snipers.length,config.maxGraphWallets);j++){const a=trades.find(t=>t.wallet===snipers[i]&&early(t)),b=trades.find(t=>t.wallet===snipers[j]&&early(t));if(Math.abs(a.slot-b.slot)<=config.synchronizedSlots)graphEdges.push({kind:'synchronized_buy',from:a.wallet,to:b.wallet,confidence:'low',signatures:unique([a.signature,b.signature]),interpretation:'Close trade timing can arise from independent bots.'});}
 const summary=addresses=>supplyUnion(addresses,input.holdings,input.totalRaw,input.circulatingRaw);
 const original=addresses=>input.launchBalancesComplete?supplyUnion(addresses,addresses.map(wallet=>(input.launchHoldings||[]).find(h=>h.wallet===wallet)||{wallet,raw:'0'}),input.launchSupplyRaw):null;
 const sets={bundle:[...bundleCandidates],sniper:snipers,developer:roots,developerLinked:linked,developerFunded:funded};const combined=summary(Object.values(sets).flat()),direct=summary(roots),potential=summary([...roots,...linked,...funded]);
 const wallets=unique([...Object.values(sets).flat(),...(input.holdings||[]).map(h=>h.wallet)]).map(wallet=>{
  const tx=trades.filter(t=>t.wallet===wallet),first=tx.find(t=>t.side==='buy');const sold=tx.filter(t=>t.side==='sell');const salesByQuote={};for(const s of sold){const q=integer(s.quoteRaw);if(q!=null)salesByQuote[s.quoteMint]=(BigInt(salesByQuote[s.quoteMint]||'0')+q).toString();}
  const firstSlotBuys=first?tx.filter(t=>t.side==='buy'&&t.slot===first.slot):[];const entryOrderUncertain=unique(firstSlotBuys.map(t=>t.signature)).length>1&&firstSlotBuys.some(t=>t.transactionIndex==null);
  const quoteDecimals=first?input.quoteDecimals?.[first.quoteMint]:null;const entry=first&&!entryOrderUncertain&&integer(first.quoteRaw)!=null&&quoteDecimals!=null&&input.decimals!=null&&BigInt(first.raw)>0n?Number(first.quoteRaw)/Number(first.raw)*10**(input.decimals-quoteDecimals):null;
  return {wallet,categories:Object.entries(sets).filter(([,a])=>a.includes(wallet)).map(([k])=>k),holding:summary([wallet]),firstBuy:first||null,entryOrderUncertain,entryPrice:entry,entryQuote:first?.quoteMint||null,observedSoldRaw:sold.reduce((n,t)=>n+BigInt(t.raw),0n).toString(),salesByQuote,salesCoverage:'Sampled decoded sales; proceeds are not profit. Missing transactions are not zero sales.',trades:tx};
 });
 const simulateGroup=(s,label)=>({label,holdingStatus:s.status,knownWallets:s.knownWallets,totalWallets:s.wallets.length,scenarios:s.raw!=null&&s.knownWallets>0?config.sellFractions.map(f=>({fraction:f,...simulateSale(input.pool,(BigInt(s.raw)*BigInt(Math.round(f*10000))/10000n).toString(),now,config)})):[]});
 return {version:config.version,mint:input.mint,at:now,decimals:input.decimals??null,quoteDecimals:input.quoteDecimals||{},totalRaw:input.totalRaw??null,circulatingRaw:input.circulatingRaw??null,launch,creatorHint:input.creatorHint||null,pool:input.pool||null,coverage:input.coverage||{},warnings:unique(input.warnings||[]),
  bundle:{confirmedBundles:null,groups,original:original(sets.bundle),remaining:summary(sets.bundle),status:launch?'candidate_detection':'launch_unknown'},
  sniper:{windowSeconds:config.sniperSeconds,windowSlots:config.sniperSlots,original:original(sets.sniper.filter(a=>launchBuys.some(t=>t.wallet===a))),remaining:summary(sets.sniper),originalScope:'End-of-launch-slot balance, only for wallets buying in that slot. Later sniper entries are excluded.',status:launch?'sampled':'launch_unknown'},
  developer:{direct,potential,funded:summary(funded),roles:launch?[{wallet:launch.deployer,role:'Create-event user / deployer'},{wallet:launch.creator,role:'Create-event creator'}]:[],note:'Role addresses and transfer-linked candidates are distinct. Transfers and shared funders do not prove developer control.'},
  combined:{...combined,categoryMemberships:Object.values(sets).reduce((n,a)=>n+a.length,0),overlapMemberships:Object.values(sets).reduce((n,a)=>n+a.length,0)-combined.wallets.length},wallets,
  graph:{nodes:unique([...wallets.map(w=>w.wallet),...transfers.flatMap(e=>[e.from,e.to])]).map(id=>({id,roles:wallets.find(w=>w.wallet===id)?.categories||[]})),edges:graphEdges.slice(0,config.maxGraphEdges),omittedEdges:Math.max(0,graphEdges.length-config.maxGraphEdges),note:'Confidence describes relationship evidence strength, not a calibrated insider probability.'},
  simulations:[simulateGroup(direct,'Creator/deployer role wallets'),simulateGroup(potential,'Role wallets + potential transfer/funding links'),simulateGroup(combined,'All deduplicated flagged wallets')],
  limitations:['No confirmed bundle attribution without bundle-service evidence.','Circulating supply is unknown without verified lock, vesting and exclusion records.','Observed trades and links are a bounded sample; absence is not clearance.','No claim of insider access, common control or future selling.']};
}
