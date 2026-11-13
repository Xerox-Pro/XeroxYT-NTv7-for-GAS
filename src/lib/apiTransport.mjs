// GAS never requests the upstream origin configuration or direct-access tickets.
export function readTransportState(){return {mode:'proxy',automatic:false};}
export function setTransportMode(_mode){}
export function apiFetch(path,options={}){return fetch(path,options);}
export function cloudflareOnlyFetch(path,options={}){return fetch(path,options);}
