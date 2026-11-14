import test from 'node:test';
import assert from 'node:assert/strict';
import {setAllTopicShapes} from '../../vendor/personal-mindmap/src/core/shape';
import {indexDoc} from '../../vendor/personal-mindmap/src/core/query';
import {resolveAll} from '../../vendor/personal-mindmap/src/core/theme';
import {addChild,setStyle} from '../../vendor/personal-mindmap/src/core/ops';
import {parse,serialize} from '../../vendor/personal-mindmap/src/core/doc';
import {parseMarkdownDoc,writeMarkdownDoc} from '../../vendor/personal-mindmap/src/fusion/markdown';
import type {MindDoc} from '../../vendor/personal-mindmap/src/core/types';
const example=():MindDoc=>({version:1,root:{id:'root',text:'R',style:{fill:'#123456',shape:'rect',custom:true},children:[{id:'a',text:'A',collapsed:true,children:[{id:'hidden',text:'Hidden',hidden:true,style:{shape:'ellipse',fontSize:23}}]},{id:'b',text:'B'}],summaries:[{id:'sum',from:'a',to:'b',text:'Summary',style:{shape:'capsule'}}]},floating:[{id:'free',text:'Free',position:{x:70,y:30},children:[{id:'leaf',text:'Leaf'}]}],relationships:[{id:'rel',from:'a',to:'free'}]});
test('all-topic shapes cover root, collapsed/hidden topics and floating trees while preserving other fields',()=>{
 const doc=example(),before=JSON.stringify(doc),next=setAllTopicShapes(doc,'underline');
 assert.equal(next.nodeShape,'underline');for(const {topic}of indexDoc(next).values())assert.equal(topic.style?.shape,'underline');
 assert.equal(next.root.style?.fill,'#123456');assert.equal(next.root.style?.custom,true);assert.equal(next.root.children![0].children![0].style?.fontSize,23);
 assert.equal(next.relationships,doc.relationships);assert.equal(next.root.summaries,doc.root.summaries);assert.equal(JSON.stringify(doc),before);
 assert.equal(setAllTopicShapes(next,'underline'),next);
});
test('new topics inherit the whole-map shape while per-node overrides remain supported',()=>{
 let doc=setAllTopicShapes(example(),'capsule');const added=addChild(doc,'b',{text:'New'});doc=added.doc;
 assert.equal(resolveAll(doc,false).styles.get(added.id)?.shape,'capsule');
 assert.equal(parse(serialize(doc)).doc?.nodeShape,'capsule');
 assert.equal(resolveAll(setStyle(doc,[added.id],{shape:'rect'}),false).styles.get(added.id)?.shape,'rect');
 assert.equal(resolveAll(setStyle(doc,[added.id],{shape:undefined}),false).styles.get(added.id)?.shape,'capsule');
 assert.equal(resolveAll({...doc,look:'hand'},false).styles.get(added.id)?.shape,'capsule');
});
test('resetting whole-map shape removes only shape overrides and restores theme defaults',()=>{
 const next=setAllTopicShapes(setAllTopicShapes(example(),'none'),undefined);
 assert.equal(next.nodeShape,undefined);for(const {topic}of indexDoc(next).values())assert.equal(topic.style?.shape,undefined);
 assert.equal(next.root.style?.fill,'#123456');assert.equal(next.root.children![0].children![0].style?.fontSize,23);assert.equal(next.root.children![1].style,undefined);
});
test('whole-map shape survives Markdown editing and reopen',()=>{
 const source='# Root\n\n- Child\n';const doc=setAllTopicShapes(parseMarkdownDoc(source,'Test'),'ellipse');
 const reopened=parseMarkdownDoc(writeMarkdownDoc(source,doc,'Test'),'Test');assert.equal(reopened.nodeShape,'ellipse');for(const {topic}of indexDoc(reopened).values())assert.equal(topic.style?.shape,'ellipse');
});
