// @ts-ignore Shared module validated with Node tests.
import {inspectWallet,validAddress} from '../../../lib/wallets.mjs';
// @ts-ignore Dated public research evidence; never represented as live.
import {researchSnapshot} from '../../../lib/research-snapshot.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const address=new URL(request.url).searchParams.get('address');
 if(!address)return Response.json({version:1,publicActivity:true,performanceConfigured:!!process.env.BIRDEYE_API_KEY,rankingAvailable:false},{headers:{'Cache-Control':'no-store'}});
 if(!validAddress(address))return Response.json({error:'Enter a valid Solana public wallet address.'},{status:400});
 try{return Response.json(await inspectWallet(address,{key:process.env.BIRDEYE_API_KEY,rpcUrl:process.env.SOLANA_RPC_URL}),{headers:{'Cache-Control':'no-store'}})}catch(e){const reason=e instanceof Error?e.message:'Wallet data unavailable';const snapshot=researchSnapshot(address,reason);if(snapshot)return Response.json(snapshot,{headers:{'Cache-Control':'no-store','X-Evidence-Mode':'saved-snapshot'}});return Response.json({error:reason+' A dedicated Solana data connection may be required.'},{status:502,headers:{'Cache-Control':'no-store'}})}
}
