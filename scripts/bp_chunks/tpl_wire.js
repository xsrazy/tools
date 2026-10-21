(function(){
'use strict';
__CORE__
var K = '__K__';
var FROM_NAME = '__FROM__';
var TO_NAME = '__TO__';
var PARSE = '__PARSE__';
var DELIM = __DELIM__;
var EMIT = '__EMIT__';
var ROOT_NAME = __ROOT__;
var SAMPLE = __SAMPLE__;
var DL_NAME = '__DL_NAME__';
var DL_MIME = '__DL_MIME__';
var HAS_TABLE = __HAS_TABLE__;
var __wb = null;
var __scripts = {};
function loadLib(url, cb){
  if (__scripts[url] === 2){ cb(null); return; }
  if (__scripts[url] === 1){ setTimeout(function(){ loadLib(url, cb); }, 120); return; }
  __scripts[url] = 1;
  var s = document.createElement('script');
  s.src = url; s.async = true;
  s.onload = function(){ __scripts[url] = 2; cb(null); };
  s.onerror = function(){ __scripts[url] = 0; cb(new Error('cdn')); };
  document.head.appendChild(s);
}
function gid(id){ return document.getElementById(id); }
function parseInput(src, cb){
  if (PARSE === 'json'){
    var d;
    try { d = JSON.parse(src); } catch(e){ cb(new Error('Invalid JSON: ' + e.message)); return; }
    cb(null, d); return;
  }
  if (PARSE === 'delim'){
    loadLib('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js', function(err){
      if (err){ cb(new Error('Could not load the CSV parser from the CDN. Check your connection and try again.')); return; }
      var res;
      try { res = window.Papa.parse(src, { header: true, skipEmptyLines: 'greedy', delimiter: DELIM }); }
      catch(e){ cb(e); return; }
      var bad = (res.errors || []).filter(function(e){ return e.code !== 'TooFewFields' && e.code !== 'TooManyFields'; });
      if (bad.length){ cb(new Error(bad[0].message + (bad[0].row !== undefined ? ' (near row ' + (bad[0].row + 1) + ')' : ''))); return; }
      cb(null, res.data);
    });
    return;
  }
  if (PARSE === 'yaml'){
    loadLib('https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js', function(err){
      if (err){ cb(new Error('Could not load the YAML parser from the CDN. Check your connection and try again.')); return; }
      var d2;
      try { d2 = window.jsyaml.load(src); } catch(e){ cb(e); return; }
      cb(null, d2);
    });
    return;
  }
  if (PARSE === 'toml'){
    var d3;
    try { d3 = mthParseToml(src); } catch(e){ cb(new Error('Invalid TOML: ' + e.message)); return; }
    cb(null, d3); return;
  }
  cb(new Error('Unknown parser'));
}
function emitOutput(data, table, cb){
  try {
    var rows, text, note;
    if (EMIT === 'xlsx'){
      rows = mthRowsOf(data);
      if (!rows.length) throw new Error('No rows found to convert.');
      loadLib('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', function(err){
        if (err){ cb(new Error('Could not load the spreadsheet library from the CDN. Check your connection and try again.')); return; }
        try {
          var ws = window.XLSX.utils.json_to_sheet(rows.map(function(r){
            var o = {};
            Object.keys(r).forEach(function(k){ o[k] = mthCell(r[k]); });
            return o;
          }));
          var wb = window.XLSX.utils.book_new();
          window.XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
          __wb = wb;
          cb(null, { text: 'Spreadsheet ready: ' + rows.length + ' row(s) x ' + mthUnionKeys(rows).length + ' column(s).\nPress Download to save ' + DL_NAME + '.', note: 'Converted ' + rows.length + ' row(s) to XLSX.' });
        } catch(e){ cb(e); }
      });
      return;
    }
    switch (EMIT){
      case 'tsv': rows = mthRowsOf(data); text = mthEmitDelim(rows, '\t'); note = 'Converted ' + rows.length + ' row(s) to TSV.'; break;
      case 'csv': rows = mthRowsOf(data); text = mthEmitDelim(rows, ','); note = 'Converted ' + rows.length + ' row(s) to CSV.'; break;
      case 'jsonl': text = mthEmitJsonl(data); note = 'Converted to JSONL.'; break;
      case 'toml': text = mthEmitToml(data, ROOT_NAME); note = 'Converted to TOML.'; break;
      case 'xml': text = mthEmitXml(data, ROOT_NAME); note = 'Converted to XML.'; break;
      case 'htmltable': rows = mthRowsOf(data); text = mthEmitHtmlTable(rows); note = 'Converted ' + rows.length + ' row(s) to an HTML table.'; break;
      case 'mdtable': rows = mthRowsOf(data); text = mthEmitMdTable(rows); note = 'Converted ' + rows.length + ' row(s) to a Markdown table.'; break;
      case 'sql': rows = mthRowsOf(data); text = mthEmitSql(rows, table || 'my_table'); note = 'Generated an INSERT for ' + rows.length + ' row(s).'; break;
      case 'phparray': text = mthEmitPhp(data); note = 'Converted to a PHP array.'; break;
      case 'ini': text = mthEmitIni(data); note = 'Converted to INI.'; break;
      case 'yaml': text = mthEmitYaml(data); note = 'Converted to YAML.'; break;
      case 'json': text = mthEmitJson(data); note = 'Converted to JSON.'; break;
      default: throw new Error('Unknown emitter');
    }
    cb(null, { text: text, note: note });
  } catch(e){ cb(e); }
}
var inEl = gid(K + '-input');
if (inEl){
  var outEl = gid(K + '-output'), cBtn = gid(K + '-convert'), sBtn = gid(K + '-sample'),
      cpBtn = gid(K + '-copy'), dlBtn = gid(K + '-download'),
      errBox = gid(K + '-error'), errMsg = gid(K + '-error-msg'),
      statusEl = gid(K + '-status'), tableEl = HAS_TABLE ? gid(K + '-table') : null;
  var lastText = '';
  var deb = null;
  function showErr(t){ if (errMsg) errMsg.textContent = t; if (errBox) errBox.style.display = 'block'; }
  function hideErr(){ if (errBox) errBox.style.display = 'none'; if (errMsg) errMsg.textContent = ''; }
  function doConvert(){
    hideErr();
    var src = inEl.value;
    if (!src.trim()){
      outEl.value = ''; lastText = ''; __wb = null;
      if (statusEl) statusEl.textContent = 'Waiting for ' + FROM_NAME + ' input.';
      return;
    }
    if (statusEl) statusEl.textContent = 'Converting...';
    parseInput(src, function(perr, data){
      if (perr){
        lastText = ''; outEl.value = ''; __wb = null;
        if (statusEl) statusEl.textContent = 'Could not convert. See the error below.';
        showErr(perr.message || String(perr));
        return;
      }
      emitOutput(data, tableEl ? tableEl.value : 'my_table', function(eerr, res){
        if (eerr){
          lastText = ''; outEl.value = ''; __wb = null;
          if (statusEl) statusEl.textContent = 'Could not convert. See the error below.';
          showErr(eerr.message || String(eerr));
          return;
        }
        lastText = res.text;
        outEl.value = res.text;
        if (statusEl) statusEl.textContent = res.note;
      });
    });
  }
  inEl.addEventListener('input', function(){ if (deb) clearTimeout(deb); deb = setTimeout(doConvert, 350); });
  if (cBtn) cBtn.addEventListener('click', function(){ if (deb){ clearTimeout(deb); deb = null; } doConvert(); });
  if (sBtn) sBtn.addEventListener('click', function(){ inEl.value = SAMPLE; doConvert(); inEl.focus(); });
  if (cpBtn) cpBtn.addEventListener('click', function(){
    var t = lastText;
    if (!t) return;
    function done(ok){
      cpBtn.textContent = ok ? 'Copied' : 'Copy';
      setTimeout(function(){ cpBtn.textContent = 'Copy'; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(t).then(function(){ done(true); }, function(){ done(false); });
    } else {
      var tmp = document.createElement('textarea');
      tmp.value = t;
      tmp.style.position = 'fixed'; tmp.style.opacity = '0';
      document.body.appendChild(tmp);
      tmp.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch(e){}
      tmp.remove();
      done(ok);
    }
  });
  if (dlBtn) dlBtn.addEventListener('click', function(){
    if (EMIT === 'xlsx'){
      if (!__wb || !window.XLSX) return;
      window.XLSX.writeFile(__wb, DL_NAME);
      return;
    }
    if (!lastText) return;
    var blob = new Blob([lastText], { type: DL_MIME + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = DL_NAME;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  });
}
})();
