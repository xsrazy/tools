#!/usr/bin/env node
/**
 * Micro Tools Hub - static programmatic-SEO generator.
 * Reads data/tools-registry.json, renders `generated:true` pages from
 * scripts/templates/page.html, then regenerates index.html cards,
 * sitemap.xml and syncs the footer byte-identical across all pages.
 *
 * Usage: node scripts/generate.js
 * Idempotent: re-running produces identical output (no duplicates).
 */
const fs = require('fs');
const path = require('path');
const { iconFor } = require('./card-icons');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://tools.xsrazy.web.id';
const TODAY = '2026-10-19';

const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const DOLLAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20"/><path d="M17 6.5c0-2-2.2-3-5-3s-5 1-5 3 2 2.6 5 3.2 5 1.4 5 3.3-2.2 3-5 3-5-1-5-3"/></svg>';
const TINTS = ['tint-sky', 'tint-violet', 'tint-indigo', 'tint-teal', 'tint-amber', 'tint-rose'];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function loadRegistry() {
  let reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tools-registry.json'), 'utf8'));
  // matrix expansion: entry.matrix = {a:[...], b:[...]} with {a}/{b} tokens in string fields
  const out = [];
  for (const e of reg) {
    if (e.matrix && Array.isArray(e.matrix.a) && Array.isArray(e.matrix.b)) {
      for (const a of e.matrix.a) for (const b of e.matrix.b) {
        const sub = (s) => String(s).split('{a}').join(a).split('{b}').join(b);
        const clone = JSON.parse(JSON.stringify(e));
        delete clone.matrix;
        for (const k of Object.keys(clone)) {
          if (typeof clone[k] === 'string') clone[k] = sub(clone[k]);
        }
        if (Array.isArray(clone.faq)) clone.faq = clone.faq.map(f => ({ q: sub(f.q), a: sub(f.a) }));
        if (Array.isArray(clone.explainer)) clone.explainer = clone.explainer.map(x => ({ h: sub(x.h), body: sub(x.body) }));
        out.push(clone);
      }
    } else out.push(e);
  }
  return out;
}

function faqJsonLd(faq) {
  return faq.map((f, i) =>
    '        {"@type":"Question","name":' + JSON.stringify(f.q) +
    ',"acceptedAnswer":{"@type":"Answer","text":' + JSON.stringify(f.a) + '}}' + (i < faq.length - 1 ? ',' : '')
  ).join('\n');
}

function faqItems(faq) {
  return faq.map(f =>
    '        <details>\n' +
    '          <summary>' + esc(f.q) + CHEV + '</summary>\n' +
    '          <div class="a">' + esc(f.a) + '</div>\n' +
    '        </details>'
  ).join('\n');
}

function explainerHtml(list) {
  return list.map(x =>
    '        <div class="card">\n' +
    '          <h3>' + esc(x.h) + '</h3>\n' +
    '          ' + x.body + '\n' +
    '        </div>'
  ).join('\n');
}

function relatedHtml(registry, entry) {
  const same = registry.filter(e => e.category === entry.category && e.slug !== entry.slug && e.handbuilt);
  const pick = (same.length >= 3 ? same : registry.filter(e => e.slug !== entry.slug)).slice(0, 3);
  const links = pick.map(e =>
    '          <a href="' + e.slug + '"><span class="t">' + esc(e.title) + '</span><span class="d">' + esc(e.cardDesc) + '</span></a>'
  ).join('\n');
  return '        <h2>Related tools</h2>\n        <div class="related-grid">\n' + links + '\n        </div>';
}

const CAT_ANCHOR = {
  'Text Tools': 'text-tools', 'Generators': 'generators', 'Converters': 'converters',
  'Image Tools': 'image-tools', 'Developer Tools': 'dev-tools', 'Calculators': 'calculators',
  'Everyday Tools': 'everyday-tools', 'Business Tools': 'business-tools',
  'Downloaders': 'downloaders'
};

// footer nav aria-labels do not match category names 1:1 (footer groups 8 categories into 6)
const FOOT_NAV = {
  'Text Tools': 'Text tools', 'Generators': 'Generators', 'Converters': 'Converters',
  'Image Tools': 'More tools', 'Developer Tools': 'More tools', 'Calculators': 'Calculators',
  'Everyday Tools': 'More tools', 'Business Tools': 'Business'
};

const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const CAT_ICON = {
  'Text Tools': SVG_OPEN + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>',
  'Generators': SVG_OPEN + '<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8L20 3"/><path d="M16 7l3 3M13.5 9.5l2.5 2.5"/></svg>',
  'Converters': SVG_OPEN + '<path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/></svg>',
  'Image Tools': SVG_OPEN + '<path d="M4 4h6v6M20 20h-6v-6M9 9L4 4M15 15l5 5"/></svg>',
  'Developer Tools': SVG_OPEN + '<path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1"/></svg>',
  'Calculators': DOLLAR_ICON,
  'Everyday Tools': SVG_OPEN + '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/></svg>',
  'Business Tools': SVG_OPEN + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>',
  'Downloaders': SVG_OPEN + '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>'
};
const GO_TEXT = { 'Calculators': 'Open calculator &rarr;' };
const GO_DEFAULT = 'Open tool &rarr;';

function renderPage(tpl, registry, e) {
  const toolUI = '        <div class="tool-grid">\n' + e.toolUI + '\n        </div>';
  const toolJS = '    <script>\n' + e.toolJS + '\n    </script>';
  const extraCSSBlock = e.extraCSS ? '    <style>\n' + e.extraCSS + '\n    </style>' : '';
  const anchor = CAT_ANCHOR[e.category] || 'tools';
  const vals = {
    '{{title}}': esc(e.title),
    '{{pageTitle}}': esc(e.pageTitle || e.title),
    '{{seoDescription}}': esc(e.seoDescription),
    '{{ogDescription}}': esc(e.seoDescription),
    '{{keywords}}': esc(e.keywords),
    '{{slug}}': e.slug,
    '{{appCategory}}': ({ 'Calculators': 'FinanceApplication', 'Developer Tools': 'DeveloperApplication', 'Image Tools': 'MultimediaApplication', 'Generators': 'UtilitiesApplication', 'Converters': 'UtilitiesApplication', 'Text Tools': 'UtilitiesApplication', 'Everyday Tools': 'LifestyleApplication', 'Business Tools': 'BusinessApplication', 'Downloaders': 'MultimediaApplication' })[e.category] || 'UtilitiesApplication',
    '{{h1}}': esc(e.h1),
    '{{lede}}': e.lede,
    '{{crumbCatHref}}': 'index.html#' + anchor,
    '{{crumbCatName}}': esc(e.category),
    '{{crumbTitle}}': esc(e.title),
    '{{toolUI}}': toolUI,
    '{{extraCSSBlock}}': extraCSSBlock,
    '{{explainer}}': explainerHtml(e.explainer),
    '{{related}}': relatedHtml(registry, e),
    '{{faqTitle}}': esc(e.title + ' FAQs'),
    '{{faqItems}}': faqItems(e.faq),
    '{{faqJsonLd}}': faqJsonLd(e.faq),
    '{{toolJS}}': toolJS,
    '{{footer}}': '{{footer}}' // replaced later with synced footer
  };
  let out = tpl;
  for (const [k, v] of Object.entries(vals)) out = out.split(k).join(v);
  return out;
}

function main() {
  const registry = loadRegistry();
  const tpl = fs.readFileSync(path.join(ROOT, 'scripts', 'templates', 'page.html'), 'utf8');
  const generated = registry.filter(e => e.generated);
  console.log('generated entries:', generated.length);

  // ---- 1. render new pages (without footer yet) ----
  const pages = [];
  for (const e of generated) {
    if (!e.slug || !e.title || !e.toolUI || !e.toolJS || !e.faq || !e.explainer) {
      throw new Error('registry entry missing required fields: ' + e.slug);
    }
    if (e.title.length > 21) throw new Error('card title >21 chars: ' + e.slug);
    if (e.cardDesc.length > 64) throw new Error('card desc >64 chars: ' + e.slug);
    const html = renderPage(tpl, registry, e);
    const dest = path.join(ROOT, e.slug);
    fs.writeFileSync(dest, html);
    pages.push(e.slug);
  }
  console.log('pages written:', pages.length);

  // ---- 2. update index.html ----
  let idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  // hero count (only tools that actually have pages: handbuilt + generated)
  const liveTools = registry.filter(e => e.handbuilt || e.generated);
  const totalTools = liveTools.length;
  idx = idx.replace(/<div><strong>\d+<\/strong><span>Tools<\/span><\/div>/,
    '<div><strong>' + totalTools + '</strong><span>Tools</span></div>');
  // meta description count
  idx = idx.replace(/(Micro Tools Hub: )\d+( free online tools)/, '$1' + totalTools + '$2');
  // keywords: append new titles
  const newKw = generated.map(e => e.title.toLowerCase()).join(', ');
  idx = idx.replace(/(<meta name="keywords" content="[^"]*?)(" \/>)/, (m, a, b) => {
    return a.includes('percentage calculator') ? m : a + ', ' + newKw + b;
  });

  // cards: append new cards into each entry's own category block (idempotent)
  // entries with noCard:true (e.g. currency pair pages consolidated under one converter) are skipped
  // NOTE: use liveTools (handbuilt + generated), not just generated
  const byCat = {};
  for (const e of liveTools) {
    if (e.noCard) continue;
    const anchor = CAT_ANCHOR[e.category] || 'tools';
    (byCat[anchor] = byCat[anchor] || []).push(e);
  }
  for (const anchor of Object.keys(byCat)) {
    const gridRe = new RegExp('(<div class="cat-block" id="' + anchor + '">[\\s\\S]*?<div class="cards-grid">)([\\s\\S]*?)(</div>\\s*</div>)');
    const gm = idx.match(gridRe);
    if (!gm) throw new Error('cat-block not found: ' + anchor);
    let grid = gm[2];
    byCat[anchor].forEach((e, i) => {
      if (grid.includes('href="' + e.slug + '"')) return; // already present
      const tint = TINTS[i % TINTS.length];
      const icon = iconFor(e, CAT_ICON[e.category] || DOLLAR_ICON);
      const go = GO_TEXT[e.category] || GO_DEFAULT;
      grid += '            <a class="tool-card ' + tint + '" href="' + e.slug + '">\n' +
        '              <span class="card-icon">' + icon + '</span>\n' +
        '              <span class="t">' + esc(e.title) + '</span>\n' +
        '              <span class="d">' + esc(e.cardDesc) + '</span>\n' +
        '              <span class="go">' + go + '</span>\n' +
        '            </a>\n';
    });
    idx = idx.replace(gridRe, (m, a) => a + grid + gm[3]);
  }

  // refresh icons on existing cards so iconFor() changes apply retroactively
  for (const e of liveTools) {
    if (e.noCard) continue;
    const icon = iconFor(e, CAT_ICON[e.category] || DOLLAR_ICON);
    const slugEsc = e.slug.replace(/\./g, '\\.');
    const cardIconRe = new RegExp('(<a class="tool-card[^"]*" href="' + slugEsc + '">\\s*<span class="card-icon">)[\\s\\S]*?(</span>)');
    idx = idx.replace(cardIconRe, (m, a, b) => a + icon + b);
  }

  // remove cards for entries that became noCard:true (idempotent both ways)
  const noCardSlugs = new Set(registry.filter(e => e.noCard).map(e => e.slug));
  if (noCardSlugs.size) {
    idx = idx.replace(/<a class="tool-card[^"]*" href="([^"]+)">[\s\S]*?<\/a>\n?/g,
      (m, slug) => noCardSlugs.has(slug) ? '' : m);
  }

  // footer: slim link-columns now (no per-tool navs) — nothing to append per entry.
  // The byte-identical sync below keeps the footer uniform across all pages.

  fs.writeFileSync(path.join(ROOT, 'index.html'), idx);
  console.log('index.html updated');

  // ---- 3. sync footer byte-identical across ALL html files ----
  const footRe = /    <footer class="footer">[\s\S]*?\n    <\/footer>/;
  const footMatch = idx.match(footRe);
  if (!footMatch) throw new Error('footer block not found in index.html');
  const footer = footMatch[0];
  // inject footer into generated pages (they still carry the {{footer}} token)
  for (const slug of pages) {
    const p = path.join(ROOT, slug);
    let h = fs.readFileSync(p, 'utf8');
    h = h.split('{{footer}}').join(footer);
    fs.writeFileSync(p, h);
  }
  // sync across every html file
  const htmlFiles = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) { if (f !== 'node_modules') walk(fp); }
      else if (f.endsWith('.html')) htmlFiles.push(fp);
    }
  })(ROOT);
  let synced = 0;
  for (const fp of htmlFiles) {
    let h = fs.readFileSync(fp, 'utf8');
    if (!footRe.test(h)) { console.log('WARN no footer in', path.relative(ROOT, fp)); continue; }
    const nh = h.replace(footRe, () => footer);
    if (nh !== h) { fs.writeFileSync(fp, nh); synced++; }
  }
  console.log('footer synced, files changed:', synced, '/', htmlFiles.length);

  // ---- 3b. sync styles.css version across ALL html files ----
  const tplCss = (idx.match(/styles\.css\?v=(\d+)/) || [])[1];
  if (tplCss) {
    const cssRe = /styles\.css\?v=\d+/g;
    let cssSynced = 0;
    for (const fp of htmlFiles) {
      let h = fs.readFileSync(fp, 'utf8');
      const nh = h.replace(cssRe, 'styles.css?v=' + tplCss);
      if (nh !== h) { fs.writeFileSync(fp, nh); cssSynced++; }
    }
    console.log('css version synced to v' + tplCss + ', files changed:', cssSynced);
  }

  // ---- 4. sitemap.xml ----
  const smPath = path.join(ROOT, 'sitemap.xml');
  let sm = fs.readFileSync(smPath, 'utf8');
  // bump index.html lastmod
  sm = sm.replace(/(<loc>https:\/\/tools\.xsrazy\.web\.id\/index\.html<\/loc>\s*<lastmod>)[\d-]+(<\/lastmod>)/, '$1' + TODAY + '$2');
  const existingLocs = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
  const additions = [];
  for (const e of liveTools) {
    const loc = SITE + '/' + e.slug;
    if (!existingLocs.has(loc)) {
      additions.push('  <url>\n    <loc>' + loc + '</loc>\n    <lastmod>' + TODAY + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>');
      existingLocs.add(loc);
    }
  }
  if (additions.length) {
    sm = sm.replace(/<\/urlset>/, additions.join('\n') + '\n</urlset>');
  }
  fs.writeFileSync(smPath, sm);
  console.log('sitemap urls:', existingLocs.size, '| added:', additions.length);

  console.log('DONE');
}

main();
