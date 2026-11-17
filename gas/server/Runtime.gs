/** Server-only configuration: Apps Script > Project settings > Script properties.
 * API_BASE_URL (HTTPS origin), API_SHARED_SECRET (optional),
 * ACCOUNT_BASE_URL (optional; defaults to API_BASE_URL),
 * UPSTREAM_ORIGIN (the existing frontend origin allowed by your API),
 * ASSET_REPO (default Xerox-Pro/XeroxYT-NTv7-for-GAS), ASSET_BRANCH (default gas-runtime).
 * Never put these API values into Index.html or a VITE_* variable.
 */
function doGet(e) {
  var stage='CONFIG';
  try {
    var release=GAS_RELEASE_.release,repo=GAS_RELEASE_.repo;
    var base='https://cdn.jsdelivr.net/gh/'+repo+'@'+release.revision+'/gas/web';
    var config=JSON.stringify({base:base,js:base+'/'+release.entry,css:base+'/'+release.css,version:release.entry+':'+release.css+':'+release.serverHash,webAppUrl:ScriptApp.getService().getUrl(),route:e&&e.parameter&&/^\/(?!\/)/.test(e.parameter.route||'')?e.parameter.route:null}).replace(/</g,'\\u003c');
    stage='HTML';
    // Remote HTML is static; replace its one JSON placeholder without a second
    // Apps Script template evaluation inside a dynamically loaded function.
    var marker='<?!= assetConfig ?>';
    if(GAS_INDEX_HTML_.split(marker).length!==2)throw new Error('Invalid HTML placeholder');
    var html=GAS_INDEX_HTML_.replace(marker,function(){return config;});
    var output=HtmlService.createHtmlOutput(html).setTitle('XeroxYT-NTv7 for GAS').addMetaTag('viewport','width=device-width, initial-scale=1');
    // Icon failure must not prevent the application from opening.
    try{output.setFaviconUrl(base+'/app-icons/favicon.png');}catch(_){}
    return output;
  } catch (_) {
    return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><body><h1>画面を読み込めませんでした</h1><p>GAS_RENDER_'+stage+'：更新後に再読み込みしてください。</p></body></html>').setTitle('XeroxYT-NTv7 for GAS');
  }
}
function gasResult_(status, data, headers) {
  return {status:status,body:JSON.stringify(data),headers:Object.assign({'content-type':'application/json; charset=utf-8','cache-control':'no-store'},headers||{})};
}
function gasOrigin_(value) {
  value=String(value||'').trim().replace(/\/$/,'');
  if(!/^https:\/\/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::443)?$/i.test(value))throw new Error('config');
  return value;
}
function gasHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value).map(function(v){return ('0'+((v+256)%256).toString(16)).slice(-2);}).join('');
}
function gasRoute_(path) {
  if(typeof path!=='string'||path.length>12000||!/^\/api\/[A-Za-z0-9_@%./?=&+,:~!-]/.test(path)||/[\\\s#\u0000-\u001f]/.test(path))return false;
  var pathname=path.split('?')[0],decoded;
  try{decoded=decodeURIComponent(pathname);}catch(_){return false;}
  if(/%|\\|\/\/|[\u0000-\u001f]/.test(decoded)||decoded.split('/').some(function(s){return s==='.'||s==='..';}))return false;
  if(/^\/api\/(?:debug|admin|internal|transport-config)(?:\/|$)/.test(decoded)||decoded==='/api/account/cloudflare-session')return false;
  return /^\/api\/(?:account|auth|user|instagram|tiktok|limits|recommendations|trending|search|suggestions|video|channel|channels|home|mix|shorts|shorts-ranking|sync|playlist|playlists|health|config)(?:\/|$)/.test(decoded);
}
function gasHeader_(headers,name) {
  var key=Object.keys(headers||{}).find(function(k){return k.toLowerCase()===name;});return key?headers[key]:null;
}
// Server-only session persistence. Cache eviction must not log users out.
function gasForgetCookie_(key) {
  PropertiesService.getScriptProperties().deleteProperty(key);
  CacheService.getScriptCache().remove(key);
}
function gasStoreCookie_(key,cookie,expires) {
  var value=JSON.stringify({cookie:cookie,expires:expires});
  PropertiesService.getScriptProperties().setProperty(key,value);
  CacheService.getScriptCache().put(key,value,Math.max(1,Math.min(21600,Math.floor((expires-Date.now())/1000))));
}
function gasLoadCookie_(key) {
  var cache=CacheService.getScriptCache(),props=PropertiesService.getScriptProperties();
  var value=cache.get(key)||props.getProperty(key);
  if(!value)return null;
  // Migrate sessions created by the old cache-only implementation once.
  if(/^__Host-xy_session=[a-f0-9]{64}$/.test(value)){
    gasStoreCookie_(key,value,Date.now()+21600000);return value;
  }
  var saved;try{saved=JSON.parse(value);}catch(_){gasForgetCookie_(key);return null;}
  if(!saved||!/^__Host-xy_session=[a-f0-9]{64}$/.test(saved.cookie||'')||!Number.isFinite(saved.expires)||saved.expires<=Date.now()){
    gasForgetCookie_(key);return null;
  }
  cache.put(key,value,Math.max(1,Math.min(21600,Math.floor((saved.expires-Date.now())/1000))));
  return saved.cookie;
}
function gasSaveCookie_(key,responseHeaders) {
  var values=gasHeader_(responseHeaders,'set-cookie');
  if(!values)return;
  (Array.isArray(values)?values:[String(values)]).forEach(function(line){
    var match=/(?:^|,\s*)__Host-xy_session=([a-f0-9]{64}|)(?:;|$)/.exec(line);
    if(!match)return;
    var age=/(?:^|;)\s*Max-Age=(-?\d+)/i.exec(line);
    var date=/(?:^|;)\s*Expires=([^;]+)/i.exec(line);
    var expires=age?Date.now()+Number(age[1])*1000:date?Date.parse(date[1]):Date.now()+21600000;
    if(!match[1]||!Number.isFinite(expires)||expires<=Date.now()){gasForgetCookie_(key);return;}
    // Remove expired records only, leaving API configuration and active sessions intact.
    var props=PropertiesService.getScriptProperties(),all=props.getProperties();
    Object.keys(all).filter(function(name){return /^xyg:[a-f0-9]{64}$/.test(name);}).forEach(function(name){
      try{var record=JSON.parse(all[name]);if(record.expires<=Date.now())gasForgetCookie_(name);}catch(_){}
    });
    gasStoreCookie_(key,'__Host-xy_session='+match[1],expires);
  });
}
function gasSanitize_(value,hidden) {
  if(typeof value==='string'){
    hidden.forEach(function(origin){
      // Redact both URLs and bare hosts; never return encoded upstream links.
      var host=origin.replace(/^https:\/\//,'');
      [origin,origin.replace(/\/$/,''),host,encodeURIComponent(origin),encodeURIComponent(host)].forEach(function(needle){value=value.split(needle).join('[非公開API]');});
    });return value;
  }
  if(Array.isArray(value))return value.map(function(v){return gasSanitize_(v,hidden);});
  if(value&&typeof value==='object'){var out={};Object.keys(value).forEach(function(k){out[gasSanitize_(k,hidden)]=gasSanitize_(value[k],hidden);});return out;}
  return value;
}
function gasRequest(request) {
  try {
    if(!request||!/^[a-f0-9]{64}$/.test(request.session||'')||!gasRoute_(request.path))return gasResult_(400,{error:'通信先が無効です。'});
    var method=String(request.method||'GET').toUpperCase();
    if(request.path==='/api/config/client-release'&&method==='GET'){
      var release=GAS_RELEASE_.release,base='https://cdn.jsdelivr.net/gh/'+GAS_RELEASE_.repo+'@'+release.revision+'/gas/web';
      return gasResult_(200,{base:base,js:base+'/'+release.entry,css:base+'/'+release.css,version:release.entry+':'+release.css+':'+release.serverHash});
    }
    if(!/^(GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(method))return gasResult_(405,{error:'この通信方法は使えません。'});
    if(request.body!==null&&request.body!==undefined&&(typeof request.body!=='string'||request.body.length>131072))return gasResult_(413,{error:'送信データが大きすぎます。'});
    var props=PropertiesService.getScriptProperties();
    var api=gasOrigin_(props.getProperty('API_BASE_URL'));
    var account=gasOrigin_(props.getProperty('ACCOUNT_BASE_URL')||api);
    var origin=gasOrigin_(props.getProperty('UPSTREAM_ORIGIN'));
    var target=/^\/api\/account(?:\/|\?|$)/.test(request.path)?account:api;
    var key='xyg:'+gasHash_(request.session+target);
    var headers={'Accept':'application/json','Origin':origin};
    ['content-type','accept-language','x-client-id','x-usage-token','x-client-usage'].forEach(function(name){var v=gasHeader_(request.headers,name);if(typeof v==='string'&&v.length<2048&&!/[\r\n]/.test(v))headers[name]=v;});
    var cookie=gasLoadCookie_(key);if(cookie)headers.Cookie=cookie;
    // The account cookie must also reach auth/user/social routes when origins differ.
    if(target!==account){var accountCookie=gasLoadCookie_('xyg:'+gasHash_(request.session+account));if(accountCookie)headers.Cookie=accountCookie;}
    var secret=props.getProperty('API_SHARED_SECRET');if(secret)headers.Authorization='Bearer '+secret;
    if(!['GET','HEAD'].includes(method)&&!/^application\/json(?:;|$)/i.test(headers['content-type']||''))return gasResult_(415,{error:'JSON形式で送信してください。'});
    var options={method:method.toLowerCase(),headers:headers,muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true};
    if(!['GET','HEAD'].includes(method)&&request.body!=null)options.payload=request.body;
    var response=UrlFetchApp.fetch(target+request.path,options);
    var status=response.getResponseCode();
    if(status>=300&&status<400)return gasResult_(502,{error:'APIから想定外のリダイレクトが返されました。'});
    var responseHeaders=response.getAllHeaders();
    // Login/session cookie changes are processed before the next RPC can use them.
    if(/^\/api\/account\/(?:login|register|logout|session)(?:\?|$)/.test(request.path)&&status>=200&&status<300)gasSaveCookie_(key,responseHeaders);
    // A failed session check must not erase a recoverable server-side record.
    if(method==='HEAD'||status===204)return gasResult_(status,{});
    if(!/application\/(?:json|[^;]+\+json)/i.test(String(gasHeader_(responseHeaders,'content-type')||'')))return gasResult_(502,{error:'GAS版ではJSON以外の動画・バイナリ中継に対応していません。',code:'GAS_STREAM_UNSUPPORTED'});
    var text=response.getContentText();
    if(text.length>4000000)return gasResult_(413,{error:'応答が大きすぎます。'});
    var data=JSON.parse(text);
    if(request.path==='/api/account/login'&&status===403&&data.code==='ACCOUNT_BANNED')gasSaveCookie_(key,responseHeaders);
    data=gasSanitize_(data,[api,account]);
    if(secret)data=gasSanitize_(data,[secret]);
    var safeHeaders={};
    ['retry-after','x-daily-usage-token'].forEach(function(name){var value=gasHeader_(responseHeaders,name);if(value)safeHeaders[name]=gasSanitize_(String(value),secret?[api,account,secret]:[api,account]);});
    return gasResult_(status,data,safeHeaders);
  } catch (_) {
    // Upstream exceptions can contain private URLs, so never send raw exceptions.
    return gasResult_(502,{error:'GASからAPIに接続できませんでした。設定またはAPIの稼働状態を確認してください。',code:'GAS_UPSTREAM_FAILED'});
  }
}
