import test from 'node:test';
import assert from 'node:assert/strict';
import {scan,assess} from '../lib/scanner.mjs';
const A='11111111111111111111111111111111', B='22222222222222222222222222222222', C='33333333333333333333333333333333';
const now=Date.now();
const good={liquidity:100000,volume:20000,buys:110,sells:50,change:5,created:now-172800000};
const pair=a=>({chainId:'solana',baseToken:{address:a,name:'Test',symbol:'TEST'},pairAddress:'test-pair',dexId:'pumpswap',priceUsd:'0.0002',liquidity:{usd:good.liquidity},volume:{h1:good.volume},txns:{h1:{buys:110,sells:50}},priceChange:{h1:5},pairCreatedAt:good.created});
const response=d=>new Response(JSON.stringify(d),{headers:{'content-type':'application/json'}});
test('changing discovery brings in new coins; saved coins survive leaving the feed',async()=>{
 let generation=0;const calls=[];
 const fetcher=async url=>{calls.push(url);if(url.includes('/tokens/v1/'))return response(url.split('/').pop().split(',').map(pair));if(url.includes('latest/v1')&&url.includes('profiles'))return response([{chainId:'solana',tokenAddress:generation?B:A}]);return response([])};
 const first=await scan(fetcher);generation=1;const second=await scan(fetcher,{watch:[A]});
 assert.deepEqual(first.coins.map(x=>x.address),[A]);assert.deepEqual(new Set(second.coins.map(x=>x.address)),new Set([A,B]));assert.ok(second.coins.find(c=>c.address===A).sources.includes('Watchlist'));
});
test('remote search and contract lookup retrieve coins outside discovery',async()=>{
 const fetcher=async url=>url.includes('/search?')?response({pairs:[pair(C)]}):response([pair(C)]);
 assert.equal((await scan(fetcher,{query:'different'})).coins[0].address,C);
 assert.equal((await scan(fetcher,{query:C})).coins[0].address,C);
});
test('missing core data is unscored, never converted to a low-risk zero',()=>{assert.equal(assess({...good,liquidity:null},now).score,null)});
test('scores sum transparently and severe market warnings produce a pass',()=>{
 const result=assess({...good,liquidity:100,buys:0,sells:1,change:-90,created:now-1000},now);
 assert.equal(result.score,100);assert.equal(result.score,result.factors.reduce((s,f)=>s+f.points,0));assert.match(result.verdict,/Pass/);
 const watch=assess(good,now);assert.equal(watch.score,40);assert.match(watch.verdict,/Watch/);assert.match(watch.unverified,/unverified/);
});
test('partial discovery is disclosed and unavailable watchlist coins stay identified',async()=>{
 const fetcher=async url=>{if(url.includes('recent-updates'))return new Response('',{status:429});if(url.includes('/tokens/v1/'))return response([pair(A)]);return response([{chainId:'solana',tokenAddress:A}])};
 const r=await scan(fetcher,{watch:[B]});assert.equal(r.warnings.length,1);assert.deepEqual(r.missingWatch,[B]);
});
test('failed market requests cannot yield current scores',async()=>{
 const fetcher=async url=>url.includes('/tokens/v1/')?new Response('',{status:503}):response([{chainId:'solana',tokenAddress:A}]);
 await assert.rejects(()=>scan(fetcher),/Market data unavailable/);
});

test('successful scanner output matches the shared browser contract',async()=>{const {validScan}=await import('../lib/scan-contract.mjs');const result=await scan(async url=>url.includes('/tokens/v1/')?response([pair(A)]):response([{chainId:'solana',tokenAddress:A}]));assert.equal(validScan(result),true);assert.equal(validScan({...result,version:2}),false);assert.equal(validScan({...result,fetchedAt:null}),false)});
test('market failure preserves the provider reason and retry time',async()=>{const retryAt=Date.now()+60000;await assert.rejects(()=>scan(async url=>{if(url.includes('/tokens/v1/')){const e=new Error('Market provider cooldown');e.retryAt=retryAt;throw e;}return response([{chainId:'solana',tokenAddress:A}]);}),e=>{assert.match(e.message,/cooldown/);assert.equal(e.retryAt,retryAt);return true;});});
