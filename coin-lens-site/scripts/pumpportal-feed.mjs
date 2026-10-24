// Public launch/migration subscriptions only. No trade subscriptions or wallet keys.
export function launchFeed(){
 let socket=null,timer=null,stopped=false,buffer=[],dropped=0,reconnects=0,connectedAt=null;
 const connect=()=>{
  if(stopped)return;
  socket=new WebSocket('wss://pumpportal.fun/api/data');
  const timeout=setTimeout(()=>socket?.close(),15000);
  socket.onopen=()=>{clearTimeout(timeout);connectedAt=Date.now();socket.send(JSON.stringify({method:'subscribeNewToken'}));socket.send(JSON.stringify({method:'subscribeMigration'}));};
  socket.onmessage=e=>{try{if(String(e.data).length>20000)return;const d=JSON.parse(e.data);if(!['create','migrate','migration'].includes(d.txType))return;
   if(buffer.length>=1000){dropped++;return;}
   buffer.push({mint:d.mint,txType:d.txType,name:d.name,symbol:d.symbol,signature:d.signature,traderPublicKey:d.traderPublicKey,receivedAt:Date.now()});
  }catch{}};
  socket.onerror=()=>socket?.close();
  socket.onclose=()=>{clearTimeout(timeout);if(!stopped){reconnects++;timer=setTimeout(connect,Math.min(60000,5000*reconnects));}};
 };
 connect();
 return {batch(){return {events:buffer.slice(0,300),health:{connected:socket?.readyState===WebSocket.OPEN,connectedAt,dropped,reconnects}}},ack(count){buffer.splice(0,count)},close(){stopped=true;clearTimeout(timer);socket?.close()}};
}
