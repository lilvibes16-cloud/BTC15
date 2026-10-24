const valid=n=>typeof n==='number'&&Number.isFinite(n);
export function summarizeOutcome(snapshot,observations,horizon,now){
 const cfg=typeof snapshot.config==='string'?JSON.parse(snapshot.config):snapshot.config;
 const due=snapshot.at+horizon*60000,late=cfg.sampling.maxCheckpointLatenessSeconds*1000;
 const matching=observations.filter(o=>o.pair===snapshot.pair&&o.at>=snapshot.at&&o.at<=now).sort((a,b)=>a.at-b.at);
 const point=matching.find(o=>o.at>=due&&o.at<=due+late&&o.status==='ok'&&valid(o.price)&&o.price>=0)||null;
 if(!point&&now<due+late)return null;
 const validBase=valid(snapshot.price)&&snapshot.price>0;
 const window=matching.filter(o=>o.at<=due&&o.status==='ok'&&valid(o.price)&&o.price>=0);
 const times=[snapshot.at,...window.map(o=>o.at),due].sort((a,b)=>a-b);
 const maxGap=Math.max(0,...times.slice(1).map((t,i)=>t-times[i]));
 const slots=new Set(window.map(o=>Math.floor((o.at-snapshot.at)/(cfg.sampling.targetIntervalSeconds*1000))));
 const expected=Math.max(1,Math.ceil(horizon*60/cfg.sampling.targetIntervalSeconds));
 const coverage=Math.min(1,slots.size/expected);
 const baseLiq=valid(snapshot.liquidity)&&snapshot.liquidity>0;
 const intact=o=>baseLiq&&valid(o?.liquidity)&&o.liquidity>=Math.max(cfg.runner.minLiquidityUsd,snapshot.liquidity*cfg.runner.minLiquidityRetention);
 const hit=validBase?window.find(o=>o.at<=snapshot.at+cfg.runner.windowMinutes*60000&&o.price/snapshot.price>=cfg.runner.multiple&&intact(o)):null;
 const complete=!!point&&window.every(o=>valid(o.liquidity))&&coverage>=cfg.sampling.minCoverage&&maxGap<=cfg.sampling.maxGapSeconds*1000;
 let runnerStatus='not_evaluated';
 if(horizon===cfg.runner.windowMinutes){runnerStatus=!validBase||!baseLiq||!point||!valid(point.liquidity)?'unknown':hit&&intact(point)?'observed_runner':complete?'no_observed_runner':'unknown';}
 return {status:point?'recorded':'missed',dueAt:due,observedAt:point?.at??null,latenessSeconds:point?(point.at-due)/1000:null,
  priceMultiple:point&&validBase?point.price/snapshot.price:null,
  peakMultiple:window.length&&validBase?Math.max(...window.map(o=>o.price/snapshot.price)):null,
  peakType:'sampled_lower_bound',liquidityChange:point&&baseLiq&&valid(point.liquidity)?point.liquidity/snapshot.liquidity-1:null,
  rugged:null,rugStatus:'unverified',collapseFlag:point&&validBase&&baseLiq&&valid(point.liquidity)?point.price/snapshot.price<=cfg.collapse.maxPriceRetention&&point.liquidity/snapshot.liquidity<=cfg.collapse.maxLiquidityRetention:null,
  runnerStatus,firstObservedHitAt:hit?.at??null,coverage,maxGapSeconds:maxGap/1000,samples:window.length,definitionVersion:cfg.version};
}
