import {useEffect,useRef,useState} from 'react';
import {FFmpeg} from '@ffmpeg/ffmpeg';
import {toBlobURL} from '@ffmpeg/util';
import {useYouTubeLinked} from '../lib/youtubeConnection';
type Format={token:string;url:string;itag:number;mime:string;size:number;quality:string;fps?:number;bitrate:number;audio:boolean;video:boolean;language:string};
async function api(path:string,body:unknown){const response=await fetch('/api/user/download/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'取得できませんでした。');return data;}
const extension=(format:Format)=>format.mime.includes('webm')?'webm':format.video?'mp4':'m4a';
export default function VideoDownload({videoId}:{videoId:string}){
 const linked=useYouTubeLinked(),[open,setOpen]=useState(false),[consent,setConsent]=useState(false),[formats,setFormats]=useState<Format[]>([]),[video,setVideo]=useState(''),[audio,setAudio]=useState(''),[mode,setMode]=useState('merge'),[title,setTitle]=useState(videoId),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const cancelled=useRef(false),engine=useRef<FFmpeg|null>(null);
 useEffect(()=>()=>{cancelled.current=true;engine.current?.terminate();},[]);
 useEffect(()=>{if(busy)(window as any).__XEROX_GAS_DOWNLOAD_BUSY__=true;return()=>{if(busy)(window as any).__XEROX_GAS_DOWNLOAD_BUSY__=false;};},[busy]);
 useEffect(()=>{setFormats([]);setOpen(false);setConsent(false);},[videoId]);
 if(!linked)return null;
 const load=async()=>{setBusy(true);setError('');try{const result=await api('formats',{videoId,rightsConfirmed:consent});setFormats(result.formats);setTitle(result.title);setVideo(result.formats.find((f:Format)=>f.video)?.token||'');setAudio(result.formats.find((f:Format)=>f.audio&&!f.video)?.token||'');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const save=async()=>{
  cancelled.current=false;setBusy(true);setError('');
  try{
   const selected=[...(mode!=='audio'?[formats.find(f=>f.token===video)]:[]),...(mode!=='video'?[formats.find(f=>f.token===audio)]:[])].filter(Boolean) as Format[];
   if(selected.length!==(mode==='merge'?2:1))throw Error('保存する形式を選択してください。');
   if(selected.reduce((sum,f)=>sum+f.size,0)>268435456)throw Error('合計256MB以下の形式を選択してください。');
   const buffers=[];
   for(const f of selected){
    const url=new URL(f.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.googlevideo.com'))throw Error('配信URLが無効です。');
    let response;try{response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});}catch{throw Error('ブラウザから動画を直接取得できません。配信元のCORS・接続元制限がある場合は保存できません。');}
    if(!response.ok||!response.body)throw Error('配信元が取得を拒否しました。形式を再取得してください。');
    const bytes=new Uint8Array(f.size),reader=response.body.getReader();let offset=0;
    try{while(true){if(cancelled.current)throw Error('中止しました。');const {done,value}=await reader.read();if(done)break;if(offset+value.length>f.size)throw Error('動画サイズが上限を超えました。');bytes.set(value,offset);offset+=value.length;setStatus(`端末に直接取得中 ${Math.floor(offset/f.size*100)}% (${f.quality||f.itag})`);}}finally{await reader.cancel();}
    if(offset!==f.size)throw Error('動画の取得が途中で終了しました。');buffers.push(bytes);
   }
   let output:Uint8Array=buffers[0],ext=extension(selected[0]);
   if(mode==='merge'){
    setStatus('合成エンジンを準備しています…');const ffmpeg=new FFmpeg();engine.current=ffmpeg;
    const base=(window as any).__XEROX_GAS_ASSETS__?.base||'';
    const workerURL=await toBlobURL(base+'/app-icons/media-worker.js','text/javascript');
    const core='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
    const coreURL=await toBlobURL(core+'/ffmpeg-core.js','text/javascript'),wasmURL=await toBlobURL(core+'/ffmpeg-core.wasm','application/wasm');
    try{await ffmpeg.load({classWorkerURL:workerURL,coreURL,wasmURL});await ffmpeg.writeFile('video',buffers[0]);await ffmpeg.writeFile('audio',buffers[1]);setStatus('端末内で映像と音声を合成中…');const code=await ffmpeg.exec(['-i','video','-i','audio','-map','0:v:0','-map','1:a:0','-c','copy','output.mkv']);if(code!==0)throw Error('この形式の組み合わせは合成できません。別の形式を選択してください。');output=await ffmpeg.readFile('output.mkv') as Uint8Array;ext='mkv';}finally{ffmpeg.terminate();engine.current=null;[workerURL,coreURL,wasmURL].forEach(url=>URL.revokeObjectURL(url));}
   }
   if(cancelled.current)throw Error('中止しました。');const url=URL.createObjectURL(new Blob([output.slice().buffer]));const link=document.createElement('a');link.href=url;link.download=title.replace(/[\\/:*?"<>|]/g,'_')+'.'+ext;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setStatus('保存を開始しました。');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const label=(f:Format)=>`${f.quality||f.itag} ${f.fps?f.fps+'fps ':''}${f.mime.split(';')[0]} ${Math.round(f.size/1048576)}MB ${f.language}`;
 return <div className="relative"><button type="button" className="rounded-full border bg-gray-100 px-3 py-2 text-xs font-semibold" onClick={()=>setOpen(value=>!value)}>ダウンロード</button>{open&&<section role="dialog" aria-label="動画の保存" className="fixed inset-x-3 top-24 z-[250] mx-auto max-h-[80vh] max-w-lg overflow-y-auto rounded-2xl border bg-white p-5 shadow-2xl"><h2 className="text-lg font-bold">動画の保存</h2><p className="my-3 text-xs text-gray-600">本人のGoogle連携を使って取得します。合計256MBまで。合成結果はMKV形式です。配信制限・DRM・ライブ動画には対応していません。</p><label className="block text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/> 自分に権利がある、または保存の許可がある動画です</label><button disabled={!consent||busy} className="my-3 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40" onClick={()=>void load()}>利用可能な形式を取得</button>{formats.length>0&&<><label className="block text-sm">保存方法<select className="my-2 block w-full rounded-lg border p-2" disabled={busy} value={mode} onChange={e=>setMode(e.target.value)}><option value="merge">映像＋音声を端末内で合成</option><option value="video">映像・通常動画を単体保存</option><option value="audio">音声のみ保存</option></select></label>{mode!=='audio'&&<label className="block text-sm">映像<select className="my-2 block w-full rounded-lg border p-2" disabled={busy} value={video} onChange={e=>setVideo(e.target.value)}>{formats.filter(f=>f.video).map(f=><option key={f.token} value={f.token}>{label(f)}{f.audio?' 音声付き':''}</option>)}</select></label>}{mode!=='video'&&<label className="block text-sm">音声<select className="my-2 block w-full rounded-lg border p-2" disabled={busy} value={audio} onChange={e=>setAudio(e.target.value)}><option value="">選択してください</option>{formats.filter(f=>f.audio&&!f.video).map(f=><option key={f.token} value={f.token}>{label(f)}</option>)}</select></label>}<button disabled={busy||!consent} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-40" onClick={()=>void save()}>取得して保存</button></>}{status&&<p role="status" className="mt-3 text-sm">{status}</p>}{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<button className="ml-3 mt-4 text-sm underline" onClick={()=>{cancelled.current=true;engine.current?.terminate();if(!busy)setOpen(false);}}> {busy?'中止':'閉じる'}</button></section>}</div>;
}
