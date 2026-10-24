import test from 'node:test';
import assert from 'node:assert/strict';
import {validAddress,tokenChanges,summarizePnl,inspectWallet} from '../lib/wallets.mjs';
import {compareCallout} from '../lib/wallet-evidence.mjs';
const wallet='11111111111111111111111111111111';
const token='So11111111111111111111111111111111111111112';
const balance=(amount,owner=wallet)=>({mint:token,owner,uiTokenAmount:{amount,decimals:6}});
test('validates decoded 32-byte public addresses, rejects mnemonic and wrong size',()=>{
 assert.ok(validAddress(wallet));assert.ok(validAddress(token));assert.equal(validAddress('1'.repeat(44)),false);assert.equal(validAddress('these are secret words'),false);
});
test('computes net token flows without misclassifying internal transfers or failed transactions',()=>{
 const tx={meta:{err:null,preTokenBalances:[balance('99999999999999999999')],postTokenBalances:[balance('99999999999998999999')]}};
 assert.deepEqual(tokenChanges(tx,wallet),[{mint:token,amount:'-1.000000',direction:'Outflow'}]);
 assert.deepEqual(tokenChanges({meta:{err:null,preTokenBalances:[balance('1000000')],postTokenBalances:[balance('400000'),balance('600000')]}},wallet),[]);
 assert.deepEqual(tokenChanges({meta:{...tx.meta,err:{failure:true}}},wallet),[]);
});
test('profit is separate from balances and missing provider data never becomes zero profit',()=>{
 assert.throws(()=>summarizePnl({data:{summary:{pnl:{realized_profit_usd:null}}}}));
 const result=summarizePnl({data:{summary:{pnl:{realized_profit_usd:'12.5',unrealized_usd:'-3'},counts:{total_win:3,total_loss:2},unique_tokens:5}}});
 assert.equal(result.realized,12.5);assert.equal(result.unrealized,-3);assert.equal(result.wins,3);
});
test('public-callout comparison is inconclusive without sampled outflows; flags evidence without claiming sales',()=>{
 const now=Date.now(),time=new Date(now-100000).toISOString();
 const snapshot={fetchedAt:new Date(now).toISOString(),transactions:[{signature:'test',timestamp:(now-50000)/1000,failed:false,detailsLoaded:true,changes:[{mint:token,direction:'Outflow'}]}]};
 const r=compareCallout(snapshot,{time,token},now);assert.equal(r.count,1);assert.match(r.note,/transfers/);assert.match(r.note,/not independently verified/);
 assert.match(compareCallout({...snapshot,transactions:[]},{time,token},now).verdict,/Inconclusive/);
 assert.ok(compareCallout(snapshot,{time:new Date(now+10000).toISOString(),token},now).error);
});
test('unconnected profitability stays unknown even if balance is large',async()=>{
 const fetcher=async(url,opts)=>{const {method}=JSON.parse(opts.body);const result=method==='getBalance'?{value:1000000000000}:method==='getSignaturesForAddress'?[]:{value:[]};return new Response(JSON.stringify({jsonrpc:'2.0',result,id:1}))};
 const d=await inspectWallet(wallet,{fetcher});assert.equal(d.sol,1000);assert.equal(d.performance.realized,null);assert.equal(d.performance.status,'not_connected');assert.equal(d.followerStatus,'Unknown');assert.match(d.opinion,/unverified/);
});
