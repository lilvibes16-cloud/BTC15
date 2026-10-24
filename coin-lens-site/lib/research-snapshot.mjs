import observations from './research-observations.json' with {type:'json'};
export function researchSnapshot(address,liveError){
 const item=observations.items.find(x=>x.address===address);
 if(!item||(!item.transactions&&item.sol===null))return null;
 return {address,snapshotMode:true,fetchedAt:item.observedAt,lastLiveAttemptAt:new Date().toISOString(),sol:item.sol,holdings:[],holdingsTotal:null,holdingsComplete:false,transactions:(item.transactions||[]).map(t=>({...t,detailsLoaded:false,changes:[],url:'https://solscan.io/tx/'+t.signature})),performance:{status:'not_connected',realized:null,unrealized:null,note:'This dated research snapshot contains no historical cost-basis or profit calculations.'},warnings:['Live data unavailable: '+liveError,...item.errors],source:observations.source+' · saved research snapshot',scope:'Up to 20 address-referencing transaction signatures collected at the displayed snapshot time. Transaction balance details and holdings are not included.',opinion:'Wait — this is dated evidence, not a live trading signal. Current profitability and follower impact remain unverified.',followerStatus:'Unknown',insiderStatus:'Not established'};
}
