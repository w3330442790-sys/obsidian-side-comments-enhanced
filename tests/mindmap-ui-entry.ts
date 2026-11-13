import 'obsidian';
import { DiagramEditor } from '../src/mindmap/editor';
const w = window as unknown as Record<string, any>;
w.setupDiagram = (source = '# 项目\n\n- 甲\n- 乙\n') => {
  w.diagram?.destroy(); document.body.replaceChildren();
  const root = document.createElement('main'); document.body.append(root);
  w.disk = source; w.fail = false; w.writes = 0;
  w.diagram = new DiagramEditor(root, {
    source, title: '项目',
    process: async (transform: (text: string) => string) => {
      if (w.fail) throw Error('模拟保存失败');
      const next = transform(w.disk); w.disk = next; w.writes++; return next;
    },
    getComments: () => [{ timestamp: 1, selectedText: '甲', comment: '原有批注', startLine: 2, endLine: 2, color: '#ef4444', markType: 'text-color' }],
    onOpenComment: () => { w.commentOpened = true; }, onMarkdown: async () => { w.openedMarkdown = true; },
    storeRecovery: (text: string | null) => { w.recovery = text; },
  });
};
