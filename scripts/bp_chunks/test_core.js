const fs = require('fs');
const core = fs.readFileSync('/home/hatch/workspace/micro-tools-site/scripts/bp_chunks/tpl_core.js', 'utf8');
eval(core);

let fails = 0;
function ok(name, cond, extra) {
  if (!cond) { fails++; console.log('FAIL:', name, extra || ''); }
  else console.log('ok:', name);
}

const JSON_SAMPLE = JSON.parse('[{"name":"Ava","role":"Designer","active":true,"contact":{"email":"ava@example.com","city":"Jakarta"},"tags":["ui","ux"]}]');
const TOML_SAMPLE = '[[users]]\nname = "Ava"\nrole = "Designer"\nactive = true\ntags = ["ui", "ux"]\n\n[users.contact]\nemail = "ava@example.com"\ncity = "Jakarta"\n\n[[users]]\nname = "Ben"\nrole = "Developer"\nactive = false\ntags = ["backend"]\n\n[users.contact]\nemail = "ben@example.com"\ncity = "Bandung"';

// TOML parse
const tp = mthParseToml(TOML_SAMPLE);
ok('toml users', Array.isArray(tp.users) && tp.users.length === 2, JSON.stringify(tp).slice(0, 80));
ok('toml nested', tp.users[0].contact.city === 'Jakarta');
ok('toml types', tp.users[0].active === true && tp.users[1].active === false);
ok('toml array', JSON.stringify(tp.users[0].tags) === '["ui","ux"]');

// TOML edge cases
const tp2 = mthParseToml('title = "a=b # not comment"\ncount = 1_000\npi = 3.14\nflag = false\nday = 2024-01-01\ndotted.key = 1\n[server]\nhost = "x"\n');
ok('toml edge', tp2.title === 'a=b # not comment' && tp2.count === 1000 && tp2.pi === 3.14 && tp2.dotted.key === 1 && tp2.server.host === 'x', JSON.stringify(tp2));
const tp3 = mthParseToml('key = [1,\n 2, # comment\n 3]\npoint = {x = 1, y = 2}\n');
ok('toml multiline', JSON.stringify(tp3.key) === '[1,2,3]' && tp3.point.x === 1);

// TOML emit + round trip
const te = mthEmitToml(JSON_SAMPLE, 'items');
ok('toml emit', te.indexOf('[[items]]') > -1 && te.indexOf('[items.contact]') > -1, te.split('\n').slice(0, 6).join('|'));
const rt = mthParseToml(te);
ok('toml roundtrip', rt.items[0].contact.city === 'Jakarta' && rt.items[0].active === true);
const te2 = mthEmitToml(tp, 'users');
ok('toml emit 2', mthParseToml(te2).users.length === 2);

// rows / flatten
const rows = mthRowsOf(JSON_SAMPLE);
ok('rows flatten', rows[0]['contact.city'] === 'Jakarta' && rows[0].tags === 'ui, ux');
const rowsT = mthRowsOf(tp);
ok('rows unwrap', rowsT.length === 2 && rowsT[0].name === 'Ava', JSON.stringify(rowsT[0]));

// delim
const tsv = mthEmitDelim(rows, '\t');
ok('tsv', tsv.split('\n')[0].split('\t')[0] === 'name' && tsv.split('\n').length === 2);
const csv = mthEmitDelim([{a: 'x,y', b: 'q"q'}, {a: 'z', b: 'w'}], ',');
ok('csv quote', csv.indexOf('"x,y"') > -1 && csv.indexOf('"q""q"') > -1, csv);

// jsonl / json
ok('jsonl', mthEmitJsonl(rows).split('\n').length === 1 && mthEmitJsonl([{a:1},{a:2}]).split('\n').length === 2);
ok('json', mthEmitJson({a: 1}).indexOf('"a": 1') > -1);

// xml
const xm = mthEmitXml(rows, 'rows');
ok('xml', xm.indexOf('<rows>') > -1 && xm.indexOf('<name>Ava</name>') > -1 && xm.indexOf('<?xml') === 0);
const xm2 = mthEmitXml([{k: 'a&b <c>'}], 'rows');
ok('xml esc', xm2.indexOf('a&amp;b &lt;c&gt;') > -1);
const xm3 = mthEmitXml([{'weird key!': 1}], 'rows');
ok('xml name', xm3.indexOf('<weird_key_>') > -1, xm3);

// html / md
const ht = mthEmitHtmlTable(rows);
ok('html', ht.indexOf('<table>') === 0 && ht.indexOf('<th>contact.city</th>') > -1);
const md = mthEmitMdTable([{a: 'x|y', b: 'l1\nl2'}]);
ok('md', md.indexOf('x\\|y') > -1 && md.indexOf('l1<br>l2') > -1, md.split('\n')[2]);

// sql
const sq = mthEmitSql([{name: "O'Brien", n: 3, b: true, e: ''}], 'my_table');
ok('sql', sq.indexOf("O''Brien") > -1 && sq.indexOf('NULL') > -1 && sq.indexOf('`my_table`') > -1, sq);

// php
const ph = mthEmitPhp({a: "x'y", n: 2, b: false});
ok('php', ph.indexOf("<?php") === 0 && ph.indexOf("'a' => 'x\\'y'") > -1 && ph.indexOf("'b' => false") > -1, ph.split('\n').slice(0, 4).join('|'));

// ini
const ini = mthEmitIni({title: 'hi', db: {host: 'x', port: 1}});
ok('ini', ini.indexOf('[db]') > -1 && ini.indexOf('title = hi') === 0, ini);
const ini2 = mthEmitIni([{a: 1}, {a: 2}]);
ok('ini arr', ini2.indexOf('[item_1]') > -1 && ini2.indexOf('[item_2]') > -1);

// yaml
const ym = mthEmitYaml(JSON_SAMPLE);
ok('yaml', ym.indexOf('- name: Ava') === 0 && ym.indexOf('contact:\n    email: ava@example.com') > -1, ym.split('\n').slice(0, 5).join('|'));
const ym2 = mthEmitYaml({k: 'a: b', n: 'yes', m: 5});
ok('yaml quote', ym2.indexOf('"a: b"') > -1 && ym2.indexOf('"yes"') > -1 && ym2.indexOf('m: 5') > -1, ym2);

// error paths
try { mthParseToml('key = [1,'); ok('toml err', false); } catch (e) { ok('toml err', true); }
try { mthEmitDelim([], ','); ok('empty err', false); } catch (e) { ok('empty err', true); }

console.log(fails === 0 ? 'ALL CORE TESTS PASSED' : fails + ' FAILURES');
process.exit(fails ? 1 : 0);
