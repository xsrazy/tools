/* Micro Tools Hub converter core: pure functions, no DOM. Shared by every data-format converter page. */
function mthIsObj(v){ return v !== null && typeof v === 'object' && !Array.isArray(v); }

function mthFlatten(o, pfx, out){
  out = out || {}; pfx = pfx || '';
  if (!mthIsObj(o)) return out;
  Object.keys(o).forEach(function(k){
    var v = o[k];
    var key = pfx ? pfx + '.' + k : k;
    if (mthIsObj(v)) mthFlatten(v, key, out);
    else if (Array.isArray(v)){
      if (v.length && v.every(function(x){ return x === null || typeof x !== 'object'; })) out[key] = v.join(', ');
      else out[key] = JSON.stringify(v);
    } else out[key] = (v === undefined ? '' : v);
  });
  return out;
}

function mthRowsOf(data, raw){
  var arr;
  if (Array.isArray(data)) arr = data;
  else if (mthIsObj(data)){
    var ks = Object.keys(data), ak = null, i, vv;
    for (i = 0; i < ks.length; i++){
      vv = data[ks[i]];
      if (Array.isArray(vv) && vv.length && vv.every(mthIsObj)){ ak = ks[i]; break; }
    }
    arr = ak ? data[ak] : [data];
  } else arr = [{ value: data }];
  if (raw) return arr;
  return arr.map(function(r){ return mthIsObj(r) ? mthFlatten(r) : { value: r }; });
}

function mthUnionKeys(rows){
  var keys = [], seen = {};
  rows.forEach(function(r){
    Object.keys(r).forEach(function(k){ if (!seen[k]){ seen[k] = 1; keys.push(k); } });
  });
  return keys;
}

function mthCell(v){ return (v === null || v === undefined) ? '' : String(v); }

/* ---------- TOML parser (tables, arrays of tables, dotted keys, inline tables, multiline arrays) ---------- */
function mthParseToml(src){
  var root = {};
  var cur = root;

  function assignPath(o, parts, val){
    for (var i = 0; i < parts.length - 1; i++){
      var k = parts[i];
      if (!mthIsObj(o[k])) o[k] = {};
      o = o[k];
    }
    o[parts[parts.length - 1]] = val;
  }

  function parseKeyStr(k){
    var parts = [], buf = '', q = null, i, c;
    for (i = 0; i < k.length; i++){
      c = k[i];
      if (q){
        if (c === '\\' && q === '"' && i + 1 < k.length){ buf += k[i + 1]; i++; }
        else if (c === q) q = null;
        else buf += c;
      } else if (c === '"' || c === "'") q = c;
      else if (c === '.'){ parts.push(buf); buf = ''; }
      else buf += c;
    }
    parts.push(buf);
    return parts.map(function(p){ return p.trim(); });
  }

  function topIndex(s, ch){
    var q = null, ml = null, depth = 0;
    for (var i = 0; i < s.length; i++){
      var c = s[i];
      if (ml){
        if (ml === '"' && s.substr(i, 3) === '"""'){ ml = null; i += 2; }
        else if (ml === "'" && s.substr(i, 3) === "'''"){ ml = null; i += 2; }
        continue;
      }
      if (q){
        if (c === '\\' && q === '"') i++;
        else if (c === q) q = null;
      } else if (c === '"' || c === "'"){
        if (c === '"' && s.substr(i, 3) === '"""'){ ml = '"'; i += 2; }
        else if (c === "'" && s.substr(i, 3) === "'''"){ ml = "'"; i += 2; }
        else q = c;
      } else if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth--;
      else if (c === ch && depth === 0) return i;
    }
    return -1;
  }

  function stripComment(s){
    var i = topIndex(s, '#');
    return i < 0 ? s : s.slice(0, i);
  }

  function openDepth(s){
    var q = null, ml = null, depth = 0;
    for (var i = 0; i < s.length; i++){
      var c = s[i];
      if (ml){
        if (ml === '"' && s.substr(i, 3) === '"""'){ ml = null; i += 2; }
        else if (ml === "'" && s.substr(i, 3) === "'''"){ ml = null; i += 2; }
        continue;
      }
      if (q){
        if (c === '\\' && q === '"') i++;
        else if (c === q) q = null;
      } else if (c === '"' || c === "'"){
        if (c === '"' && s.substr(i, 3) === '"""'){ ml = '"'; i += 2; }
        else if (c === "'" && s.substr(i, 3) === "'''"){ ml = "'"; i += 2; }
        else q = c;
      } else if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth--;
    }
    return depth + (q ? 1 : 0) + (ml ? 1 : 0);
  }

  function parseVal(str){
    var pos = { i: 0 };
    function ws(){
      while (pos.i < str.length && (str[pos.i] === ' ' || str[pos.i] === '\t')) pos.i++;
    }
    function readKey(){
      ws();
      var start = pos.i, q = null;
      while (pos.i < str.length){
        var c = str[pos.i];
        if (q){
          if (c === '\\' && q === '"') pos.i++;
          else if (c === q) q = null;
        } else if (c === '"' || c === "'") q = c;
        else if (c === '=') break;
        pos.i++;
      }
      return parseKeyStr(str.slice(start, pos.i));
    }
    function val(){
      ws();
      var c = str[pos.i];
      if (c === '"'){
        if (str.substr(pos.i, 3) === '"""'){
          pos.i += 3;
          if (str[pos.i] === '\n') pos.i++;
          var e = str.indexOf('"""', pos.i);
          if (e < 0) throw new Error('Unterminated multi-line string');
          var mv = str.slice(pos.i, e);
          pos.i = e + 3;
          return mv.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
        pos.i++;
        var out = '';
        while (pos.i < str.length && str[pos.i] !== '"'){
          if (str[pos.i] === '\\'){
            var n = str[++pos.i];
            out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
            pos.i++;
          } else out += str[pos.i++];
        }
        if (str[pos.i] !== '"') throw new Error('Unterminated string');
        pos.i++;
        return out;
      }
      if (c === "'"){
        if (str.substr(pos.i, 3) === "'''"){
          pos.i += 3;
          var e2 = str.indexOf("'''", pos.i);
          if (e2 < 0) throw new Error('Unterminated multi-line literal string');
          var lv = str.slice(pos.i, e2);
          pos.i = e2 + 3;
          return lv;
        }
        pos.i++;
        var e3 = str.indexOf("'", pos.i);
        if (e3 < 0) throw new Error('Unterminated literal string');
        var sv = str.slice(pos.i, e3);
        pos.i = e3 + 1;
        return sv;
      }
      if (c === '['){
        pos.i++;
        var arr = [];
        for (;;){
          while (pos.i < str.length && /\s/.test(str[pos.i])) pos.i++;
          if (pos.i >= str.length) throw new Error('Unterminated array');
          if (str[pos.i] === '#'){ while (pos.i < str.length && str[pos.i] !== '\n') pos.i++; continue; }
          if (str[pos.i] === ']'){ pos.i++; break; }
          arr.push(val());
          while (pos.i < str.length && /\s/.test(str[pos.i])) pos.i++;
          if (str[pos.i] === ','){ pos.i++; continue; }
          if (str[pos.i] === ']'){ pos.i++; break; }
          throw new Error('Expected , or ] in array');
        }
        return arr;
      }
      if (c === '{'){
        pos.i++;
        var obj = {};
        for (;;){
          while (pos.i < str.length && /\s/.test(str[pos.i])) pos.i++;
          if (pos.i >= str.length) throw new Error('Unterminated inline table');
          if (str[pos.i] === '}'){ pos.i++; break; }
          var kp = readKey();
          while (pos.i < str.length && /\s/.test(str[pos.i])) pos.i++;
          if (str[pos.i] !== '=') throw new Error('Expected = in inline table');
          pos.i++;
          assignPath(obj, kp, val());
          while (pos.i < str.length && /\s/.test(str[pos.i])) pos.i++;
          if (str[pos.i] === ','){ pos.i++; continue; }
          if (str[pos.i] === '}'){ pos.i++; break; }
          throw new Error('Expected , or } in inline table');
        }
        return obj;
      }
      var start = pos.i;
      while (pos.i < str.length && str[pos.i] !== ',' && str[pos.i] !== ']' && str[pos.i] !== '}' && str[pos.i] !== '\n') pos.i++;
      var tok = str.slice(start, pos.i).trim();
      if (tok === 'true') return true;
      if (tok === 'false') return false;
      var num = tok.replace(/_/g, '');
      if (/^[+-]?0x[0-9a-fA-F]+$/.test(num)) return parseInt(num, 16);
      if (/^[+-]?0o[0-7]+$/.test(num)) return parseInt(num, 8);
      if (/^[+-]?0b[01]+$/.test(num)) return parseInt(num, 2);
      if (/^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(num) || /^(inf|\+inf|-inf|nan)$/i.test(num)){
        var n2 = Number(num);
        if (!isNaN(n2)) return n2;
      }
      return tok;
    }
    var v = val();
    ws();
    if (pos.i < str.length) throw new Error('Unexpected text after value');
    return v;
  }

  var buf = '';
  src.split(/\r?\n/).forEach(function(line){
    buf += (buf ? '\n' : '') + line;
    if (openDepth(buf) !== 0) return;
    var stmt = buf;
    buf = '';
    var t = stmt.trim();
    if (!t || t.charAt(0) === '#') return;
    if (t.charAt(0) === '['){
      var isArr = t.charAt(1) === '[';
      var close = isArr ? t.lastIndexOf(']]') : t.lastIndexOf(']');
      if (close < 0) throw new Error('Bad table header');
      var inner = t.slice(isArr ? 2 : 1, close);
      var parts = parseKeyStr(inner);
      cur = root;
      for (var i = 0; i < parts.length; i++){
        var k = parts[i], last = i === parts.length - 1;
        if (last && isArr){
          if (!Array.isArray(cur[k])) cur[k] = [];
          var no = {};
          cur[k].push(no);
          cur = no;
        } else {
          if (Array.isArray(cur[k])) cur = cur[k][cur[k].length - 1];
          else {
            if (!mthIsObj(cur[k])) cur[k] = {};
            cur = cur[k];
          }
        }
      }
      return;
    }
    var clean = stripComment(stmt);
    var eq = topIndex(clean, '=');
    if (eq < 0) throw new Error('Expected key = value');
    var ks = parseKeyStr(clean.slice(0, eq));
    var vv = parseVal(clean.slice(eq + 1));
    assignPath(cur, ks, vv);
  });
  if (buf.trim()) throw new Error('Unterminated statement at end of input');
  return root;
}

/* ---------- emitters ---------- */
function mthEmitDelim(rows, delim){
  var keys = mthUnionKeys(rows);
  if (!rows.length) throw new Error('No rows found to convert.');
  function cell(v){
    var s = mthCell(v);
    var q = delim === ',' ? /[",\n\r]/ : /[\t\n\r"]/;
    return q.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  var lines = [keys.map(cell).join(delim)];
  rows.forEach(function(r){
    lines.push(keys.map(function(k){ return cell(r[k]); }).join(delim));
  });
  return lines.join('\n');
}

function mthEmitJsonl(data){
  var rows = mthRowsOf(data, true);
  if (!rows.length) throw new Error('No rows found to convert.');
  return rows.map(function(r){ return JSON.stringify(r); }).join('\n');
}

function mthEmitJson(data){
  var t = JSON.stringify(data, null, 2);
  return t === undefined ? 'null' : t;
}

function mthTomlKey(k){
  var s = String(k);
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function mthTomlScalar(v){
  if (v === null || v === undefined) return '""';
  if (typeof v === 'number') return isFinite(v) ? String(v) : '""';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Object.prototype.toString.call(v) === '[object Date]') return '"' + v.toISOString() + '"';
  return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
}

function mthEmitToml(data, rootName){
  rootName = rootName || 'items';
  var lines = [];
  function emitObj(o, prefix){
    var keys = Object.keys(o);
    var scalars = [], tables = [], arrTables = [];
    keys.forEach(function(k){
      var v = o[k];
      if (Array.isArray(v) && v.length && v.every(mthIsObj)) arrTables.push(k);
      else if (mthIsObj(v)) tables.push(k);
      else scalars.push(k);
    });
    scalars.forEach(function(k){
      var v = o[k];
      if (Array.isArray(v)) lines.push(mthTomlKey(k) + ' = [' + v.map(mthTomlScalar).join(', ') + ']');
      else lines.push(mthTomlKey(k) + ' = ' + mthTomlScalar(v));
    });
    tables.forEach(function(k){
      var name = prefix ? prefix + '.' + mthTomlKey(k) : mthTomlKey(k);
      lines.push('');
      lines.push('[' + name + ']');
      emitObj(o[k], name);
    });
    arrTables.forEach(function(k){
      var name = prefix ? prefix + '.' + mthTomlKey(k) : mthTomlKey(k);
      o[k].forEach(function(item){
        lines.push('');
        lines.push('[[' + name + ']]');
        emitObj(item, name);
      });
    });
  }
  if (Array.isArray(data)){
    if (data.length && data.every(mthIsObj)){
      data.forEach(function(item){
        lines.push('');
        lines.push('[[' + rootName + ']]');
        emitObj(item, rootName);
      });
    } else lines.push(rootName + ' = [' + data.map(mthTomlScalar).join(', ') + ']');
  } else if (mthIsObj(data)) emitObj(data, '');
  else lines.push('value = ' + mthTomlScalar(data));
  return lines.join('\n').replace(/^\n+/, '');
}

function mthXmlEsc(s){
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function mthXmlName(k){
  var n = String(k).replace(/[^A-Za-z0-9_.\-]/g, '_');
  if (!/^[A-Za-z_]/.test(n)) n = 'field_' + n;
  return n || 'field';
}
function mthXmlVal(v, tag, ind){
  var pad = new Array(ind + 1).join('  ');
  if (v === null || v === undefined) return pad + '<' + tag + '/>';
  if (Array.isArray(v)) return v.map(function(x){ return mthXmlVal(x, tag, ind); }).join('\n');
  if (mthIsObj(v)){
    var ks = Object.keys(v);
    if (!ks.length) return pad + '<' + tag + '/>';
    var inner = ks.map(function(k){ return mthXmlVal(v[k], mthXmlName(k), ind + 1); }).join('\n');
    return pad + '<' + tag + '>\n' + inner + '\n' + pad + '</' + tag + '>';
  }
  return pad + '<' + tag + '>' + mthXmlEsc(v) + '</' + tag + '>';
}
function mthEmitXml(data, rootName){
  rootName = mthXmlName(rootName || 'root');
  var body;
  if (Array.isArray(data)) body = '<' + rootName + '>\n' + data.map(function(r){ return mthXmlVal(r, 'row', 1); }).join('\n') + '\n</' + rootName + '>';
  else body = mthXmlVal(data, rootName, 0);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + body;
}

function mthHtmlEsc(s){
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function mthEmitHtmlTable(rows){
  var keys = mthUnionKeys(rows);
  if (!rows.length) throw new Error('No rows found to convert.');
  var h = '<table>\n<thead>\n<tr>' + keys.map(function(k){ return '<th>' + mthHtmlEsc(k) + '</th>'; }).join('') + '</tr>\n</thead>\n<tbody>\n';
  rows.forEach(function(r){
    h += '<tr>' + keys.map(function(k){ return '<td>' + mthHtmlEsc(mthCell(r[k])) + '</td>'; }).join('') + '</tr>\n';
  });
  return h + '</tbody>\n</table>';
}

function mthEmitMdTable(rows){
  var keys = mthUnionKeys(rows);
  if (!rows.length) throw new Error('No rows found to convert.');
  function cell(v){ return mthCell(v).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>'); }
  var out = '| ' + keys.map(cell).join(' | ') + ' |\n';
  out += '| ' + keys.map(function(){ return '---'; }).join(' | ') + ' |\n';
  rows.forEach(function(r){ out += '| ' + keys.map(function(k){ return cell(r[k]); }).join(' | ') + ' |\n'; });
  return out;
}

function mthEmitSql(rows, table){
  var keys = mthUnionKeys(rows);
  if (!rows.length) throw new Error('No rows found to convert.');
  var t = String(table || 'my_table').replace(/[^A-Za-z0-9_$]/g, '_') || 'my_table';
  function sqlVal(v){
    if (v === null || v === undefined || v === '') return 'NULL';
    if (typeof v === 'number' && isFinite(v)) return String(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return "'" + String(v).replace(/'/g, "''") + "'";
  }
  var cols = keys.map(function(k){ return '`' + String(k).replace(/`/g, '``') + '`'; }).join(', ');
  var vals = rows.map(function(r){
    return '(' + keys.map(function(k){ return sqlVal(r[k]); }).join(', ') + ')';
  }).join(',\n');
  return 'INSERT INTO `' + t + '` (' + cols + ') VALUES\n' + vals + ';';
}

function mthPhpStr(s){ return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
function mthPhpVal(v, ind){
  var pad = new Array(ind + 1).join('    ');
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)){
    if (!v.length) return '[]';
    return '[\n' + v.map(function(x){ return pad + '    ' + mthPhpVal(x, ind + 1); }).join(',\n') + '\n' + pad + ']';
  }
  if (mthIsObj(v)){
    var ks = Object.keys(v);
    if (!ks.length) return '[]';
    return '[\n' + ks.map(function(k){ return pad + '    ' + mthPhpStr(k) + ' => ' + mthPhpVal(v[k], ind + 1); }).join(',\n') + '\n' + pad + ']';
  }
  return mthPhpStr(v);
}
function mthEmitPhp(data){ return '<?php\n\nreturn ' + mthPhpVal(data, 0) + ';\n'; }

function mthIniVal(v){
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return isFinite(v) ? String(v) : '';
  if (Array.isArray(v)) return v.map(mthIniVal).join(', ');
  if (mthIsObj(v)) return JSON.stringify(v);
  var s = String(v);
  return /[\s=;#"\[\]]|^$/.test(s) ? '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : s;
}
function mthEmitIni(data){
  var lines = [];
  function section(o, name){
    var ks = Object.keys(o);
    var scalars = ks.filter(function(k){ return !mthIsObj(o[k]) || Array.isArray(o[k]); });
    var nested = ks.filter(function(k){ return mthIsObj(o[k]) && !Array.isArray(o[k]); });
    lines.push('[' + name + ']');
    scalars.forEach(function(k){ lines.push(String(k) + ' = ' + mthIniVal(o[k])); });
    nested.forEach(function(k){
      lines.push('');
      section(o[k], name + '.' + k);
    });
  }
  if (Array.isArray(data)){
    if (!data.length) return '';
    data.forEach(function(item, i){
      if (i) lines.push('');
      if (mthIsObj(item)) section(item, 'item_' + (i + 1));
      else { lines.push('[item_' + (i + 1) + ']'); lines.push('value = ' + mthIniVal(item)); }
    });
  } else if (mthIsObj(data)){
    var ks = Object.keys(data);
    var scalars = ks.filter(function(k){ return !mthIsObj(data[k]) || Array.isArray(data[k]); });
    var nested = ks.filter(function(k){ return mthIsObj(data[k]) && !Array.isArray(data[k]); });
    scalars.forEach(function(k){ lines.push(String(k) + ' = ' + mthIniVal(data[k])); });
    nested.forEach(function(k){
      if (lines.length) lines.push('');
      section(data[k], String(k));
    });
  } else lines.push('value = ' + mthIniVal(data));
  return lines.join('\n');
}

function mthYamlKey(k){
  var s = String(k);
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : JSON.stringify(s);
}
function mthYamlScalar(v){
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
  var s = String(v);
  var need = s === '' || /^\s|\s$/.test(s) || /[\n\r]/.test(s) || /: /.test(s) || /:$/.test(s) || s.indexOf('#') !== -1 ||
    /^[-?:,\[\]{}#&*!|>'"%@`]/.test(s) || /^(true|false|null|~|yes|no|on|off)$/i.test(s) ||
    (/^-?[\d.]/.test(s) && !isNaN(Number(s)));
  return need ? JSON.stringify(s) : s;
}
function mthEmitYaml(data, ind){
  ind = ind || 0;
  var pad = new Array(ind + 1).join('  ');
  if (Array.isArray(data)){
    if (!data.length) return pad + '[]';
    return data.map(function(x){
      if (mthIsObj(x)){
        var ks = Object.keys(x);
        if (!ks.length) return pad + '- {}';
        var out = '';
        ks.forEach(function(k, ki){
          var v = x[k];
          var pre = ki === 0 ? pad + '- ' : pad + '  ';
          if (mthIsObj(v) || Array.isArray(v)) out += pre + mthYamlKey(k) + ':\n' + mthEmitYaml(v, ind + 2) + '\n';
          else out += pre + mthYamlKey(k) + ': ' + mthYamlScalar(v) + '\n';
        });
        return out.replace(/\n$/, '');
      }
      if (Array.isArray(x)) return pad + '-\n' + mthEmitYaml(x, ind + 1);
      return pad + '- ' + mthYamlScalar(x);
    }).join('\n');
  }
  if (mthIsObj(data)){
    var ks2 = Object.keys(data);
    if (!ks2.length) return pad + '{}';
    return ks2.map(function(k){
      var v = data[k];
      if (mthIsObj(v) || Array.isArray(v)) return pad + mthYamlKey(k) + ':\n' + mthEmitYaml(v, ind + 1);
      return pad + mthYamlKey(k) + ': ' + mthYamlScalar(v);
    }).join('\n');
  }
  return pad + mthYamlScalar(data);
}
