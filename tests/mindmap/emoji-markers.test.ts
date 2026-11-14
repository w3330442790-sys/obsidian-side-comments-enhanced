import {test} from "node:test";
import assert from "node:assert/strict";
import {emojiMarkerGroups,parseCustomMarkers,toggleEmojiMarker,hasEmojiMarker} from "../../vendor/personal-mindmap/src/core/emoji-markers";
import {getTopic} from "../../vendor/personal-mindmap/src/core/query";
import type {MindDoc} from "../../vendor/personal-mindmap/src/core/types";
test("emoji groups preserve full builtins and parse grapheme custom markers",()=>{const groups=emojiMarkerGroups("🧑‍⚕️ ⚕️ 🧠 abc 12 🧠",true);assert.ok(groups.some(g=>g.emojis.includes("🙈")));assert.deepEqual(parseCustomMarkers("🧑‍⚕️ ⚕️ 🧠 abc 12 🧠"),["🧑‍⚕️","⚕️","🧠"]);assert.equal(groups.at(-1)?.exclusive,true);});
test("exclusive custom markers replace own group while preserving other markers and text",()=>{const groups=emojiMarkerGroups("🧠 🫀",true);const d:MindDoc={version:1,root:{id:"r",text:"1️⃣ 🧠 [x] diagnosis",markers:["flag-red"]}};const next=toggleEmojiMarker(d,["r"],"🫀",groups);assert.equal(next.root.text,"1️⃣ 🫀 [x] diagnosis");assert.deepEqual(next.root.markers,["flag-red"]);assert.equal(d.root.text,"1️⃣ 🧠 [x] diagnosis");assert.ok(hasEmojiMarker(next.root,"🫀",groups));assert.equal(toggleEmojiMarker(next,["r"],"🫀",groups).root.text,"1️⃣ [x] diagnosis");});
