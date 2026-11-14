import {parseClipboard,parseMarkdown} from '../../vendor/gogoga/src/markdown';
import {markdownTreeToDoc} from './markdown';
import type {Topic} from '../core/types';
export function clipboardTopics(text:string):Topic[]{
  return parseClipboard(text).map(root=>markdownTreeToDoc({...parseMarkdown('',{fallbackTitle:''}),root}).root);
}
