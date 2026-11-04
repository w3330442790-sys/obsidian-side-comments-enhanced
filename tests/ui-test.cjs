const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
let source = fs.readFileSync(path.join(root, 'src/main.ts'), 'utf8').replace(/from (["'])\.\//g, 'from $1../src/');
fs.writeFileSync(path.join(root, 'artifacts/main-test.ts'), source + '\nexport { SideNoteView, CommentModal };\n');
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'ui-entry.ts')], bundle: true, outfile: path.join(root, 'artifacts/ui.bundle.js'), platform: 'browser', external: ['buffer'], alias: { obsidian: path.join(__dirname, 'obsidian-mock.ts') }, logLevel: 'warning' });
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><meta charset="utf-8"><style>:root {--background-primary:#fff;--background-secondary:#f4f4f4;--text-normal:#222;--text-muted:#666;--text-faint:#888;--background-modifier-border:#ddd;--interactive-accent:#5865f2;--text-on-accent:#fff;--font-ui:Arial}*{box-sizing:border-box}body{margin:0;font-family:Arial}button,select{padding:6px;border:1px solid #ccc;border-radius:6px}button:disabled{opacity:.4}.sidenote-view-container{width:320px;height:100vh}.modal-container{position:fixed;inset:10%;background:white;z-index:20000;padding:20px;border:1px solid #aaa;overflow:auto}</style><style>' + css + '</style><script>' + fs.readFileSync(path.join(root, 'artifacts/ui.bundle.js'), 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>');
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const results = [];
  const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };
  const reset = async (mobile = false) => { await page.evaluate(mobile => { window.failWrite = false; localStorage.clear(); return window.setup(mobile); }, mobile); await page.locator('.sidenote-comment-item').first().waitFor(); };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => window.setup); await reset();
    await check('one-click mobile options free list space and persist without changing filters', async () => {
      await reset(true);
      await page.evaluate(() => { window.view.containerEl.style.height = '850px'; });
      const toggle = page.getByRole('button', { name: '展开选项', exact: true });
      assert.equal(await toggle.count(), 1);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.getByLabel('筛选标记样式').isVisible(), false);
      assert.equal(await page.locator('.sidenote-navigation').isVisible(), true);
      const collapsedHeight = (await page.locator('.sidenote-comments-list-wrapper').boundingBox()).height;
      await toggle.click();
      assert.equal(await page.getByLabel('筛选标记样式').isVisible(), true);
      const expandedHeight = (await page.locator('.sidenote-comments-list-wrapper').boundingBox()).height;
      assert.ok(collapsedHeight > expandedHeight + 80, JSON.stringify({collapsedHeight, expandedHeight, layout: await page.locator('.sidenote-options').evaluate(el => ({height:el.clientHeight, scroll:el.scrollHeight, parent:el.parentElement.clientHeight}))}));
      await page.getByLabel('筛选标记样式').selectOption('underline');
      assert.equal(await page.getByRole('button', { name: '收起选项', exact: true }).getAttribute('aria-expanded'), 'true');
      await page.getByRole('button', { name: '收起选项', exact: true }).click();
      assert.match(await page.locator('.sidenote-options-status').innerText(), /筛选中/);
      assert.equal(await page.locator('.sidenote-comment-item').count(), 2);
      await page.getByRole('button', { name: '下一条', exact: true }).click();
      assert.equal(await page.evaluate(() => window.lastJump), 1);
      await page.evaluate(() => { window.plugin.pendingRebind = { filePath: 'note.md' }; window.view.renderView(); });
      assert.equal(await page.getByRole('button', { name: '绑定所选文字', exact: true }).isVisible(), true);
      assert.equal(await page.getByLabel('筛选标记样式').isVisible(), false);
      await page.getByRole('button', { name: '展开选项', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.evaluate(() => window.setup(true));
      assert.equal(await page.getByLabel('筛选标记样式').isVisible(), true);
      await page.getByRole('button', { name: '收起选项', exact: true }).click();
      await page.evaluate(() => window.setup(true));
      assert.equal(await page.getByLabel('筛选标记样式').isVisible(), false);
      await page.evaluate(() => { window.view.app.saveLocalStorage = () => { throw Error('storage unavailable'); }; });
      await page.getByRole('button', { name: '展开选项', exact: true }).click();
      assert.equal(await page.getByLabel('筛选标记样式').isVisible(), true);
      await page.getByLabel('搜索批注', { exact: true }).fill('批注1');
      await page.getByRole('button', { name: '收起选项', exact: true }).click();
      assert.match(await page.locator('.sidenote-options-status').innerText(), /搜索中/);
      await page.screenshot({ path: path.join(root, 'artifacts/options-collapsed.png') });
      await reset();
      assert.equal(await page.getByLabel('筛选标记样式').isVisible(), true);
    });
    await check('combined filter affects list only and does not write annotation files', async () => {
      await page.getByLabel('筛选标记样式').selectOption('underline'); await page.getByLabel('筛选标记颜色').selectOption('#ec4899');
      assert.equal(await page.locator('.sidenote-comment-item').count(), 2);
      assert.equal(await page.evaluate(() => window.plugin.comments.length), 4);
      assert.equal(await page.evaluate(() => window.writes.some(x => x.startsWith('side-note-data'))), false);
    });
    await check('navigation uses filtered order, counter and endpoint states', async () => {
      await page.getByRole('button', { name: '下一条', exact: true }).click();
      assert.equal(await page.evaluate(() => window.lastJump), 1); assert.match(await page.locator('.sidenote-navigation').innerText(), /第 1／2 条/);
      assert.equal(await page.getByRole('button', { name: '上一条', exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: '下一条', exact: true }).click(); assert.equal(await page.evaluate(() => window.lastJump), 2);
      assert.equal(await page.getByRole('button', { name: '下一条', exact: true }).isDisabled(), true);
    });
    await check('named filter persists and restores after reload', async () => {
      await page.getByRole('button', { name: '保存筛选', exact: true }).click(); await page.getByLabel('筛选名称').fill('粉色下划线');
      await page.locator('.modal-container').getByRole('button', { name: '保存', exact: true }).click();
      await page.getByRole('button', { name: '显示全部', exact: true }).click();
      await page.getByLabel('常用筛选', { exact: true }).selectOption('0'); assert.equal(await page.locator('.sidenote-comment-item').count(), 2);
      await page.evaluate(async () => { window.plugin.preferences = { filter: {}, presets: [] }; await window.plugin.loadPreferences(); window.view.renderView(); });
      assert.equal(await page.getByLabel('筛选标记样式').inputValue(), 'underline');
    });
    await reset();
    await check('draft survives close and restores text, color and style', async () => {
      await page.evaluate(() => window.openEdit()); await page.locator('.sidenote-modal-textarea').fill('草稿内容');
      await page.locator('.sidenote-modal-mark-button[data-mark-type="bold"]').click();
      assert.match(await page.locator('.sidenote-save-status').innerText(), /草稿已暂存/);
      await page.getByLabel('关闭批注窗口', { exact: true }).click(); await page.evaluate(() => window.openEdit());
      await page.locator('.sidenote-draft-recovery').getByRole('button', { name: '恢复草稿', exact: true }).click();
      assert.equal(await page.locator('.sidenote-modal-textarea').inputValue(), '草稿内容');
      assert.equal(await page.locator('[data-mark-type="bold"]').getAttribute('aria-pressed'), 'true');
    });
    await check('failed save retains input and original annotation; retry saves once', async () => {
      await page.evaluate(() => window.failWrite = true); await page.getByRole('button', { name: '保存', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.sidenote-save-status')?.textContent.includes('保存失败'));
      assert.equal(await page.locator('.sidenote-modal-textarea').inputValue(), '草稿内容');
      assert.equal(await page.evaluate(() => window.plugin.comments[0].comment), '批注1');
      assert.equal(await page.evaluate(() => window.plugin.drafts.list().length), 1);
      await page.evaluate(() => window.failWrite = false); await page.getByRole('button', { name: '保存', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.sidenote-modal-floating'));
      assert.equal(await page.evaluate(() => window.plugin.comments[0].comment), '草稿内容');
      assert.equal(await page.evaluate(() => window.plugin.drafts.list().length), 0);
    });
    await reset();
    await check('orphan-only list and confirmed rebind preserve body and identity', async () => {
      await page.getByRole('button', { name: '定位异常 1', exact: true }).click(); assert.equal(await page.locator('.sidenote-comment-item').count(), 1);
      await page.evaluate(async () => { await window.plugin.beginRebind(window.plugin.comments[2]); window.setSelection(window.noteText.lastIndexOf('新选原文'), window.noteText.length); });
      await page.getByRole('button', { name: '绑定所选文字', exact: true }).click();
      await page.locator('.modal-container').getByRole('button', { name: '确认绑定', exact: true }).click();
      await page.waitForFunction(() => window.plugin.pendingRebind === null);
      const comment = await page.evaluate(() => window.plugin.comments[2]);
      assert.equal(comment.comment, '批注3'); assert.equal(comment.timestamp, 3); assert.equal(comment.color, '#f59e0b'); assert.equal(comment.selectedText, '新选原文'); assert.equal(comment.isOrphaned, false);
    });
    await reset();
    await check('failed new annotation save rolls back and retry creates one annotation', async () => {
      await page.evaluate(() => window.openAdd()); await page.locator('.sidenote-modal-textarea').fill('新增草稿');
      await page.evaluate(() => window.failWrite = true); await page.getByRole('button', { name: '保存', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.sidenote-save-status')?.textContent.includes('保存失败'));
      assert.equal(await page.evaluate(() => window.plugin.comments.length), 4);
      await page.evaluate(() => window.failWrite = false); await page.getByRole('button', { name: '保存', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.sidenote-modal-floating'));
      assert.equal(await page.evaluate(() => window.plugin.comments.length), 5);
    });
    await reset();
    await check('closing and opening another editor cannot interrupt a pending save', async () => {
      await page.evaluate(() => { window.openEdit(); window.plugin.editComment = async () => new Promise(resolve => window.finishSave = resolve); });
      await page.locator('.sidenote-modal-textarea').fill('正在保存'); await page.getByRole('button', { name: '保存', exact: true }).click();
      await page.evaluate(() => { window.modal.close(); window.openEdit(1); });
      assert.equal(await page.locator('.sidenote-modal-textarea').inputValue(), '正在保存');
      assert.equal(await page.getByRole('button', { name: '保存', exact: true }).isDisabled(), true);
      await page.evaluate(() => window.finishSave()); await page.waitForFunction(() => !document.querySelector('.sidenote-modal-floating'));
    });
    await reset();
    await check('draft list restores a new draft after plugin reconstruction', async () => {
      await page.evaluate(() => window.openAdd(window.noteText.indexOf('新选原文'), '新选原文')); await page.locator('.sidenote-modal-textarea').fill('新建未保存内容');
      await page.getByLabel('关闭批注窗口', { exact: true }).click();
      await page.evaluate(() => window.setup());
      await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
      await page.getByRole('button', { name: '恢复编辑', exact: true }).click();
      assert.equal(await page.locator('.sidenote-modal-textarea').inputValue(), '新建未保存内容');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.sidenote-modal-floating'));
      assert.equal(await page.evaluate(() => window.plugin.drafts.list().length), 0);
    });
    await reset();
    await check('unreadable and unrelated JSON files survive an ordinary save', async () => {
      const result = await page.evaluate(async () => {
        window.files.set('side-note-data/unrelated.json', '{bad');
        window.files.set('side-note-data/foreign.json', JSON.stringify({ other: true }));
        await window.plugin.loadAllCommentsFromFiles(); await window.plugin.saveData();
        return [window.files.get('side-note-data/unrelated.json'), window.files.get('side-note-data/foreign.json')];
      });
      assert.deepEqual(result, ['{bad', '{"other":true}']);
    });
    await reset();
    await check('failed legacy style edit removes newly introduced optional properties', async () => {
      const unchanged = await page.evaluate(async () => {
        const target = window.plugin.comments[3]; delete target.color; delete target.markType;
        const before = JSON.stringify(target); window.failWrite = true;
        try { await window.plugin.editComment(target.timestamp, 'failed', '#123456', 'bold'); } catch {}
        window.failWrite = false; return JSON.stringify(target) === before;
      }); assert.equal(unchanged, true);
    });
    await reset();
    await check('failed legacy rebind restores exact prior anchors', async () => {
      await page.evaluate(async () => {
        const target = window.plugin.comments[2]; window.priorBinding = JSON.stringify(target);
        await window.plugin.beginRebind(target); window.setSelection(window.noteText.lastIndexOf('新选原文'), window.noteText.length);
        window.failWrite = true;
      });
      await page.getByRole('button', { name: '绑定所选文字', exact: true }).click();
      await page.locator('.modal-container').getByRole('button', { name: '确认绑定', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.modal-container button').disabled);
      assert.equal(await page.evaluate(() => JSON.stringify(window.plugin.comments[2]) === window.priorBinding), true);
      await page.evaluate(() => { window.failWrite = false; document.querySelector('.modal-container').remove(); });
    });
    await reset();
    await check('reverting edits to original clears only the draft changed in this session', async () => {
      await page.evaluate(() => window.openEdit()); await page.locator('.sidenote-modal-textarea').fill('后来撤回的草稿');
      await page.locator('.sidenote-modal-textarea').fill('批注1');
      await page.getByLabel('关闭批注窗口', { exact: true }).click();
      assert.equal(await page.evaluate(() => window.plugin.drafts.list().length), 0);
      await page.evaluate(() => window.openAdd()); await page.locator('.sidenote-modal-textarea').fill('清空前');
      await page.locator('.sidenote-modal-textarea').fill('');
      assert.match(await page.locator('.sidenote-save-status').innerText(), /未保存/);
      await page.getByLabel('关闭批注窗口', { exact: true }).click();
      assert.equal(await page.evaluate(() => window.plugin.drafts.list().length), 0);
    });
    await reset(true);
    await check('deleting last annotation on a newly written note removes its JSON', async () => {
      const exists = await page.evaluate(async () => {
        await window.plugin.saveCommentsForSingleFile('note.md');
        window.plugin.comments.splice(0);
        await window.plugin.saveData();
        return window.files.has('side-note-data/note.json');
      });
      assert.equal(exists, false);
    });
    await reset(true);
    await check('tablet save remains visible when viewport shrinks for keyboard', async () => {
      await page.setViewportSize({ width: 768, height: 1024 }); await page.evaluate(() => window.openEdit());
      await page.locator('.sidenote-modal-textarea').fill('长批注\n'.repeat(200));
      await page.setViewportSize({ width: 768, height: 360 }); await page.waitForTimeout(120);
      const box = await page.getByRole('button', { name: '保存', exact: true }).boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= 360 && box.height >= 44, JSON.stringify(box));
      await page.screenshot({ path: path.join(root, 'artifacts/tablet-keyboard.png') });
    });
    await page.evaluate(() => window.modal.close());
    await check('narrow sidebar and phone landscape keep all controls inside viewport', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => { window.view.containerEl.style.width = '250px'; window.view.renderView(); });
      await page.getByRole('button', { name: '展开选项', exact: true }).click();
      const overflow = await page.evaluate(() => { const el = window.view.containerEl; return el.scrollWidth > el.clientWidth + 1; });
      const layout = await page.evaluate(() => { const el = window.view.containerEl, right = el.getBoundingClientRect().right; return Array.from(el.querySelectorAll('*')).filter(x => x.getBoundingClientRect().right > right + 1).map(x => ({ cls: x.className, tag: x.tagName, right: x.getBoundingClientRect().right, width: x.getBoundingClientRect().width })); });
      assert.equal(overflow, false, JSON.stringify(layout));
      await page.evaluate(() => window.openEdit()); await page.setViewportSize({ width: 844, height: 320 }); await page.waitForTimeout(120);
      const box = await page.getByRole('button', { name: '保存', exact: true }).boundingBox();
      const editorLayout = await page.evaluate(() => Array.from(document.querySelector('.sidenote-modal-floating').children).map(x => ({ cls: x.className, height: x.getBoundingClientRect().height, y: x.getBoundingClientRect().y, min: getComputedStyle(x).minHeight, shrink: getComputedStyle(x).flexShrink })));
      if (box.y + box.height > 320) await page.screenshot({ path: path.join(root, 'artifacts/landscape-failure.png') });
      assert.ok(box && box.y >= 0 && box.y + box.height <= 320, JSON.stringify({ box, editorLayout }));
      await page.screenshot({ path: path.join(root, 'artifacts/phone-landscape.png') });
    });
    fs.writeFileSync(path.join(root, 'artifacts/ui-results.json'), JSON.stringify({ passed: results.length, results }, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
