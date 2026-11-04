const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const entry = path.join(__dirname, '../src/enhancements.ts');
let core = {};
if (fs.existsSync(entry)) {
  const compiled = require('esbuild').transformSync(fs.readFileSync(entry, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(mod, mod.exports, require);
  core = mod.exports;
}
const record = (overrides = {}) => ({ filePath: 'note.md', selectedText: '原文', comment: '正文', timestamp: 123, startLine: 0, startChar: 0, endLine: 0, endChar: 2, selectedTextHash: 'old', ...overrides });
test('style and exact color combine; legacy defaults and query remain supported', () => {
  assert.equal(typeof core.filterComments, 'function');
  const entries = [record(), record({ timestamp: 124, markType: 'underline', color: '#EC4899' }), record({ timestamp: 125, color: '#f59e0b' })];
  assert.deepEqual(core.filterComments(entries, { markType: 'underline', color: '#ec4899' }, '#ffc800', '').map(x => x.timestamp), [124]);
  assert.deepEqual(core.filterComments(entries, { markType: 'highlight', color: '#FFC800' }, '#ffc800', '正文').map(x => x.timestamp), [123]);
  assert.equal(entries.length, 3);
  assert.equal(core.filterComments(entries, { orphanOnly: true }, '#ffc800', '').length, 0);
});
test('navigation clamps at boundaries and handles removed active entry', () => {
  assert.equal(typeof core.navigation, 'function');
  const entries = [record(), record({ timestamp: 124 })];
  assert.deepEqual(core.navigation(entries, null, 1), { index: 0, total: 2, timestamp: 123 });
  assert.equal(core.navigation(entries, 124, 1).timestamp, 124);
  assert.equal(core.navigation(entries, 123, -1).timestamp, 123);
  assert.equal(core.navigation(entries, 999, -1).timestamp, 123);
  assert.deepEqual(core.navigation([], null, 1), { index: -1, total: 0, timestamp: null });
});
test('rebinding preserves annotation fields and anchors the selected repeated occurrence', () => {
  assert.equal(typeof core.rebindComment, 'function');
  const old = record({ color: '#ec4899', markType: 'underline', isOrphaned: true, extra: 'keep' });
  const text = '# 一\n原文\n# 二\n新文 新文';
  const from = text.lastIndexOf('新文');
  const bound = core.rebindComment(old, text, from, from + 2, 'newhash');
  assert.equal(bound.comment, old.comment); assert.equal(bound.color, old.color); assert.equal(bound.timestamp, old.timestamp);
  assert.equal(bound.extra, 'keep'); assert.equal(bound.selectedTextHash, 'newhash');
  assert.equal(bound.occurrenceIndex, 1); assert.deepEqual(bound.headingPath, ['二']);
  assert.equal(bound.absoluteFrom, from); assert.equal(bound.isOrphaned, false);
  assert.equal(old.isOrphaned, true);
  assert.throws(() => core.rebindComment(old, text, 0, 0, 'hash'));
  assert.throws(() => core.rebindComment(old, text, -1, 2, 'hash'));
});
test('draft identities separate repeated quotes and existing annotation edits', () => {
  assert.equal(typeof core.draftKey, 'function');
  assert.notEqual(core.draftKey('a.md', '原文', 1, 3), core.draftKey('a.md', '原文', 8, 10));
  assert.equal(core.draftKey('a.md', 'before', 1, 3, 123), core.draftKey('a.md', 'after', 8, 10, 123));
});
test('failed legacy edits and rebindings restore optional fields exactly', () => {
  assert.equal(typeof core.restoreComment, 'function');
  const old = record();
  const snapshot = { ...old };
  Object.assign(old, { markType: 'bold', absoluteFrom: 99, contextBefore: 'new', isOrphaned: false });
  core.restoreComment(old, snapshot);
  assert.deepEqual(old, snapshot);
  assert.equal(Object.hasOwn(old, 'markType'), false);
  assert.equal(Object.hasOwn(old, 'absoluteFrom'), false);
});
test('drafts survive store reconstruction, failed writes preserve prior drafts', () => {
  assert.equal(typeof core.DraftStore, 'function');
  const map = new Map(); let fail = false;
  const storage = { getItem: k => map.get(k) ?? null, setItem: (k,v) => { if (fail) throw Error('quota'); map.set(k,v); } };
  const store = new core.DraftStore(storage, 'vault');
  const draft = { key: 'a', filePath: 'a.md', selectedText: '原文', from: 1, to: 3, commentText: '未保存', color: '#ffc800', markType: 'highlight', updatedAt: 1 };
  store.put(draft);
  assert.equal(new core.DraftStore(storage, 'vault').list()[0].commentText, '未保存');
  assert.equal(new core.DraftStore(storage, 'other-vault').list().length, 0);
  fail = true; assert.throws(() => store.put({ ...draft, commentText: 'new' }), /quota/);
  assert.equal(store.list()[0].commentText, '未保存');
  fail = false; store.remove('a'); assert.equal(store.list().length, 0);
});
test('corrupt draft storage is reported and never overwritten', () => {
  assert.equal(typeof core.DraftStore, 'function');
  let raw = '{bad';
  const store = new core.DraftStore({ getItem: () => raw, setItem: (_, value) => { raw = value; } }, 'vault');
  assert.throws(() => store.list()); assert.throws(() => store.put({ key: 'a' }));
  assert.equal(raw, '{bad');
});
