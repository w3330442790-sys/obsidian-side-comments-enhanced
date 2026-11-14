// Vendored table tools are plain CommonJS modules. Their host-facing behaviour
// is typed at the integration boundary in excel-tool.ts instead.
declare module '*.cjs' {
    const value: unknown;
    export default value;
}
