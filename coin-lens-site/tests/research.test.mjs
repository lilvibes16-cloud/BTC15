import test from 'node:test';
import assert from 'node:assert/strict';
import {researchSnapshot} from '../lib/research-snapshot.mjs';
import observations from '../lib/research-observations.json' with {type:'json'};
import {researchWallets} from '../lib/wallet-research.mjs';
import {validAddress} from '../lib/wallets.mjs';
test('fallback retains original observation time and explicitly lacks profit and current advice',()=>{
 const original=observations.items.find(x=>x.transactions);
 assert.ok(original,'Live research must produce at least one observed record');
 const snapshot=researchSnapshot(original.address,'upstream unavailable');
 assert.equal(snapshot.fetchedAt,original.observedAt);assert.equal(snapshot.snapshotMode,true);assert.equal(snapshot.performance.realized,null);assert.equal(snapshot.holdingsTotal,null);assert.equal(snapshot.transactions.length,original.transactions.length);assert.ok(snapshot.transactions.every(t=>t.detailsLoaded===false&&t.changes.length===0));assert.equal(snapshot.followerStatus,'Unknown');
});
test('unknown wallets never receive another address’s snapshot',()=>{assert.equal(researchSnapshot('11111111111111111111111111111111','failed'),null)});
test('research addresses are valid, source-backed and do not assert trusted status',()=>{
 for(const r of researchWallets){assert.ok(validAddress(r.address));assert.ok(r.sources.length);assert.ok(r.sources.every(s=>s.url.startsWith('https://')));assert.ok(r.gaps.length);assert.notEqual(r.state,'Trusted')}
});
