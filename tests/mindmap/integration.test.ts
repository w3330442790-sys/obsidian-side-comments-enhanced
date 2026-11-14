import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

/**
 * Boots the fused Taube Markdown Tool class with a browserless Obsidian API.
 * This is the wiring test between the annotation plugin and the vendored
 * Weilanx/gogoga editor: views, commands, setting tabs and the two separate
 * settings files must all be registered exactly once from one plugin instance.
 */
async function boot(seed: Record<string, string> = {}) {
  const result = await build({
    entryPoints: ['src/main.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'fused-plugin-host',
      setup(build) {
        build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host' }));
        build.onLoad({ filter: /.*/, namespace: 'host' }, () => ({
          contents: `
          class Component {
            constructor(){ this.cleanups=[]; }
            register(fn){ this.cleanups.push(fn); }
            registerEvent(ref){ this.register(()=>ref.off()); }
            registerDomEvent(target,name,handler){ target.addEventListener?.(name,handler); this.register(()=>target.removeEventListener?.(name,handler)); }
            addChild(){ return new Component(); }
            load(){} unload(){ for(const fn of this.cleanups.splice(0).reverse())fn(); }
          }
          class WorkspaceLeaf {
            constructor(){ this.app=globalThis.__testApp; this.view={ getViewType(){return 'markdown';}, file:null, containerEl:{ownerDocument:document} }; }
            async setViewState(state){ this.state=state; }
            getViewState(){ return this.state ?? {type:'markdown', state:{}}; }
          }
          class FileView extends Component { constructor(leaf){ super(); this.leaf=leaf; this.app=leaf.app; this.file=leaf.file; this.contentEl=document.createElement('div'); } }
          class MarkdownView extends FileView {
            constructor(leaf){ super(leaf); this.actions=[]; this.wasSaved=false; this.editor={ getValue(){return '';}, getSelection(){return '';}, getCursor(){return {line:0,ch:0};}, posToOffset(){return 0;}, offsetToPos(){return {line:0,ch:0};}, setSelection(){}, somethingSelected(){return false;}, getMode(){return 'source';}, hasFocus(){return false;} }; }
            addAction(icon,title,callback){ const el=document.createElement('span'); this.actions.push({icon,title,callback,el}); return el; }
            async save(){ this.wasSaved=true; }
            getMode(){ return 'source'; }
          }
          class Plugin extends Component {
            constructor(app,manifest){ super(); this.app=app; this.manifest=manifest; this.views=new Map(); this.extensions=new Map(); this.commands=[]; this.codeblocks=new Map(); this.tabs=[]; this.saved=[]; this.loaded=null; this.refs=[]; }
            async loadData(){ return this.loaded; }
            async saveData(data){ this.saved.push(structuredClone(data)); await this.app.vault.adapter.write(this.manifest.dir + '/data.json', JSON.stringify(data)); }
            onload(){} onunload(){}
            registerView(type,create){ this.views.set(type,create); this.register(()=>this.views.delete(type)); }
            registerExtensions(exts,type){ for(const ext of exts) this.extensions.set(ext,type); this.register(()=>exts.forEach(ext=>this.extensions.delete(ext))); }
            addCommand(command){ this.commands.push(command); this.register(()=>this.commands.splice(this.commands.indexOf(command),1)); }
            addSettingTab(tab){ this.tabs.push(tab); this.register(()=>this.tabs.splice(this.tabs.indexOf(tab),1)); tab.update?.(); }
            addRibbonIcon(){ return {remove(){}}; }
            addStatusBarItem(){ return {setText(){},remove(){}}; }
            registerHoverLinkSource(){}
            registerObsidianProtocolHandler(){}
            registerMarkdownCodeBlockProcessor(language,processor){ this.codeblocks.set(language,processor); this.register(()=>this.codeblocks.delete(language)); }
            registerMarkdownPostProcessor(){}
            registerEditorExtension(){}
          }
          const classes={Component,Plugin,WorkspaceLeaf,FileView,TextFileView:FileView,ItemView:FileView,MarkdownView};
          globalThis.__MockMarkdownView=MarkdownView;
          for(const name of ['AbstractInputSuggest','FuzzySuggestModal','PluginSettingTab','Modal','SuggestModal','Setting','Menu','MenuItem','MarkdownRenderChild','Scope','TAbstractFile','TFile','TFolder','App','Notice']) classes[name]=class extends Component { constructor(...args){ super(); this.app=args[0]; } register(){} };
          classes.PluginSettingTab = class extends Component {
            constructor(app,plugin){ super(); this.app=app; this.plugin=plugin; this.name=plugin.manifest.name; this.id=plugin.manifest.id; }
            update(){ this.definitions=this.getSettingDefinitions?.() ?? []; }
          };
          class TFile extends classes.TAbstractFile { constructor(path){ super(); this.path=path; this.name=path; this.basename=path.replace(/\\.[^.]+$/,''); this.extension=path.split('.').pop()||''; this.parent=null; } }
          class TFolder extends classes.TAbstractFile { constructor(path){ super(); this.path=path; this.name=path; this.children=[]; } }
          classes.TFile=TFile; classes.TFolder=TFolder;
          const functions={getLanguage:()=> 'en',normalizePath:path=>path.replace(/^\\//,''),loadMathJax:async()=>{},loadPrism:async()=>{},moment:{locale:()=> 'en'},addIcon:()=>{},getIcon:()=>null,setIcon:()=>{},setTooltip:()=>{},finishRenderMath:()=>{},renderMath:()=>null,Platform:{isMobile:false,isMacOS:false},MarkdownRenderer:{async render(){}},getIconIds:()=>[]};
          module.exports=new Proxy({__esModule:true,...classes,...functions},{get(target,key){ return target[key] ?? class extends Component { constructor(...args){ super(); this.app=args[0]; } }; }});
          `,
        }));
        build.onResolve({ filter: /^(react|react-dom\/client)$/ }, args => ({ path: args.path, namespace: 'react' }));
        build.onLoad({ filter: /.*/, namespace: 'react' }, () => ({ contents: 'export function App(){};export function createElement(){};export function createRoot(){return {render(){},unmount(){}}}' }));
        build.onResolve({ filter: /webview\/src\/(App|RichTopic)$/ }, args => ({ path: args.path, namespace: 'react' }));
      },
    }],
  });

  const style = { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } };
  const classes = new Set<string>();
  const makeElement = (): any => {
    const el: any = {
      ownerDocument: doc, isConnected: false, textContent: '', className: '', id: '',
      style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
      child: null,
      classList: { add(...names: string[]) { names.forEach(n => classes.add(n)); }, remove(...names: string[]) { names.forEach(n => classes.delete(n)); }, toggle(name: string, on: boolean) { if (on) classes.add(name); else classes.delete(name); }, contains(name: string) { return classes.has(name); } },
      appendChild(child: any) { el.child = child; child.isConnected = true; return child; },
      append(...children: any[]) { children.forEach((child: any) => el.appendChild(child)); },
      replaceChildren(...children: any[]) { children.forEach((child: any) => el.appendChild(child)); },
      remove() { el.isConnected = false; },
      setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      createEl(tag: string) { return makeElement(); }, createDiv() { return makeElement(); }, createSpan() { return makeElement(); },
      empty() { el.replaceChildren(); }, addClass() {}, removeClass() {}, hasClass() { return false; }, toggleClass() {},
      setText(text: string) { el.textContent = text; }, setCssStyles() {},
    };
    return el;
  };
  const doc: any = {
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    createElement() { return makeElement(); }, createEvent() { return {}; },
    defaultView: null,
  };
  doc.body = makeElement();
  doc.head = makeElement();
  doc.documentElement = makeElement();
  const storage = new Map<string, string>();
  (globalThis as any).MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
  (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
  (globalThis as any).requestAnimationFrame = (fn: Function) => setTimeout(fn, 0);
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
  (globalThis as any).getComputedStyle = () => ({ getPropertyValue() { return ''; } });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, String(v)), removeItem: (k: string) => storage.delete(k) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, removeEventListener() {}, localStorage: globalThis.localStorage, document: doc } });

  const files = new Map<string, string>(Object.entries(seed));
  const adapter = {
    async exists(path: string) { return files.has(path); },
    async read(path: string) { if (!files.has(path)) throw new Error('missing ' + path); return files.get(path); },
    async write(path: string, data: string) { files.set(path, data); },
    async list(path: string) { return { files: [...files.keys()].filter(f => f.startsWith(path + '/')), folders: [] }; },
    async remove(path: string) { files.delete(path); },
    async stat(path: string) { return files.has(path) ? { mtime: 0, ctime: 0, size: 0, type: 'file' } : null; },
    async mkdir() {},
  };
  const refs = new Set<any>();
  const on = (_name: string, fn: Function) => { const ref = { fn, off() { refs.delete(ref); } }; refs.add(ref); return ref; };
  const panes = new Map<string, any[]>();
  const embeds: Record<string, unknown> = { md: () => {} };
  const app: any = {
    appId: 'test-vault',
    workspace: {
      on, offref: (ref: any) => ref.off(), document: doc, containerEl: { doc, ownerDocument: doc, win: globalThis },
      getLeavesOfType: (type: string) => panes.get(type) ?? [],
      iterateAllLeaves(fn: Function) { for (const leaves of panes.values()) for (const leaf of leaves) fn(leaf); },
      onLayoutReady(fn: Function) { fn(); },
      getActiveFile() { return null; }, getActiveViewOfType() { return null; },
      getMostRecentLeaf() { return null; }, getLeaf() { return null; },
      getRightLeaf() { return null; }, getLeftLeaf() { return null; }, revealLeaf: async () => {}, trigger() {},
      setActiveLeaf() {},
    },
    metadataCache: { on, getCache() { return null; }, getFirstLinkpathDest() { return null; }, resolvedLinks: {} },
    vault: {
      configDir: '.obsidian', getName: () => 'test-vault', adapter,
      on, read: async () => '', create: async () => ({}), process: async () => {}, getAbstractFileByPath: () => null,
      createFolder: async () => {}, getResourcePath: () => '', getFiles: () => [],
    },
    fileManager: { getAvailablePathForAttachment: async (name: string) => name },
    embedRegistry: { embedByExtension: embeds, registerExtension(ext: string, create: unknown) { embeds[ext] = create; }, unregisterExtension(ext: string) { delete embeds[ext]; } },
    plugins: { plugins: {}, enabledPlugins: new Set<string>() },
    internalPlugins: { getPluginById: () => undefined },
    setting: { open() {}, openTabById() {} },
    loadLocalStorage: () => null, saveLocalStorage: () => {},
    scope: {},
  };
  (globalThis as any).__testApp = app;

  const module = { exports: {} };
  try {
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
    const Main = (module.exports as any).default;
    const plugin = new Main(app, { id: 'taube-markdown-tool', name: 'Taube Markdown Tool', dir: '.obsidian/plugins/taube-markdown-tool' });
    await plugin.onload();
    return {
      plugin, app, panes, refs, embeds, files, doc,
      cleanup() {
        plugin.onunload();
        plugin.unload();
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
        if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document');
        if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
      },
    };
  } catch (error) {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document');
    if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
    throw error;
  }
}

test('one plugin registers both feature sets and keeps their settings in separate files', async () => {
  const f = await boot();
  try {
    for (const type of ['sidenote-view', 'taube-markdown-tool-wmind', 'markdown-tool-mindmap', 'taube-markdown-tool-xmind']) {
      assert.ok(f.plugin.views.has(type), type);
    }
    for (const legacy of ['personal-mindmap-markdown', 'personal-mindmap-wmind', 'personal-mindmap-xmind']) {
      assert.ok(f.plugin.views.has(legacy), legacy);
    }
    assert.equal(f.plugin.extensions.get('wmind'), 'taube-markdown-tool-wmind');
    assert.equal(f.plugin.extensions.get('xmind'), 'taube-markdown-tool-xmind');
    assert.equal(f.plugin.codeblocks.size, 2);
    const ids = f.plugin.commands.map((command: any) => command.id);
    assert.ok(ids.length > 60, String(ids.length));
    assert.equal(new Set(ids).size, ids.length, 'command ids must be unique');
    for (const id of ['open-comment-view', 'red-selected-text', 'block-move-up', 'create-wmind', 'convert-to-wmind', 'wmind-outline', 'toggle-view']) {
      assert.ok(ids.includes(id), id);
    }
    assert.equal(f.plugin.tabs.length, 2, 'annotation tab + fused mind-map tab');
    assert.ok(f.plugin.tabs[0].definitions.length > 0, 'annotation settings render immediately after addSettingTab');
    assert.equal(f.plugin.tabs[0].name, 'Taube Markdown Tool');
    assert.match(f.plugin.tabs[1].name, /思维导图/, 'mind-map tab has its own nav label');

    assert.equal(typeof f.plugin.toolSettings.commentSortOrder, 'string');
    assert.ok(Array.isArray(f.plugin.settings.customThemes), 'mind-map settings live on plugin.settings');

    f.plugin.toolSettings.highlightColor = '#123456';
    await f.plugin.saveToolData();
    f.plugin.settings.defaultTheme = 'dark';
    await f.plugin.saveSettings();
    assert.ok(f.files.has('.obsidian/plugins/taube-markdown-tool/data.json'), 'annotation data.json');
    assert.ok(f.files.has('.obsidian/plugins/taube-markdown-tool/mindmap-settings.json'), 'mindmap-settings.json');
    const tool = JSON.parse(f.files.get('.obsidian/plugins/taube-markdown-tool/data.json')!);
    const mindmap = JSON.parse(f.files.get('.obsidian/plugins/taube-markdown-tool/mindmap-settings.json')!);
    assert.equal(tool.highlightColor, '#123456');
    assert.equal(mindmap.defaultTheme, 'dark');
    assert.equal(tool.commentSortOrder, 'position');
    assert.equal(mindmap.customThemes.length, 0);
  } finally {
    f.cleanup();
  }
  assert.equal(f.refs.size, 0, 'all workspace/cache listeners are released');
  assert.equal(f.plugin.views.size, 0);
  assert.equal(f.plugin.commands.length, 0);
});

test('first load migrates standalone personal-mindmap settings and state once', async () => {
  const legacySettings = JSON.stringify({ defaultTheme: 'dark', indent: '4', customThemes: [] });
  const legacyState = JSON.stringify({ locked: { 'note.md': true } });
  const f = await boot({
    '.obsidian/plugins/personal-mindmap/data.json': legacySettings,
    '.obsidian/plugins/personal-mindmap/state.json': legacyState,
  });
  try {
    assert.equal(f.plugin.settings.defaultTheme, 'dark');
    assert.equal(f.plugin.settings.indent, '4');
    assert.ok(f.files.has('.obsidian/plugins/taube-markdown-tool/mindmap-settings.json'));
    assert.ok(f.files.has('.obsidian/plugins/taube-markdown-tool/state.json'));
    assert.equal(f.files.get('.obsidian/plugins/taube-markdown-tool/state.json'), legacyState);
    const migrated = JSON.parse(f.files.get('.obsidian/plugins/taube-markdown-tool/mindmap-settings.json')!);
    assert.equal(migrated.defaultTheme, 'dark');
    assert.equal(migrated.indent, '4');
  } finally {
    f.cleanup();
  }
});
