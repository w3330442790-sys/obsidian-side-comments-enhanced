// The annotation UI harnesses isolate SideNote's sidebar/markup behaviour and do
// not mount the fused mind-map editor. This stub keeps the production class
// hierarchy available to esbuild without pulling the canvas and its fonts in.
import { Plugin } from 'obsidian';

export default class MindmapPluginBase extends Plugin {}
