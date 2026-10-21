#!/usr/bin/env python3
"""Merge blueprint chunk files into data/tools-registry.json.

Reads ~/workspace/micro-tools-site/hidden_files/bp_chunks/chunk_*.json,
validates every entry (schema, lengths, uniqueness, toolJS via node --check),
dedupes slugs first-wins, backs up the registry, and merges.
"""
import json, glob, os, re, subprocess, sys, shutil
from collections import Counter

ROOT = os.path.expanduser('~/workspace/micro-tools-site')
CHUNK_DIR = os.path.join(ROOT, 'hidden_files', 'bp_chunks')
REG = os.path.join(ROOT, 'data', 'tools-registry.json')

CATEGORIES = {'Text Tools','Generators','Converters','Image Tools','Developer Tools',
              'Calculators','Everyday Tools','Business Tools'}
TEMPLATES = {'textToText','calculator','generator','fileDropzone','visualPlayground'}
REQ_KEYS = {'slug','title','cardDesc','category','templateType','generated','source',
            'pageTitle','h1','lede','keywords','seoDescription','toolUI','toolJS',
            'extraCSS','explainer','faq'}

def fail(msg):
    print('FATAL:', msg); sys.exit(1)

reg = json.load(open(REG))
existing_slugs = {e['slug'] for e in reg}
existing_sds = {e.get('seoDescription') for e in reg if e.get('seoDescription')}

files = sorted(glob.glob(os.path.join(CHUNK_DIR, 'chunk_*.json')))
if len(files) != 18:
    fail(f'expected 18 chunk files, found {len(files)} — refusing partial merge')
print(f'chunks: {len(files)}')

new_entries, errors, seen_slugs, dropped = [], [], set(), []
pt_normalized = 0
for fp in files:
    tag = os.path.basename(fp)
    try:
        arr = json.load(open(fp))
    except Exception as ex:
        errors.append(f'{tag}: invalid JSON: {ex}'); continue
    if not isinstance(arr, list):
        errors.append(f'{tag}: not a JSON array'); continue
    for i, e in enumerate(arr):
        t = f'{tag}[{i}]'
        if not isinstance(e, dict):
            errors.append(f'{t}: not an object'); continue
        missing = REQ_KEYS - set(e.keys())
        if missing: errors.append(f'{t}: missing keys {sorted(missing)}')
        slug = e.get('slug', '')
        if not re.fullmatch(r'[a-z0-9-]+\.html', slug or ''):
            errors.append(f'{t}: bad slug {slug!r}')
        if slug in existing_slugs:
            errors.append(f'{t}: slug collides with existing registry entry {slug}')
        if slug in seen_slugs:
            dropped.append(f'{t}: duplicate slug {slug} (first occurrence kept)')
            continue
        seen_slugs.add(slug)
        if not isinstance(e.get('title'), str) or len(e['title']) > 21:
            errors.append(f'{t}: title >21 chars ({len(e.get("title",""))})')
        if not isinstance(e.get('cardDesc'), str) or len(e['cardDesc']) > 64:
            errors.append(f'{t}: cardDesc >64 chars ({len(e.get("cardDesc",""))})')
        sd = e.get('seoDescription', '')
        if not isinstance(sd, str) or not (150 <= len(sd) <= 160):
            errors.append(f'{t}: seoDescription len {len(sd)} not in 150-160')
        if e.get('category') not in CATEGORIES:
            errors.append(f'{t}: bad category {e.get("category")!r}')
        if e.get('templateType') not in TEMPLATES:
            errors.append(f'{t}: bad templateType {e.get("templateType")!r}')
        if not isinstance(e.get('generated'), bool):
            errors.append(f'{t}: generated not bool')
        if e.get('source') != 'blueprint':
            errors.append(f'{t}: source != blueprint')
        for tf in ('toolUI','toolJS','lede','h1','pageTitle','keywords'):
            if not isinstance(e.get(tf), str) or not e[tf].strip():
                errors.append(f'{t}: empty {tf}')
        faq = e.get('faq')
        if not isinstance(faq, list) or len(faq) != 5 or any(not f.get('q') or not f.get('a') for f in faq):
            errors.append(f'{t}: faq must be 5 q/a pairs')
        exp = e.get('explainer')
        if (not isinstance(exp, list) or len(exp) != 2
                or any(not isinstance(x, dict) or not x.get('h') or '<p>' not in x.get('body','') for x in exp)):
            errors.append(f'{t}: explainer must be 2 objects {{"h","body"}} with <p> body')
        lede = e.get('lede','')
        if lede.lstrip().startswith('<p>'):
            errors.append(f'{t}: lede must NOT have an outer <p> wrapper (template adds it)')
        # </script> inside toolJS would prematurely close generate.js's inlined
        # <script> block and break the page: always reject. In toolUI (which is
        # inlined into the body) allow only CDN <script src="https://..."> tags.
        if '</script' in e.get('toolJS','').lower():
            errors.append(f'{t}: </script> in toolJS would break the page')
        ui_tmp = re.sub(r'<script\s+src="https?://[^"]*"\s*>\s*</script\s*>', '',
                        e.get('toolUI',''), flags=re.I)
        if re.search(r'<script', ui_tmp, re.I):
            errors.append(f'{t}: non-CDN <script> in toolUI')
        # normalize: pageTitle must NOT carry the site suffix (template adds
        # "| Micro Tools Hub" to <title> itself; pageTitle feeds og:title raw)
        pt = e.get('pageTitle')
        if isinstance(pt, str) and pt.endswith('| Micro Tools Hub'):
            e['pageTitle'] = pt[: -len('| Micro Tools Hub')].rstrip(' |')
            pt_normalized += 1
        new_entries.append(e)

print(f'new entries: {len(new_entries)}, existing: {len(reg)}, dropped dupes: {len(dropped)}, pageTitles normalized: {pt_normalized}')
for d in dropped: print('  DROP', d)

if errors:
    print(f'\n{len(errors)} ERRORS:')
    for er in errors[:60]: print(' ', er)
    if len(errors) > 60: print(f'  ... and {len(errors)-60} more')
    sys.exit(1)

# seoDescription uniqueness across new entries and vs existing registry
sds = [e['seoDescription'] for e in new_entries]
dups = [s for s, c in Counter(sds).items() if c > 1]
if dups: fail(f'duplicate seoDescriptions within batch: {len(dups)}')
clash = set(sds) & existing_sds
if clash: fail(f'seoDescription clashes with existing registry: {len(clash)}')

# toolJS syntax check via node --check (batched)
print('node --check on toolJS blocks...')
bad = []
tmpd = '/tmp/bpjscheck'
os.makedirs(tmpd, exist_ok=True)
for i, e in enumerate(new_entries):
    p = os.path.join(tmpd, f'e{i}.js')
    open(p, 'w').write(e['toolJS'])
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    if r.returncode != 0:
        bad.append(f"{e['slug']}: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else 'syntax error'}")
shutil.rmtree(tmpd, ignore_errors=True)
if bad:
    print(f'{len(bad)} toolJS syntax ERRORS:'); [print(' ', b) for b in bad[:30]]
    sys.exit(1)
print('toolJS syntax OK:', len(new_entries))

# backup + merge
shutil.copy(REG, REG + '.bak')
reg.extend(new_entries)
json.dump(reg, open(REG, 'w'), indent=1, ensure_ascii=False)
gen_true = sum(1 for e in new_entries if e['generated'])
print(f'MERGED OK: registry now {len(reg)} entries (+{len(new_entries)}; generated:true in batch = {gen_true})')
