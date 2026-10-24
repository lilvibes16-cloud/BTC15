import {rpc,RPC,validAddress} from '../wallets.mjs';
import {decodePool,transactionEvidence} from './protocol.mjs';
import {OWNERSHIP_CONFIG as C} from '../radar-config.mjs';
const CLASSIC='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SOL='So11111111111111111111111111111111111111112';
const quoteDecimals={[SOL]:9,'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v':6};
export function launchSlotBalances(block,mint){
 const accounts=new Map();for(const tx of block.transactions||[]){if(tx.meta?.err)continue;const keys=(tx.transaction?.message?.accountKeys||[]).map(k=>typeof k==='string'?k:k.pubkey);
  const post=new Set((tx.meta?.postTokenBalances||[]).filter(r=>r.mint===mint).map(r=>r.accountIndex));
  for(const r of tx.meta?.preTokenBalances||[])if(r.mint===mint&&!post.has(r.accountIndex)&&keys[r.accountIndex])accounts.delete(keys[r.accountIndex]);
  for(const r of tx.meta?.postTokenBalances||[])if(r.mint===mint&&r.owner&&keys[r.accountIndex]&&/^\d+$/.test(r.uiTokenAmount?.amount||''))accounts.set(keys[r.accountIndex],{wallet:r.owner,raw:r.uiTokenAmount.amount});
 }const owners=new Map();for(const a of accounts.values())owners.set(a.wallet,(owners.get(a.wallet)||0n)+BigInt(a.raw));return [...owners].map(([wallet,raw])=>({wallet,raw:raw.toString()}));
}
export async function collectOwnership(mint,{pair=null,launchHint=null,fetcher=fetch,rpcUrl=C.publicRpc,config=C}={}){
 if(!validAddress(mint))throw Error('Invalid token mint');
 const input={mint,at:Date.now(),trades:[],transfers:[],holdings:[],launchHoldings:[],launchBalancesComplete:false,quoteDecimals:{...quoteDecimals},warnings:[],coverage:{provider:rpcUrl===C.publicRpc?'PublicNode Solana RPC + official Pump event decoders':'Configured Solana RPC + official Pump event decoders',history:'bounded sample',rpcRequests:0,successfulRequests:0,transactions:0,launchSlotComplete:false,fullHistory:false},creatorHint:launchHint?.creator||null};
 const started=Date.now();let blocked=false;const call=async(method,params)=>{if(input.coverage.rpcRequests>=config.maxRpcRequests||Date.now()-started>config.deadlineMs)blocked=true;if(blocked)throw Error('RPC unavailable for this inspection');input.coverage.rpcRequests++;try{const value=await rpc(method,params,fetcher,rpcUrl);input.coverage.successfulRequests++;return value}catch(e){if(/HTTP (403|401|429)/.test(e.message))blocked=true;throw e;}};
 const attempt=async(label,fn)=>{try{return await fn()}catch(e){input.warnings.push(label+': '+e.message);return null;}};
 const mintResult=await attempt('Mint and supply',()=>call('getAccountInfo',[mint,{encoding:'jsonParsed',commitment:'confirmed'}]));
 const mintInfo=mintResult?.value?.data?.parsed?.info;
 if(mintInfo?.supply&&Number.isInteger(mintInfo.decimals)){input.totalRaw=mintInfo.supply;input.decimals=mintInfo.decimals;input.supplySlot=mintResult.context?.slot;}
 if(blocked){input.coverage.state='provider_unavailable';return input;}
 let poolInfo=null;
 if(pair&&validAddress(pair)){
  const first=await attempt('Pool account',()=>call('getAccountInfo',[pair,{encoding:'base64',commitment:'confirmed'}]));
  poolInfo=await attempt('Pool decoder',async()=>decodePool(first?.value));
  if(poolInfo?.base_mint===mint){
   const p=poolInfo;
   const state=await attempt('Pool reserves',()=>call('getMultipleAccounts',[[pair,p.pool_base_token_account,p.pool_quote_token_account],{encoding:'jsonParsed',commitment:'confirmed'}]));
   if(state?.value?.length===3){const current=await attempt('Pool recheck',async()=>decodePool(state.value[0]));const base=state.value[1]?.data?.parsed?.info,quote=state.value[2]?.data?.parsed?.info;
    if(current&&current.base_mint===mint&&current.pool_base_token_account===p.pool_base_token_account&&current.pool_quote_token_account===p.pool_quote_token_account&&base?.mint===mint&&quote?.mint===p.quote_mint&&base.owner===pair&&quote.owner===pair){
     let unsupportedReason=null;
     if(BigInt(current.virtual_quote_reserves||'0')!==0n)unsupportedReason='Virtual-reserve / boosted pool: constant-product scenario disabled.';
     if(BigInt(current.protocol_fees||'0')!==0n||BigInt(current.creator_fees||'0')!==0n)unsupportedReason='Pool retains fee balances; spendable reserves require a version-specific fee model.';
     const extensions=mintInfo?.extensions;
     const baseSupported=(mintResult?.value?.owner===CLASSIC&&state.value[1]?.owner===CLASSIC)||(mintResult?.value?.owner===TOKEN2022&&state.value[1]?.owner===TOKEN2022&&Array.isArray(extensions)&&extensions.every(e=>['metadataPointer','tokenMetadata'].includes(e.extension)));
     if(!baseSupported||state.value[2]?.owner!==CLASSIC)unsupportedReason='Unsupported token extensions or quote token program; transfer-fee model required.';
     if(current.is_mayhem_mode||current.is_holder_reward||base.state==='frozen'||quote.state==='frozen')unsupportedReason='Special pool mode or frozen vault: simulation disabled.';
     input.pool={address:pair,model:'constant_product',verified:true,baseRaw:base.tokenAmount?.amount,quoteRaw:quote.tokenAmount?.amount,quoteMint:p.quote_mint,quoteDecimals:quote.tokenAmount?.decimals,at:Date.now(),slot:state.context?.slot,unsupportedReason};input.quoteDecimals[p.quote_mint]=quote.tokenAmount?.decimals;
    }else input.warnings.push('Pool vault identity could not be verified. Simulation disabled.');
   }
  }else input.warnings.push('Selected pair is not a verified PumpSwap pool for this mint. Simulation disabled.');
 }
 const transactions=new Map();
 const add=tx=>{const sig=tx?.transaction?.signatures?.[0];if(sig&&!tx.meta?.err)transactions.set(sig,tx);};
 if(launchHint?.signature){const tx=await attempt('Launch transaction',()=>call('getTransaction',[launchHint.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:config.maxTransactionVersion}]));add(tx);}
 function merge(){input.trades=[];input.transfers=[];for(const tx of transactions.values()){const e=transactionEvidence(tx,mint,input.pool);input.trades.push(...e.trades);input.transfers.push(...e.transfers);input.warnings.push(...e.warnings);for(const launch of e.launches)if(!input.launch||launch.slot<input.launch.slot){input.launch={...launch,verified:true};input.launchSupplyRaw=launch.totalRaw;}}}
 merge();
 // A launch known to the log permits inspecting its actual block. A new API response is never backdated as old knowledge.
 if(input.launch){
  const slot=input.launch.slot;
  const block=await attempt('Launch block',()=>call('getBlock',[slot,{encoding:'jsonParsed',transactionDetails:'full',rewards:false,commitment:'confirmed',maxSupportedTransactionVersion:config.maxTransactionVersion}]));
  if(Array.isArray(block?.transactions)&&block.transactions.length<=config.maxBlockTransactions){
   for(const [transactionIndex,tx] of block.transactions.entries())add({...tx,slot,transactionIndex,blockTime:block.blockTime});
   const hasLaunch=block.transactions.some(t=>t.transaction?.signatures?.[0]===input.launch.signature);
   if(hasLaunch){input.launchHoldings=launchSlotBalances(block,mint);input.launchBalancesComplete=true;input.coverage.launchSlotComplete=true;}
  }else if(block)input.warnings.push('Launch block exceeds bounded inspection capacity; original holdings remain unknown.');
 }
 const historyAddress=input.launch?.bondingCurve||mint;
 const recent=await attempt('Recent token transactions',()=>call('getSignaturesForAddress',[historyAddress,{limit:config.maxRecentSignatures,commitment:'confirmed'}]));
 for(const s of recent||[]){if(blocked)break;if(s.err||transactions.has(s.signature))continue;add(await attempt('Transaction detail',()=>call('getTransaction',[s.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:config.maxTransactionVersion}])));}
 // Include the selected migrated pool's recent trades; bonding-curve history alone misses PumpSwap.
 if(input.pool&&!blocked){const recentPool=await attempt('Pool transactions',()=>call('getSignaturesForAddress',[pair,{limit:config.maxRecentSignatures,commitment:'confirmed'}]));for(const s of recentPool||[]){if(blocked)break;if(s.err||transactions.has(s.signature))continue;add(await attempt('Pool transaction detail',()=>call('getTransaction',[s.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:config.maxTransactionVersion}])));}}
 merge();
 const roots=[input.launch?.creator,input.launch?.deployer].filter(validAddress);
 // A small, explicit address-history sample, not a complete ancestry crawl.
 const early=[...new Set(input.trades.filter(t=>t.side==='buy').sort((a,b)=>a.slot-b.slot).map(t=>t.wallet))];
 for(const wallet of [...new Set([...roots,...early])].slice(0,config.maxFundingWallets)){
  if(blocked)break;const sigs=await attempt('Wallet link history',()=>call('getSignaturesForAddress',[wallet,{limit:config.maxFundingSignatures,commitment:'confirmed'}]));
  for(const s of sigs||[]){if(blocked)break;if(s.err||transactions.has(s.signature))continue;add(await attempt('Wallet link transaction',()=>call('getTransaction',[s.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:config.maxTransactionVersion}])));}
 }
 merge();
 // Limit the graph to direct participants and one-hop evidence, avoiding unrelated launch-block transfers.
 const excluded=new Set([mint,pair,input.launch?.bondingCurve,poolInfo?.pool_base_token_account,poolInfo?.pool_quote_token_account,CLASSIC,SOL,'11111111111111111111111111111111'].filter(Boolean));
 const participants=new Set([...roots,...input.trades.map(t=>t.wallet)]);
 input.transfers=input.transfers.filter(e=>!excluded.has(e.from)&&!excluded.has(e.to)&&(participants.has(e.from)||participants.has(e.to)));
 const linked=input.transfers.filter(t=>roots.includes(t.from)).map(t=>t.to);
 const wallets=[...new Set([...roots,...linked,...early])].slice(0,config.maxWallets);
 for(const wallet of wallets){if(blocked)break;const accounts=await attempt('Current wallet holdings',()=>call('getTokenAccountsByOwner',[wallet,{mint},{encoding:'jsonParsed',commitment:'confirmed'}]));
  if(Array.isArray(accounts?.value)){let raw=0n,valid=true;for(const a of accounts.value){const info=a.account?.data?.parsed?.info;if(info?.mint!==mint||info.owner!==wallet||!/^\d+$/.test(info.tokenAmount?.amount||'')){valid=false;break;}raw+=BigInt(info.tokenAmount.amount);}if(valid)input.holdings.push({wallet,raw:raw.toString(),slot:accounts.context?.slot,at:Date.now()});}
 }
 input.coverage.state=input.coverage.successfulRequests===0?'provider_unavailable':input.warnings.length?'partial':'sampled';input.coverage.transactions=transactions.size;input.coverage.decodedTrades=input.trades.length;input.coverage.holdingsKnown=input.holdings.length;input.coverage.holdingsRequested=wallets.length;input.coverage.firstObservedSlot=input.trades.length?Math.min(...input.trades.map(t=>t.slot)):null;
 input.warnings.push('First-seconds coverage beyond the launch slot and complete realized sales require a historical transaction index.');
 if(!input.launch)input.warnings.push('No decoded creation transaction in available records. Creator and launch timing remain unverified.');
 return input;
}
