// Research screens, not calibrated predictions. Every threshold is disclosed in the UI.
import {OLD_GATE_CONFIG} from './radar-config.mjs';
export const RUNNER_RULES = OLD_GATE_CONFIG;
const R=RUNNER_RULES;
const finite = n => typeof n === 'number' && Number.isFinite(n);
export function runnerAssessment(c, now=Date.now(), previous=null) {
 const required=['liquidity','volume','volume5m','buys5m','sells5m','change5m','change','created'];
 const missing=required.filter(k=>!finite(c[k]));
 const invalid=['liquidity','volume','volume5m','buys5m','sells5m'].some(k=>finite(c[k])&&c[k]<0)||c.created>now;
 const minutes=finite(c.created)?(now-c.created)/60000:null;
 const transactions=finite(c.buys5m)&&finite(c.sells5m)?c.buys5m+c.sells5m:null;
 const buyShare=transactions>0?c.buys5m/transactions:null;
 // The most recent five minutes are removed from h1, leaving a separate 55-minute baseline.
 const baseline=finite(c.volume)&&finite(c.volume5m)?c.volume-c.volume5m:null;
 const acceleration=minutes>=60&&baseline>0&&c.volume5m>=0?(c.volume5m/5)/(baseline/55):null;
 const elapsed=previous?now-previous.at:null;
 const comparable=Boolean(previous&&c.pairAddress&&previous.pairAddress===c.pairAddress&&elapsed>=R.minComparisonMs&&elapsed<=R.maxComparisonMs&&finite(previous.liquidity)&&previous.liquidity>0&&finite(c.liquidity));
 const liquidityChange=comparable?100*(c.liquidity/previous.liquidity-1):null;
 const observations={liquidityChange,elapsed:comparable?elapsed:null};
 const result={acceleration,buyShare,transactions,...observations};
 if(missing.length||invalid||baseline<0)return {...result,status:'incomplete',label:'Incomplete data',reason:invalid||baseline<0?'Inconsistent market fields; no momentum assessment.':'Missing: '+missing.join(', ')+'. No momentum assessment.',checks:[]};
 const checks=[
  {label:'Pair age 1–72 hours',pass:minutes>=R.minAgeMinutes&&minutes<=R.maxAgeHours*60},
  {label:'Liquidity at least $20,000',pass:c.liquidity>=R.minLiquidity},
  {label:'5m volume at least $2,000',pass:c.volume5m>=R.minVolume5m},
  {label:'At least 20 transactions in 5m',pass:transactions>=R.minTransactions5m},
  {label:'Buy share at least 60% of transaction count',pass:buyShare!==null&&buyShare>=R.minBuyShare},
  {label:'Volume rate at least 1.5× the preceding 55m',pass:acceleration!==null&&acceleration>=R.minAcceleration},
  {label:'Positive 5m move, at most 25%; 1h move 0–100%',pass:c.change5m>0&&c.change5m<=R.maxChange5m&&c.change>=0&&c.change<=R.maxChange1h},
 ];
 if(c.liquidity<R.minLiquidity||c.change5m<=R.warningChange5m||c.change<=R.warningChange1h||(buyShare!==null&&transactions>=R.minTransactions5m&&buyShare<R.warningBuyShare)||(liquidityChange!==null&&liquidityChange<=R.warningLiquidityChange))return {...result,status:'weak',label:'Market warnings',reason:liquidityChange!==null&&liquidityChange<=R.warningLiquidityChange?'Liquidity value fell at least 10% since the comparable snapshot. This does not establish a withdrawal or a rug.':c.liquidity<R.minLiquidity?'Liquidity is below the research minimum.': 'Price or sell-side activity triggers the warning screen.',checks};
 if(c.change5m>R.maxChange5m||c.change>R.maxChange1h)return {...result,status:'extended',label:'Extended move',reason:'Price has risen over 25% in 5m or over 100% in 1h. Excluded from the building-activity shortlist.',checks};
 if(checks.every(k=>k.pass))return {...result,status:'building',label:'Building activity',reason:'All activity filters pass in this snapshot. Worth investigating ownership and sellability; this is not a cleared buy.',checks};
 return {...result,status:'wait',label:minutes<60?'Early · needs history':'No qualifying setup',reason:minutes<60?'Under one hour of pair history. Too early for a reliable 55-minute volume baseline.':'Waiting on: '+checks.filter(k=>!k.pass).map(k=>k.label.toLowerCase()).join('; ')+'.',checks};
}

// Session-only observations: require a meaningful gap, reject stale or different-pair comparisons.
export function recordObservation(history,coin,at){
 const rows=(history||[]).filter(r=>r.at>=at-600000&&r.at<at&&r.pairAddress===coin.pairAddress);
 const previous=[...rows].reverse().find(r=>at-r.at>=60000)||null;
 rows.push({at,pairAddress:coin.pairAddress,liquidity:coin.liquidity});
 return {history:rows.slice(-20),previous};
}
