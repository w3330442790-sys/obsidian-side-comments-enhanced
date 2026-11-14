import { readFile, writeFile } from "node:fs/promises";
import esbuild from "esbuild";

/**
 * styles.css is the only stylesheet Obsidian loads. It combines the annotation
 * side (styles.tool.css, edited by hand) with the fused mind-map canvas. The
 * canvas styles are scoped under body .wm-root so they never leak into other
 * plugin UI, matching the standalone editor's build.
 */
const banner = `/*!
 * Taube Markdown Tool styles.
 * Annotation UI is maintained in styles.tool.css. Mind-map styles are generated
 * from vendor/personal-mindmap (MIT: Weilanx, gogoga) by scripts/build-styles.mjs.
 * Do not edit the generated part below the marker.
 */
`;

const tool = await readFile("styles.tool.css", "utf8");
const theme = await readFile("vendor/personal-mindmap/src/obsidian/theme.css", "utf8");
const shared = (await readFile("vendor/personal-mindmap/webview/src/style.css", "utf8"))
	.replace(/\.wm-root/g, "&");
const scoped = `${theme}\nbody .wm-root {\n${shared}\n}\n`;
const { code } = await esbuild.transform(scoped, { loader: "css", target: ["chrome100", "safari15"] });
const gogoga = await readFile("vendor/personal-mindmap/vendor/gogoga/styles.css", "utf8");

await writeFile(
	"styles.css",
	`${banner}${tool}\n\n/* ===== generated: fused mind-map canvas (vendor/personal-mindmap) ===== */\n${code}\n${gogoga}\n`,
	"utf8",
);
console.log("styles.css rebuilt from styles.tool.css + fused mind-map canvas");
