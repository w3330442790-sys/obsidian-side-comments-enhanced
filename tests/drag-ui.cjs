const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'drag-ui-entry.ts')],
  bundle: true,
  outfile: path.join(root, 'artifacts/drag-ui.bundle.js'),
  platform: 'browser',
  logLevel: 'warning',
});
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><style>:root{--background-primary:#fff;--text-normal:#222;--text-muted:#666;--text-faint:#888;--background-modifier-border:#ddd;--interactive-accent:#5865f2;--font-ui:Arial;--font-monospace:Consolas,monospace}body{margin:0;font-family:Arial}#host{height:100vh}</style><style>${css}</style><div id="host"></div><script>window.createDiv=()=>document.createElement("div");window.createEl=(tag)=>document.createElement(tag);</script><script>${fs.readFileSync(path.join(root, 'artifacts/drag-ui.bundle.js'), 'utf8')}</script>`);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  page.on('pageerror', error => console.log('PAGEERROR', error.message));
  const results = [];
  const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };
  const setup = async doc => {
    await page.evaluate(text => window.setup(text), doc);
    await page.waitForFunction(() => {
      const line = document.querySelector('.cm-line');
      return !!line && line.getBoundingClientRect().height > 4;
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const handleBox = async startLine => {
    const handle = page.locator(`.mt-drag-handle[data-mt-block-start="${startLine}"]`);
    const box = await handle.boundingBox();
    assert.ok(box, `drag handle for line ${startLine} must be visible`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const dragTo = async (from, to, expectedMode) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.move(to.x + 1, to.y + 1, { steps: 2 });
    if (expectedMode) {
      await page.waitForFunction(mode => document.querySelector('.mt-drop-indicator')?.className.includes('mt-drop-' + mode), expectedMode, { timeout: 5000 });
    }
    await page.mouse.up();
  };
  const linePoint = async (line, ratio) => {
    const point = await page.evaluate(([number, value]) => window.coords(number, value), [line, ratio]);
    assert.ok(point, 'line coordinates must exist');
    return point;
  };

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.setup);

    await check('handles appear only for real block starts and not for the metadata comment', async () => {
      await setup('# A\n\nalpha\n\n# B\n\nbeta\n<!-- markdown-tool:v1 abc -->\n');
      assert.equal(await page.evaluate(() => window.handleCount()), 4);
      assert.equal(await page.locator('.mt-drag-handle[data-mt-block-start="7"]').count(), 0);
    });

    await check('the drag gutter is wide enough and its handles are visible', async () => {
      await setup('# A\n\nalpha\n');
      const style = await page.evaluate(() => {
        const gutter = document.querySelector('.mt-drag-gutter');
        const handle = document.querySelector('.mt-drag-handle');
        if (!gutter || !handle) return null;
        return {
          gutterWidth: parseFloat(getComputedStyle(gutter).width),
          handleOpacity: parseFloat(getComputedStyle(handle).opacity),
          handleHeight: handle.getBoundingClientRect().height,
        };
      });
      assert.ok(style, 'gutter and handle must exist');
      assert.ok(style.gutterWidth >= 16, JSON.stringify(style));
      assert.ok(style.handleOpacity > 0, JSON.stringify(style));
      assert.ok(style.handleHeight >= 10, JSON.stringify(style));
    });

    await check('dragging a heading below the next section reorders the whole section', async () => {
      await setup('# A\n\nalpha\n\n# B\n\nbeta\n');
      await dragTo(await handleBox(0), await linePoint(7, 0.85), 'after');
      assert.equal(await page.evaluate(() => window.doc()), '# B\n\nbeta\n\n# A\n\nalpha\n');
      const moves = await page.evaluate(() => window.moves.map(plan => ({ text: plan.text, mode: plan.mode })));
      assert.equal(moves.length, 1);
      assert.equal(moves[0].mode, 'after');
    });

    await check('dropping in the middle of a list item nests it as a child', async () => {
      await setup('- one\n  - child\n- two\n');
      assert.equal(await page.evaluate(() => window.drag(0, 3, 0.5)), true);
      assert.equal(await page.evaluate(() => window.doc()), '- two\n  - one\n    - child\n');
      assert.equal(await page.evaluate(() => window.moves[0].levelDelta), 2);
    });

    await check('dropping at the top edge inserts before the target block', async () => {
      await setup('# A\n\nalpha\n\n# B\n\nbeta\n');
      assert.equal(await page.evaluate(() => window.drag(4, 1, 0.2)), true);
      assert.equal(await page.evaluate(() => window.doc()), '# B\n\nbeta\n\n# A\n\nalpha\n');
      assert.equal(await page.evaluate(() => window.moves[0].mode), 'before');
    });

    await check('escape cancels the drag without changing the document', async () => {
      await setup('# A\n\nalpha\n\n# B\n\nbeta\n');
      const before = await page.evaluate(() => window.doc());
      const from = await handleBox(0);
      const to = await linePoint(7, 0.9);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 4 });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      assert.equal(await page.evaluate(() => window.doc()), before);
      assert.equal(await page.evaluate(() => window.moves.length), 0);
    });

    await check('a drag that ends on the same place reports no change', async () => {
      await setup('# A\n\nalpha\n\n# B\n\nbeta\n');
      const before = await page.evaluate(() => window.doc());
      const from = await handleBox(0);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 2, from.y + 2, { steps: 2 });
      await page.mouse.up();
      assert.equal(await page.evaluate(() => window.doc()), before);
    });

    await check('a synthetic touch pointer drag moves the block as well', async () => {
      await setup('- one\n  - child\n- two\n');
      const moved = await page.evaluate(() => {
        const handle = document.querySelector('.mt-drag-handle[data-mt-block-start="0"]');
        if (!(handle instanceof HTMLElement)) return false;
        const rect = handle.getBoundingClientRect();
        const fire = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
        }));
        fire(handle, 'pointerdown', rect.left + 3, rect.top + 3);
        const point = window.coords(3, 0.9);
        if (!point) return false;
        fire(window, 'pointermove', point.x, point.y);
        fire(window, 'pointerup', point.x, point.y);
        return true;
      });
      assert.equal(moved, true);
      assert.equal(await page.evaluate(() => window.doc()), '- two\n- one\n  - child\n');
    });

    console.log(`DRAG UI PASS ${results.length}`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
