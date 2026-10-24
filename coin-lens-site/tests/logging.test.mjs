import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {logScan,loggingStatus,collectOutcomes} from '../lib/logging.mjs';
import {LOGGING_CONFIG} from '../lib/logging-config.mjs';
import {summarizeOutcome} from '../lib/outcome-math.mjs';
const now=Date.now(),minute=60000;
const coin={address:'token',pairAddress:'pair',symbol:'TEST',name:'Test',price:1,liquidity:50000,volume:27000,volume5m:5000,buys:150,sells:50,buys5m:30,sells5m:10,change5m:8,change:30,created:now-7200000};
const scan={fetchedAt:new Date(now).toISOString(),coins:[coin],warnings:[]};
function dbAt(file=':memory:',migrate=true){
 const sql=new DatabaseSync(file);if(migrate)sql.exec(readFileSync(new URL('../drizzle/0000_moaning_kulan_gath.sql',import.meta.url),'utf8'));
 const db={prepare(query){let values=[];return{bind(...args){values=args;return this},async all(){return{results:sql.prepare(query).all(...values)}},async first(){return sql.prepare(query).get(...values)||null},async run(){const result=sql.prepare(query).run(...values);return{meta:{changes:Number(result.changes)}}}}},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};return {db,sql};
}
const snapshot={at:now,pair:'pair',price:1,liquidity:50000,config:LOGGING_CONFIG};
const observation=(m,price=1,liquidity=50000)=>({pair:'pair',at:now+m*minute,status:'ok',price,liquidity});
test('snapshots survive reopening SQLite and remain scoped to the authenticated actor',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'radar-log-'));const file=join(folder,'test.sqlite');let connection=dbAt(file);
 try{const result=await logScan(connection.db,scan,'alice');assert.equal(result.snapshots,1);assert.equal(result.checkpoints,5);connection.sql.close();connection=dbAt(file,false);const alice=await loggingStatus(connection.db,'alice'),bob=await loggingStatus(connection.db,'bob');assert.equal(alice.totals.snapshots,1);assert.equal(bob.totals.snapshots,0);assert.equal(alice.recent[0].features.uniqueBuyers5m,null);assert.equal(alice.recent[0].features.transactions5m,40);assert.equal(alice.recent[0].features.gate.acceleration,2.5);assert.equal(alice.outcomes.length,5);assert.equal(alice.matureDistinctTokens,0)}finally{connection.sql.close();rmSync(folder,{recursive:true})}
});
test('snapshot write rolls back atomically if one token cannot be saved',async()=>{
 const {db,sql}=dbAt();try{await assert.rejects(logScan(db,{...scan,coins:[coin,{...coin,address:'other',pairAddress:null}]},'alice'));assert.equal(sql.prepare('SELECT COUNT(*) n FROM radar_scans').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM radar_snapshots').get().n,0)}finally{sql.close()}
});
test('outcomes never use a later spike for an earlier horizon and never call a sampled peak exact',()=>{
 const r=summarizeOutcome(snapshot,[observation(0),observation(10,2),observation(15,3),observation(16,20)],15,now+20*minute);assert.equal(r.priceMultiple,3);assert.equal(r.peakMultiple,3);assert.equal(r.peakType,'sampled_lower_bound');assert.equal(r.rugged,null);
});
test('sparse or late observations stay unknown/missed rather than fabricated failures',()=>{
 const sparse=summarizeOutcome(snapshot,[observation(0),observation(120,2)],120,now+121*minute);assert.equal(sparse.runnerStatus,'unknown');assert.equal(sparse.status,'recorded');
 const missed=summarizeOutcome(snapshot,[observation(0),observation(124,6)],120,now+124*minute);assert.equal(missed.status,'missed');assert.equal(missed.priceMultiple,null);assert.equal(missed.runnerStatus,'unknown');
 assert.equal(summarizeOutcome(snapshot,[observation(0)],15,now+15*minute),null);
});
test('5x requires intact liquidity at the observed hit and 2h checkpoint',()=>{
 const samples=Array.from({length:121},(_,i)=>observation(i,i===30?5:2));
 assert.equal(summarizeOutcome(snapshot,samples,120,now+120*minute).runnerStatus,'observed_runner');
 assert.equal(summarizeOutcome(snapshot,samples.map(o=>({...o,liquidity:o.at===now+30*minute?100:50000})),120,now+120*minute).runnerStatus,'no_observed_runner');
 assert.equal(summarizeOutcome(snapshot,samples.map(o=>({...o,liquidity:o.at===now+120*minute?100:50000})),120,now+120*minute).runnerStatus,'no_observed_runner');
});
test('zero observed price is a real zero multiple, not missing or proof of a rug',()=>{
 const r=summarizeOutcome(snapshot,[observation(0),observation(15,0,0)],15,now+15*minute);assert.equal(r.priceMultiple,0);assert.equal(r.collapseFlag,true);assert.equal(r.rugged,null);
});
test('collector follows original pairs and records provider outages without labeling rugs',async()=>{
 const {db,sql}=dbAt();try{await logScan(db,{...scan,fetchedAt:new Date(Date.now()-20*minute).toISOString()},'alice');let requested='';const fetcher=async url=>{requested=url;return new Response('{}',{status:503})};const r=await collectOutcomes(db,fetcher);assert.match(requested,/pairs\/solana\/pair$/);assert.equal(r.failedBatches,1);assert.equal(r.missed,1);const out=sql.prepare('SELECT result FROM radar_outcomes WHERE horizon=15').get();assert.equal(JSON.parse(out.result).rugged,null);assert.equal(JSON.parse(out.result).priceMultiple,null);assert.equal(sql.prepare('SELECT COUNT(*) n FROM radar_leases').get().n,0)}finally{sql.close()}
});
