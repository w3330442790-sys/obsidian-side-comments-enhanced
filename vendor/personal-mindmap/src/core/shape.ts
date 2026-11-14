import type {MindDoc, Shape, Topic} from './types';

/** Set every topic's shape in one history transaction, preserving all other styles. */
export function setAllTopicShapes(doc:MindDoc, shape:Shape|undefined):MindDoc {
  const visit=(topic:Topic):Topic=>{
    let next=topic;
    if(topic.style?.shape!==shape){
      const style={...topic.style};
      if(shape===undefined) delete style.shape; else style.shape=shape;
      next={...next,style:Object.keys(style).length?style:undefined};
    }
    if(topic.children){
      const children=topic.children.map(visit);
      if(children.some((child,i)=>child!==topic.children![i])) next={...next,children};
    }
    return next;
  };
  const root=visit(doc.root),floating=doc.floating?.map(visit);
  if(root===doc.root&&!floating?.some((topic,i)=>topic!==doc.floating![i])&&doc.nodeShape===shape)return doc;
  const next={...doc,root,nodeShape:shape};
  if(floating)next.floating=floating;
  if(shape===undefined)delete next.nodeShape;
  return next;
}
