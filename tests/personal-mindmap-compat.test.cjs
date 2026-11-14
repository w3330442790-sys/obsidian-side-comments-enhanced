const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const entry = path.join(__dirname, '../src/mindmap/compat.ts');
const { outputFiles } = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false });
const mod = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(mod, mod.exports, require);
const compat = mod.exports;

function app(version, enabled = true) {
  return {
    plugins: {
      enabledPlugins: new Set(enabled ? ['personal-mindmap'] : []),
      manifests: version ? { 'personal-mindmap': { version } } : {},
    },
  };
}

test('personal mindmap must be enabled and at least 0.2.0 before the old canvas steps aside', () => {
  assert.equal(compat.personalMindmapProvidesView(app('0.2.0')), true);
  assert.equal(compat.personalMindmapProvidesView(app('0.2.1')), true);
  assert.equal(compat.personalMindmapProvidesView(app('0.10.0')), true);
  assert.equal(compat.personalMindmapProvidesView(app('1.0.0')), true);
  assert.equal(compat.personalMindmapProvidesView(app('0.1.2')), false);
  assert.equal(compat.personalMindmapProvidesView(app(undefined)), false);
  assert.equal(compat.personalMindmapProvidesView(app('0.2.0', false)), false);
  assert.equal(compat.personalMindmapProvidesView(null), false);
});

test('version comparison is numeric and ignores missing patch components', () => {
  assert.equal(compat.isVersionAtLeast('0.2', '0.2.0'), true);
  assert.equal(compat.isVersionAtLeast('0.2.0', '0.2'), true);
  assert.equal(compat.isVersionAtLeast('0.9.9', '0.10.0'), false);
  assert.equal(compat.isVersionAtLeast('1.0.0', '0.99.99'), true);
});

test('the personal view and min-version constants match the released plugin', () => {
  assert.equal(compat.PERSONAL_MINDMAP_ID, 'personal-mindmap');
  assert.equal(compat.PERSONAL_MINDMAP_VIEW, 'personal-mindmap-markdown');
  assert.equal(compat.PERSONAL_MINDMAP_MIN_VERSION, '0.2.0');
  assert.equal(compat.LEGACY_MINDMAP_VIEW, 'markdown-tool-mindmap');
});
