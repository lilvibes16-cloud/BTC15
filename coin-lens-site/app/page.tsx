'use client';
import {useEffect,useRef,useState} from 'react';
import {validScan} from '../lib/scan-contract.mjs';
const ADDRESS=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const money=(v:any)=>v==null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1}).format(v);
const pairAge=(v:any,now:number)=>!v?'Unknown':now-v<3600000?`${Math.max(0,Math.floor((now-v)/60000))}m` : now-v<86400000?`${Math.floor((now-v)/3600000)}h`:`${Math.floor((now-v)/86400000)}d`;
const signature=(c:any)=>JSON.stringify([c.price,c.liquidity,c.volume,c.buys,c.sells,c.change,c.marketCap]);
export default function Home(){
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [filter,setFilter]=useState('all'),[input,setInput]=useState(''),[query,setQuery]=useState('');
 const [saved,setSaved]=useState<string[]>([]),[clock,setClock]=useState(Date.now()),[auto,setAuto]=useState(true);
 const [sort,setSort]=useState('newest'),[update,setUpdate]=useState<any>(null),[message,setMessage]=useState('');
 const dataRef=useRef<any>(null),watchRef=useRef<string[]>([]),termRef=useRef(''),requestRef=useRef<AbortController|null>(null),requestId=useRef(0);
 const retryAtRef=useRef(0);
 async function refresh(term=termRef.current,watch=watchRef.current){
  if(Date.now()<retryAtRef.current)return;
  requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;const id=++requestId.current;
  setBusy(true);setError('');
  try{
   const params=new URLSearchParams();if(term)params.set('q',term);if(watch.length)params.set('watch',watch.join(','));
   const r=await fetch('/api/scan?'+params.toString(),{cache:'no-store',signal:controller.signal});
   const d:any=await r.json();retryAtRef.current=Number(d.retryAt)||0;if(!r.ok)throw Error(d.error||'Feed unavailable');
   if(!validScan(d))throw Error('The new feed is not ready yet. Reload this page shortly.');
   if(id!==requestId.current)return;
   const previous=dataRef.current;
   if(previous&&previous.query===d.query){
    const old=new Map(previous.coins.map((c:any)=>[c.address,signature(c)]));
    const fresh=d.coins.filter((c:any)=>!old.has(c.address)).map((c:any)=>c.address);
    const changed=d.coins.filter((c:any)=>old.has(c.address)&&old.get(c.address)!==signature(c)).length;
    setUpdate({fresh,changed,first:false});
   }else setUpdate({fresh:[],changed:0,first:true});
   dataRef.current=d;setData(d);if(d.stale)setError(d.feedError||'Using a saved snapshot');setClock(Date.now());
  }catch(e){if(id===requestId.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Feed unavailable')}
  finally{if(id===requestId.current)setBusy(false)}
 }
 useEffect(()=>{
  let initial:string[]=[];
  try{const v=JSON.parse(localStorage.getItem('coin-lens-watch')||'[]');if(Array.isArray(v))initial=v.filter(a=>typeof a==='string'&&ADDRESS.test(a)).slice(0,20)}catch{}
  setSaved(initial);watchRef.current=initial;refresh('',initial);
  const clockTimer=setInterval(()=>setClock(Date.now()),1000);
  return()=>{clearInterval(clockTimer);requestRef.current?.abort()};
 },[]);
 useEffect(()=>{
  if(!auto)return;
  const timer=setInterval(()=>{if(!document.hidden)refresh()},60000);
  const visible=()=>{if(!document.hidden&&Date.now()-Date.parse(dataRef.current?.fetchedAt||'1970-01-01')>60000)refresh()};
  document.addEventListener('visibilitychange',visible);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible)};
 },[auto]);
 function toggle(address:string){
  setMessage('');if(!watchRef.current.includes(address)&&watchRef.current.length>=20){setMessage('Your watchlist holds 20 coins. Remove one to add another.');return}
  const next=watchRef.current.includes(address)?watchRef.current.filter(a=>a!==address):[...watchRef.current,address];
  watchRef.current=next;setSaved(next);try{localStorage.setItem('coin-lens-watch',JSON.stringify(next))}catch{setMessage('Browser storage is unavailable; this watchlist will last only for this session.')}
 }
 function search(e:React.FormEvent){e.preventDefault();const q=input.trim();if(q&&q.length<2){setMessage('Enter at least two characters or a full contract address.');return}setMessage('');termRef.current=q;setQuery(q);setFilter('all');setData(null);refresh(q)}
 function clearSearch(){termRef.current='';setInput('');setQuery('');setData(null);refresh('')}
 const age=data?Math.max(0,Math.floor((clock-Date.parse(data.fetchedAt))/1000)):null;
 const stale=age!==null&&age>120;
 const unavailable=Boolean(error)||stale;
 const coins=(data?.coins||[]).filter((c:any)=>(filter!=='saved'||saved.includes(c.address))&&(filter!=='pump'||['pumpfun','pumpswap'].includes(c.dex))).sort((a:any,b:any)=>sort==='liquidity'?(b.liquidity??-1)-(a.liquidity??-1):sort==='risk'?(a.assessment?.score??101)-(b.assessment?.score??101):(b.created??0)-(a.created??0));
 return <main>
  <header><a className="brand" href="/">◉ <span>COIN LENS</span></a><span className="tag">DISCOVERY / V4</span></header>
  <nav className="appnav"><a className="active" href="/">Coin scanner</a><a href="/runners">Runner radar</a><a href="/wallets">Wallet tracker</a><a href="/ownership">Supply & dump risk</a><a href="/logging">Scan log</a></nav>
  <section className="hero"><div className="eyebrow">SOLANA / DISCOVERY DESK</div><h1>Research before <em>risk.</em></h1><p>Find more coins. See what changed. Get a bot assessment with the evidence behind every score.</p>
   <div className="actions"><button onClick={()=>refresh()} disabled={busy}>{busy?'Scanning…':'↻ Scan market'}</button><label><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> Auto-refresh every minute while open</label></div>
  </section>
  {data?.logging&&<div className="notice">{data.logging.state==='cached'?'Showing a saved market snapshot; no duplicate outcome records added.':data.logging.state==='saved'?`${data.logging.snapshots} token snapshots saved to your persistent log.`:data.logging.state==='sign_in_required'?<>Scanning works without sign-in. <a href="/signin-with-chatgpt?return_to=%2Frunners" target="_top">Sign in to save every scan.</a></>:<strong>Logging failed: this scan was not saved.</strong>} <a href="/logging">View log →</a></div>}
  <section className="metrics"><div><span>FEED STATUS</span><strong className={unavailable?'amber':'green'}>{busy?'Fetching':error?'Unavailable':stale?'Stale snapshot':data?'Snapshot received':'Not loaded'}</strong></div><div><span>COINS FOUND</span><strong>{data?.coins.length??'—'} <small>{data?.sources.filter((s:any)=>s.ok).length??'—'} feeds + watchlist</small></strong></div><div><span>SNAPSHOT AGE</span><strong>{age===null?'—':age<60?`${age}s`:`${Math.floor(age/60)}m`} <small>since retrieval</small></strong></div></section>
  {error&&<div role="alert" className="notice">Data request failed: {error}. {data?'Previous results remain visible; current scores are paused.':'No sample data is substituted.'}</div>}
  {stale&&!error&&<div className="notice">This snapshot is over two minutes old. Refresh to enable current bot assessments.</div>}
  {data?.warnings?.length>0&&<div className="notice">Partial scan: {data.warnings.join(' · ')}</div>}
  <form className="searchbox" onSubmit={search}><label htmlFor="network-search">Search beyond the feed</label><div><input id="network-search" placeholder="Coin name or full Solana contract…" value={input} maxLength={80} onChange={e=>setInput(e.target.value)}/><button type="submit" disabled={busy}>Search</button>{query&&<button type="button" className="secondary" onClick={clearSearch}>Clear</button>}</div><small>Network search fetches other coins. Names can be copied—verify the contract.</small></form>
  {message&&<p role="status" className="notice">{message}</p>}
  <div className="toolbar"><div className="tabs">{[['all','All Solana'],['pump','Pump.fun / Swap'],['saved',`Watchlist (${saved.length})`]].map(([v,t])=><button key={v} className={filter===v?'selected':''} onClick={()=>{setFilter(v);if(v==='saved')refresh()}}>{t}</button>)}</div><label className="sortlabel">Sort<select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest pair</option><option value="liquidity">Highest liquidity</option><option value="risk">Risk indicator</option></select></label></div>
  <div className="sectionhead"><h2>{filter==='saved'?'Your watchlist':query?'Search results':'Discovery feed'}</h2><span aria-live="polite">{busy?'Checking feeds…':error?'Last scan failed':update?.first?`${data?.coins.length} coins in this scan`:update?`${update.fresh.length} new · ${update.changed} changed since last scan`:''}</span></div>
  <p className="caption">{query?`Results for “${query}”, plus saved coins.`:'Three DEX Screener feeds: latest profiles, updated profiles, and paid boosts. These are not all new launches.'} Pair age is not token age. Refresh can return the same coins if the provider list has not changed.</p>
  {data&&<details className="sourcebox"><summary>Feed health & score methodology</summary><div className="sourcechips">{data.sources.map((s:any)=><span key={s.name}>{s.name}: {s.ok?s.count+' candidates':'unavailable'}</span>)}</div><p>The 0–100 risk indicator is an unvalidated rules-based heuristic, not a probability of a crash, loss, or rug. Higher means more warning factors. It always starts at 40: 20 for speculative-token risk and 20 for missing ownership and sell checks.</p><p>Added points: liquidity 0–25; pair age 0–10; low transaction count 0–10; large 1h price movement 0–10; sell-heavy transaction counts 0–5. Each card shows its exact calculation. Missing core market fields means no score. All scores pause after two minutes or a failed refresh. Thresholds are our screening rules, not statistical estimates.</p><p>Bot view is generated from these fixed rules, not a live AI chat or independent audit. Even the lowest score here is not “safe.” Paid boosts never count as evidence of quality.</p></details>}
  {filter==='saved'&&data?.missingWatch?.length>0&&<div className="notice">No market data returned for {data.missingWatch.length} saved coin(s). They remain saved; no current score is available.<details><summary>Manage unavailable coins</summary>{data.missingWatch.map((a:string)=><div className="missing" key={a}><code>{a}</code><button className="secondary" onClick={()=>toggle(a)}>Remove</button></div>)}</details></div>}
  <section className="grid">{coins.map((c:any)=>{const a=c.assessment;const paused=unavailable;return <article key={c.address}>
   <div className="cardtop"><div className="avatar">{String(c.symbol).slice(0,2).toUpperCase()}</div><div className="name"><h3>{c.name}</h3><span>{c.symbol} · {c.dex} · pair {pairAge(c.created,clock)}</span></div><button className="star" aria-label={saved.includes(c.address)?'Remove from watchlist':'Add to watchlist'} onClick={()=>toggle(c.address)}>{saved.includes(c.address)?'★':'☆'}</button></div>
   <div className="price">{c.price==null?'Price unavailable':'$'+Number(c.price).toLocaleString('en-US',{maximumSignificantDigits:5})}<span className={c.change==null?'':c.change>=0?'green':'red'}>{c.change==null?'—':(c.change>=0?'+':'')+c.change+'%'} <small>1h</small></span></div>
   <div className="stats"><div><span>Liquidity</span><b>{money(c.liquidity)}</b></div><div><span>Volume · 1h</span><b>{money(c.volume)}</b></div><div><span>Buys / sells · 1h</span><b>{c.buys??'—'} / {c.sells??'—'}</b></div><div><span>Market cap</span><b>{money(c.marketCap)}</b></div></div>
   <div className="flags">{update?.fresh.includes(c.address)&&<span className="newflag">New this scan</span>}{c.promoted&&<span>Paid promotion detected</span>}{c.sources.map((s:string)=><span className="mutedflag" key={s}>{s}</span>)}</div>
   <section className="assessment"><div className="riskheading"><span>RISK INDICATOR</span><strong className={a.score>=80?'red':'amber'}>{paused?'Paused':a.score==null?'Not scored':<>{a.score}<small> / 100</small></>}</strong></div><div className="riskbar" aria-hidden="true"><i style={{width:paused||a.score==null?'0%':a.score+'%',background:a.score>=80?'#ff998c':'#eac37d'}}/></div><small className="risknote">{paused?'Refresh required':a.score==null?'Insufficient market data':`${a.band} · not a loss probability`}</small><div className="botlabel">BOT VIEW <span>Rules-based</span></div><h4>{paused?'Wait · refresh required':a.verdict}</h4><p>{paused?'Do not use the old assessment for a new decision.':a.reason}</p></section>
   <details><summary>Why this score?</summary>{!paused&&a.factors.length>0?<ul className="factors">{a.factors.map((f:any)=><li key={f.label}><span>{f.label}</span><b>+{f.points}</b></li>)}</ul>:<p>{paused?'Current scoring is paused.':a.reason}</p>}<p>{a.unverified} Counts are transactions, not unique buyers; volume may be manipulated. No fee-adjusted entry quote is available.</p><p>Score model v{a.version}; heuristic, not calibrated or backtested. This is a pool snapshot, not a complete wallet audit.</p></details>
   <details><summary>Contract & evidence</summary><code>{c.address}</code><p>Pair created: {c.created?new Date(c.created).toLocaleString():'Unavailable'}</p><p>Retrieved: {new Date(data.fetchedAt).toLocaleString()}. The provider does not supply a verified observation timestamp for every field.</p><p>Market figures describe the largest-liquidity returned pool.</p></details>
   <a className="external" target="_blank" rel="noopener noreferrer" href={c.url}>Inspect source ↗</a><a className="external" href={'/wallets?token='+c.address}>Find public holder wallets ↗</a>
  </article>})}</section>
  {!coins.length&&<div className="empty"><span>◎</span><h3>{busy?'Checking the market…':error?'Waiting for a working feed':filter==='saved'?'No available watchlist results':'No matching Solana pairs'}</h3><p>{filter==='saved'?'Star a coin to keep refreshing it even after it leaves discovery. Up to 20 saved coins.':'Try another name or full contract address. The provider may not have indexed a new coin yet.'}</p></div>}
  <footer><div><strong>Evidence, not certainty.</strong><p>No wallet connection or automatic trades. You can lose the whole position.</p></div><p>DEX Screener data · Coin Lens v4<br/>Watchlist saved on this device. Refresh runs only while this page is open.</p></footer>
 </main>
}
