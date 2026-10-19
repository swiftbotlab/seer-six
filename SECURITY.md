# Security

Static site: HTML, CSS and vanilla JavaScript served from GitHub Pages.

- No backend, no accounts, no wallet connection, no forms that send data anywhere.
- No third-party scripts or CDNs; fonts are self-hosted. No analytics or cookies.
- `localStorage` holds one value, the viewer's theme choice (`seer-theme`).
- Any CSV a viewer drops into a demo is parsed in the browser and never uploaded.
- All rendered text from data goes through `textContent`, not `innerHTML`.

Report an issue: open a GitHub issue on this repository.
