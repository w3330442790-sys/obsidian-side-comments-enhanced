const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'gogoga-ui-entry.ts')],
  bundle: true,
  outfile: path.join(root, 'artifacts/gogoga-ui.bundle.js'),
  platform: 'browser',
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><style>:root{--background-primary:#fff;--background-secondary:#f4f4f4;--text-normal:#222;--text-muted:#666;--text-faint:#888;--background-modifier-border:#ddd;--background-modifier-hover:#eee;--interactive-accent:#5865f2;--font-ui:Arial;--font-monospace:Consolas,monospace}body{margin:0;font-family:Arial}#host{position:fixed;inset:0}</style><style>${css}</style><div id="host"></div><script>${fs.readFileSync(path.join(root, 'artifacts/gogoga-ui.bundle.js'), 'utf8')}</script>`);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  page.on('pageerror', error => console.log('PAGEERROR', error.message));
  const results = [];
  const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => !!window.canvas && !!document.querySelector('.gg-mm-node'));

    await check('icon picker opens from the selected node toolbar', async () => {
      await page.locator('.gg-mm-node').first().click();
      await page.locator('.mm-nodebar [data-tool="icons"]').click();
      assert.equal(await page.locator('.mm-icon-overlay').count(), 1);
      assert.equal(await page.locator('.mm-icon-title').textContent(), 'Add icon');
    });

    await check('searching and choosing an emoji adds it to the node', async () => {
      await page.locator('.mm-icon-search').fill('书');
      const book = page.locator('.mm-icon-cell[data-emoji="📖"]');
      assert.equal(await book.count(), 1);
      await book.click();
      assert.match(await page.evaluate(() => window.docText()), /📖/);
      assert.ok(await page.locator('.mm-icon-cell[data-emoji="📖"]').evaluate(el => el.classList.contains('is-active')));
    });

    await check('remove clears icons and closes the picker', async () => {
      await page.getByRole('button', { name: 'Remove', exact: true }).click();
      assert.equal(await page.locator('.mm-icon-overlay').count(), 0);
      assert.doesNotMatch(await page.evaluate(() => window.docText()), /📖/);
    });

    await check('cloze button hides highlights without touching the document', async () => {
      await page.evaluate(() => {
        const doc = window.canvas.getDoc();
        if (doc) doc.root.text = '==隐藏答案== 可见';
        window.canvas.setDoc(doc);
      });
      const source = await page.evaluate(() => window.docText());
      await page.locator('.mm-toolbar [data-tool="cloze"]').click();
      assert.equal(await page.locator('.gg-mm-node mark').first().evaluate(el => getComputedStyle(el).color), 'rgba(0, 0, 0, 0)');
      assert.equal(await page.evaluate(() => window.docText()), source);
    });

    console.log(`GOGOGA UI PASS ${results.length}`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
