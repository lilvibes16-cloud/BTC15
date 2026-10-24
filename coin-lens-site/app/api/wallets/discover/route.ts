// @ts-ignore Shared module validated with Node tests.
import {discoverWallets,validAddress} from '../../../../lib/wallets.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const token=new URL(request.url).searchParams.get('token')||'';
 if(token&&!validAddress(token))return Response.json({error:'Enter a valid Solana token contract.'},{status:400});
 try{return Response.json(await discoverWallets(token,{rpcUrl:process.env.SOLANA_RPC_URL}),{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({error:e instanceof Error?e.message:'Wallet discovery unavailable'},{status:502,headers:{'Cache-Control':'no-store'}})}
}
