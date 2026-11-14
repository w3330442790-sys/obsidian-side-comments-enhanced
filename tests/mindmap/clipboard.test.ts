import test from 'node:test';import assert from 'node:assert/strict';
import {clipboardTopics} from '../../vendor/personal-mindmap/src/fusion/clipboard';
test('PDF++ selection becomes one linked primary topic with the original quote',()=>{
 const topics=clipboardTopics('> [!PDF|yellow] [[书.pdf#page=3&selection=1,2,4,5|书, p.3]]\n> > 第一行\n> > 第二行\n');
 assert.equal(topics.length,1);assert.equal(topics[0].text,'[[书.pdf#page=3&selection=1,2,4,5|第一行 第二行]]');
});
test('clipboard preserves structured subtrees and PDF cropped-image embeds',()=>{
 assert.equal(clipboardTopics('- Parent\n  - Child')[0].children?.[0].text,'Child');
 assert.equal(clipboardTopics('> [!PDF|] ![[a.pdf#page=1&rect=1,2,3,4|200]]')[0].text,'![[a.pdf#page=1&rect=1,2,3,4|200]]');
});
