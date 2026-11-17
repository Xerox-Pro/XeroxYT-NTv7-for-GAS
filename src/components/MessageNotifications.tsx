import {useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useSiteAccount} from './AccountGate';
export default function MessageNotifications(){
 const username=useSiteAccount()?.username,location=useLocation(),[toast,setToast]=useState('');
 useEffect(()=>{if(location.pathname==='/messages'){window.dispatchEvent(new CustomEvent('xerox-dm-unread',{detail:0}));setToast('');}},[location.pathname]);
 useEffect(()=>{let disposed=false,busy=false,initialized=false,unread=0;const known=new Map<string,number>();let hide:ReturnType<typeof setTimeout>;
 const check=async()=>{if(disposed||busy)return;busy=true;try{const response=await fetch('/api/account/dm',{cache:'no-store'});if(!response.ok)return;const data=await response.json();if(data.needsProfile)return;
 const items=(data.threads||[]).filter(t=>t.status==='accepted'||t.incoming&&t.status==='pending').map(t=>({id:'dm:'+t.id,time:t.updatedAt,mine:t.lastMine,label:t.label}));
 const groups=await fetch('/api/account/dm/rooms',{cache:'no-store'});if(groups.ok){const rooms=await groups.json();items.push(...(rooms.rooms||[]).filter(r=>r.status==='joined'&&r.lastAt).map(r=>({id:'room:'+r.id,time:r.lastAt,mine:!!r.lastMine,label:r.name})));}
 if(disposed)return;let latest='';for(const item of items){const previous=known.get(item.id)||0;known.set(item.id,item.time||0);if(initialized&&!item.mine&&item.time>previous){unread++;latest=item.label;}}
 initialized=true;if(latest&&!window.location.hash.startsWith('#/messages')){setToast(latest+'に新着メッセージがあります');window.dispatchEvent(new CustomEvent('xerox-dm-unread',{detail:unread}));clearTimeout(hide);hide=setTimeout(()=>setToast(''),6000);if('Notification'in window&&Notification.permission==='granted'){const notification=new Notification('新着メッセージ',{body:'DMに新しいメッセージがあります。',tag:'xerox-dm'});notification.onclick=()=>{window.focus();window.location.hash='/messages';notification.close();};}}
 }catch{}finally{busy=false;}};void check();const timer=setInterval(()=>void check(),10000);return()=>{disposed=true;clearInterval(timer);clearTimeout(hide);};},[username]);
 return toast?<Link to="/messages" role="status" data-effect-controls className="fixed right-4 top-20 z-[310] max-w-xs rounded-2xl border border-purple-100 bg-white px-5 py-4 text-sm text-gray-900 shadow-xl">{toast}<span className="mt-1 block text-xs text-purple-600">会話を開く →</span></Link>:null;
}
