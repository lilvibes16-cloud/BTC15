'use client';
import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowUpRight,ChartNoAxesCombined,Check,Copy,Layers3,ScanLine,Settings2,Wallet,X} from 'lucide-react';
import {freshness} from '../../lib/terminal.mjs';
export function Brand(){return <a href="/" className="t-brand" aria-label="Coin Lens home"><span className="t-brand-mark"><ScanLine size={22}/></span><span>Coin<span className="t-brand-light">Lens</span><small>RESEARCH TERMINAL</small></span></a>}
export function Shell({children,scanner,detail=false}:{children:React.ReactNode,scanner:any,detail?:boolean}){
 const [settings,setSettings]=useState(false),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);const status=freshness(scanner.data,scanner.error,scanner.clock);
 useEffect(()=>{if(settings)dialog.current?.showModal();else dialog.current?.close()},[settings]);
 const close=()=>{setSettings(false);trigger.current?.focus()};
 return <div className="terminal"><header className="t-header"><Brand/><nav className="t-desktop-nav" aria-label="Primary"><a href="/" className="active">Scanner</a><a href="/runners">Runner radar</a><a href="/wallets">Wallets</a><a href="/logging">Scan log</a></nav><div className="t-header-right"><span className={'t-fresh '+(status.stale?'is-stale':'')} role="status"><i/>{scanner.busy?'Updating':status.state}{!scanner.busy&&status.seconds!==null&&<span> · {status.seconds<60?`${status.seconds}s`:`${Math.floor(status.seconds/60)}m`}</span>}</span><button ref={trigger} className="t-icon" aria-label="Open settings" onClick={()=>setSettings(true)}><Settings2 size={18}/></button></div></header>
 <main className={'t-main '+(detail?'t-detail-main':'')}>{children}</main>
 <footer className="t-footer"><span><i/> Solana <b>MAINNET</b></span><span>DEX Screener · public on-chain evidence</span><span>Read-only · no automatic trades</span></footer>
 <nav className="t-mobile-nav" aria-label="Mobile navigation"><a className="active" href="/"><ChartNoAxesCombined size={19}/>Scanner</a><a href="/runners"><Activity size={19}/>Radar</a><a href="/wallets"><Wallet size={19}/>Wallets</a><a href="/logging"><Layers3 size={19}/>Log</a></nav>
 <dialog ref={dialog} className="t-dialog" onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===dialog.current)close()}}><div className="t-dialog-head"><h2>Terminal settings</h2><button className="t-icon" onClick={close} aria-label="Close settings"><X size={20}/></button></div><label className="t-setting"><span>Auto-refresh<small>Every 60 seconds while this tab is visible.</small></span><input type="checkbox" checked={scanner.auto} onChange={e=>scanner.setRefresh(e.target.checked)}/></label><p>Watchlist and settings are saved on this device. Market snapshots retain their actual retrieval time.</p><a href="/logging">View persistent scan log <ArrowUpRight size={14}/></a></dialog>
 </div>
}
export function CopyAddress({address}:{address:string}){const [copied,setCopied]=useState(false),[failed,setFailed]=useState(false);return <button className="t-copy" aria-label="Copy token contract address" onClick={async()=>{try{await navigator.clipboard.writeText(address);setCopied(true);setFailed(false);setTimeout(()=>setCopied(false),2000)}catch{setFailed(true)}}}>{copied?<Check size={13}/>:<Copy size={13}/>}<span>{copied?'Copied':failed?address:address.slice(0,6)+'…'+address.slice(-5)}</span></button>}
export function Avatar({symbol}:{symbol:string}){return <span className="t-avatar" aria-hidden="true">{(symbol||'?').slice(0,2).toUpperCase()}</span>}
export function Metric({label,value,sub}:{label:string,value:React.ReactNode,sub?:string}){return <div className="t-metric"><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>}
