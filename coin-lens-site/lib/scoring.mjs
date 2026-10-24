import {SCORING_CONFIG} from './radar-config.mjs';
import {runnerAssessment} from './runners.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function weightedScore(c,now=Date.now(),config=SCORING_CONFIG,drop=null){
 const age=finite(c.created)?(now-c.created)/3600000:null;
 const bucket=age==null?null:config.buckets.find((b,i)=>age>=b.minHours&&(age<b.maxHours||(i===config.buckets.length-1&&age===b.maxHours)));
 const old=runnerAssessment(c,now);const total=Object.entries(config.weights).filter(([k])=>k!==drop).reduce((s,[,v])=>s+v,0);
 if(!bucket)return {version:config.version,score:null,coverage:0,bucket:null,alert:false,oldGate:old.status==='building',features:[],reason:age!=null&&age<1?'Early launch: under one hour of pair history.':'Outside configured age buckets or missing pair age.'};
 const volumeShare=finite(c.buyVolume5m)&&finite(c.sellVolume5m)&&c.buyVolume5m>=0&&c.sellVolume5m>=0&&c.buyVolume5m+c.sellVolume5m>0?c.buyVolume5m/(c.buyVolume5m+c.sellVolume5m):null;
 const rows=[['liquidity',c.liquidity,bucket.minLiquidity],['volume5m',c.volume5m,bucket.minVolume5m],['acceleration',old.acceleration,bucket.minAcceleration],['momentum',finite(c.change5m)&&finite(c.change)?+(c.change5m>0&&c.change5m<=bucket.maxChange5m&&c.change>=0&&c.change<=bucket.maxChange1h):null,1],['buyVolumeShare',volumeShare,bucket.minBuyVolumeShare],['uniqueBuyers',c.uniqueBuyers5m,bucket.minUniqueBuyers]];
 const features=rows.filter(([k])=>k!==drop).map(([key,value,threshold])=>{const known=finite(value)&&value>=0;return {key,value:known?value:null,threshold,weight:config.weights[key],known,pass:known&&value>=threshold,points:known&&value>=threshold?config.weights[key]:0}});
 const earned=features.reduce((s,f)=>s+f.points,0),known=features.filter(f=>f.known).reduce((s,f)=>s+f.weight,0);
 const score=total?100*earned/total:0,coverage=total?known/total:0;
 const warnings=[];if(finite(c.liquidity)&&c.liquidity<config.warnings.minLiquidity)warnings.push('Very low liquidity');if(c.change5m!=null&&c.change5m<=config.warnings.drop5m||c.change!=null&&c.change<=config.warnings.drop1h)warnings.push('Sharp price decline');
 const alert=score>=config.alertScore&&coverage>=config.minCoverage&&!warnings.length;
 return {version:config.version,score,coverage,bucket:bucket.id,alert,oldGate:old.status==='building',features,warnings,
 reason:warnings.length?'Wait: '+warnings.join('; ')+'.':alert?`Research shortlist: ${score.toFixed(0)}/100 with ${(coverage*100).toFixed(0)}% feature coverage. Verify missing ownership and execution evidence.`:`Wait: ${score.toFixed(0)}/100 with ${(coverage*100).toFixed(0)}% feature coverage. Below the configured research threshold.`,
 missing:features.filter(f=>!f.known).map(f=>f.key)};
}
