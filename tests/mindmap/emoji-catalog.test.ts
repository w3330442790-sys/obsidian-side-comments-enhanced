import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMON_ICONS,
  EMOJI_CATEGORIES,
  clearNodeIcons,
  searchIcons,
  splitLeadingIcons,
  togglePlainIcon,
} from "../../vendor/personal-mindmap/vendor/gogoga/src/emoji-catalog";

test("icon catalog keeps common picks and searchable categories", () => {
  assert.ok(COMMON_ICONS.includes("✅"));
  assert.ok(EMOJI_CATEGORIES.length >= 6);
  assert.ok(EMOJI_CATEGORIES.every(category => category.emojis.length >= 4));
  assert.ok(searchIcons("书").includes("📖"));
  assert.ok(searchIcons("药").includes("💊"));
  assert.equal(searchIcons("✅")[0], "✅");
  assert.deepEqual(searchIcons("不存在的图标"), []);
});

test("leading icons are split from node text without touching the body", () => {
  assert.deepEqual(splitLeadingIcons("✅ 📌 复习 **重点**"), {
    icons: ["✅", "📌"],
    rest: "复习 **重点**",
  });
  assert.deepEqual(splitLeadingIcons("1️⃣ 2️⃣ 第一条"), {
    icons: ["1️⃣", "2️⃣"],
    rest: "第一条",
  });
  assert.deepEqual(splitLeadingIcons("普通文字 ✅"), {
    icons: [],
    rest: "普通文字 ✅",
  });
});

test("plain icon toggles and removal preserve the rest of the node", () => {
  assert.equal(togglePlainIcon("复习**重点**", "📌"), "📌 复习**重点**");
  assert.equal(togglePlainIcon("📌 复习**重点**", "📌"), "复习**重点**");
  assert.equal(clearNodeIcons("1️⃣ ✅ 📌 复习"), "复习");
});
