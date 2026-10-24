'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {validScan} from '../../lib/scan-contract.mjs';
import {addPoint} from '../../lib/terminal.mjs';
const ADDRESS=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function useScanner(initialQuery=''){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[clock,setClock]=useState(Date.now()),[saved,setSaved]=useState<string[]>([]),[auto,setAuto]=useState(true),[message,setMessage]=useState(''),[query,setQuery]=useState(initialQuery),[retryAt,setRetryAt]=useState(0),[points,setPoints]=useState<any>({});
 const refs=useRef({query:initialQuery,watch:[] as string[],retryAt:0,at:0}),controller=useRef<AbortController|null>(null),serial=useRef(0);
 const refresh=useCallback(async(term=refs.current.query)=>{
  if(Date.now()<refs.current.retryAt)return;
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const id=++serial.current;setBusy(true);setError('');
  try{const r=await fetch('/api/scan?'+new URLSearchParams({q:term,watch:refs.current.watch.join(',')}),{signal:abort.signal,cache:'no-store'});const d:any=await r.json();if(id!==serial.current)return;
   refs.current.retryAt=Number(d.retryAt)||0;setRetryAt(refs.current.retryAt);if(!r.ok)throw Error(d.error||'Market provider unavailable');if(!validScan(d))throw Error('Unexpected market response. Try refreshing.');
   refs.current.at=Date.parse(d.fetchedAt);setData(d);setClock(Date.now());if(d.stale)setError(d.feedError||'Showing the last saved snapshot.');
   if(!d.stale)setPoints((p:any)=>d.coins.reduce((next:any,c:any)=>addPoint(next,c,Date.parse(d.fetchedAt)),p));
  }catch(e){if(id===serial.current&&!abort.signal.aborted)setError(e instanceof Error?e.message:'Market provider unavailable')}finally{if(id===serial.current)setBusy(false)}
 },[]);
 useEffect(()=>{try{const w=JSON.parse(localStorage.getItem('coin-lens-watch')||'[]');if(Array.isArray(w))refs.current.watch=w.filter(x=>typeof x==='string'&&ADDRESS.test(x)).slice(0,20);setAuto(localStorage.getItem('coin-lens-auto')!=='off')}catch{}setSaved(refs.current.watch);refresh();const timer=setInterval(()=>setClock(Date.now()),1000);return()=>{clearInterval(timer);serial.current++;controller.current?.abort()}},[refresh]);
 useEffect(()=>{if(!auto)return;const timer=setInterval(()=>{if(!document.hidden)refresh()},60000);const visible=()=>{if(!document.hidden&&Date.now()-refs.current.at>60000)refresh()};document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible)}},[auto,refresh]);
 function toggle(address:string){setMessage('');if(!refs.current.watch.includes(address)&&refs.current.watch.length>=20){setMessage('Watchlist full. Remove a token before adding another.');return}const next=refs.current.watch.includes(address)?refs.current.watch.filter(a=>a!==address):[...refs.current.watch,address];refs.current.watch=next;setSaved(next);try{localStorage.setItem('coin-lens-watch',JSON.stringify(next))}catch{setMessage('Storage unavailable. Watchlist changes will last for this session.')}}
 function search(term:string){const q=term.trim();if(q&&q.length<2){setMessage('Enter a token name or Solana contract address.');return}if(Date.now()<refs.current.retryAt){setMessage('Search will be available after the provider cooldown.');return}refs.current.query=q;setQuery(q);setData(null);setMessage('');refresh(q)}
 function setRefresh(value:boolean){setAuto(value);try{localStorage.setItem('coin-lens-auto',value?'on':'off')}catch{setMessage('Settings could not be saved on this device.')}}
 return {data,error,busy,clock,saved,auto,message,query,retryAt,points,refresh,search,toggle,setRefresh};
}
