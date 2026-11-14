const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const obsidianStub = {
  setIcon: () => {},
  Notice: class {
    constructor(message) { this.message = message; }
  },
};

function load() {
  const entry = path.join(__dirname, '../src/markdown-toolbar.ts');
  const result = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['obsidian', '@codemirror/view'],
  });
  const mod = { exports: {} };
  const stubRequire = id => {
    if (id === 'obsidian') return obsidianStub;
    if (id === '@codemirror/view') return {};
    return require(id);
  };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, stubRequire);
  return mod.exports;
}

const toolbar = load();
const plan = (text, from, to, command) => toolbar.planMarkdownCommand(text, from, to, command);

/** Apply a plan with the same rules CodeMirror uses and validate its invariants. */
function applyPlan(text, result) {
  assert.ok(Array.isArray(result.changes), 'changes must be an array');
  let previousTo = 0;
  for (const change of result.changes) {
    assert.ok(Number.isInteger(change.from) && Number.isInteger(change.to), 'change positions must be integers');
    assert.ok(change.from >= 0 && change.to <= text.length, 'change must stay inside the original text');
    assert.ok(change.from <= change.to, 'change must not be inverted');
    assert.ok(change.from >= previousTo, 'changes must be sorted and non-overlapping');
    assert.equal(typeof change.insert, 'string');
    previousTo = change.to;
  }
  let output = text;
  for (const change of [...result.changes].sort((left, right) => right.from - left.from || right.to - left.to)) {
    output = output.slice(0, change.from) + change.insert + output.slice(change.to);
  }
  assert.ok(Number.isInteger(result.anchor) && Number.isInteger(result.head), 'selection must be integers');
  assert.ok(result.anchor >= 0 && result.head <= output.length, 'selection must stay inside the result');
  assert.ok(result.anchor <= result.head, 'selection must be ordered');
  return output;
}

test('bold, italic and highlight wrap selections and toggle back to identical text', () => {
  for (const [command, mark] of [['bold', '**'], ['italic', '*'], ['highlight', '==']]) {
    const text = 'hello world';
    const first = plan(text, 6, 11, command);
    const wrapped = applyPlan(text, first);
    assert.equal(wrapped, `hello ${mark}world${mark}`);
    assert.equal(wrapped.slice(first.anchor, first.head), 'world');
    const second = plan(wrapped, first.anchor, first.head, command);
    assert.equal(applyPlan(wrapped, second), text);
  }
});

test('wrap commands unwrap marks that are part of the selection', () => {
  const text = '**bold**';
  const result = plan(text, 0, text.length, 'bold');
  assert.equal(applyPlan(text, result), 'bold');
  assert.deepEqual([result.anchor, result.head], [0, 4]);
});

test('empty selections insert a mark pair and place the caret between the marks', () => {
  const bold = plan('abc', 1, 1, 'bold');
  assert.equal(applyPlan('abc', bold), 'a****bc');
  assert.deepEqual([bold.anchor, bold.head], [3, 3]);
  const code = plan('abc', 1, 1, 'inline-code');
  assert.equal(applyPlan('abc', code), 'a``bc');
  assert.deepEqual([code.anchor, code.head], [2, 2]);
});

test('headings replace the existing level instead of stacking and preserve indentation', () => {
  assert.equal(applyPlan('## Title', plan('## Title', 0, 8, 'h1')), '# Title');
  assert.equal(applyPlan('  ### Deep', plan('  ### Deep', 0, 10, 'h2')), '  ## Deep');
  assert.equal(applyPlan('#### Four', plan('#### Four', 0, 9, 'h3')), '### Four');
});

test('headings apply to every touched line and toggle off', () => {
  const text = '# One\nTwo\n### Three';
  const applied = applyPlan(text, plan(text, 0, text.length, 'h2'));
  assert.equal(applied, '## One\n## Two\n## Three');
  const toggled = applyPlan(applied, plan(applied, 0, applied.length, 'h2'));
  assert.equal(toggled, 'One\nTwo\nThree');
  assert.equal(applyPlan(toggled, plan(toggled, 0, toggled.length, 'h2')), applied);
});

test('bullet lists replace existing markers and toggle off without stacking', () => {
  const text = 'one\ntwo';
  const applied = applyPlan(text, plan(text, 0, text.length, 'bullet-list'));
  assert.equal(applied, '- one\n- two');
  assert.equal(applyPlan(applied, plan(applied, 0, applied.length, 'bullet-list')), text);
  const mixed = '* one\n1. two\n+ three\n- four';
  assert.equal(
    applyPlan(mixed, plan(mixed, 0, mixed.length, 'bullet-list')),
    '- one\n- two\n- three\n- four',
  );
});

test('ordered lists renumber existing markers and toggle off', () => {
  const text = '9. one\n- two\nthree';
  const numbered = applyPlan(text, plan(text, 0, text.length, 'number-list'));
  assert.equal(numbered, '1. one\n2. two\n3. three');
  assert.equal(applyPlan(numbered, plan(numbered, 0, numbered.length, 'number-list')), 'one\ntwo\nthree');
});

test('task lists replace list markers, keep checked items and toggle off', () => {
  const text = '- one\n* two\nplain';
  const applied = applyPlan(text, plan(text, 0, text.length, 'task-list'));
  assert.equal(applied, '- [ ] one\n- [ ] two\n- [ ] plain');
  assert.equal(applyPlan(applied, plan(applied, 0, applied.length, 'task-list')), 'one\ntwo\nplain');
  assert.equal(applyPlan('- [x] done', plan('- [x] done', 0, 10, 'task-list')), 'done');
});

test('blockquotes prefix every touched line and toggle one level off', () => {
  const text = 'one\ntwo';
  const quoted = applyPlan(text, plan(text, 0, text.length, 'quote'));
  assert.equal(quoted, '> one\n> two');
  assert.equal(applyPlan(quoted, plan(quoted, 0, quoted.length, 'quote')), text);
  assert.equal(applyPlan('> > deep', plan('> > deep', 0, 9, 'quote')), '> deep');
});

test('code blocks wrap selected lines and toggle off', () => {
  const text = 'hello';
  const first = plan(text, 0, text.length, 'code-block');
  const wrapped = applyPlan(text, first);
  assert.equal(wrapped, '```\nhello\n```');
  assert.equal(wrapped.slice(first.anchor, first.head), 'hello');
  const second = plan(wrapped, first.anchor, first.head, 'code-block');
  assert.equal(applyPlan(wrapped, second), text);
});

test('code blocks handle multi-line selections and empty caret insertion', () => {
  assert.equal(applyPlan('a\nb', plan('a\nb', 0, 3, 'code-block')), '```\na\nb\n```');
  const empty = plan('', 0, 0, 'code-block');
  const output = applyPlan('', empty);
  assert.equal(output, '```\n\n```');
  assert.deepEqual([empty.anchor, empty.head], [4, 4]);
  assert.equal(output.slice(0, 4), '```\n');
  assert.equal(output[4], '\n');
});

test('link wraps a selection and selects the placeholder URL; caret inserts an empty link', () => {
  const first = plan('docs', 0, 4, 'link');
  const output = applyPlan('docs', first);
  assert.equal(output, '[docs](https://)');
  assert.equal(output.slice(first.anchor, first.head), 'https://');
  const caret = plan('abc', 1, 1, 'link');
  const inserted = applyPlan('abc', caret);
  assert.equal(inserted, 'a[](https://)bc');
  assert.equal(inserted.slice(caret.anchor, caret.head), 'https://');
});

test('table insertion starts on a new line and keeps a surrounding blank line', () => {
  const text = 'before\n\nafter';
  const result = plan(text, 8, 8, 'table');
  const output = applyPlan(text, result);
  assert.equal(output, 'before\n\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\nafter');
  assert.equal(output.slice(result.anchor, result.anchor + 3), '列 1');
  assert.equal(
    applyPlan('intro', plan('intro', 5, 5, 'table')),
    'intro\n\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |',
  );
  assert.equal(
    applyPlan('hello', plan('hello', 2, 2, 'table')),
    '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\nhello',
  );
});

test('divider inserts its own line and places the cursor after it', () => {
  const eof = plan('abc', 3, 3, 'divider');
  assert.equal(applyPlan('abc', eof), 'abc\n---');
  assert.equal(eof.anchor, 7);
  assert.equal(eof.head, 7);
  const start = plan('abc', 0, 0, 'divider');
  const prefixed = applyPlan('abc', start);
  assert.equal(prefixed, '---\nabc');
  assert.equal(prefixed[start.anchor], 'a');
});

test('clear-marks strips wrappers and line markers without losing text', () => {
  const bold = plan('**bold**', 0, 8, 'clear-marks');
  assert.equal(applyPlan('**bold**', bold), 'bold');
  assert.deepEqual([bold.anchor, bold.head], [0, 4]);
  assert.equal(applyPlan('~~**bold**~~', plan('~~**bold**~~', 0, 12, 'clear-marks')), 'bold');
  const lines = '# One\n> Two\n- Three';
  assert.equal(applyPlan(lines, plan(lines, 0, lines.length, 'clear-marks')), 'One\nTwo\nThree');
  assert.deepEqual(plan('plain text', 0, 10, 'clear-marks').changes, []);
});

test('plans stay well-formed for randomized text and selections', () => {
  let seed = 20261113;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const alphabet = ['a', 'b', ' ', '\n', '*', '-', '>', '#', '`', '~', '='];
  const commands = toolbar.MARKDOWN_TOOLBAR_COMMANDS.map(entry => entry.command);
  for (let iteration = 0; iteration < 120; iteration++) {
    let text = '';
    const length = Math.floor(random() * 24);
    for (let index = 0; index < length; index++) text += alphabet[Math.floor(random() * alphabet.length)];
    const from = Math.floor(random() * (text.length + 5)) - 2;
    const to = Math.floor(random() * (text.length + 5)) - 2;
    for (const command of commands) applyPlan(text, plan(text, from, to, command));
  }
});

test('out-of-range and inverted selections are clamped safely', () => {
  const wrapped = plan('abc', -5, 99, 'bold');
  assert.equal(applyPlan('abc', wrapped), '**abc**');
  assert.deepEqual([wrapped.anchor, wrapped.head], [2, 5]);
  const swapped = plan('abc', 5, 1, 'italic');
  assert.equal(applyPlan('abc', swapped), 'a*bc*');
  const results = [
    wrapped,
    swapped,
    plan('abc', NaN, NaN, 'bold'),
    plan('abc', Infinity, -Infinity, 'divider'),
  ];
  for (const result of results) {
    for (const value of [result.anchor, result.head, ...result.changes.flatMap(change => [change.from, change.to])]) {
      assert.ok(Number.isInteger(value));
    }
  }
});

test('every toolbar command is listed once and plans integer positions', () => {
  const commands = toolbar.MARKDOWN_TOOLBAR_COMMANDS.map(entry => entry.command);
  assert.equal(new Set(commands).size, commands.length);
  assert.equal(commands.length, 17);
  assert.deepEqual(commands.slice(0, 5), ['bold', 'italic', 'strikethrough', 'highlight', 'inline-code']);
  assert.equal(toolbar.MARKDOWN_TOOLBAR_COMMANDS.filter(entry => entry.group === 'text').length, 5);
  assert.equal(toolbar.MARKDOWN_TOOLBAR_COMMANDS.filter(entry => entry.group === 'block').length, 8);
  assert.equal(toolbar.MARKDOWN_TOOLBAR_COMMANDS.filter(entry => entry.group === 'insert').length, 4);
  const text = 'alpha\nbeta\ngamma';
  for (const command of commands) {
    for (const [from, to] of [[0, 0], [0, 5], [2, 9], [5, 5]]) {
      applyPlan(text, plan(text, from, to, command));
    }
  }
});

test('edit commands delegate undo, redo and find-replace to Obsidian', () => {
  const editCommands = toolbar.MARKDOWN_EDIT_COMMANDS.map(entry => entry.command);
  assert.deepEqual(editCommands, ['undo', 'redo', 'find-replace']);
  assert.ok(toolbar.MARKDOWN_EDIT_COMMANDS.every(entry => entry.group === 'edit'));
  assert.equal(toolbar.MARKDOWN_TOOLBAR_COMMANDS.length, 17);

  const calls = [];
  const notices = [];
  const editor = {
    focus: () => calls.push('focus'),
    undo: () => calls.push('undo'),
    redo: () => calls.push('redo'),
  };
  const view = {
    editor,
    getMode: () => 'source',
    showSearch: replace => calls.push(`search:${replace}`),
  };
  toolbar.runMarkdownToolbarCommand(view, 'undo', message => notices.push(message));
  assert.deepEqual(calls, ['focus', 'undo']);
  calls.length = 0;
  toolbar.runMarkdownToolbarCommand(view, 'redo', message => notices.push(message));
  assert.deepEqual(calls, ['focus', 'redo']);
  calls.length = 0;
  toolbar.runMarkdownToolbarCommand(view, 'find-replace', message => notices.push(message));
  assert.deepEqual(calls, ['search:true']);
  assert.deepEqual(notices, []);
});

test('reading mode blocks every edit action, including find-replace', () => {
  const calls = [];
  const notices = [];
  const view = {
    editor: {
      focus: () => calls.push('focus'),
      undo: () => calls.push('undo'),
      redo: () => calls.push('redo'),
    },
    getMode: () => 'preview',
    showSearch: replace => calls.push(`search:${replace}`),
  };
  toolbar.runMarkdownToolbarCommand(view, 'undo', message => notices.push(message));
  toolbar.runMarkdownToolbarCommand(view, 'redo', message => notices.push(message));
  toolbar.runMarkdownToolbarCommand(view, 'find-replace', message => notices.push(message));
  assert.deepEqual(calls, []);
  assert.deepEqual(notices, [
    '请先切换到编辑模式再使用工具栏',
    '请先切换到编辑模式再使用工具栏',
    '请先切换到编辑模式再使用查找替换',
  ]);
});

test('find-replace reports a notice when the host has no search panel', () => {
  const notices = [];
  const view = { editor: { focus: () => {} }, getMode: () => 'source' };
  toolbar.runMarkdownToolbarCommand(view, 'find-replace', message => notices.push(message));
  assert.deepEqual(notices, ['当前 Obsidian 版本不支持查找替换，请使用 Obsidian 的查找命令']);
});

test('applyMarkdownCommand sends a single CodeMirror transaction when a cm view exists', () => {
  const dispatched = [];
  const cm = {
    state: { doc: { toString: () => 'abc' }, selection: { main: { from: 1, to: 1 } } },
    dispatch: transaction => dispatched.push(transaction),
    focus: () => dispatched.push('focus'),
  };
  toolbar.applyMarkdownCommand({ cm }, 'bold');
  assert.equal(dispatched.length, 2);
  assert.deepEqual(dispatched[0].changes, [{ from: 1, to: 1, insert: '****' }]);
  assert.deepEqual(dispatched[0].selection, { anchor: 3, head: 3 });
  assert.equal(dispatched[1], 'focus');
});
