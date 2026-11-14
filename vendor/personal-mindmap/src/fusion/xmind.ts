import type { MindDoc } from '../core/types';
import { parseXmind, xmindSheetToDoc, type XmindSheet, type XmindTopic } from '../../vendor/gogoga/src/xmind';
import type { MindNode } from '../../vendor/gogoga/src/model';
import { markdownTreeToDoc } from './markdown';

export interface XmindFusionSheet { title: string; doc: MindDoc; warnings: string[]; images?: Map<string, Uint8Array> }

export function xmindSheetToMindDoc(sheet: XmindSheet): XmindFusionSheet {
  const warnings = Object.entries(sheet.lost).filter(([, count]) => count > 0).map(([kind, count]) => `XMind ${kind}: ${count} unsupported or missing item(s).`);
  // Image data stays available to the host for attachment persistence and previews.
  const tree = xmindSheetToDoc(sheet, {}, src => `xmind-resource:${encodeURIComponent(src)}`);
  const sourceIds = (node: MindNode, source: XmindTopic) => { if (source.id) node.id = source.id; node.children.forEach((child, i) => sourceIds(child, source.children[i])); };
  sourceIds(tree.root, sheet.root);
  const doc = markdownTreeToDoc(tree);
  if (sheet.images?.size) {
    warnings.push('XMind images are retained as package resources; export or persist these attachments with the document.');
    doc.xmindImages = Object.fromEntries([...sheet.images].map(([path, bytes]) => [path, Array.from(bytes)]));
  }
  doc.xmind = { title: sheet.title, lost: { ...sheet.lost } };
  return { title: sheet.title, doc, warnings, images: sheet.images };
}

/** Imports every sheet rather than silently taking only the first. */
export async function parseXmindDocs(buffer: ArrayBuffer): Promise<XmindFusionSheet[]> {
  return (await parseXmind(buffer)).map(xmindSheetToMindDoc);
}
