const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const code = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/commentManager.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const mod = { exports: {} }; new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const { CommentManager } = mod.exports;
function anchored(source, quote, overrides = {}) {
  const from = source.indexOf(quote), to = from + quote.length;
  const line = source.slice(0, from).split('\n');
  return { filePath: 'note.md', selectedText: quote, selectedTextHash: 'hash', comment: 'Keep body', timestamp: 123,
    startLine: line.length - 1, startChar: line.at(-1).length, endLine: line.length - 1, endChar: line.at(-1).length + quote.length,
    absoluteFrom: from, absoluteTo: to, occurrenceIndex: 0, contextBefore: source.slice(Math.max(0, from - 50), from), contextAfter: source.slice(to, to + 50), ...overrides };
}
test('swapping repeated-label branches moves annotation with its own following note', async () => {
  const before = '# T\n\n- Same\n  note A\n- Same\n  note B\n';
  const after = '# T\n\n- Same\n  note B\n- Same\n  note A\n';
  const comment = anchored(before, 'Same', { headingPath: ['T'] });
  await new CommentManager([comment]).updateCommentCoordinatesForFile(after, 'note.md');
  assert.equal(comment.isOrphaned, false);
  assert.equal(comment.absoluteFrom, after.lastIndexOf('Same'));
  assert.equal(comment.startLine, 4);
  assert.equal(comment.comment, 'Keep body'); assert.equal(comment.timestamp, 123);
});
test('legacy duplicate quotes cannot bind using old offset, line, occurrence or heading alone', async () => {
  const source = '# T\n\n- Same\n  note A\n- Same\n  note B\n';
  for (const coordinates of [{}, { absoluteFrom: undefined, absoluteTo: undefined }]) {
    const comment = anchored(source, 'Same', { contextBefore: undefined, contextAfter: undefined, headingPath: ['T'], ...coordinates });
    await new CommentManager([comment]).updateCommentCoordinatesForFile(source, 'note.md');
    assert.equal(comment.isOrphaned, true);
    assert.equal(comment.comment, 'Keep body');
  }
});
test('ambiguous equal contexts orphan instead of preferring the unchanged offset', async () => {
  const source = '- Same suffix\n- Same suffix\n';
  const comment = anchored(source, 'Same', { contextBefore: '- ', contextAfter: ' suffix' });
  await new CommentManager([comment]).updateCommentCoordinatesForFile(source, 'note.md');
  assert.equal(comment.isOrphaned, true);
});
test('lost duplicate context cannot fall back to the first occurrence', async () => {
  const before = '- Same\n  original note\n- Same\n  other note\n';
  const after = '- Same\n  changed note\n- Same\n  other note\n';
  const comment = anchored(before, 'Same');
  await new CommentManager([comment]).updateCommentCoordinatesForFile(after, 'note.md');
  assert.equal(comment.isOrphaned, true);
});
test('unique unchanged and relocated text retains existing anchoring behavior', async () => {
  const before = '# T\n\nUnique label\n';
  for (const after of [before, 'New paragraph\n' + before]) {
    const comment = anchored(before, 'Unique label', { contextBefore: undefined, contextAfter: undefined });
    await new CommentManager([comment]).updateCommentCoordinatesForFile(after, 'note.md');
    assert.equal(comment.isOrphaned, false);
    assert.equal(comment.absoluteFrom, after.indexOf('Unique label'));
  }
});
test('a neighbouring sibling is not identity evidence after branch movement', async () => {
  const before = '- Same\n- Same\n- Same\n  note B\n';
  const after = '- Same\n- Same\n  note B\n- Same\n';
  const comment = anchored(before, 'Same');
  await new CommentManager([comment]).updateCommentCoordinatesForFile(after, 'note.md');
  assert.equal(comment.isOrphaned, true);
});
