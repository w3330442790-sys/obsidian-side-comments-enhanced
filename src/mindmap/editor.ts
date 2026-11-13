import {
    parseDocument, allNodes, findNode, addChild, addSibling, renameNode,
    removeNode, indentNode, outdentNode, moveNode, setCollapsed,
    setRelationship, removeRelationship, addSummary, removeSummary,
    type MindmapDoc, type MindmapNode,
} from './model';
import { MindmapHistory, SnapshotSession } from './session';

export interface DiagramComment {
    timestamp: number; selectedText: string; comment: string;
    startLine: number; endLine: number; color?: string; markType?: string; isOrphaned?: boolean;
}
export interface DiagramOptions {
    source: string;
    title: string;
    process: (transform: (text: string) => string) => Promise<string | void>;
    getComments: () => DiagramComment[];
    onOpenComment: (timestamp: number) => void;
    onMarkdown: () => Promise<void>;
    storeRecovery: (text: string | null) => void;
    recovery?: string | null;
    archivedRecovery?: string | null;
    archiveRecovery?: (text: string | null) => void;
    history?: MindmapHistory;
    renderMarkdown?: (text: string, target: HTMLElement) => (() => void) | void;
}
interface PositionedNode { node: MindmapNode; x: number; y: number; summary: boolean }
const NS = 'http://www.w3.org/2000/svg';
const NODE_WIDTH = 228, ROW = 90, COLUMN = 310;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
    const el = createEl(tag); el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
}
function button(label: string, action: () => void, cls = ''): HTMLButtonElement {
    const el = element('button', cls, label); el.type = 'button'; el.setAttribute('aria-label', label);
    el.addEventListener('click', action); return el;
}
function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value)); return el;
}

/** Shared UI for the live diagram and its editable outline. No filesystem or Obsidian globals. */
export class DiagramEditor {
    readonly history: MindmapHistory;
    readonly session: SnapshotSession;
    private selected = new Set<string>();
    private mode: 'map' | 'outline' = 'map';
    private multi = false;
    private relationFrom: string | null = null;
    private relationId: string | null = null;
    private query = '';
    private matchIndex = -1;
    private zoom = 1;
    private timer: number | null = null;
    private pendingInspector: ((doc: MindmapDoc) => void) | null = null;
    private composing = false;
    private disposed = false;
    private disposers: Array<() => void> = [];
    private inspectorDisposers: Array<() => void> = [];
    private readonly toolbar = element('div', 'mt-toolbar');
    private readonly status = element('span', 'mt-save-status');
    private readonly message = element('div', 'mt-message');
    private readonly viewport = element('div', 'mt-viewport');
    private readonly inspector = element('aside', 'mt-inspector');
    private readonly stage = element('div', 'mt-stage');
    private readonly body = element('div', 'mt-body');
    private saveButton!: HTMLButtonElement;
    private undoButton!: HTMLButtonElement;
    private redoButton!: HTMLButtonElement;
    private recovery: string | null;
    private external: string | null = null;
    private archivedRecovery: string | null;

    constructor(private readonly root: HTMLElement, private readonly options: DiagramOptions) {
        this.history = options.history?.text === options.source ? options.history : new MindmapHistory(options.source, options.title);
        this.session = new SnapshotSession(options.source, options.process);
        this.recovery = options.recovery && options.recovery !== options.source ? options.recovery : null;
        this.archivedRecovery = options.archivedRecovery ?? null;
        root.classList.add('mt-editor'); root.replaceChildren();
        this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
        this.viewport.tabIndex = 0; this.viewport.setAttribute('aria-label', '思维导图画布');
        this.viewport.append(this.stage); this.body.append(this.viewport, this.inspector);
        root.append(this.toolbar, this.message, this.body);
        this.buildToolbar(); this.root.addEventListener('keydown', this.keydown);
        this.selected.add(this.history.doc.root.id); this.render();
    }
    get text(): string { return this.history.text; }
    get dirty(): boolean { return this.session.status !== 'saved'; }
    private buildToolbar(): void {
        const title = element('strong', 'mt-title', this.options.title);
        this.undoButton = button('撤销', () => this.navigateHistory(false));
        this.redoButton = button('重做', () => this.navigateHistory(true));
        this.saveButton = button('保存', () => { void this.flush(); });
        const map = button('思维导图', () => { this.commitInspector();this.mode = 'map'; this.render(); });
        const outline = button('大纲', () => { this.commitInspector();this.mode = 'outline'; this.render(); });
        const multi = button('多选', () => { this.commitInspector();this.multi = !this.multi; if(this.multi)this.selected.clear(); multi.setAttribute('aria-pressed', String(this.multi)); this.renderCanvas();this.renderInspector(); });
        multi.setAttribute('aria-pressed', 'false');
        const search = element('input', 'mt-search'); search.type = 'search'; search.placeholder = '搜索节点'; search.setAttribute('aria-label', '搜索节点');
        search.addEventListener('input', () => { this.query = search.value; this.matchIndex = -1; });
        search.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.nextMatch(); } });
        this.toolbar.append(title, map, outline, this.undoButton, this.redoButton, this.saveButton, multi,
            button('添加子节点', () => this.add(false)), button('添加同级节点', () => this.add(true)),
            button('折叠 / 展开分支', () => this.change(doc => { const node = this.active(doc); if (node) setCollapsed(doc, node.id, !node.folded); })),
            button('添加关联线', () => { const id = [...this.selected][0]; if (id) { this.relationFrom = id; this.message.textContent = '请选择关联线的终点节点。'; } }),
            button('添加总括', () => this.change(doc => { const summary = addSummary(doc, [...this.selected]); this.selected = new Set([summary.root.id]); })),
            button('适应画布', () => this.fit()),
            button('缩小', () => { this.zoom = Math.max(.25, this.zoom - .15); this.renderCanvas(); }),
            button('放大', () => { this.zoom = Math.min(2, this.zoom + .15); this.renderCanvas(); }),
            search, button('下一个结果', () => this.nextMatch()),
            button('返回 Markdown', () => { void this.openMarkdown(); }), this.status);
    }
    private active(doc = this.history.doc): MindmapNode | undefined { return findNode(doc, [...this.selected][0]); }
    private change(mutate: (doc: MindmapDoc) => void): void {
        if (this.session.status === 'conflict' || this.recovery) { this.renderRecovery();return; }
        const pending=this.pendingInspector;this.pendingInspector=null;
        try {
            if (!this.history.edit(doc=>{pending?.(doc);mutate(doc);})) {this.pendingInspector=pending;return;}
            this.relationId = null;
            this.session.update(this.history.text); this.persistRecovery(); this.render(); this.scheduleSave();
        } catch (error) { this.pendingInspector=pending;this.message.textContent = error instanceof Error ? error.message : String(error); }
    }
    private navigateHistory(redo: boolean): void {
        if (this.session.status === 'conflict' || this.recovery) return;
        this.commitInspector();
        if (redo ? this.history.redo() : this.history.undo()) {
            this.session.update(this.history.text); this.persistRecovery(); this.render(); this.scheduleSave();
        }
    }
    private add(sibling: boolean): void {
        this.change(doc => { const node = this.active(doc); if (!node) return; const added = sibling ? addSibling(doc, node.id) : addChild(doc, node.id); this.selected = new Set([added.id]); });
        this.focusEditor();
    }
    private focusEditor(): void { const input = this.inspector.querySelector<HTMLInputElement>('[aria-label="节点文字"]'); input?.focus(); input?.select(); }
    private scheduleSave(): void { if (this.timer) window.clearTimeout(this.timer); this.timer = window.setTimeout(() => { this.timer = null; void this.flush(); }, 300); }
    private persistRecovery(): void {
        try { this.options.storeRecovery(this.session.status === 'saved' ? null : this.history.text); }
        catch { this.message.textContent = '本机恢复存储不可用，请保持此页面打开并重试保存。'; }
    }
    async flush(): Promise<boolean> {
        if(this.composing){this.scheduleSave();return false;}
        this.commitInspector();
        if (this.timer) { window.clearTimeout(this.timer); this.timer = null; }
        if (this.recovery) return false;
        const task = this.session.flush(); this.renderStatus();
        const saved = await task;
        if (!this.disposed) { this.persistRecovery(); this.renderStatus(); if (!saved) this.renderRecovery(); }
        return saved;
    }
    receiveExternal(text: string): void {
        if (this.disposed || text === this.session.baseline) return;
        this.commitInspector();
        try { parseDocument(text, this.options.title); }
        catch (error) {
            this.session.rejectExternal(text,this.history.text); this.external=text;
            this.renderStatus(); this.renderRecovery();
            this.message.append(element('span','',`外部文件无法解析，已停止编辑：${String(error)}`)); return;
        }
        if (!this.session.acceptExternal(text)) { this.external = text; this.persistRecovery(); this.renderRecovery(); this.renderStatus(); return; }
        if (this.session.pending !== undefined || this.session.status === 'saving') return;
        try { this.history.reset(text); this.render(); }
        catch (error) { this.message.textContent = `无法解析外部修改：${error instanceof Error ? error.message : String(error)}`; }
    }
    refreshComments(): void { if (!this.disposed) { this.renderCanvas(); if(!this.inspector.contains(this.root.ownerDocument.activeElement)){this.commitInspector();this.renderInspector();} } }
    private renderStatus(): void {
        const labels: Record<string, string> = { saved: '已保存', dirty: '未保存', saving: '保存中…', error: '保存失败，可重试', conflict: '外部修改冲突，本地内容已保留' };
        this.status.textContent = this.recovery ? '发现待恢复内容' : labels[this.session.status];
        this.status.dataset.state = this.session.status;
        this.saveButton.disabled = this.session.status === 'conflict' || !!this.recovery;
        this.saveButton.title = this.session.error ? String(this.session.error) : '保存当前 Markdown 文件';
        this.undoButton.disabled = !this.history.canUndo || this.session.status === 'conflict' || !!this.recovery;
        this.redoButton.disabled = !this.history.canRedo || this.session.status === 'conflict' || !!this.recovery;
        this.inspector.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea').forEach(input=>{input.disabled=this.session.status==='conflict'||!!this.recovery;});
    }
    private renderRecovery(): void {
        this.message.replaceChildren();
        if (this.recovery) {
            this.message.append(element('span', '', '检测到上次未保存内容。'),
                button('预览恢复内容', () => this.preview(this.recovery ?? '')),
                button('恢复本地内容', () => { const text = this.recovery; if (!text) return; try { this.history.reset(text); this.recovery = null; this.session.update(text); this.persistRecovery(); this.render(); } catch (e) { this.message.append(element('span', '', String(e))); } }),
                button('保留磁盘内容', () => { this.recovery = null; this.options.storeRecovery(null); this.render(); }));
        } else if (this.session.status === 'conflict') {
            this.message.append(element('span', '', '磁盘已有其他修改。请先复制本地内容，再载入磁盘版本；可在 Markdown 中合并。'),
                button('预览本地内容', () => this.preview(this.history.text)),
                button('复制本地内容', () => { void this.copyLocal(); }),
                button('载入磁盘版本', () => { void this.reloadExternal(); }));
        } else if (this.session.status === 'error') {
            this.message.append(element('span', '', '保存失败，本地内容仍保留。'), button('重试保存', () => { void this.flush(); }), button('预览本地内容', () => this.preview(this.history.text)));
        } else {
            if(this.history.doc.warnings.length)this.message.append(element('span','',this.history.doc.warnings.join('；')));
            if(this.archivedRecovery)this.message.append(element('span','','本机保留了一份先前冲突内容。'),button('预览上次冲突内容',()=>this.preview(this.archivedRecovery ?? '')),
                button('恢复上次冲突内容',()=>{const text=this.archivedRecovery;if(!text)return;try{this.history.reset(text);this.session.update(text);this.persistRecovery();this.render();}catch(error){this.message.append(element('span','',String(error)));}}),
                button('清除冲突副本',()=>{this.options.archiveRecovery?.(null);this.archivedRecovery=null;this.renderRecovery();}));
        }
    }
    private preview(text: string): void {
        this.message.querySelector('.mt-recovery-preview')?.remove();
        const preview = element('textarea', 'mt-recovery-preview'); preview.readOnly = true; preview.value = text; preview.setAttribute('aria-label', '本地恢复内容'); this.message.append(preview); preview.focus(); preview.select();
    }
    private async copyLocal(): Promise<void> {
        try { await navigator.clipboard.writeText(this.history.text); this.message.append(element('span', '', '已复制本地内容。')); }
        catch { this.preview(this.history.text); }
    }
    private async reloadExternal(): Promise<void> {
        // Loading the disk never overwrites it. Retain the previous local text until explicitly discarded.
        this.external = this.session.lastExternal ?? this.external;
        if (this.external === null) {
            await this.options.process(text => { this.external = text; return text; });
        }
        const text = this.external; if (text === null) return;
        try {
            parseDocument(text,this.options.title);
            const local=this.history.text;this.options.archiveRecovery?.(local);this.archivedRecovery=local;
            this.history.reset(text);
            this.session.discardAndReload(text); this.external = null; this.recovery = null; this.render();
            this.message.append(element('span', '', '已载入磁盘版本，可预览或恢复先前冲突内容。'));
        } catch (e) { this.message.append(element('span', '', `载入失败：${String(e)}`)); }
    }
    private async openMarkdown(): Promise<void> {
        if (!await this.flush()) { this.message.append(element('span', '', '请先解决保存问题，再切换到 Markdown。')); return; }
        await this.options.onMarkdown();
    }
    private render(): void {
        const active=this.root.ownerDocument.activeElement;
        const field=active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement?active:null;
        const restore=field&&this.inspector.contains(field)?{label:field.getAttribute('aria-label'),start:field.selectionStart,end:field.selectionEnd}:null;
        const valid = new Set(allNodes(this.history.doc).map(n => n.id));
        this.selected = new Set([...this.selected].filter(id => valid.has(id)));
        if (!this.selected.size) this.selected.add(this.history.doc.root.id);
        this.renderStatus(); this.renderRecovery(); this.renderCanvas(); this.renderInspector();
        if(restore){const input=Array.from(this.inspector.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')).find(el=>el.getAttribute('aria-label')===restore.label);input?.focus({preventScroll:true});if(input&&restore.start!==null&&restore.end!==null)input.setSelectionRange(restore.start,restore.end);}
    }
    private select(id: string, event?: MouseEvent): void {
        this.commitInspector();
        if (this.relationFrom) {
            const from = this.relationFrom; this.relationFrom = null;
            let createdId: string | null = null;
            this.change(doc => { createdId = setRelationship(doc, from, id, '关系').id; });
            this.relationId = createdId; this.renderInspector(); return;
        }
        this.relationId = null;
        if (this.multi || event?.ctrlKey || event?.metaKey || event?.shiftKey) {
            if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
        } else this.selected = new Set([id]);
        this.renderCanvas(); this.renderInspector();
    }
    private layout(): { nodes: PositionedNode[]; width: number; height: number } {
        const nodes: PositionedNode[] = []; let row = 0;
        const visit = (node: MindmapNode, depth: number, summary: boolean): number => {
            const start = row;
            const children = node.folded ? [] : node.children;
            const ys = children.map(child => visit(child, depth + 1, summary));
            if (!ys.length) row++;
            const y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : start * ROW + 110;
            nodes.push({node, x: depth * COLUMN + 36, y, summary}); return y;
        };
        visit(this.history.doc.root, 0, false);
        for (const summary of this.history.doc.summaries) {
            const parent = nodes.find(p => p.node.id === summary.parentId);
            if (!parent || parent.node.folded) continue;
            row++; visit(summary.root, Math.round((parent.x - 36) / COLUMN) + 1, true);
        }
        return {nodes, width: Math.max(600,...nodes.map(p => p.x + NODE_WIDTH + 70)), height: Math.max(360,row * ROW + 80)};
    }
    private clearRendered(): void { for (const dispose of this.disposers.splice(0)) dispose(); }
    private renderCanvas(): void {
        this.clearRendered(); this.stage.replaceChildren(); this.viewport.classList.toggle('mt-outline', this.mode === 'outline');
        this.stage.style.removeProperty('transform'); this.stage.style.removeProperty('width'); this.stage.style.removeProperty('height');
        if (this.mode === 'outline') {
            const list = element('div', 'mt-outline-list');
            const visit = (node: MindmapNode, level: number, summary: boolean) => {
                const row = element('div', 'mt-outline-row'); row.style.paddingLeft = `${level * 20}px`;
                row.append(button(node.folded ? '展开分支' : '收起分支', () => this.change(doc => setCollapsed(doc,node.id,!node.folded)), 'mt-fold'));
                const label = this.nodeButton(node, summary); row.append(label); list.append(row);
                if (!node.folded) for (const child of node.children) visit(child,level+1,summary);
            };
            visit(this.history.doc.root,0,false);
            for (const summary of this.history.doc.summaries) {
                const parent = findNode(this.history.doc,summary.parentId);
                list.append(element('div','mt-summary-caption',`总括范围：${parent?.text ?? ''} / ${findNode(this.history.doc,summary.from)?.text ?? ''} → ${findNode(this.history.doc,summary.to)?.text ?? ''}`));
                visit(summary.root,1,true);
            }
            this.stage.append(list); return;
        }
        const layout = this.layout();
        this.stage.style.width = `${layout.width * this.zoom}px`; this.stage.style.height = `${layout.height * this.zoom}px`;
        const canvas = element('div','mt-canvas'); canvas.style.width = `${layout.width}px`; canvas.style.height = `${layout.height}px`; canvas.style.transform = `scale(${this.zoom})`; this.stage.append(canvas);
        const svg = svgElement('svg', {width:String(layout.width),height:String(layout.height),class:'mt-connectors','aria-label':'节点连线'}); canvas.append(svg);
        const positions = new Map(layout.nodes.map(p => [p.node.id,p]));
        const connect = (from: PositionedNode,to: PositionedNode,cls: string) => {
            const x1 = from.x + NODE_WIDTH, y1 = from.y, x2 = to.x,y2 = to.y;
            svg.append(svgElement('path',{d:`M ${x1} ${y1} C ${x1+40} ${y1} ${x2-40} ${y2} ${x2} ${y2}`,class:cls}));
        };
        for (const position of layout.nodes) {
            const parent = position.node.parent ? positions.get(position.node.parent.id) : undefined;
            if (parent) connect(parent,position,'mt-tree-line');
            const label = this.nodeButton(position.node,position.summary); label.style.left = `${position.x}px`; label.style.top = `${position.y-25}px`; canvas.append(label);
        }
        for (const summary of this.history.doc.summaries) {
            const from = positions.get(summary.from), to = positions.get(summary.to), target = positions.get(summary.root.id);
            if (!from || !to || !target) continue;
            const x = Math.max(from.x,to.x)+NODE_WIDTH+18;
            svg.append(svgElement('path',{d:`M ${x-8} ${Math.min(from.y,to.y)-28} H ${x} V ${Math.max(from.y,to.y)+28} H ${x-8}`,class:'mt-summary-line'}));
            connect(to,target,'mt-summary-line');
        }
        for (const relation of this.history.doc.relationships) {
            const from = positions.get(relation.from), to = positions.get(relation.to); if (!from || !to) continue;
            const x1=from.x+NODE_WIDTH/2,y1=from.y-28,x2=to.x+NODE_WIDTH/2,y2=to.y-28;
            const top=Math.max(22,Math.min(y1,y2)-42);
            const line=svgElement('path',{d:`M ${x1} ${y1} C ${x1} ${top} ${x2} ${top} ${x2} ${y2}`,class:'mt-relation-line'}); svg.append(line);
            const label=svgElement('text',{x:String((x1+x2)/2),y:String(top+6),class:'mt-relation-label',tabindex:'0',role:'button','aria-label':`编辑关联线：${relation.text || '关系'}`}); label.textContent=relation.text || '关系';
            const edit=()=>{this.commitInspector();this.relationId=relation.id;this.renderInspector();this.inspector.querySelector<HTMLInputElement>('[aria-label="关系文字"]')?.focus();};
            label.addEventListener('click',edit);label.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')edit();}); svg.append(label);
        }
    }
    private nodeButton(node: MindmapNode, summary: boolean): HTMLButtonElement {
        const label = button(`节点：${node.text || '未命名'}`, () => {}, 'mt-node'); label.replaceChildren();
        label.dataset.nodeId=node.id;label.classList.toggle('is-selected',this.selected.has(node.id));label.classList.toggle('is-summary',summary);
        label.setAttribute('aria-pressed',String(this.selected.has(node.id)));
        const text = element('span','mt-node-text');label.append(text);
        if (this.options.renderMarkdown) { const dispose=this.options.renderMarkdown(node.text || '未命名',text);if(dispose)this.disposers.push(dispose); }
        else text.textContent=node.text || '未命名';
        const comments=this.nodeComments(node);
        if(comments.length) { label.append(element('span','mt-comment-count',`批注 ${comments.length}`)); const mark=comments.find(c=>c.markType==='text-color'); if(mark)label.style.setProperty('--mt-annotation-color',mark.color || '#ef4444'); }
        if(node.folded&&node.children.length)label.append(element('span','mt-fold-count',`+${node.children.length}`));
        label.addEventListener('click',e=>this.select(node.id,e));label.addEventListener('dblclick',()=>{this.selected=new Set([node.id]);this.renderInspector();this.focusEditor();});return label;
    }
    private nodeComments(node: MindmapNode): DiagramComment[] {
        return this.options.getComments().filter(comment => !comment.isOrphaned && (
            node.sourceLine !== undefined && comment.startLine <= (node.sourceEndLine ?? node.sourceLine) && comment.endLine >= node.sourceLine));
    }
    private field(label: string,value: string, multiline=false): HTMLInputElement | HTMLTextAreaElement {
        const wrapper=element('label','mt-field');wrapper.append(element('span','',label));
        const input=multiline?element('textarea'):element('input');input.value=value;input.setAttribute('aria-label',label);
        input.disabled=this.session.status==='conflict'||!!this.recovery;
        input.addEventListener('compositionstart',()=>{this.composing=true;});input.addEventListener('compositionend',()=>{this.composing=false;});
        input.addEventListener('input',()=>{this.status.textContent='未保存';this.status.dataset.state='dirty';this.scheduleSave();});
        wrapper.append(input);this.inspector.append(wrapper);return input;
    }
    private renderInspector(): void {
        for(const dispose of this.inspectorDisposers.splice(0))dispose();
        this.pendingInspector=null;
        this.inspector.replaceChildren();
        const relation=this.history.doc.relationships.find(r=>r.id===this.relationId);
        if(relation){
            this.inspector.append(element('h3','','编辑关联线'));
            this.inspector.append(element('p','',`${findNode(this.history.doc,relation.from)?.text ?? ''} → ${findNode(this.history.doc,relation.to)?.text ?? ''}`));
            const text=this.field('关系文字',relation.text);
            this.pendingInspector=doc=>{if(text.value!==relation.text)setRelationship(doc,relation.from,relation.to,text.value,relation.id);};
            this.inspector.append(button('保存关系文字',()=>this.change(doc=>{setRelationship(doc,relation.from,relation.to,text.value,relation.id);})),button('删除关联线',()=>this.change(doc=>removeRelationship(doc,relation.id))));return;
        }
        const node=this.active();if(!node)return;
        this.inspector.append(element('h3','',this.selected.size>1?`已选 ${this.selected.size} 个节点`:'编辑节点'));
        const text=this.field('节点文字',node.text);
        const apply=()=>this.change(doc=>renameNode(doc,node.id,text.value));
        text.addEventListener('keydown',e=>{const key=e as KeyboardEvent;if(key.key==='Enter'&&!key.shiftKey&&!key.isComposing){key.preventDefault();apply();}});
        this.inspector.append(button('应用文字',apply));
        const note=this.field('节点备注',node.note,true);
        this.pendingInspector=doc=>{if(text.value!==node.text)renameNode(doc,node.id,text.value);if(note.value!==node.note){const target=findNode(doc,node.id);if(target)target.note=note.value;}};
        this.inspector.append(button('保存备注',()=>this.change(doc=>{const target=findNode(doc,node.id);if(target)target.note=note.value;})));
        const actions=element('div','mt-node-actions');
        actions.append(button('上移',()=>this.change(doc=>moveNode(doc,node.id,-1))),button('下移',()=>this.change(doc=>moveNode(doc,node.id,1))),
            button('降级',()=>this.change(doc=>indentNode(doc,node.id))),button('升级',()=>this.change(doc=>outdentNode(doc,node.id))),
            button('删除节点',()=>this.change(doc=>removeNode(doc,node.id))));this.inspector.append(actions);
        const summary=this.history.doc.summaries.find(s=>s.root.id===node.id);
        if(summary)this.inspector.append(element('p','mt-hint','这是总括节点，可用“添加子节点”继续分点。'),button('删除总括',()=>this.change(doc=>removeSummary(doc,summary.id))));
        for(const relation of this.history.doc.relationships.filter(r=>r.from===node.id||r.to===node.id))this.inspector.append(button(`编辑关系：${relation.text || '关系'}`,()=>{this.commitInspector();this.relationId=relation.id;this.renderInspector();}));
        const comments=element('section','mt-comments');comments.append(element('h4','','原批注'));
        for(const comment of this.nodeComments(node)){
            const item=element('div','mt-comment');item.append(element('blockquote','',comment.selectedText));
            const content=element('div');if(this.options.renderMarkdown){const dispose=this.options.renderMarkdown(comment.comment,content);if(dispose)this.inspectorDisposers.push(dispose);}else content.textContent=comment.comment;
            item.append(content,button('查看原批注',()=>this.options.onOpenComment(comment.timestamp)));comments.append(item);
        }
        if(comments.children.length===1)comments.append(element('p','mt-hint','当前节点暂无原批注。'));
        this.inspector.append(comments);
    }
    private commitInspector(): void {if(this.pendingInspector)this.change(()=>{});}
    private nextMatch(): void {
        this.commitInspector();
        const query=this.query.trim().toLocaleLowerCase();if(!query)return;
        const matches=allNodes(this.history.doc).filter(n=>`${n.text}\n${n.note}`.toLocaleLowerCase().includes(query));
        if(!matches.length){this.message.textContent='没有匹配节点。';return;}
        this.matchIndex=(this.matchIndex+1)%matches.length;const match=matches[this.matchIndex];
        const ancestors=new Set<string>();let branch:MindmapNode|undefined=match;const visited=new Set<string>();
        while(branch&&!visited.has(branch.id)){
            visited.add(branch.id);while(branch.parent){branch=branch.parent;if(branch.folded)ancestors.add(branch.id);}
            const summary=this.history.doc.summaries.find(s=>s.root.id===branch?.id);
            branch=summary?findNode(this.history.doc,summary.parentId):undefined;if(branch?.folded)ancestors.add(branch.id);
        }
        if(ancestors.size)this.change(doc=>ancestors.forEach(id=>setCollapsed(doc,id,false)));
        this.selected=new Set([match.id]);this.renderCanvas();this.renderInspector();this.message.textContent=`搜索结果 ${this.matchIndex+1} / ${matches.length}`;this.centerSelection();
    }
    private centerSelection(): void { const id=[...this.selected][0];const el=Array.from(this.stage.querySelectorAll<HTMLElement>('[data-node-id]')).find(el=>el.dataset.nodeId===id);el?.scrollIntoView({block:'center',inline:'center'}); }
    private fit(): void {const layout=this.layout();this.zoom=Math.max(.25,Math.min(1,(this.viewport.clientWidth-30)/layout.width,(this.viewport.clientHeight-30)/layout.height));this.renderCanvas();this.viewport.scrollTo(0,0);}
    private readonly keydown=(event:KeyboardEvent):void=>{
        const target=event.target as HTMLElement;if(target.closest('input,textarea,[contenteditable="true"]'))return;
        const mod=event.ctrlKey||event.metaKey;
        if(mod&&event.key.toLowerCase()==='z'){event.preventDefault();this.navigateHistory(event.shiftKey);return;}
        if(mod&&event.key.toLowerCase()==='y'){event.preventDefault();this.navigateHistory(true);return;}
        if(mod&&event.key.toLowerCase()==='s'){event.preventDefault();void this.flush();return;}
        if(mod&&event.key.toLowerCase()==='f'){event.preventDefault();this.toolbar.querySelector<HTMLInputElement>('.mt-search')?.focus();return;}
        if(event.key==='Escape'){this.relationFrom=null;this.multi=false;this.message.textContent='';return;}
        if(event.key==='Tab'&&target.closest('.mt-viewport')){event.preventDefault();if(event.shiftKey)this.change(doc=>{const node=this.active(doc);if(node)outdentNode(doc,node.id);});else this.add(false);return;}
        if(event.key==='Enter'&&target.closest('.mt-node')){event.preventDefault();this.add(true);return;}
        if(event.key==='F2'){event.preventDefault();this.focusEditor();return;}
        if((event.key==='Delete'||event.key==='Backspace')&&target.closest('.mt-node')){event.preventDefault();this.change(doc=>{const node=this.active(doc);if(node)removeNode(doc,node.id);});}
    };
    destroy(): void { this.disposed=true;if(this.timer)window.clearTimeout(this.timer);this.root.removeEventListener('keydown',this.keydown);this.clearRendered();for(const dispose of this.inspectorDisposers.splice(0))dispose();this.root.replaceChildren(); }
}
