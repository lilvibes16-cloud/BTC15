import test from 'node:test';import assert from 'node:assert/strict';
import {weightedScore} from '../lib/scoring.mjs';
const now=1800000000000,c={created:now-7200000,liquidity:60000,volume5m:5000,volume:27000,change5m:8,change:30,buys5m:30,sells5m:10};
test('missing buyer data earns zero without inflating score; count share does not substitute',()=>{const r=weightedScore(c,now);assert.equal(r.score,60);assert.equal(r.coverage,.6);assert.deepEqual(r.missing,['buyVolumeShare','uniqueBuyers']);assert.equal(weightedScore({...c,buys5m:100000},now).score,60)});
test('age bucket boundaries are exclusive except the final maximum',()=>{for(const [h,b] of [[1,'1–6h'],[6,'6–24h'],[24,'24–72h'],[72,'24–72h'],[73,null]])assert.equal(weightedScore({...c,created:now-h*3600000},now).bucket,b)});
test('actual volume and unique buyers score independently and partial passes can alert',()=>{const r=weightedScore({...c,buyVolume5m:3000,sellVolume5m:2000,uniqueBuyers5m:20,buys5m:1,sells5m:99},now);assert.equal(r.score,100);assert.equal(r.oldGate,false);assert.equal(r.alert,true)});
test('ablation removes only selected feature and normalizes remaining weights',()=>{const r=weightedScore(c,now,undefined,'liquidity');assert.equal(r.features.some(f=>f.key==='liquidity'),false);assert.equal(r.score,50)});
