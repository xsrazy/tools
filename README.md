# Micro Tools Hub

A collection of 1,108 free online tools that run in the browser. No sign-up, no fees: open a tool, use it instantly, and leave.

Live: https://tools.xsrazy.web.id

## About

Micro Tools Hub (tools.xsrazy.web.id) collects small everyday utilities in one place: counters, converters, calculators, generators, image tools, and more. Almost everything is computed locally on the visitor's own device, so tools answer instantly and the files or text being processed never need to leave the browser.

## Features

- 1,108 tools, all free, with no sign-up and no fees
- Homepage search plus category pages, so any tool is a few seconds away
- Every tool has its own page with a short guide and an FAQ section
- Most tools run fully client-side in the visitor's browser

## Categories

| Category | Tools |
| --- | --- |
| Developer | 377 |
| Converters | 170 |
| Calculators | 155 |
| Image | 141 |
| Text | 76 |
| Generators | 68 |
| Business | 63 |
| Everyday | 47 |
| Downloaders | 11 |

Examples: word counter, password generator, meme generator, JSON formatter, currency converter with live rates, mortgage calculator, image compressor, HEIC to JPG converter, QR code generator, and invoice maker.

## Architecture

- Frontend: plain static HTML, CSS, and vanilla JavaScript. No framework, and no build output beyond the generated pages themselves
- Page generation: `scripts/generate.js` builds pages from `data/tools-registry.json` (the single registry of all 1,108 tools) using `scripts/templates/page.html`. 1,057 pages are generated this way; 51 pages (mostly calculators and interactive tools) are handbuilt HTML files kept in the repo
- SEO: generated pages include FAQ sections with JSON-LD structured data, and `sitemap.xml` lists 1,113 URLs. The generator also syncs the shared footer, the stylesheet version, and the sitemap on every run
- Backend: almost none. Only two Vercel serverless functions exist: `api/rates.js`, which proxies the Frankfurter API for live currency exchange rates (cached at the edge for 6 hours), and `api/dl.js`, which resolves downloadable media for the Downloader tools

## Development

- To add or change a tool, edit `data/tools-registry.json`, then run `node scripts/generate.js` (this is also the Vercel build command) and push. Vercel builds and deploys from this repo's `main` branch
- `.vercelignore` only excludes `hidden_files/` and `*.md`. The `sitemap.xml` file must stay in the repo because the generator reads and updates it
- The Vercel project output directory is set to the repository root

## License

MIT. See [LICENSE](LICENSE).
