import {createRoot} from 'react-dom/client';
import {App} from '../vendor/personal-mindmap/webview/src/App';
import {registerFusionThemes} from '../vendor/personal-mindmap/src/core/theme';
import type {Host} from '../vendor/personal-mindmap/webview/src/host';
import '../vendor/personal-mindmap/webview/src/page.css';
import '../vendor/personal-mindmap/webview/src/style.css';
declare global{interface Window{__testHost:Host}}
registerFusionThemes({customThemes:[]});
createRoot(document.getElementById('root')!).render(<App host={window.__testHost}/>);
