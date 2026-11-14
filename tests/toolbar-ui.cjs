const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'toolbar-ui-entry.ts')],
  bundle: true,
  outfile: path.join(root, 'artifacts/toolbar-ui.bundle.js'),
  platform: 'browser',
  alias: { obsidian: path.join(__dirname, 'obsidian-mock.ts') },
  logLevel: 'warning',
});
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><style>:root{--background-primary:#fff;--background-secondary:#f4f4f4;--text-normal:#222;--text-muted:#666;--text-faint:#888;--background-modifier-border:#ddd;--background-modifier-hover:#eee;--interactive-accent:#5865f2;--font-ui:Arial;--font-monospace:Consolas,monospace}body{margin:0;font-family:Arial}#host{height:100vh;display:flex}.view-container{display:flex;flex-direction:column;flex:1}.view-content{display:flex;flex-direction:column;flex:1;min-height:0}</style><style>${css}</style><div id="host"></div><script>${fs.readFileSync(path.join(root, 'artifacts/toolbar-ui.bundle.js'), 'utf8')}</script>`);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.on('pageerror', error => console.log('PAGEERROR', error.message));
  const results = [];
  const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.setup);

    await check('toolbar mounts at the top of the view content with grouped buttons', async () => {
      await page.evaluate(() => window.setup());
      const toolbar = page.locator('.mt-md-toolbar');
      assert.equal(await toolbar.count(), 1);
      assert.equal(await page.locator('.mt-md-toolbar-btn').count(), 21);
      assert.equal(await page.locator('.mt-md-toolbar-sep').count(), 3);
      const first = await page.evaluate(() => document.querySelector('.view-content')?.firstElementChild?.className);
      assert.equal(first, 'mt-md-toolbar');
      const commands = await page.evaluate(() => [...document.querySelectorAll('.mt-md-toolbar-btn')].map(button => button.getAttribute('data-command')));
      assert.deepEqual(commands.slice(0, 4), ['undo', 'redo', 'find-replace', 'cloze-toggle']);
    });

    await check('undo and redo buttons use the native editor history', async () => {
      await page.evaluate(() => window.setup());
      await page.getByRole('button', { name: '撤销' }).click();
      await page.getByRole('button', { name: '重做' }).click();
      assert.deepEqual(await page.evaluate(() => window.calls), ['undo', 'redo']);
    });

    await check('find-replace opens the native panel in replace mode', async () => {
      await page.evaluate(() => window.setup());
      await page.getByRole('button', { name: '查找替换' }).click();
      assert.deepEqual(await page.evaluate(() => window.calls), ['search:true']);
    });

    await check('cloze button toggles the Markdown mask and its label', async () => {
      await page.evaluate(() => {
        window.setup();
        const sample = document.createElement('div');
        sample.className = 'markdown-rendered';
        sample.innerHTML = '<mark>answer</mark>';
        document.querySelector('.view-content')?.appendChild(sample);
      });
      const cloze = page.locator('[data-command="cloze-toggle"]');
      assert.equal(await cloze.getAttribute('aria-label'), '隐藏挖孔内容');
      await cloze.click();
      assert.equal(await page.evaluate(() => window.clozeHidden()), true);
      assert.equal(await cloze.getAttribute('aria-label'), '显示挖孔内容');
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.querySelector('.markdown-rendered mark')).color),
        'rgba(0, 0, 0, 0)',
      );
      await cloze.click();
      assert.equal(await page.evaluate(() => window.clozeHidden()), false);
      assert.equal(await cloze.getAttribute('aria-label'), '隐藏挖孔内容');
      assert.notEqual(
        await page.evaluate(() => getComputedStyle(document.querySelector('.markdown-rendered mark')).color),
        'rgba(0, 0, 0, 0)',
      );
    });

    await check('reading mode blocks edit actions but keeps cloze available', async () => {
      await page.evaluate(() => { window.setup(); window.setMode('preview'); });
      await page.getByRole('button', { name: '撤销' }).click();
      await page.getByRole('button', { name: '重做' }).click();
      await page.getByRole('button', { name: '查找替换' }).click();
      assert.deepEqual(await page.evaluate(() => window.calls), []);
      assert.deepEqual(await page.evaluate(() => window.notices), [
        '请先切换到编辑模式再使用工具栏',
        '请先切换到编辑模式再使用工具栏',
        '请先切换到编辑模式再使用查找替换',
      ]);
      await page.locator('[data-command="cloze-toggle"]').click();
      assert.equal(await page.evaluate(() => window.clozeHidden()), true);
      assert.equal(await page.evaluate(() => window.notices.length), 3);
    });

    await check('bold button wraps the selection and keeps it selected', async () => {
      await page.evaluate(() => { window.setup(); window.select(0, 5); });
      await page.getByRole('button', { name: '加粗' }).click();
      assert.equal(await page.evaluate(() => window.doc()), '**hello** world');
      const selection = await page.evaluate(() => window.getSelection()?.toString());
      assert.equal(selection === '' || selection === 'hello', true);
    });

    await check('heading button replaces the marker instead of stacking', async () => {
      await page.evaluate(() => { window.setup(); window.select(0, 5); });
      await page.getByRole('button', { name: 'H2' }).click();
      await page.getByRole('button', { name: 'H3' }).click();
      assert.equal((await page.evaluate(() => window.doc())).split('\n')[0], '### hello world');
    });

    await check('list button prefixes the current line and toggles off', async () => {
      await page.evaluate(() => { window.setup(); window.select(0, 0); });
      await page.getByRole('button', { name: '无序列表' }).click();
      assert.equal(await page.evaluate(() => window.doc()), '- hello world');
      await page.getByRole('button', { name: '无序列表' }).click();
      assert.equal(await page.evaluate(() => window.doc()), 'hello world');
    });

    await check('reading mode reports a notice and does not edit', async () => {
      await page.evaluate(() => { window.setup(); window.setMode('preview'); window.select(0, 5); });
      await page.getByRole('button', { name: '加粗' }).click();
      assert.equal(await page.evaluate(() => window.doc()), 'hello world');
      assert.deepEqual(await page.evaluate(() => window.notices), ['请先切换到编辑模式再使用工具栏']);
    });

    await check('toolbar buttons keep the editor selection when pressed', async () => {
      await page.evaluate(() => { window.setup(); window.select(0, 5); });
      await page.getByRole('button', { name: '加粗' }).click();
      const selection = await page.evaluate(() => window.selection());
      assert.deepEqual(selection, { from: 2, to: 7 });
      await page.getByRole('button', { name: '加粗' }).click();
      assert.equal(await page.evaluate(() => window.doc()), 'hello world');
      assert.deepEqual(await page.evaluate(() => window.selection()), { from: 0, to: 5 });
    });

    console.log(`TOOLBAR UI PASS ${results.length}`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
