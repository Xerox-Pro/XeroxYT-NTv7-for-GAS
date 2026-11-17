import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter} from 'react-router-dom';
import {installBridge} from './bridge.mjs';
import {installResponsive} from './responsive.mjs';
import {installViewport} from './viewport.mjs';
import App from '../../src/App';
import '../../src/index.css';
import '../../src/social/switcher.css';
import './layout.css';
import {warmDeviceEmbedConfig} from '../../src/lib/deviceEmbed.mjs';
import {installAutoUpdate} from './autoUpdate.mjs';
const appWindow=window as any;
appWindow.__XEROX_GAS_UNMOUNT__?.();
if(!appWindow.__XEROX_GAS_BRIDGE_INSTALLED__){installBridge();installViewport();appWindow.__XEROX_GAS_BRIDGE_INSTALLED__=true;}
appWindow.__XEROX_GAS_RESPONSIVE_DISPOSE__?.();
appWindow.__XEROX_GAS_RESPONSIVE_DISPOSE__=installResponsive();
warmDeviceEmbedConfig();
// The GAS iframe URL must stay unchanged during navigation.
const initialRoute=(window as any).__XEROX_GAS_ASSETS__?.route;
if(initialRoute)location.hash=initialRoute;
if(!location.hash.startsWith('#/')){
 let saved='/';try{saved=localStorage.getItem('xerox_last_page')||'/';}catch{}
 location.hash=saved.startsWith('/')&&!saved.startsWith('//')?saved:'/';
}
const root=createRoot(document.getElementById('root')!);
root.render(<StrictMode><HashRouter><App/></HashRouter></StrictMode>);
const stopUpdates=installAutoUpdate();
appWindow.__XEROX_GAS_BOOTED_VERSION__=appWindow.__XEROX_GAS_ASSETS__?.version;
appWindow.__XEROX_GAS_UNMOUNT__=()=>{stopUpdates();root.unmount();};
