/** Fixed GAS loader. Server logic and HTML are published by GitHub Actions.
 * Keep API URLs/secrets in Script Properties. Never execute browser-supplied code.
 */
function doGet(e) {
  try { return gasModule_().doGet(e); }
  catch (_) { return HtmlService.createHtmlOutput('<h1>画面を読み込めませんでした</h1><p>GitHubの自動公開の完了とスクリプトプロパティを確認し、再読み込みしてください。</p>').setTitle('XeroxYT-NTv7 for GAS'); }
}
function gasRequest(request) {
  try { return gasModule_().gasRequest(request); }
  catch (_) { return {status:503,body:JSON.stringify({error:'GAS処理の更新を読み込めませんでした。少し待って再試行してください。',code:'GAS_RUNTIME_UNAVAILABLE'}),headers:{'content-type':'application/json','cache-control':'no-store'}}; }
}
function gasDigest_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(function(v){return ('0'+((v+256)%256).toString(16)).slice(-2);}).join('');
}
function gasFetchText_(url) {
  var response=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true});
  if(response.getResponseCode()!==200)throw new Error('GitHub unavailable');
  var text=response.getContentText();if(text.length>80000)throw new Error('Runtime too large');return text;
}
function gasCompile_(bundle,context) {
  if(!bundle||bundle.version!==1||typeof bundle.source!=='string'||typeof bundle.html!=='string')throw new Error('Invalid runtime');
  var runtime=new Function('GAS_INDEX_HTML_','GAS_RELEASE_',bundle.source+'\nreturn {doGet:doGet,gasRequest:gasRequest};')(bundle.html,context);
  if(typeof runtime.doGet!=='function'||typeof runtime.gasRequest!=='function')throw new Error('Invalid entrypoints');
  return runtime;
}
function gasModule_() {
  var props=PropertiesService.getScriptProperties(),cache=CacheService.getScriptCache();
  var repo=props.getProperty('ASSET_REPO')||'Xerox-Pro/XeroxYT-NTv7-for-GAS';
  var ref=props.getProperty('RUNTIME_REF')||props.getProperty('ASSET_BRANCH')||'gas-runtime';
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||!(/^[\w.-]+$/.test(ref)))throw new Error('Invalid repository');
  var scope=gasDigest_(repo+'@'+ref),lastKey='xygr:last:'+scope;
  try {
    var manifestKey='xygr:manifest:'+scope;
    var manifestText=cache.get(manifestKey)||gasFetchText_('https://raw.githubusercontent.com/'+repo+'/'+ref+'/gas/web/release.json?t='+Math.floor(Date.now()/60000));
    var release=JSON.parse(manifestText);
    if(release.version!==1||!/^[a-f0-9]{40}$/.test(release.revision)||release.server!=='server-runtime.json'||!/^[a-f0-9]{64}$/.test(release.serverHash)||!/^app-[\w-]+\.js$/.test(release.entry)||!/^[\w-]+\.css$/.test(release.css))throw new Error('Invalid release');
    var sourceKey='xygr:source:'+release.serverHash;
    var body=cache.get(sourceKey)||gasFetchText_('https://raw.githubusercontent.com/'+repo+'/'+release.revision+'/gas/web/'+release.server);
    if(gasDigest_(body)!==release.serverHash)throw new Error('Runtime hash mismatch');
    var context={repo:repo,release:release};
    var runtime=gasCompile_(JSON.parse(body),context);
    cache.put(manifestKey,manifestText,60);
    cache.put(sourceKey,body,21600);
    cache.put(lastKey,JSON.stringify({body:body,context:context}),21600);
    return runtime;
  } catch (_) {
    var previous=cache.get(lastKey);
    if(!previous)throw new Error('No cached runtime');
    var saved=JSON.parse(previous);
    if(saved.context.repo!==repo||gasDigest_(saved.body)!==saved.context.release.serverHash)throw new Error('Invalid cached runtime');
    return gasCompile_(JSON.parse(saved.body),saved.context);
  }
}
