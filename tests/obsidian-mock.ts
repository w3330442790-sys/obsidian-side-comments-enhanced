// Browser-only synthetic Obsidian API. Never loads a user's vault.
const proto = HTMLElement.prototype as any;
function create(parent: HTMLElement, tag: string, options: any = {}) {
    if (typeof options === 'string') options = { cls: options };
    const el = document.createElement(tag) as any;
    if (options.cls) el.className = options.cls;
    if (options.text !== undefined) el.textContent = options.text;
    for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, String(value));
    for (const key of ['value', 'type', 'placeholder', 'title']) if (options[key] !== undefined) el[key] = options[key];
    parent.appendChild(el); return el;
}
proto.createEl = function(tag: string, opts: any) { return create(this, tag, opts); };
proto.createDiv = function(opts: any) { return create(this, 'div', opts); };
proto.createSpan = function(opts: any) { return create(this, 'span', opts); };
proto.empty = function() { this.replaceChildren(); };
proto.addClass = function(...classes: string[]) { this.classList.add(...classes); };
proto.removeClass = function(...classes: string[]) { this.classList.remove(...classes); };
proto.hasClass = function(cls: string) { return this.classList.contains(cls); };
proto.toggleClass = function(cls: string, enabled: boolean) { this.classList.toggle(cls, enabled); };
proto.setText = function(text: string) { this.textContent = text; };
proto.setCssStyles = function(styles: any) { Object.assign(this.style, styles); };
(Node.prototype as any).instanceOf = function(type: any) { return this instanceof type; };
Object.assign(window, { createEl: (tag: string, opts: any) => create(document.createElement('div'), tag, opts), createDiv: (opts: any) => create(document.createElement('div'), 'div', opts), createSpan: (opts: any) => create(document.createElement('div'), 'span', opts), createFragment: () => document.createDocumentFragment() });
export class Component { load() {} unload() {} register() {} }
export class Plugin extends Component {
    app: any; manifest: any;
    constructor(app: any, manifest: any) { super(); this.app = app; this.manifest = manifest; }
    async loadData() { return {}; }
    async saveData(data: any) { await this.app.vault.adapter.write('.obsidian/plugins/side-comments-origin/data.json', JSON.stringify(data)); }
}
export class ItemView extends Component {
    app: any; containerEl: HTMLElement; leaf: any;
    constructor(leaf: any) { super(); this.leaf = leaf; this.app = leaf.app; this.containerEl = document.createElement('div'); document.body.appendChild(this.containerEl); }
    registerDomEvent(target: any, name: string, cb: any, options?: any) { target.addEventListener(name, cb, options); }
    async setState() {}
}
export class MarkdownView { file: any; editor: any; containerEl = document.createElement('div'); getMode() { return 'source'; } }
export class TFile { path: string; extension = 'md'; basename: string; constructor(path: string) { this.path = path; this.basename = path.replace(/\.md$/, ''); } }
export class Modal {
    containerEl = document.createElement('div') as any; titleEl: any; contentEl: any;
    constructor(public app: any) { this.containerEl.className = 'modal-container'; this.titleEl = this.containerEl.createEl('h2'); this.contentEl = this.containerEl.createDiv('modal-content'); }
    open() { document.body.appendChild(this.containerEl); }
    close() { this.containerEl.remove(); }
}
export class Notice {
    messageEl = document.createElement('div') as any;
    constructor(message: any, timeout?: number) { (window as any).notices.push(typeof message === 'string' ? message : 'notice'); }
    hide() {}
}
export class PluginSettingTab {}
export class Setting {}
export class MarkdownRenderChild extends Component {}
export const Platform = { isMobile: false, isMacOS: false };
export const MarkdownRenderer = { async render(app: any, text: string, el: HTMLElement) { await Promise.resolve(); el.textContent = text; } };
export const setIcon = (el: HTMLElement, icon: string) => { el.setAttribute('data-icon', icon); };
export const normalizePath = (path: string) => path.replace(/\\/g, '/');
