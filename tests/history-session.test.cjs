const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
function bundle(entry) {
  const code = esbuild.buildSync({
    entryPoints: [path.join(root, entry)],
    bundle: true, write: false, platform: 'node', format: 'cjs',
  }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}

const { MindmapHistory } = bundle('src/mindmap/session.ts');
const { renameNode, addChild, parseDocument, serializeDocument } = bundle('src/mindmap/model.ts');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('undo history never reaches the Markdown file', () => {
  const source = '# Title\n\nOriginal line\n';
  const history = new MindmapHistory(source);
  history.edit(doc => renameNode(doc, doc.root.id, 'Renamed once'));
  history.edit(doc => renameNode(doc, doc.root.id, 'Renamed twice'));
  assert.equal(history.canUndo, true);
  assert.equal(history.text.includes('Renamed twice'), true);
  assert.equal(history.text.includes('Renamed once'), false);
  assert.equal(history.text.includes('# Title'), false);
  // Body notes stay in the current document; only superseded undo states disappear.
  assert.equal(history.text.includes('Original line'), true);

  const serialized = serializeDocument(history.doc);
  const match = /<!-- markdown-tool:v1 ([^\s]+) -->/.exec(serialized);
  assert.ok(match, 'document should keep its versioned metadata comment');
  const metadata = JSON.parse(decodeURIComponent(match[1]));
  assert.deepEqual(Object.keys(metadata).sort(), ['identities', 'relationships', 'summaries', 'version']);
  const metadataText = JSON.stringify(metadata);
  for (const stale of ['Renamed once', 'Original line', '# Title']) {
    assert.equal(metadataText.includes(stale), false, `metadata must not snapshot ${stale}`);
  }
});

test('history keeps exactly the current text plus bounded undo stacks', () => {
  const history = new MindmapHistory('# T\n');
  for (let index = 0; index < 5; index++) history.edit(doc => renameNode(doc, doc.root.id, `Step ${index}`));
  const snapshot = history.text;
  history.undo();
  assert.notEqual(history.text, snapshot);
  history.redo();
  assert.equal(history.text, snapshot);
  // The stacks are plain runtime arrays with a hard cap; nothing serializes them.
  assert.equal(Array.isArray(history.past), true);
  assert.equal(Array.isArray(history.future), true);
  assert.equal(history.past.length <= 100, true);
});

test('history state is not written by the session or the editor modules', () => {
  const session = read('src/mindmap/session.ts');
  assert.equal(/localStorage|saveData|adapter\.|vault\.|writeFile/.test(session), false);
  const editor = read('src/mindmap/editor.ts');
  assert.equal(/history\.(past|future)/.test(editor), false);
  assert.equal(/JSON\.stringify\([^)]*history/.test(editor), false);
  const view = read('src/mindmap/view.ts');
  assert.match(view, /runtime\.histories\.clear\(\)/);
  assert.match(view, /this\.runtime\.histories\.size>12/);
});

test('the plugin never stores undo stacks in plugin data or local storage', () => {
  const main = read('src/main.ts');
  assert.equal(/saveLocalStorage\([^)]*history/i.test(main), false);
  assert.equal(/undoHistory|historyStack|undoStack/.test(main), false);
});

test('drag and toolbar edits rely on the editor transaction history, not a persisted stack', () => {
  const drag = read('src/drag-handles.ts');
  assert.equal(/localStorage|saveData/.test(drag), false);
  const toolbar = read('src/markdown-toolbar.ts');
  assert.equal(/localStorage|saveData/.test(toolbar), false);
});
