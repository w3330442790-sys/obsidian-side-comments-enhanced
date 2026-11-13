const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const code = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../src/block-drag.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(mod, mod.exports, require);

const { BlockIndex, applyEdits, blockAtLine, mapPlanRange, planBlockMove } = mod.exports;

function lines(text) { return text.split('\n'); }
function span(text, needle, occurrence = 0) {
  let index = -1;
  for (let n = 0; n <= occurrence; n++) index = text.indexOf(needle, index + 1);
  if (index < 0) throw new Error(`missing ${needle}`);
  return { from: index, to: index + needle.length };
}

test('heading block owns its section and stops at the next same-level heading', () => {
  const source = '# A\n\npara\n\n## A1\n\nx\n\n# B\n\ny\n';
  const first = blockAtLine(source, 0);
  assert.deepEqual([first.kind, first.startLine, first.endLine, first.level], ['heading', 0, 6, 1]);
  const nested = blockAtLine(source, 4);
  assert.deepEqual([nested.startLine, nested.endLine, nested.level], [4, 6, 2]);
  const second = blockAtLine(source, 8);
  assert.deepEqual([second.startLine, second.endLine], [8, 10]);
});

test('list item block owns nested children and continuation lines', () => {
  const source = '- one\n  - child\n    text\n- two\n\nafter\n';
  const first = blockAtLine(source, 0);
  assert.deepEqual([first.kind, first.startLine, first.endLine, first.level], ['list', 0, 2, 0]);
  const child = blockAtLine(source, 1);
  assert.deepEqual([child.startLine, child.endLine, child.level], [1, 2, 2]);
  const second = blockAtLine(source, 3);
  assert.deepEqual([second.startLine, second.endLine], [3, 3]);
});

test('fenced code and tables stay inside one block', () => {
  const source = '# T\n\n```js\n# not a heading\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n';
  const fence = blockAtLine(source, 2);
  assert.deepEqual([fence.kind, fence.startLine, fence.endLine], ['code', 2, 4]);
  const table = blockAtLine(source, 6);
  assert.deepEqual([table.kind, table.startLine, table.endLine], ['table', 6, 8]);
});

test('hidden markdown-tool metadata is not part of the last section and is never moved', () => {
  const source = '# T\n\nbody\n<!-- markdown-tool:v1 abc -->\n';
  assert.equal(blockAtLine(source, 0).endLine, 2);
  assert.equal(planBlockMove(source, blockAtLine(source, 3), blockAtLine(source, 0), 'before'), null);
  assert.equal(blockAtLine(source, 3).kind, 'other');
});

test('moving a heading section after another as a child nests it and keeps the paragraph first', () => {
  const source = '# A\n\na\n\n# B\n\nb\n';
  const moved = blockAtLine(source, 0);
  const target = blockAtLine(source, 4);
  const plan = planBlockMove(source, moved, target, 'child');
  assert.ok(plan);
  assert.equal(plan.text, '# B\n\nb\n\n## A\n\na\n');
  assert.equal(plan.levelDelta, 1);
  assert.equal(applyEdits(source, plan.edits), plan.text);
});

test('dropping a heading after another heading keeps the same level', () => {
  const source = '# A\n\na\n\n# B\n\nb\n';
  const plan = planBlockMove(source, blockAtLine(source, 0), blockAtLine(source, 4), 'after');
  assert.ok(plan);
  assert.equal(plan.text, '# B\n\nb\n\n# A\n\na\n');
  assert.equal(plan.levelDelta, 0);
});

test('dropping a heading inside another heading nests it one level and shifts its child headings', () => {
  const source = '# A\n\n## A1\n\na1\n\n# B\n\nb\n';
  const moved = blockAtLine(source, 0);
  const target = blockAtLine(source, 6);
  const plan = planBlockMove(source, moved, target, 'child');
  assert.ok(plan);
  assert.equal(plan.levelDelta, 1);
  assert.equal(plan.text, '# B\n\nb\n\n## A\n\n### A1\n\na1\n');
  assert.equal(applyEdits(source, plan.edits), plan.text);
});

test('list reordering keeps nested children and does not touch sibling markers', () => {
  const source = '- one\n  - child\n- two\n- three\n';
  const moved = blockAtLine(source, 0);
  const target = blockAtLine(source, 3);
  const plan = planBlockMove(source, moved, target, 'after');
  assert.ok(plan);
  assert.equal(plan.text, '- two\n- three\n- one\n  - child\n');
});

test('dropping a list item onto another nests it with two extra spaces', () => {
  const source = '- one\n  - child\n- two\n';
  const moved = blockAtLine(source, 0);
  const target = blockAtLine(source, 2);
  const plan = planBlockMove(source, moved, target, 'child');
  assert.ok(plan);
  assert.equal(plan.levelDelta, 2);
  assert.equal(plan.text, '- two\n  - one\n    - child\n');
});

test('no-op drops are rejected', () => {
  const source = '- one\n- two\n';
  const first = blockAtLine(source, 0);
  assert.equal(planBlockMove(source, first, first, 'after'), null);
  assert.equal(planBlockMove(source, first, blockAtLine(source, 1), 'before'), null);
  assert.equal(planBlockMove(source, first, blockAtLine(source, 1), 'child')?.text, '- two\n  - one\n');
});

test('annotations inside a moved block follow the text and others shift', () => {
  const source = '# A\n\nalpha note\n\n# B\n\nbeta note\n';
  const before = span(source, 'alpha note');
  const after = span(source, 'beta note');
  const plan = planBlockMove(source, blockAtLine(source, 0), blockAtLine(source, 4), 'after');
  assert.ok(plan);
  const movedAlpha = mapPlanRange(plan, before.from, before.to);
  const movedBeta = mapPlanRange(plan, after.from, after.to);
  assert.ok(movedAlpha && movedBeta);
  assert.equal(plan.text.slice(movedAlpha.from, movedAlpha.to), 'alpha note');
  assert.equal(plan.text.slice(movedBeta.from, movedBeta.to), 'beta note');
  assert.equal(plan.text.indexOf('beta note') < plan.text.indexOf('alpha note'), true);
});

test('annotation offsets in a rewritten heading marker have no stable identity', () => {
  const source = '# A\n\nx\n\n# B\n';
  const marker = span(source, '# A');
  const plan = planBlockMove(source, blockAtLine(source, 0), blockAtLine(source, 4), 'child');
  assert.ok(plan);
  assert.equal(mapPlanRange(plan, marker.from, marker.to), null);
});

test('paragraph reordering keeps trailing text intact', () => {
  const source = 'first\n\nsecond\n\nthird\n';
  const plan = planBlockMove(source, blockAtLine(source, 2), blockAtLine(source, 0), 'before');
  assert.ok(plan);
  assert.equal(plan.text, 'second\n\nfirst\n\nthird\n');
});

test('documents without a trailing newline move blocks without losing text', () => {
  const source = '# A\n# B';
  const plan = planBlockMove(source, blockAtLine(source, 0), blockAtLine(source, 1), 'after');
  assert.ok(plan);
  assert.equal(plan.text, '# B\n\n# A');
  assert.equal(applyEdits(source, plan.edits), plan.text);
});

test('blank lines around a dropped block are not duplicated', () => {
  const source = '# A\n\na\n\n# B\n\nb\n';
  const plan = planBlockMove(source, blockAtLine(source, 4), blockAtLine(source, 0), 'before');
  assert.ok(plan);
  assert.equal(plan.text, '# B\n\nb\n\n# A\n\na\n');
});

test('block index neighbours expose sibling and parent for keyboard commands', () => {
  const source = '# A\n\n## A1\n\ntext\n\n## A2\n\n- item\n  - child\n- item2\n';
  const index = new BlockIndex(source);
  const nested = index.neighbours(index.at(2));
  assert.equal(nested.parent?.startLine, 0);
  const mid = index.neighbours(index.at(6));
  assert.equal(mid.sibling?.startLine, 2);
  const listChild = index.neighbours(index.at(9));
  assert.equal(listChild.parent?.startLine, 8);
  const secondItem = index.neighbours(index.at(10));
  assert.equal(secondItem.sibling?.startLine, 8);
});

test('a caret position resolves to the block that owns it', () => {
  const source = '- a\n  continuation\n- b\n';
  assert.equal(blockAtLine(source, 1).startLine, 0);
  assert.deepEqual(lines(blockAtLine(source, 1).kind) && blockAtLine(source, 1).kind, 'list');
});
