import test from "node:test";
import assert from "node:assert/strict";
import * as ops from "../../vendor/personal-mindmap/src/core/ops";
import { getTopic, indexDoc } from "../../vendor/personal-mindmap/src/core/query";
import type { MindDoc } from "../../vendor/personal-mindmap/src/core/types";

function doc(): MindDoc {
  return {
    version: 1,
    root: {
      id: "root",
      text: "项目",
      children: [
        { id: "a", text: "准备" },
        { id: "b", text: "实现" },
        { id: "c", text: "验证" },
        { id: "d", text: "发布" },
      ],
      summaries: [
        { id: "s1", from: "b", to: "c", text: "交付" },
        { id: "s2", from: "c", to: "c", text: "内部" },
        { id: "s3", from: "a", to: "b", text: "重叠" },
      ],
      boundaries: [{ id: "box1", from: "b", to: "c" }],
    },
    relationships: [{ id: "r1", from: "a", to: "d", text: "依赖" }],
  };
}

test("summaryToBranch turns a summary into a parent node with the same children", () => {
  const source = doc();
  const result = ops.summaryToBranch(source, "s1");
  assert.ok(result);
  assert.notEqual(result!.doc, source);
  const root = result!.doc.root;
  assert.deepEqual(root.children!.map(child => child.id), ["a", result!.id, "d"]);
  const branch = getTopic(result!.doc, result!.id)!;
  assert.equal(branch.text, "交付");
  assert.deepEqual(branch.children!.map(child => child.id), ["b", "c"]);
  assert.equal(root.summaries!.some(range => range.id === "s1"), false);
  // The nested summary that only covered "c" moved down with its node.
  assert.deepEqual(branch.summaries?.map(range => range.id), ["s2"]);
  assert.deepEqual(branch.boundaries?.map(range => range.id), ["box1"]);
  // The partially overlapping summary keeps its outside endpoint and collapses
  // the inside endpoint onto the new branch.
  assert.deepEqual(root.summaries?.map(range => range.id), ["s3"]);
  assert.equal(root.summaries![0].from, "a");
  assert.equal(root.summaries![0].to, result!.id);
  assert.deepEqual(result!.doc.relationships, source.relationships);
  assert.equal(result!.droppedRanges, 0);
});

test("summaryToBranch supports adding further child points and remains serializable", () => {
  const result = ops.summaryToBranch(doc(), "s1")!;
  const added = ops.addChild(result.doc, result.id, { text: "新分点" });
  assert.equal(getTopic(added.doc, added.id)?.text, "新分点");
  assert.equal(added.doc.root.children?.find(child => child.id === result.id)?.children?.length, 3);
});

test("summaryToBranch rejects non-summary ids and keeps the root untouched", () => {
  assert.equal(ops.summaryToBranch(doc(), "box1"), null);
  assert.equal(ops.summaryToBranch(doc(), "missing"), null);
  assert.equal(indexDoc(doc()).get("s1"), undefined);
});

test("summaryToBranch preserves ranges that cross the new branch boundary", () => {
  const source = doc();
  source.root.summaries = source.root.summaries!.filter(range => range.id !== "s3");
  source.root.summaries.push(
    { id: "outer", from: "a", to: "c", text: "跨范围" },
    { id: "wider", from: "a", to: "d", text: "整段" },
  );
  const result = ops.summaryToBranch(source, "s1")!;
  assert.equal(result.droppedRanges, 0);
  assert.deepEqual(result.doc.root.summaries!.map(range => range.id), ["outer", "wider"]);
  assert.equal(result.doc.root.summaries![0].to, result.id);
  assert.equal(result.doc.root.summaries![1].to, "d");
});
