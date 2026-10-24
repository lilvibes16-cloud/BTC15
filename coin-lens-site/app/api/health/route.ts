// @ts-ignore Shared read-only Solana client.
import {rpc,RPC} from '../../../lib/wallets.mjs';
export const dynamic='force-dynamic';
export async function GET(){
 const configured=!!process.env.SOLANA_RPC_URL;
 let wallet:any;
 try{await rpc('getBalance',['HWdeCUjBvPP1HJ5oCJt7aNsvMWpWoDgiejUWvfFX6T7R',{commitment:'confirmed'}],fetch,process.env.SOLANA_RPC_URL||RPC);wallet={state:'reachable',message:'Balance lookup succeeded. History and indexed-holder methods may have different limits.'}}catch(e){wallet={state:'unavailable',message:e instanceof Error?e.message:'Wallet connection unavailable'}};
 return Response.json({checkedAt:new Date().toISOString(),wallet:{...wallet,configured},performance:{configured:!!process.env.BIRDEYE_API_KEY},scope:'One balance lookup, not a full service audit.'},{headers:{'Cache-Control':'no-store'}});
}
