# Project delivery preferences

- User preference confirmed on 2026-11-04: plugin updates for this project use GitHub Releases and BRAT by default. A local ZIP alone is not completion of a requested plugin update.
- Repository: https://github.com/w3330442790-sys/taube-markdown-tool
- After implementing and verifying an update, bump package.json, package-lock.json, manifest.json and versions.json together, update the changelog, commit and push to GitHub, and publish a new non-prerelease GitHub Release. Use the plain manifest version as the tag, matching the existing release convention.
- Upload main.js, manifest.json and styles.css as separate release assets so BRAT can update the plugin. A plugin ZIP is optional supplementary delivery.
- Run npm test, npm run lint, npm run build and npm run test:ui before publishing. Check remote CI and published asset contents.
- User explicitly requested isolation from original community updates on 2026-11-13, then renamed the identity on 2026-11-14: plugin ID taube-markdown-tool, display name Taube Markdown Tool, repository taube-markdown-tool, isDesktopOnly false. Import legacy personal-markdown-tool or side-comments-origin settings without deleting the old data. Never include user notes, annotation data, drafts, credentials, private/ or local test artifacts in releases.
- This preference authorizes routine release steps within the user's requested update; do not ask again about local ZIP versus GitHub delivery.
