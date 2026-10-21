# Micro Tools Hub

**Live: https://tools.xsrazy.web.id**

Micro Tools Hub is a free online tools website with 1,108 tools that run directly in the browser. No sign-up, no installation, and for almost every tool the data you type never leaves your device because the processing happens client-side in JavaScript. The site is built for a global English-speaking audience and is fully indexed for search engines, with a generated page, explainer content and FAQ for every single tool.

## What's Inside

The homepage has a live search box and category browsing. All 1,108 tools are grouped into 9 categories:

| Category | Tools | Examples |
| --- | --- | --- |
| Developer Tools | 377 | JSON formatter, Base64 encoder, UUID generator, hash generators, regex tester, code beautifiers |
| Converters | 170 | Currency converter, unit converters (length, weight, temperature), number base converters |
| Calculators | 155 | Mortgage calculator, loan calculator, BMI calculator, age calculator, percentage calculator |
| Image Tools | 141 | Image compressor, resizer, format converter, QR code generator |
| Text Tools | 76 | Word counter, case converter, text sorter, remove duplicate lines |
| Generators | 68 | Password generator, random name picker, Lorem Ipsum generator |
| Business Tools | 63 | Invoice helpers, profit margin calculator, salary calculator |
| Everyday Tools | 47 | Stopwatch, timer, date calculators |
| Downloaders | 11 | TikTok downloader, Pinterest downloader, Twitter/X downloader and other media grabbers |

Every tool page contains the working tool itself, a written explainer section about what the tool does and how to use it, and an FAQ section. There is also an About page and a contact email (hello@tools.xsrazy.web.id, routed through Cloudflare Email Routing).

## Frontend

- Pure static HTML, CSS and vanilla JavaScript. No frontend framework and no runtime build step on the client.
- `styles.css` is the single shared stylesheet for the whole site (versioned with a query parameter), `site.js` powers the homepage search and category filtering, and `animations.js` handles small UI animations.
- Some pages are hand-built for richer tools; the rest are generated from one shared template (`scripts/templates/page.html`) so layout, header, footer and SEO tags stay identical across all 1,100+ pages. The footer is kept byte-identical on every page by the generator.
- Every page ships complete SEO metadata: canonical URL, Open Graph and Twitter cards, and FAQPage JSON-LD structured data generated from the tool's FAQ entries.

## Backend

There is no database and no user accounts. The backend is just two Vercel serverless functions:

- `GET /api/rates?from=USD&to=IDR` (`api/rates.js`): a same-origin proxy to the Frankfurter currency API (api.frankfurter.dev), needed because that API sends no CORS headers. Currency codes are validated against an ISO format check, and responses are edge-cached for 6 hours (`s-maxage=21600`) so the currency converter pages stay fast and cheap.
- `/api/dl` (`api/dl.js`): the resolver behind the 11 Downloader tools. The browser sends a media URL, the function asks the upstream provider for the direct media links, and returns them with a 5 minute edge cache.

Everything else, all calculators, converters, generators and image tools, runs 100 percent in the visitor's browser.

## How the Site Is Built

The site is registry-driven. `data/tools-registry.json` is the single source of truth listing every tool (slug, title, description, category, FAQ, explainer). Running:

```
node scripts/generate.js
```

regenerates the tool pages from the template, rebuilds the homepage cards, rewrites `sitemap.xml` (1,113 URLs) and syncs the footer across every page. Converter pairs are expanded automatically through a matrix system in the registry, so one registry entry can produce many pair pages (for example every currency pair). On Vercel, the project's build command is exactly that generator command, so pushing a registry change to this repo rebuilds the whole site.

## Project Structure

```
data/tools-registry.json   Source of truth for all 1,108 tools
scripts/generate.js        Static page generator
scripts/card-icons.js      Category and card icon mapping
scripts/templates/         Shared page template
api/rates.js               Currency rate proxy (Frankfurter)
api/dl.js                  Downloader resolver
assets/                    Logo, favicon, OG image, vendor libraries
*.html                     Generated and hand-built tool pages
```

## Notes

- All tools are free and only free upstream APIs are used.
- Contact email routing is handled by Cloudflare Email Routing on the tools subdomain.
