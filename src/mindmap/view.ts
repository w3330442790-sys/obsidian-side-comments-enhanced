import { Component, MarkdownRenderer, MarkdownView, Notice, Plugin, TextFileView, TFile, WorkspaceLeaf, type EventRef } from 'obsidian';
import type { DiagramComment, DiagramEditor } from './editor';
import type { MindmapHistory } from './session';

export const MINDMAP_VIEW = 'markdown-tool-mindmap';
interface AnnotationHooks {
    comments: (path: string) => DiagramComment[];
    openComment: (timestamp: number) => Promise<void>;
}
interface Runtime { histories: Map<string, MindmapHistory>; hooks: AnnotationHooks }

export class MarkdownToolView extends TextFileView {
    private editor: DiagramEditor | null = null;
    private source = '';
    private generation = 0;
    private ready: Promise<void> = Promise.resolve();
    private fileListener: EventRef | null = null;
    constructor(leaf: WorkspaceLeaf, private readonly runtime: Runtime) { super(leaf); }
    getViewType(): string { return MINDMAP_VIEW; }
    getDisplayText(): string { return this.file?.basename ?? 'Markdown Tool'; }
    getIcon(): string { return 'brain-circuit'; }
    async onOpen(): Promise<void> { this.contentEl.addClass('markdown-tool-view'); await Promise.resolve(); }
    getViewData(): string { return this.editor?.text ?? this.source; }
    setViewData(source: string, clear: boolean): void {
        this.data = source;
        if (!clear && this.editor) { this.editor.receiveExternal(source); return; }
        this.source = source; this.unmount();
        const generation = this.generation, file = this.file;
        if (!file) return;
        this.ready = import('./editor').then(({DiagramEditor}) => {
            if (generation !== this.generation || this.file !== file) return;
            const key = `markdown-tool:recovery:${this.app.vault.getName()}:${file.path}`;
            let recovery: string | null = null;
            let archivedRecovery: string | null = null;
            try { const saved: unknown = this.app.loadLocalStorage(key); if (typeof saved === 'string') recovery = saved; } catch { /* Editor reports any subsequent storage failure. */ }
            try {const saved:unknown=this.app.loadLocalStorage(`${key}:archive`);if(typeof saved==='string')archivedRecovery=saved;}catch{/* Editor retains active pending content independently. */}
            this.editor = new DiagramEditor(this.contentEl, {
                source, title: file.basename, history: this.runtime.histories.get(file.path), recovery,archivedRecovery,
                archiveRecovery:text=>this.app.saveLocalStorage(`${key}:archive`,text),
                process: transform => this.app.vault.process(file, transform),
                getComments: () => this.runtime.hooks.comments(file.path),
                onOpenComment: timestamp => { void this.runtime.hooks.openComment(timestamp); },
                onMarkdown: async () => { await this.leaf.setViewState({type:'markdown',state:{file:file.path,mode:'source'},active:true}); },
                storeRecovery: text => this.app.saveLocalStorage(key,text),
                renderMarkdown: (text,target) => {
                    const component = new Component(); component.load();
                    void MarkdownRenderer.render(this.app,text,target,file.path,component);
                    return () => component.unload();
                },
            });
            this.fileListener=this.app.vault.on('modify', changed => {
                if (changed === file) void this.app.vault.read(file).then(text => { if (generation === this.generation) { this.editor?.receiveExternal(text); this.editor?.refreshComments(); } }).catch(() => undefined);
            });
        }).catch((error: unknown) => {
            if (generation !== this.generation) return;
            this.contentEl.empty(); this.contentEl.createEl('p',{text:`无法打开思维导图：${error instanceof Error?error.message:String(error)}`});
            const back = this.contentEl.createEl('button',{text:'返回 Markdown'});
            back.onclick=()=>{void this.leaf.setViewState({type:'markdown',state:{file:file.path},active:true});};
        });
    }
    async save(): Promise<void> { await this.ready; if (this.editor) await this.editor.flush(); }
    async switchToMarkdown(): Promise<void> {
        await this.ready;
        if(!this.file)return;
        if(this.editor&&!await this.editor.flush()){new Notice('请先解决保存问题，再切换到 Markdown。');return;}
        await this.leaf.setViewState({type:'markdown',state:{file:this.file.path},active:true});
    }
    async onUnloadFile(file: TFile): Promise<void> { await this.save(); this.remember(file.path); this.unmount(); await super.onUnloadFile(file); }
    async onClose(): Promise<void> { await this.save(); if(this.file)this.remember(this.file.path); this.unmount(); await super.onClose(); }
    clear(): void { this.unmount(); this.source=''; }
    refreshComments(): void { this.editor?.refreshComments(); }
    private remember(path: string): void {
        if (!this.editor) return;
        this.runtime.histories.delete(path); this.runtime.histories.set(path,this.editor.history);
        while(this.runtime.histories.size>12)this.runtime.histories.delete(this.runtime.histories.keys().next().value as string);
    }
    private unmount(): void { this.generation++;if(this.fileListener)this.app.vault.offref(this.fileListener);this.fileListener=null;this.editor?.destroy();this.editor=null; }
}

export function registerMarkdownTool(plugin: Plugin, hooks: AnnotationHooks): void {
    const runtime: Runtime={histories:new Map(),hooks};
    plugin.registerView(MINDMAP_VIEW,leaf=>new MarkdownToolView(leaf,runtime));
    const buttons=new Map<MarkdownView,HTMLElement>();
    const open=async(view:MarkdownView):Promise<void>=>{
        if(!view.file)return;
        try{await view.save();await view.leaf.setViewState({type:MINDMAP_VIEW,state:{file:view.file.path},active:true});}
        catch(error){new Notice(`切换失败：${error instanceof Error?error.message:String(error)}`);}
    };
    const scan=()=>{
        const live=new Set<MarkdownView>();
        plugin.app.workspace.iterateAllLeaves(leaf=>{
            if(!(leaf.view instanceof MarkdownView))return;
            const view=leaf.view;live.add(view);
            if(!buttons.has(view))buttons.set(view,view.addAction('brain-circuit','切换为思维导图',()=>{void open(view);}));
        });
        for(const [view,el]of buttons)if(!live.has(view)){el.remove();buttons.delete(view);}
        plugin.app.workspace.getLeavesOfType(MINDMAP_VIEW).forEach(leaf=>{if(leaf.view instanceof MarkdownToolView)leaf.view.refreshComments();});
    };
    plugin.app.workspace.onLayoutReady(scan);
    plugin.registerEvent(plugin.app.workspace.on('layout-change',scan));
    plugin.registerEvent(plugin.app.workspace.on('active-leaf-change',scan));
    plugin.addCommand({id:'toggle-mindmap',name:'切换 Markdown / 思维导图',checkCallback:checking=>{
        const view=plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const map=plugin.app.workspace.getActiveViewOfType(MarkdownToolView);
        if(!view?.file&&!map?.file)return false;
        if(!checking){if(view)void open(view);else if(map?.file)void map.switchToMarkdown();}
        return true;
    }});
    plugin.register(()=>{buttons.forEach(el=>el.remove());buttons.clear();runtime.histories.clear();});
}
