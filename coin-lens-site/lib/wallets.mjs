import {ADDRESS,scan} from './scanner.mjs';
export const RPC='https://api.mainnet-beta.solana.com';
const PROGRAMS=['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
export function validAddress(a){if(!ADDRESS.test(a))return false;const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const c of a)n=n*58n+BigInt(alphabet.indexOf(c));let bytes=0;while(n){bytes++;n>>=8n}let zero=0;while(a[zero]==='1')zero++;return bytes+zero===32;}
export async function rpc(method,params,fetcher=fetch,endpoint=RPC){
 const r=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!r.ok)throw Error('Public Solana RPC returned HTTP '+r.status);
 const d=await r.json();if(d.error)throw Error('Public Solana RPC: '+String(d.error.message||'request rejected').slice(0,120));if(!('result'in d))throw Error('Unexpected Solana response');return d.result;
}
function decimal(raw,decimals){const neg=raw<0n;const s=(neg?-raw:raw).toString().padStart(decimals+1,'0');if(!decimals)return (neg?'-':'')+s;return (neg?'-':'')+s.slice(0,-decimals)+'.'+s.slice(-decimals);}
export function tokenChanges(transaction,address){
 if(!transaction?.meta||transaction.meta.err)return [];
 const amounts=new Map();
 for(const [side,rows] of [[-1n,transaction.meta.preTokenBalances||[]],[1n,transaction.meta.postTokenBalances||[]]]){
  for(const row of rows){if(row.owner!==address||!row.mint||!/^\d+$/.test(row.uiTokenAmount?.amount||''))continue;const decimals=row.uiTokenAmount.decimals;if(!Number.isInteger(decimals)||decimals<0||decimals>30)continue;const previous=amounts.get(row.mint)||{raw:0n,decimals};previous.raw+=side*BigInt(row.uiTokenAmount.amount);amounts.set(row.mint,previous)}
 }
 return [...amounts].filter(([,v])=>v.raw!==0n).map(([mint,v])=>({mint,amount:decimal(v.raw,v.decimals),direction:v.raw<0n?'Outflow':'Inflow'}));
}
export function summarizePnl(payload){
 const summary=payload?.data?.summary;if(!summary||!summary.pnl)throw Error('Unexpected performance response');
 const numeric=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
 const realized=numeric(summary.pnl.realized_profit_usd),unrealized=numeric(summary.pnl.unrealized_usd);
 if(realized===null)throw Error('Provider did not return realized profit');
 return {status:'available',source:'Birdeye',duration:'30d',realized,unrealized,total:numeric(summary.pnl.total_usd),wins:numeric(summary.counts?.total_win),losses:numeric(summary.counts?.total_loss),uniqueTokens:numeric(summary.unique_tokens),note:'Provider-reported 30-day figures, not independently audited. Fees and transferred-in cost basis have not been independently verified. These figures do not establish whether a trader sells on followers.'};
}
async function performance(address,key,fetcher){
 if(!key)return {status:'not_connected',realized:null,unrealized:null,note:'Profitability requires historical cost-basis data. Birdeye API access is not connected.'};
 try{const r=await fetcher('https://public-api.birdeye.so/wallet/v2/pnl/details',{method:'POST',headers:{'Content-Type':'application/json','X-API-KEY':key,'x-chain':'solana'},body:JSON.stringify({wallet:address,duration:'30d',limit:100}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Performance provider returned HTTP '+r.status);return summarizePnl(await r.json());}catch(e){return {status:'unavailable',realized:null,unrealized:null,note:e.message||'Performance lookup failed'}}
}
export async function inspectWallet(address,{fetcher=fetch,key='',rpcUrl=RPC}={}){
 if(!validAddress(address))throw Error('Enter a valid 32-byte Solana public address.');
 const call=(method,params)=>rpc(method,params,fetcher,rpcUrl);
 const warnings=[];
 const results=await Promise.allSettled([
  call('getBalance',[address,{commitment:'confirmed'}]),
  call('getSignaturesForAddress',[address,{limit:20,commitment:'confirmed'}]),
  ...PROGRAMS.map(programId=>call('getTokenAccountsByOwner',[address,{programId},{encoding:'jsonParsed',commitment:'confirmed'}])),
  performance(address,key,fetcher)
 ]);
 const value=(i,label)=>{const r=results[i];if(r.status==='fulfilled')return r.value;warnings.push(label+': '+r.reason.message);return null};
 const balance=value(0,'SOL balance'),history=value(1,'Activity'),classic=value(2,'Token holdings'),token2022=value(3,'Token-2022 holdings');
 const pnl=results[4].status==='fulfilled'?results[4].value:{status:'unavailable',realized:null,note:'Performance lookup failed'};
 if(!balance&&!history&&!classic&&!token2022)throw Error('Public wallet data is unavailable. Try again later.');
 const holdings=new Map();
 for(const row of [...(classic?.value||[]),...(token2022?.value||[])]){const info=row.account?.data?.parsed?.info;const raw=info?.tokenAmount?.amount;if(!info?.mint||!/^\d+$/.test(raw||'')||BigInt(raw)===0n)continue;const previous=holdings.get(info.mint)||{mint:info.mint,raw:0n,decimals:info.tokenAmount.decimals};previous.raw+=BigInt(raw);holdings.set(info.mint,previous)}
 const signatures=Array.isArray(history)?history:[];
 const details=new Map();
 const selected=signatures.filter(s=>!s.err).slice(0,6);
 for(let i=0;i<selected.length;i+=2){const r=await Promise.allSettled(selected.slice(i,i+2).map(s=>call('getTransaction',[s.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:0}])));r.forEach((v,j)=>{if(v.status==='fulfilled'&&v.value)details.set(selected[i+j].signature,v.value);else warnings.push('Transaction details unavailable for '+selected[i+j].signature.slice(0,8))})}
 const transactions=signatures.map(s=>{const tx=details.get(s.signature);return {signature:s.signature,timestamp:typeof s.blockTime==='number'?s.blockTime:null,failed:!!s.err,detailsLoaded:!!tx,changes:tokenChanges(tx,address),url:'https://solscan.io/tx/'+s.signature}});
 const tokenList=[...holdings.values()].map(v=>({mint:v.mint,amount:decimal(v.raw,v.decimals)}));
 return {address,fetchedAt:new Date().toISOString(),sol:typeof balance?.value==='number'?balance.value/1e9:null,holdings:tokenList.slice(0,60),holdingsTotal:tokenList.length,holdingsComplete:!!classic&&!!token2022,transactions,performance:pnl,warnings,source:rpcUrl===RPC?'Solana public mainnet RPC':'Configured Solana RPC',scope:'Newest 20 address-referencing transactions; balance details for up to 6 successful transactions. This is not full trading history.',opinion:pnl.status==='available'?(pnl.realized>0?'Positive provider-reported realized PnL over 30 days. Treat this as a research lead; follower impact and ownership remain unverified.':'No positive realized-profit evidence in the provider’s 30-day result. Do not select this wallet as a profitable trader on this evidence.'):'Wait — profitability is unverified. Balance and recent activity cannot establish trading skill.',followerStatus:'Unknown',insiderStatus:'Not established'};
}
export async function discoverWallets(token,{fetcher=fetch,rpcUrl=RPC}={}){
 const call=(method,params)=>rpc(method,params,fetcher,rpcUrl);
 let name=null;
 if(!token){const market=await scan(fetcher);const choice=market.coins.filter(c=>['pumpfun','pumpswap'].includes(c.dex)&&c.volume!==null).sort((a,b)=>b.volume-a.volume)[0];if(!choice)throw Error('No Pump.fun or PumpSwap token available to sample.');token=choice.address;name=choice.name;}
 if(!validAddress(token))throw Error('Enter a valid Solana token contract.');
 const [largest,supply]=await Promise.all([call('getTokenLargestAccounts',[token,{commitment:'confirmed'}]),call('getTokenSupply',[token,{commitment:'confirmed'}])]);
 const accounts=largest?.value?.filter(x=>x.address&&/^\d+$/.test(x.amount||''))||[];
 if(!accounts.length)return {token,name,candidates:[],fetchedAt:new Date().toISOString(),method:'Largest token-account owners'};
 const detail=await call('getMultipleAccounts',[accounts.map(a=>a.address),{encoding:'jsonParsed',commitment:'confirmed'}]);
 const owners=new Map();
 accounts.forEach((a,i)=>{const info=detail?.value?.[i]?.data?.parsed?.info;if(!validAddress(info?.owner||'')||info.mint!==token)return;const old=owners.get(info.owner)||{address:info.owner,raw:0n,tokenAccounts:0};old.raw+=BigInt(a.amount);old.tokenAccounts++;owners.set(info.owner,old)});
 const supplyRaw=/^\d+$/.test(supply?.value?.amount||'')?BigInt(supply.value.amount):0n;
 const candidates=[...owners.values()].sort((a,b)=>a.raw===b.raw?0:a.raw>b.raw?-1:1).slice(0,12).map(v=>({address:v.address,shareInSample:supplyRaw>0n?Number(v.raw*10000n/supplyRaw)/100:null,tokenAccounts:v.tokenAccounts,status:'Unverified holder; not a profit ranking'}));
 return {token,name,candidates,fetchedAt:new Date().toISOString(),method:'Owners of the largest 20 token accounts',note:'Sampled balances may omit other accounts owned by the same wallet. Owners may be pools, exchanges, teams or traders. Profitability, identity and insider status are unknown.'};
}
