import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useSiteAccount} from './AccountGate';

type Mode='off'|'chaos'|'chaos2'|'jelly';
type Controls={shake:()=>void;reset:()=>void;destroy:()=>void};
const titles={off:'通常',chaos:'カオス',chaos2:'カオス2',jelly:'ゼリー'};
export default function VisualModes(){
 const username=useSiteAccount()?.username,location=useLocation();
 const [mode,setMode]=useState<Mode>('off'),[sensorMessage,setSensorMessage]=useState('');
 const controls=useRef<Controls|null>(null);
 useEffect(()=>{
  setMode('off');let disposed=false,busy=false;const abort=new AbortController();
  const check=async()=>{if(busy||disposed||document.hidden)return;busy=true;try{const response=await fetch('/api/account/visual-mode',{credentials:'same-origin',cache:'no-store',signal:abort.signal});if(!response.ok)return;const data=await response.json();if(!disposed)setMode(['chaos','chaos2','jelly'].includes(data.mode)?data.mode:'off');}catch{}finally{busy=false;}};
  void check();const timer=setInterval(()=>void check(),30000);const refresh=()=>void check();window.addEventListener('focus',refresh);window.addEventListener('xerox-visual-mode-updated',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{disposed=true;abort.abort();clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('xerox-visual-mode-updated',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[username]);
 useEffect(()=>{
  if(mode==='off')return;
  let disposed=false;const timer=setTimeout(()=>{void import('../lib/visualPhysics.mjs').then(({startVisualPhysics})=>{if(!disposed){const root=document.getElementById('root');if(root)controls.current=startVisualPhysics(root,mode);}});},350);
  return()=>{disposed=true;clearTimeout(timer);controls.current?.destroy();controls.current=null;};
 },[mode,location.pathname,location.search]);
 const enableSensors=async()=>{
  try{
   const constructors=[(window as any).DeviceOrientationEvent,(window as any).DeviceMotionEvent].filter(Boolean);
   if(!constructors.length){setSensorMessage('この端末には傾きセンサーがありません。「揺らす」を使えます。');return;}
   const results=await Promise.all(constructors.map(type=>typeof type.requestPermission==='function'?type.requestPermission():Promise.resolve('granted')));
   setSensorMessage(results.some(value=>value==='granted')?'センサーを有効にしました。端末を傾けたり、軽く振ってください。':'センサーの利用が許可されませんでした。「揺らす」を使えます。');
  }catch{setSensorMessage('ブラウザまたはGASの制限によりセンサーを使えません。「揺らす」を使えます。');}
 };
 if(mode==='off')return null;
 return <aside data-effect-controls className="fixed bottom-20 right-3 z-[290] max-w-[min(360px,calc(100vw-24px))] rounded-2xl border border-purple-300 bg-white/95 p-3 text-gray-900 shadow-xl backdrop-blur" aria-label="画面モードの操作"><p className="text-xs font-bold">{titles[mode]}モード</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className="rounded-lg bg-purple-100 px-3 py-2 text-xs" onClick={()=>controls.current?.shake()}>揺らす</button><button type="button" className="rounded-lg bg-gray-100 px-3 py-2 text-xs" onClick={()=>controls.current?.reset()}>配置を戻す</button><button type="button" className="rounded-lg bg-gray-100 px-3 py-2 text-xs" onClick={()=>void enableSensors()}>傾き操作を有効にする</button></div>{sensorMessage&&<p role="status" className="mt-2 text-xs">{sensorMessage}</p>}</aside>;
}
