const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
function load(file) {
  const entry = path.join(__dirname, '../src', file);
  if (!fs.existsSync(entry)) return {};
  const code = esbuild.buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
  const mod = { exports: {} }; new Function('module', 'exports', 'require', code)(mod, mod.exports, require); return mod.exports;
}
const tools = load('selection-tools.ts');
const enhancements = load('enhancements.ts');
const comment = { filePath: 'note.md', selectedText: '原文', comment: '保留的批注', timestamp: 1, startLine: 0, startChar: 0, endLine: 0, endChar: 2, selectedTextHash: 'hash' };
test('foreground mark provides an opaque text color independent of background opacity', () => {
  assert.equal(typeof tools.markPresentation, 'function');
  const mark = tools.markPresentation({ ...comment, markType: 'text-color', color: '#DC2626' }, 0);
  assert.match(mark.className, /sidenote-mark-text-color/);
  assert.match(mark.style, /--sidenote-text-color: #DC2626/);
  assert.match(mark.style, /rgba\(220, 38, 38, 0\)/);
});
test('legacy highlights retain fallback and untrusted colors never become CSS', () => {
  assert.equal(typeof tools.markPresentation, 'function');
  const mark = tools.markPresentation(comment, .2);
  assert.match(mark.className, /sidenote-mark-highlight/);
  assert.match(mark.style, /255, 200, 0/);
  const invalid = tools.markPresentation({ ...comment, markType: 'text-color', color: 'red;position:fixed' }, .2);
  assert.doesNotMatch(invalid.style, /position/);
  assert.match(invalid.style, /--sidenote-text-color: #dc2626/);
});
test('cleared markers are separate from highlights and keep annotation metadata', () => {
  assert.equal(typeof tools.markPresentation, 'function');
  const cleared = { ...comment, markType: 'none' };
  assert.match(tools.markPresentation(cleared, .2).className, /sidenote-mark-none/);
  assert.equal(cleared.comment, '保留的批注');
  assert.equal(enhancements.filterComments([cleared, comment], { markType: 'none' }, '#ffc800').length, 1);
});
test('foreground and cleared-marker drafts survive reconstruction', () => {
  const map = new Map(); const storage = { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) };
  const store = new enhancements.DraftStore(storage, 'test');
  for (const markType of ['text-color', 'none']) {
    const draft = { key: markType, filePath: 'note.md', selectedText: '原文', from: 0, to: 2, commentText: '保留的批注', color: '#dc2626', markType, updatedAt: 1 };
    store.put(draft);
  }
  assert.deepEqual(new enhancements.DraftStore(storage, 'test').list().map(d => d.markType), ['text-color', 'none']);
});
test('Word export uses foreground color without introducing background shading', () => {
  const entry = path.join(__dirname, '../src/wordExporter.ts');
  const result = esbuild.buildSync({ stdin: { contents: fs.readFileSync(entry, 'utf8') + '\nexport { runOptionsFor };', resolveDir: path.dirname(entry), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['docx'] });
  const mod = { exports: {} }; new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require);
  const red = mod.exports.runOptionsFor({}, [{ comment: { ...comment, markType: 'text-color', color: '#dc2626' } }]);
  assert.equal(red.color, 'DC2626'); assert.equal(red.shading, undefined);
  const clear = mod.exports.runOptionsFor({}, [{ comment: { ...comment, markType: 'none' } }]);
  assert.equal(clear.color, undefined); assert.equal(clear.shading, undefined);
  const legacy = mod.exports.runOptionsFor({}, [{ comment }]);
  assert.deepEqual(legacy.shading, { fill: 'FFC800' });
});
