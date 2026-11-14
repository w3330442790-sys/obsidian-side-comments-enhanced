import test from "node:test";
import assert from "node:assert/strict";
import { applyInlineFormat, INLINE_ORANGE, INLINE_RED } from "../../vendor/personal-mindmap/src/core/inline-format";

test("format: selected text is wrapped in the exact safe red span", () => {
  const source = "厥阴之为病，消渴。";
  const start = source.indexOf("消渴");
  const result = applyInlineFormat(source, start, start + 2, "red");
  assert.equal(result.text, `厥阴之为病，<span style="color:${INLINE_RED}">消渴</span>。`);
  assert.equal(result.text.slice(result.start, result.end), "消渴");
});

test("format: selecting inside a colored phrase toggles or recolors the whole phrase", () => {
  const source = `前文<span style="color:${INLINE_RED}">重点文字</span>后文`;
  const inside = source.indexOf("点文");
  const cleared = applyInlineFormat(source, inside, inside + 2, "red");
  assert.equal(cleared.text, "前文重点文字后文");
  assert.equal(cleared.text.slice(cleared.start, cleared.end), "点文");

  const recolored = applyInlineFormat(source, inside, inside + 2, "orange");
  assert.equal(recolored.text, `前文<span style="color:${INLINE_ORANGE}">重点文字</span>后文`);
  assert.equal(recolored.text.slice(recolored.start, recolored.end), "点文");
});

test("format: selecting the exact colored span toggles it off", () => {
  const marked = `<span style="color:${INLINE_RED}">重点</span>`;
  const start = marked.indexOf("重点");
  const result = applyInlineFormat(marked, start, start + 2, "red");
  assert.equal(result.text, "重点");
  assert.equal(result.text.slice(result.start, result.end), "重点");
});

test("format: clear color removes only our color span and keeps other text", () => {
  const source = `A ==<span style="color:${INLINE_RED}">重点</span>== B`;
  const start = source.indexOf("重点");
  const result = applyInlineFormat(source, start, start + 2, "clear-color");
  assert.equal(result.text, "A ==重点== B");
  assert.equal(result.text.slice(result.start, result.end), "重点");
  assert.equal(applyInlineFormat("普通文字", 0, 2, "clear-color").text, "普通文字");
});

test("format: highlight and bold toggle without stacking markers", () => {
  const highlighted = applyInlineFormat("重点", 0, 2, "highlight");
  assert.equal(highlighted.text, "==重点==");
  assert.equal(highlighted.text.slice(highlighted.start, highlighted.end), "重点");
  const unhighlighted = applyInlineFormat(highlighted.text, highlighted.start, highlighted.end, "highlight");
  assert.equal(unhighlighted.text, "重点");

  const bold = applyInlineFormat("重点", 0, 2, "bold");
  assert.equal(bold.text, "**重点**");
  assert.equal(applyInlineFormat(bold.text, bold.start, bold.end, "bold").text, "重点");
});

test("format: empty selections only insert a safe cursor pair", () => {
  const red = applyInlineFormat("", 0, 0, "red");
  assert.equal(red.text, `<span style="color:${INLINE_RED}"></span>`);
  assert.equal(red.start, `<span style="color:${INLINE_RED}">`.length);
  const bold = applyInlineFormat("", 0, 0, "bold");
  assert.equal(bold.text, "****");
  assert.equal(bold.start, 2);
});
