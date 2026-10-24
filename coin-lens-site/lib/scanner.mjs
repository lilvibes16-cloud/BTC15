import {SCAN_VERSION,scanFailure} from './scan-contract.mjs';
export const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE = 'https://api.dexscreener.com';
const SOURCES = [
 ['Latest profiles', '/token-profiles/latest/v1'],
 ['Updated profiles', '/token-profiles/recent-updates/v1'],
 ['Paid boosts', '/token-boosts/latest/v1'],
];
const num = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
export function normalizePair(pair, sources = [], now = Date.now()) {
 const p = Number(pair.priceUsd);
 return {
  address: pair.baseToken.address, name: String(pair.baseToken.name || 'Unnamed token'), symbol: String(pair.baseToken.symbol || '—'),
  dex: String(pair.dexId || 'Unknown'), price: pair.priceUsd != null && Number.isFinite(p) && p >= 0 ? p : null,
  liquidity: num(pair.liquidity?.usd), volume: num(pair.volume?.h1), buys: num(pair.txns?.h1?.buys), sells: num(pair.txns?.h1?.sells),
  change: num(pair.priceChange?.h1), created: num(pair.pairCreatedAt) > 0 && pair.pairCreatedAt <= now ? pair.pairCreatedAt : null,
  pairAddress: pair.pairAddress, volume5m: num(pair.volume?.m5), buys5m: num(pair.txns?.m5?.buys), sells5m: num(pair.txns?.m5?.sells), change5m: num(pair.priceChange?.m5),
  marketCap: num(pair.marketCap), url: 'https://dexscreener.com/solana/' + encodeURIComponent(pair.pairAddress),
  sources, promoted: sources.includes('Paid boosts') || (num(pair.boosts?.active) || 0) > 0,
 };
}
export function assess(coin, now = Date.now()) {
 const missing = ['liquidity', 'volume', 'buys', 'sells', 'change', 'created'].filter(k => coin[k] == null);
 const unverified = 'Holder concentration, linked wallets, developer sales, token permissions and sell execution remain unverified.';
 if (missing.length) return {score: null, band:'Not scored', verdict:'Wait · incomplete data', reason:'Missing '+missing.join(', ')+'. A numerical rating would imply more evidence than is available.', factors:[], unverified, version:'1.0'};
 const hours = (now - coin.created) / 3600000;
 const tx = coin.buys + coin.sells;
 const factors = [
  {label:'Speculative-token baseline', points:20},
  {label:'On-chain ownership and sell checks unverified', points:20},
  {label:coin.liquidity < 5000 ? 'Liquidity below $5,000' : coin.liquidity < 20000 ? 'Liquidity below $20,000' : coin.liquidity < 50000 ? 'Liquidity below $50,000' : 'Liquidity at least $50,000', points:coin.liquidity < 5000 ? 25 : coin.liquidity < 20000 ? 18 : coin.liquidity < 50000 ? 10 : 0},
  {label:hours < 1 ? 'Pair under 1 hour old' : hours < 24 ? 'Pair under 24 hours old' : 'Pair at least 24 hours old', points:hours < 1 ? 10 : hours < 24 ? 5 : 0},
  {label:tx < 20 ? 'Fewer than 20 transactions in 1h' : tx < 100 ? 'Fewer than 100 transactions in 1h' : 'At least 100 transactions in 1h', points:tx < 20 ? 10 : tx < 100 ? 5 : 0},
  {label:Math.abs(coin.change) >= 50 ? 'Price moved at least 50% in 1h' : Math.abs(coin.change) >= 20 ? 'Price moved at least 20% in 1h' : 'Price moved less than 20% in 1h', points:Math.abs(coin.change) >= 50 ? 10 : Math.abs(coin.change) >= 20 ? 5 : 0},
  {label:coin.sells > 2 * coin.buys ? 'Sell count exceeds twice buy count' : 'Sell count does not exceed twice buy count', points:coin.sells > 2 * coin.buys ? 5 : 0},
 ];
 const score = factors.reduce((s, f) => s + f.points, 0);
 const severe = coin.liquidity < 5000 || coin.change <= -50 || tx < 5 || score >= 80;
 const active = coin.liquidity >= 50000 && tx >= 100 && hours >= 1 && Math.abs(coin.change) < 20;
 const evidence = factors.slice(2).filter(f => f.points > 0).map(f => f.label.toLowerCase()).slice(0,3);
 return {score, band:score >= 80 ? 'Very high' : score >= 60 ? 'High' : 'Elevated', verdict:severe ? 'Pass · major market warnings' : active ? 'Watch · further research only' : 'Wait · unverified setup',
  reason:severe ? 'I would pass on this snapshot: '+evidence.join('; ')+'.' : active ? 'Activity and liquidity meet the watch criteria. I would keep this on a research watchlist, not treat it as a cleared buy.' : 'I would wait'+(evidence.length ? ': '+evidence.join('; ') : ' for ownership and sell checks')+'.',
  factors, unverified, version:'1.0'};
}
export async function scan(fetcher = fetch, options = {}) {
 const get = async path => {
  const r = await fetcher(BASE + path, {signal:AbortSignal.timeout(12000), cache:'no-store', headers:{Accept:'application/json', 'Cache-Control':'no-cache'}});
  if (!r.ok) throw Error('Market provider returned HTTP '+r.status);
  return r.json();
 };
 const watch = [...new Set((options.watch || []).filter(a => ADDRESS.test(a)))].slice(0,20);
 const query = String(options.query || '').trim().slice(0,80);
 const candidates = new Map();
 const add = (address, source) => {if(!ADDRESS.test(address))return;const sources=candidates.get(address)||[];if(!sources.includes(source))sources.push(source);candidates.set(address,sources)};
 const sources=[];
 let directPairs=[];
 if (query) {
  if (ADDRESS.test(query)) {add(query,'Contract lookup');sources.push({name:'Contract lookup',ok:true,count:1});}
  else {
   const d=await get('/latest/dex/search?q='+encodeURIComponent(query));
   if(!Array.isArray(d.pairs))throw Error('Unexpected search response');
   directPairs=d.pairs.filter(p=>p.chainId==='solana'&&p.baseToken&&ADDRESS.test(p.baseToken.address)).slice(0,30);
   for(const p of directPairs)add(p.baseToken.address,'Network search');
   sources.push({name:'Network search',ok:true,count:candidates.size});
  }
 } else {
  const results=await Promise.allSettled(SOURCES.map(async([name,path])=>{const d=await get(path);if(!Array.isArray(d))throw Error('Unexpected discovery response');return d.filter(p=>p.chainId==='solana'&&ADDRESS.test(p.tokenAddress)).slice(0,30)}));
  results.forEach((r,i)=>{const name=SOURCES[i][0];if(r.status==='fulfilled'){for(const p of r.value)add(p.tokenAddress,name);sources.push({name,ok:true,count:r.value.length})}else sources.push({name,ok:false,count:0,error:r.reason?.message||'Unavailable',retryAt:r.reason?.retryAt||null})});
 }
 for(const c of options.launches||[])add(c.address,c.migrated?'PumpPortal migration':'PumpPortal launch');
 const discovered=candidates.size;
 for(const a of watch)add(a,'Watchlist');
 if(!candidates.size && sources.every(s=>!s.ok))throw scanFailure('All discovery feeds are unavailable.',sources.filter(s=>!s.ok));
 const addresses=[...candidates.keys()];
 const batches=[];
 for(let i=0;i<addresses.length;i+=30)batches.push(addresses.slice(i,i+30));
 const marketResults=await Promise.allSettled(batches.map(async a=>{const d=await get('/tokens/v1/solana/'+a.join(','));if(!Array.isArray(d))throw Error('Unexpected market response');return d}));
 const warnings=sources.filter(s=>!s.ok).map(s=>s.name+': '+s.error);
 const pairs=[];
 marketResults.forEach(r=>{if(r.status==='fulfilled')pairs.push(...r.value);else warnings.push('Some market data unavailable: '+(r.reason?.message||'request failed'))});
 if(batches.length && marketResults.every(r=>r.status==='rejected'))throw scanFailure('Market data unavailable. No current assessments can be produced.',marketResults.filter(r=>r.status==='rejected').map(r=>({name:'Token markets',error:r.reason?.message||'Request failed',retryAt:r.reason?.retryAt||null})));
 const now=Date.now();
 const coins=[];
 for(const [address, origin] of candidates){
  const pair=pairs.filter(p=>p.chainId==='solana'&&p.baseToken?.address===address&&typeof p.pairAddress==='string').sort((a,b)=>(num(b.liquidity?.usd)||0)-(num(a.liquidity?.usd)||0))[0];
  if(!pair)continue;
  const c=normalizePair(pair,origin,now);coins.push({...c,assessment:assess(c,now)});
 }
 const found=new Set(coins.map(c=>c.address));
 return {fetchedAt:new Date(now).toISOString(),discovered,coins,sources,warnings,missingWatch:watch.filter(a=>!found.has(a)),pendingLaunches:(options.launches||[]).filter(c=>!found.has(c.address)),launchCandidates:(options.launches||[]).length,query,version:SCAN_VERSION};
}
