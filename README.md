# Micro Tools Hub

**Live: https://tools.xsrazy.web.id**

A collection of 1,100+ free online tools that run right in your browser. No sign-up, no installs, no fees.

## What's inside

- Calculators: finance (mortgage, loan, compound interest), math, health, date and time, converters
- Text tools: case converters, counters, formatters, encoders and decoders
- Developer tools: JSON and data format converters, checksum and hash generators, code utilities
- Downloaders and media utilities, QR tools, generators, and more

## How it works

Every page is generated from a single data source, `data/tools-registry.json`, by `scripts/generate.js`. Vercel runs the generator as the build command and serves the resulting static site. Two small serverless functions live in `api/` (currency rates proxy and a downloader endpoint). Most tools are fully client-side, so your data never leaves your device.

## Development

Edit the registry, run `node scripts/generate.js`, commit and push. The push triggers a fresh build and deployment on Vercel automatically.
