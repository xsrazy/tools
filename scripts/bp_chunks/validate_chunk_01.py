#!/usr/bin/env python3
"""Validate chunk_01.json: schema, lengths, uniqueness, banned content, ids, and node --check on every toolJS."""
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.expanduser('~/workspace/micro-tools-site')
BP = os.path.join(ROOT, 'hidden_files', 'bp_chunks')
PATH = os.path.join(BP, 'chunk_01.json')

pairs = json.load(open(os.path.join(BP, 'lists', 'chunk_01_pairs.json')))
registry = json.load(open(os.path.join(ROOT, 'data', 'tools-registry.json')))
existing_slugs = {e['slug'] for e in registry}

errors = []


def err(msg):
    errors.append(msg)
    print('FAIL:', msg)


data = json.load(open(PATH))
print('entries:', len(data))

# 1. count + slugs match pair list
want_slugs = [p['slug'] for p in pairs]
got_slugs = [e['slug'] for e in data]
if len(data) != 50:
    err('expected 50 entries, got %d' % len(data))
if got_slugs != want_slugs:
    err('slug order/content mismatch vs pair list')
if len(set(got_slugs)) != len(got_slugs):
    err('duplicate slugs within chunk')
for s in got_slugs:
    if s in existing_slugs:
        err('slug already in registry: ' + s)

KEYS = ['slug', 'title', 'cardDesc', 'category', 'templateType', 'generated',
        'source', 'pageTitle', 'h1', 'lede', 'keywords', 'seoDescription',
        'toolUI', 'toolJS', 'extraCSS', 'explainer', 'faq']

EMOJI_RE = re.compile('['
                      '\U0001F300-\U0001FAFF'
                      '\u2600-\u27BF'
                      '\u2B00-\u2BFF'
                      '\uFE0F'
                      ']')
DASH_RE = re.compile('[\u2013\u2014]')

seo_seen = {}
for e in data:
    slug = e.get('slug', '?')
    # 2. exact 17 keys
    if sorted(e.keys()) != sorted(KEYS):
        err('%s: keys mismatch: %s' % (slug, sorted(e.keys())))
    # 3. fixed fields
    if e.get('category') != 'Developer Tools':
        err('%s: bad category' % slug)
    if e.get('templateType') != 'textToText':
        err('%s: bad templateType' % slug)
    if e.get('generated') is not False:
        err('%s: generated not false' % slug)
    if e.get('source') != 'blueprint':
        err('%s: bad source' % slug)
    if e.get('extraCSS') != '':
        err('%s: extraCSS not empty' % slug)
    # 4. lengths
    if len(e.get('title', '')) > 21:
        err('%s: title %d chars' % (slug, len(e['title'])))
    if len(e.get('cardDesc', '')) > 64:
        err('%s: cardDesc %d chars' % (slug, len(e['cardDesc'])))
    sd = e.get('seoDescription', '')
    if not (150 <= len(sd) <= 160):
        err('%s: seoDescription %d chars' % (slug, len(sd)))
    if sd in seo_seen:
        err('%s: seoDescription duplicates %s' % (slug, seo_seen[sd]))
    seo_seen[sd] = slug
    # 5. faq / explainer (CORRECTED schema: explainer = 2 objects with h + body)
    faq = e.get('faq', [])
    if len(faq) != 5 or any(set(f.keys()) != {'q', 'a'} or not f['q'].strip() or not f['a'].strip() for f in faq):
        err('%s: faq must be exactly 5 {q,a} with non-empty text' % slug)
    ex = e.get('explainer', [])
    if len(ex) != 2 or any(set(x.keys()) != {'h', 'body'} for x in ex):
        err('%s: explainer must be exactly 2 {h,body} objects' % slug)
    else:
        for x in ex:
            if not x['h'].strip() or not x['body'].strip().startswith('<p>') or not x['body'].strip().endswith('</p>'):
                err('%s: explainer body must be <p>...</p> with heading' % slug)
    # 6. lede: NO outer <p> wrapper (CORRECTED schema)
    lede = e.get('lede', '')
    if lede.strip().startswith('<p>') or lede.strip().endswith('</p>'):
        err('%s: lede must not be wrapped in <p>' % slug)
    if not lede.strip():
        err('%s: empty lede' % slug)
    # 7. banned content everywhere
    blob = json.dumps(e, ensure_ascii=False)
    if EMOJI_RE.search(blob):
        err('%s: emoji found' % slug)
    if DASH_RE.search(blob):
        err('%s: em/en dash found' % slug)
    if 'lorem ipsum' in blob.lower():
        err('%s: lorem ipsum found' % slug)
    if '</script>' in e.get('toolUI', '') or '</script>' in e.get('toolJS', ''):
        err('%s: literal </script> in toolUI/toolJS' % slug)
    if re.search(r'__[A-Z]+__', e.get('toolJS', '')):
        err('%s: unreplaced __TOKEN__ in toolJS' % slug)
    # 8. toolUI structure
    ui = e.get('toolUI', '')
    if not ui.startswith('<div class="card panel">'):
        err('%s: toolUI must start with <div class="card panel">' % slug)
    # 9. ids referenced in toolJS exist in toolUI
    k = slug[:-5]
    need_ids = {k + s for s in ('-input', '-output', '-convert', '-sample', '-copy',
                               '-download', '-error', '-error-msg', '-status')}
    if 'var HAS_TABLE = true;' in e.get('toolJS', ''):
        need_ids.add(k + '-table')
    ui_ids = set(re.findall(r'id="([^"]+)"', ui))
    for i in sorted(need_ids):
        if i not in ui_ids:
            err('%s: id referenced in toolJS missing from toolUI: %s' % (slug, i))
    # 10. toolJS shape
    tjs = e.get('toolJS', '')
    if not tjs.startswith('(function(){') or not tjs.rstrip().endswith('})();'):
        err('%s: toolJS must be a single IIFE' % slug)
    if 'TODO' in tjs or 'FIXME' in tjs:
        err('%s: stub marker in toolJS' % slug)

# 11. node --check every toolJS
tmpdir = tempfile.mkdtemp(prefix='chunk01js_')
node_fails = 0
for e in data:
    p = os.path.join(tmpdir, e['slug'].replace('.html', '') + '.js')
    open(p, 'w').write(e['toolJS'])
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    if r.returncode != 0:
        node_fails += 1
        err('%s: node --check failed: %s' % (e['slug'], r.stderr.strip()[:300]))
print('node --check: %d/%d passed' % (len(data) - node_fails, len(data)))

print()
if errors:
    print('VALIDATION FAILED:', len(errors), 'errors')
    sys.exit(1)
print('ALL VALIDATION CHECKS PASSED')
