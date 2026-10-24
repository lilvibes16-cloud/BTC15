import {PROTOCOL} from './protocol-schema.mjs';
const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes){let n=0n;for(const b of bytes)n=n*256n+BigInt(b);let s='';while(n){s=ALPHABET[Number(n%58n)]+s;n/=58n;}for(const b of bytes){if(b!==0)break;s='1'+s;}return s;}
const bytes64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function decode(bytes,schema,types={},prefix=false){
 if(!schema.discriminator.every((b,i)=>bytes[i]===b))return null;
 let offset=8;
 const take=n=>{if(offset+n>bytes.length)throw Error('Truncated protocol data');const b=bytes.slice(offset,offset+n);offset+=n;return b;};
 function value(type){
  if(type==='pubkey')return base58(take(32));
  if(type==='bool'){const v=take(1)[0];if(v>1)throw Error('Invalid boolean');return !!v;}
  if(type==='string'){const n=Number(value('u32'));if(n>10000)throw Error('Oversized protocol string');return new TextDecoder().decode(take(n));}
  if(typeof type==='string'&&/^[ui](8|16|32|64|128)$/.test(type)){const bits=Number(type.slice(1)),b=take(bits/8);let n=0n;for(let i=b.length-1;i>=0;i--)n=n*256n+BigInt(b[i]);if(type[0]==='i'&&(b.at(-1)&128))n-=1n<<BigInt(bits);return bits<=32?Number(n):n.toString();}
  if(type?.vec){const n=Number(value('u32'));if(n>100)throw Error('Oversized vector');return Array.from({length:n},()=>value(type.vec));}
  if(type?.defined){const def=types[type.defined.name||type.defined];if(!def)throw Error('Unknown nested type');return Object.fromEntries(def.fields.map(f=>[f.name,value(f.type)]));}
  throw Error('Unsupported protocol field');
 }
 const out={};for(const f of schema.fields){if(prefix&&offset===bytes.length)break;out[f.name]=value(f.type);}return out;
}
export function decodePool(account){
 if(account?.owner!==PROTOCOL.swap.program||!Array.isArray(account.data)||account.data[1]!=='base64')return null;
 return decode(bytes64(account.data[0]),PROTOCOL.swap.schemas.Pool,{},true);
}
export function transactionEvidence(tx,mint,pool=null){
 const result={trades:[],launches:[],transfers:[],warnings:[]};if(!tx?.meta||tx.meta.err)return result;
 const signature=tx.transaction?.signatures?.[0];if(!signature)return result;
 const stack=[];let eventIndex=0;
 for(const line of tx.meta.logMessages||[]){
  const invoke=/^Program (\w+) invoke \[\d+\]/.exec(line);if(invoke){stack.push(invoke[1]);continue;}
  const ended=/^Program (\w+) (success|failed:)/.exec(line);if(ended){if(stack.at(-1)===ended[1])stack.pop();else stack.length=0;continue;}
  if(!line.startsWith('Program data: '))continue;
  const protocol=Object.values(PROTOCOL).find(p=>p.program===stack.at(-1));if(!protocol)continue;
  let data;try{data=bytes64(line.slice(14));}catch{continue;}
  const match=Object.entries(protocol.schemas).find(([n,s])=>n!=='Pool'&&s.discriminator.every((b,i)=>data[i]===b));if(!match)continue;
  try{
   const [name,schema]=match,e=decode(data,schema,protocol.types,true),evidence={signature,slot:tx.slot,transactionIndex:tx.transactionIndex??null,blockTime:tx.blockTime,eventIndex:eventIndex++,program:protocol.program};
   if(name==='CreateEvent'&&e.mint===mint&&e.user&&e.creator&&e.timestamp!=null)result.launches.push({...evidence,mint,creator:e.creator,deployer:e.user,bondingCurve:e.bonding_curve,timestamp:Number(e.timestamp),totalRaw:e.token_total_supply});
   if(name==='TradeEvent'&&e.mint===mint&&e.user&&e.timestamp!=null&&e.token_amount!=null&&e.real_token_reserves!=null){
    // Older events are SOL-denominated. New quote fields take precedence when present.
    const quoteMint=e.quote_mint||'So11111111111111111111111111111111111111112';
    result.trades.push({...evidence,mint,wallet:e.user,side:e.is_buy?'buy':'sell',raw:e.token_amount,quoteRaw:e.quote_amount??e.sol_amount,quoteMint,timestamp:Number(e.timestamp),feesIncluded:false});
   }
   if((name==='BuyEvent'||name==='SellEvent')&&pool&&e.pool===pool.address&&e.user&&e.timestamp!=null&&e.user_quote_token_account){result.trades.push({...evidence,mint,wallet:e.user,side:name==='BuyEvent'?'buy':'sell',raw:name==='BuyEvent'?e.base_amount_out:e.base_amount_in,quoteRaw:name==='BuyEvent'?e.user_quote_amount_in:e.user_quote_amount_out,quoteMint:pool.quoteMint,timestamp:Number(e.timestamp),feesIncluded:true});}
  }catch{result.warnings.push('A matching protocol event could not be decoded; transaction coverage is partial.');}
 }
 const keys=(tx.transaction?.message?.accountKeys||[]).map(k=>typeof k==='string'?k:k.pubkey),owners=new Map();
 for(const r of [...(tx.meta.preTokenBalances||[]),...(tx.meta.postTokenBalances||[])])if(r.owner&&r.mint)owners.set(keys[r.accountIndex],{owner:r.owner,mint:r.mint});
 const instructions=[...(tx.transaction?.message?.instructions||[]),...(tx.meta.innerInstructions||[]).flatMap(x=>x.instructions||[])];
 for(const ix of instructions){const p=ix.parsed,info=p?.info;if(!info)continue;
  if(ix.program==='system'&&p.type==='transfer'&&info.lamports>0)result.transfers.push({kind:'funding',from:info.source,to:info.destination,raw:String(info.lamports),signature,slot:tx.slot,blockTime:tx.blockTime});
  if(['spl-token','spl-token-2022'].includes(ix.program)&&['transfer','transferChecked'].includes(p.type)){
   const a=owners.get(info.source),b=owners.get(info.destination);if(a?.mint===mint&&b?.mint===mint&&a.owner!==b.owner)result.transfers.push({kind:'token_transfer',from:a.owner,to:b.owner,raw:info.amount??info.tokenAmount?.amount,signature,slot:tx.slot,blockTime:tx.blockTime});
  }
 }
 return result;
}
