import test from 'node:test';
import assert from 'node:assert/strict';
import {runnerAssessment,recordObservation} from '../lib/runners.mjs';
import {normalizePair} from '../lib/scanner.mjs';
const now=1800000000000;
const coin={pairAddress:'pair',liquidity:60000,volume:27000,volume5m:5000,buys5m:30,sells5m:10,change5m:8,change:30,created:now-7200000};
test('volume acceleration compares disjoint windows and a qualifying screen',()=>{
 const r=runnerAssessment(coin,now);assert.equal(r.acceleration,2.5);assert.equal(r.buyShare,.75);assert.equal(r.status,'building');
});
test('unavailable, inconsistent and zero-baseline data cannot invent acceleration',()=>{
 assert.equal(runnerAssessment({...coin,volume5m:null},now).status,'incomplete');
 assert.equal(runnerAssessment({...coin,volume5m:30000},now).status,'incomplete');
 const zero=runnerAssessment({...coin,volume:5000},now);assert.equal(zero.acceleration,null);assert.equal(zero.status,'wait');
 const young=runnerAssessment({...coin,created:now-1200000},now);assert.equal(young.acceleration,null);assert.equal(young.status,'wait');
});
test('extended moves and liquidity deterioration are excluded despite strong volume',()=>{
 assert.equal(runnerAssessment({...coin,change5m:26},now).status,'extended');
 assert.equal(runnerAssessment({...coin,change:101},now).status,'extended');
 const r=runnerAssessment(coin,now,{at:now-60000,pairAddress:'pair',liquidity:80000});assert.equal(r.status,'weak');assert.equal(r.liquidityChange,-25);
});
test('snapshot comparisons require time separation, a matching pair and recency',()=>{
 for(const p of [{at:now-1000,pairAddress:'pair',liquidity:90000},{at:now-60000,pairAddress:'other',liquidity:90000},{at:now-600001,pairAddress:'pair',liquidity:90000}]) assert.equal(runnerAssessment(coin,now,p).liquidityChange,null);
 const first=recordObservation([],coin,now-61000);const second=recordObservation(first.history,coin,now-30000);assert.equal(second.previous,null);
 const third=recordObservation(second.history,coin,now);assert.equal(third.previous.at,now-61000);
});
test('normalization preserves actual five-minute fields and absent values',()=>{
 const base={baseToken:{address:'a'},pairAddress:'p',volume:{h1:100,m5:10},txns:{m5:{buys:5,sells:2}},priceChange:{m5:3}};
 const c=normalizePair(base);assert.equal(c.volume5m,10);assert.equal(c.buys5m,5);assert.equal(c.change5m,3);assert.equal(c.pairAddress,'p');assert.equal(normalizePair({...base,volume:{}}).volume5m,null);
});
