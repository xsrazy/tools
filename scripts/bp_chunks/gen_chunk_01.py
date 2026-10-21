#!/usr/bin/env python3
"""Generate chunk_01 registry entries: 50 directed data-format converter pages."""
import json
import os
import re
import sys

ROOT = os.path.expanduser('~/workspace/micro-tools-site')
BP = os.path.join(ROOT, 'hidden_files', 'bp_chunks')
LISTS = os.path.join(BP, 'lists')

pairs = json.load(open(os.path.join(LISTS, 'chunk_01_pairs.json')))
registry = json.load(open(os.path.join(ROOT, 'data', 'tools-registry.json')))
existing_slugs = {e['slug'] for e in registry}

core_js = open(os.path.join(ROOT, 'scripts', 'bp_chunks', 'tpl_core.js')).read()
wire_tpl = open(os.path.join(ROOT, 'scripts', 'bp_chunks', 'tpl_wire.js')).read()

DISP = {
    'JSON': 'JSON', 'CSV': 'CSV', 'TSV': 'TSV', 'YAML': 'YAML', 'TOML': 'TOML',
    'XML': 'XML', 'HTMLTable': 'HTML Table', 'MDTable': 'MD Table',
    'SQLInsert': 'SQL Insert', 'XLSX': 'XLSX', 'JSONL': 'JSONL',
    'PHPArray': 'PHP Array', 'Ini': 'INI',
}

FROM_PARSE = {
    'JSON': ('json', None),
    'CSV': ('delim', '","'),
    'TSV': ('delim', '"\\t"'),
    'YAML': ('yaml', None),
    'TOML': ('toml', None),
}

FROM_HINT = {
    'JSON': 'Tip: arrays of objects convert best. A single object becomes one row.',
    'CSV': 'The first line is treated as the header row. Quoted fields are respected.',
    'TSV': 'The first line is treated as the header row. Tabs separate the fields.',
    'YAML': 'Lists of maps convert best. Nested maps are flattened with dot notation.',
    'TOML': 'Tables and [[arrays of tables]] are supported, including dotted keys.',
}

FROM_PARSE_DESC = {
    'JSON': "parses it with the browser's native JSON parser",
    'CSV': 'parses it with the PapaParse library, using the first row as column headers',
    'TSV': 'parses it with the PapaParse library using a tab delimiter, using the first row as column headers',
    'YAML': 'parses it with the js-yaml library',
    'TOML': 'parses it with a built-in TOML parser that understands tables, arrays of tables, dotted keys and inline tables',
}

FROM_PRIVACY = {
    'JSON': 'conversion runs entirely in your browser with built-in code, so your data never leaves your device.',
    'CSV': 'parsing uses the PapaParse library (loaded once from a CDN); the conversion itself happens locally and your data is never uploaded.',
    'TSV': 'parsing uses the PapaParse library (loaded once from a CDN); the conversion itself happens locally and your data is never uploaded.',
    'YAML': 'parsing uses the js-yaml library (loaded once from a CDN); the conversion itself happens locally and your data is never uploaded.',
    'TOML': 'conversion runs entirely in your browser with a built-in TOML parser, so your data never leaves your device.',
}

FROM_SAMPLE = {
    'JSON': (
        '[\n'
        '  {\n'
        '    "name": "Ava",\n'
        '    "role": "Designer",\n'
        '    "active": true,\n'
        '    "contact": { "email": "ava@example.com", "city": "Jakarta" },\n'
        '    "tags": ["ui", "ux"]\n'
        '  },\n'
        '  {\n'
        '    "name": "Ben",\n'
        '    "role": "Developer",\n'
        '    "active": false,\n'
        '    "contact": { "email": "ben@example.com", "city": "Bandung" },\n'
        '    "tags": ["backend"]\n'
        '  }\n'
        ']'
    ),
    'CSV': 'name,role,active,city\nAva,Designer,yes,Jakarta\nBen,Developer,no,Bandung',
    'TSV': 'name\trole\tactive\tcity\nAva\tDesigner\tyes\tJakarta\nBen\tDeveloper\tno\tBandung',
    'YAML': (
        '- name: Ava\n'
        '  role: Designer\n'
        '  active: true\n'
        '  contact:\n'
        '    email: ava@example.com\n'
        '    city: Jakarta\n'
        '- name: Ben\n'
        '  role: Developer\n'
        '  active: false\n'
        '  contact:\n'
        '    email: ben@example.com\n'
        '    city: Bandung'
    ),
    'TOML': (
        '[[users]]\n'
        'name = "Ava"\n'
        'role = "Designer"\n'
        'active = true\n'
        'tags = ["ui", "ux"]\n'
        '\n'
        '[users.contact]\n'
        'email = "ava@example.com"\n'
        'city = "Jakarta"\n'
        '\n'
        '[[users]]\n'
        'name = "Ben"\n'
        'role = "Developer"\n'
        'active = false\n'
        'tags = ["backend"]\n'
        '\n'
        '[users.contact]\n'
        'email = "ben@example.com"\n'
        'city = "Bandung"'
    ),
}

FROM_PARSE_QA = {
    'JSON': (
        'How is my JSON parsed?',
        'With the browser\'s native JSON parser, so even large documents convert fast. An array of objects becomes one row per object, a single object becomes a single row, and nested values are flattened with dot notation (for example contact.city).',
    ),
    'CSV': (
        'How is my CSV parsed?',
        'With the PapaParse library: the first line becomes the column headers, quoted fields with embedded commas or line breaks are respected, and empty lines are skipped.',
    ),
    'TSV': (
        'How is my TSV parsed?',
        'With the PapaParse library using a tab delimiter: the first line becomes the column headers, quoted fields are respected, and empty lines are skipped.',
    ),
    'YAML': (
        'How is my YAML parsed?',
        'With the js-yaml library. A list of maps becomes one row per item, a single map becomes one row, and nested maps are flattened with dot notation so tabular output stays clean.',
    ),
    'TOML': (
        'How is my TOML parsed?',
        'With a built-in TOML parser that supports [tables], [[arrays of tables]], dotted keys, inline tables, multiline arrays and all scalar types (strings, integers, floats, booleans and dates).',
    ),
}

# ---------------- target format metadata ----------------
# emit: wire EMIT token | dl: (filename, mime) | root: ROOT_NAME literal for xml/toml
# faqs: 5 (q, a); {FROM} is interpolated. The source-parse Q is inserted at index 1 later.
TO = {
    'TSV': dict(
        emit='tsv', dl=('converted.tsv', 'text/tab-separated-values'), root=None,
        lede_tail='open the result straight in Excel or Google Sheets',
        emit_desc='writes it out as tab-separated values with a header row, quoting any values that contain tabs or line breaks',
        expl2_h='TSV tips',
        expl2_body=(
            '<p>TSV shines when your data contains commas, because tabs almost never appear in normal text. '
            'The first row of the output is always the header. Nested objects are flattened with dot notation '
            '(for example contact.city), lists of plain values are joined with commas, and values containing tabs, '
            'quotes or line breaks are wrapped in double quotes, which Excel and Google Sheets parse correctly on import.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to TSV?',
             'TSV is the safest plain-text format for spreadsheet data that contains commas: product names, addresses and descriptions survive untouched because fields split on tabs, not commas. Excel, Google Sheets, LibreOffice and most databases import TSV without complaints, so it is a handy middle step between a raw export and a working spreadsheet.'),
            ('What happens if my data contains tabs or line breaks?',
             'Those values are wrapped in double quotes with any inner quotes doubled. Excel and Google Sheets understand this quoting, so the data lands in the right cells when you import the file.'),
            ('How are nested objects handled?',
             'Nested objects are flattened with dot notation, so contact.city becomes its own column. Lists of plain values are joined with commas, and lists of objects are kept as compact JSON inside the cell, which keeps every record on exactly one line.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
    'TOML': dict(
        emit='toml', dl=('converted.toml', 'text/plain'), root='"items"',
        lede_tail='drop the result into your config files',
        emit_desc='emits it as TOML: plain key-value pairs first, then [tables], with lists of objects becoming [[array of tables]] blocks',
        expl2_h='Reading the TOML output',
        expl2_body=(
            '<p>A list of records becomes a series of [[items]] blocks, which is the idiomatic TOML way to express a list of objects. '
            'Lists of plain values become inline arrays like tags = ["ui", "ux"], and keys containing spaces or special characters are '
            'quoted automatically following the TOML spec. Nested objects become [tables], with deeper levels joined by dots.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to TOML?',
             'TOML is the config format behind Cargo, Python projects (pyproject.toml), Hugo and many developer tools. Converting exported data to TOML is the fastest way to turn an API response or a spreadsheet export into a config file you can commit to a repository.'),
            ('How are lists of records represented?',
             'Each object in a list becomes its own [[items]] array-of-tables block, which is the idiomatic TOML way to express record lists. Lists of plain values become inline arrays, and nested objects become [tables] with dotted paths.'),
            ('What if my keys contain spaces or special characters?',
             'They are quoted automatically following the TOML specification, so unusual key names stay valid and parseable by any TOML library.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
    'XML': dict(
        emit='xml', dl=('converted.xml', 'application/xml'), root='"rows"',
        lede_tail='use it with APIs, feeds and legacy systems',
        emit_desc='serializes it to XML with an XML declaration, escaping special characters and sanitizing element names',
        expl2_h='About the XML output',
        expl2_body=(
            '<p>Each record becomes a &lt;row&gt; element containing one child element per field, and nested objects become nested elements, '
            'so the structure mirrors your data. Characters like &amp;, &lt; and &gt; are escaped automatically, and field names are '
            'sanitized into valid XML element names. The output starts with an XML declaration, so parsers accept it as-is.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to XML?',
             'XML still powers RSS feeds, sitemaps, SOAP services, Android layouts, Maven configs and plenty of enterprise APIs. Converting to XML is useful whenever a system you integrate with only speaks XML and your data starts life in a friendlier format.'),
            ('How is my data mapped to XML elements?',
             'Each record becomes a <row> element with one child element per field. Nested objects become nested elements, and the document starts with an XML declaration so parsers accept it without tweaks.'),
            ('What about special characters and unusual field names?',
             'Characters like & < > " and \' are escaped automatically, and field names are sanitized into valid XML element names (spaces and symbols become underscores), so the output always parses.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
    'HTMLTable': dict(
        emit='htmltable', dl=('converted-table.html', 'text/html'), root=None,
        lede_tail='paste it into your page, document or CMS',
        emit_desc='renders it as a semantic HTML table with a header row, escaping all cell content',
        expl2_h='Styling the table',
        expl2_body=(
            '<p>The output is a plain semantic table with &lt;thead&gt; and &lt;tbody&gt;, ready to paste into any web page, blog post, '
            'CMS article or HTML email. It carries no styling of its own, so add your own CSS classes or stylesheet rules to match your '
            'site design. All cell content is HTML-escaped, so stray characters in your data cannot break the surrounding page.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to an HTML table?',
             'An HTML table is the quickest way to publish data on a web page, in a blog post, a CMS article or an HTML email. Paste the output into your markup and it renders immediately, no JavaScript required.'),
            ('Does the table come with styling?',
             'No, the output is a plain semantic table with thead and tbody elements. Add your own CSS classes or stylesheet rules to match your site design; the structure is ready for any framework.'),
            ('Is the content safe to embed in my page?',
             'Yes. Every cell is HTML-escaped, so characters like < > and & in your data are displayed as text instead of breaking your markup.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
    'MDTable': dict(
        emit='mdtable', dl=('converted-table.md', 'text/markdown'), root=None,
        lede_tail='paste it into READMEs, wikis and docs',
        emit_desc='renders it as a Markdown table with an aligned header separator, escaping pipes inside cells',
        expl2_h='Markdown table notes',
        expl2_body=(
            '<p>The output follows the GitHub-flavored Markdown table syntax: a header row, a separator row of dashes, then one row per '
            'record. Pipe characters inside cells are escaped with a backslash so they never split the table into extra columns, and '
            'line breaks inside cells become &lt;br&gt; tags, which Markdown renderers display as line breaks within the cell.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to a Markdown table?',
             'Markdown tables render natively on GitHub, GitLab, wikis, Notion and most documentation platforms. Converting to a Markdown table is the fastest way to put structured data into a README, a report or a pull request description.'),
            ('What if my cells contain pipe characters?',
             'Pipes are escaped with a backslash, so a value like "a | b" cannot split the table into extra columns. The rendered table shows the pipe as a normal character.'),
            ('How are line breaks inside cells handled?',
             'They are converted to <br> tags, which Markdown renderers display as line breaks inside the cell, keeping each record on one table row.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
    'SQLInsert': dict(
        emit='sql', dl=('converted.sql', 'text/plain'), root=None, has_table=True,
        lede_tail='run it against MySQL, PostgreSQL or SQLite',
        emit_desc='generates a single multi-row INSERT statement, quoting strings, passing numbers through and turning blanks into NULL',
        expl2_h='Running the SQL',
        expl2_body=(
            '<p>The output is one multi-row INSERT statement, which loads faster than one statement per row. Strings are single-quoted with '
            'inner quotes doubled, numbers pass through unquoted, booleans become TRUE or FALSE, and empty values become NULL. Edit the '
            'Table name field before converting to target your real table; the name is sanitized to safe characters automatically.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to SQL INSERT?',
             'INSERT statements are the universal way to seed a database: run the output in MySQL, PostgreSQL, SQLite or MariaDB to load exported data into a table in one step. It is handy for migrations, demos and test fixtures.'),
            ('Can I change the table name?',
             'Yes. Edit the Table name field above the output before pressing Convert. It defaults to my_table and is sanitized to letters, numbers, underscores and dollar signs.'),
            ('How are values quoted?',
             'Strings are single-quoted with inner quotes doubled, numbers pass through unquoted, booleans become TRUE or FALSE, and empty values become NULL. Everything goes into one multi-row INSERT statement for speed.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
    'XLSX': dict(
        emit='xlsx', dl=('converted.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), root=None,
        lede_tail='download a real spreadsheet file',
        emit_desc='builds a genuine .xlsx workbook with the SheetJS library and offers it as a download',
        expl2_h='About the spreadsheet',
        expl2_body=(
            '<p>The SheetJS library builds a real .xlsx workbook entirely in your browser: one sheet named Sheet1, with your column names as '
            'the header row and one row per record. Press Download to save converted.xlsx, which opens in Excel, Google Sheets and '
            'LibreOffice. The sheet carries your data only, without styling or formulas, and handles thousands of rows comfortably.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to XLSX?',
             'XLSX is the format Excel, Google Sheets and LibreOffice open natively. Converting gives you a genuine spreadsheet file you can email, share and edit, which is far friendlier than raw data for non-technical colleagues.'),
            ('How is the file created?',
             'The SheetJS library builds a real .xlsx workbook entirely in your browser: one sheet with your column names as the header row. Press Download to save converted.xlsx; no server is ever involved.'),
            ('Are there formatting or size limits?',
             'The sheet contains your data with a header row, without styling or formulas. It handles thousands of rows comfortably, though extremely large exports may take a few seconds to build.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY} The spreadsheet library loads once from a CDN, and your data never leaves your device.'),
        ],
    ),
    'JSONL': dict(
        emit='jsonl', dl=('converted.jsonl', 'application/x-ndjson'), root=None,
        lede_tail='stream it into logs, pipelines and data tools',
        emit_desc='writes one compact JSON object per line, the standard JSON Lines format',
        expl2_h='Using JSON Lines',
        expl2_body=(
            '<p>JSON Lines puts one complete JSON object on each line with no outer array and no trailing commas. Unlike a JSON array, which '
            'must be parsed whole, JSONL can be read line by line, which makes it ideal for huge files, log pipelines, BigQuery imports, '
            'Elasticsearch bulk loads and machine-learning datasets. Each line keeps the full nested structure of its record.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to JSONL?',
             'JSON Lines is the standard for streaming data: log pipelines, BigQuery imports, Elasticsearch bulk loads and ML training sets all accept one JSON object per line. It is the format of choice when a JSON array would be too big to parse at once.'),
            ('How is JSONL different from a JSON array?',
             'A JSON array must be loaded and parsed whole, while JSONL can be processed line by line. That makes JSONL far better for huge files and streaming processors that handle records as they arrive.'),
            ('Is nested data preserved?',
             'Yes. Each line keeps the full nested structure of its record as compact JSON, so nothing is flattened or lost in the conversion.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
    'PHPArray': dict(
        emit='phparray', dl=('converted.php', 'text/plain'), root=None,
        lede_tail='paste it into your PHP config or seeder',
        emit_desc="emits modern PHP short array syntax wrapped in a <?php return [...]; statement",
        expl2_h='Using the PHP output',
        expl2_body=(
            '<p>The output uses modern short array syntax with \'key\' =&gt; value pairs and is wrapped in &lt;?php return [...]; so the file '
            'works the moment you save it as a .php file. Strings are single-quoted, numbers stay numeric, booleans become true or false, '
            'and missing values become null. Paste it straight into a Laravel config file, a Symfony parameter file or a database seeder.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to a PHP array?',
             'PHP config files in Laravel, Symfony and WordPress are plain PHP arrays. Converting data to PHP array syntax lets you paste it straight into a config file or seeder instead of hand-writing the structure.'),
            ("What does the output look like?",
             "Modern short array syntax with 'key' => value pairs, wrapped in <?php return [...]; so the saved file works immediately when included from PHP."),
            ('How are data types handled?',
             'Strings are single-quoted with inner quotes escaped, numbers stay numeric, booleans become true or false, and missing values become null.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
    'Ini': dict(
        emit='ini', dl=('converted.ini', 'text/plain'), root=None,
        lede_tail="drop it into your app's settings file",
        emit_desc='emits it as INI, turning nested objects into [sections]',
        expl2_h='INI limitations',
        expl2_body=(
            '<p>INI has no nesting, so nested objects become [sections], with deeper levels joined by dots like [database.credentials]. '
            'A list of objects becomes numbered sections such as [item_1] and [item_2], while lists of plain values are joined with commas '
            'on one line. Values containing spaces or special characters are quoted automatically.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to INI?',
             "INI is the classic config format for PHP applications, Python's configparser and many desktop tools. Converting flattens exported data into settings a program can read directly, without writing a custom parser."),
            ('INI has no nesting, so how are objects handled?',
             'Nested objects become [sections], with deeper levels joined by dots like [database.credentials]. Scalar values stay at the top of the file or inside their section.'),
            ('What about lists?',
             'A list of objects becomes numbered sections such as [item_1] and [item_2]; lists of plain values are joined with commas on a single line.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
    'YAML': dict(
        emit='yaml', dl=('converted.yaml', 'text/yaml'), root=None,
        lede_tail='use it in Docker Compose, CI configs and apps',
        emit_desc='emits it as YAML with proper two-space indentation, quoting strings only when needed',
        expl2_h='YAML output notes',
        expl2_body=(
            '<p>The output uses standard two-space indentation, so it works in strict YAML parsers including Docker Compose, GitHub Actions '
            'and Kubernetes manifests. Strings are quoted only when they need it: values with colons, hashes, leading special characters or '
            'number-like text get quotes, while plain strings, numbers and booleans stay clean and readable.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to YAML?',
             'YAML is the config language of Docker Compose, GitHub Actions, Kubernetes and countless apps. Converting gives you human-readable, hand-editable config from raw data exports.'),
            ('How are strings quoted?',
             'Only when needed: values with colons, hashes, leading special characters or number-like strings are quoted, while plain strings stay clean. Numbers and booleans keep their native YAML types.'),
            ('How is nesting represented?',
             'With standard two-space indentation and dash lists, so the output works in strict YAML parsers without modification.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
    'CSV': dict(
        emit='csv', dl=('converted.csv', 'text/csv'), root=None,
        lede_tail='open it in any spreadsheet app',
        emit_desc='writes it out as comma-separated values with a header row, quoting values per RFC 4180',
        expl2_h='CSV tips',
        expl2_body=(
            '<p>CSV is the universal spreadsheet exchange format: Excel, Google Sheets, databases and data tools all import it. The first row '
            'of the output is always the header. Values containing commas, quotes or line breaks are wrapped in double quotes with inner '
            'quotes doubled, following RFC 4180, so spreadsheets import them into the correct cells. Nested objects are flattened with dot notation.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to CSV?',
             'CSV is the universal spreadsheet exchange format: Excel, Google Sheets, databases and data tools all import it. Converting to CSV is the simplest way to move data into a spreadsheet or a system that expects flat files.'),
            ('What if my data contains commas or quotes?',
             'Such values are wrapped in double quotes with inner quotes doubled, following RFC 4180, so spreadsheets import them into the correct cells instead of splitting them.'),
            ('How are nested objects handled?',
             'Nested objects are flattened with dot notation into separate columns, lists of plain values are joined with commas, and lists of objects are kept as compact JSON inside the cell.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
    'JSON': dict(
        emit='json', dl=('converted.json', 'application/json'), root=None,
        lede_tail='feed it to APIs and JavaScript apps',
        emit_desc='pretty-prints it as JSON with 2-space indentation',
        expl2_h='JSON output notes',
        expl2_body=(
            '<p>The output is pretty-printed with 2-space indentation, ready to paste into an API client, a JavaScript app or a .json file. '
            'TOML dates and times come through as ISO strings, since JSON has no native date type, and every other scalar keeps its type: '
            'strings stay strings, numbers stay numeric, and booleans stay true or false.</p>'
        ),
        faqs=[
            ('Why convert {FROM} to JSON?',
             'JSON is what APIs, JavaScript apps and most developer tools consume. Converting TOML config files to JSON lets you feed settings into systems that only accept JSON, or inspect a config with familiar JSON tooling.'),
            ('What happens to TOML dates and times?',
             'They come through as ISO strings, since JSON has no native date type. Every other scalar keeps its type: strings stay strings, numbers stay numeric, booleans stay true or false.'),
            ('How is the output formatted?',
             'Pretty-printed with 2-space indentation, so it is easy to read, diff and paste into API clients or code editors.'),
            ('Is my data sent to a server?',
             'No. {PRIVACY}'),
        ],
    ),
}

SEO_TAILS = [
    ' Ready in seconds.',
    ' Private by design.',
    ' Free, fast, private.',
    ' Instant, free, private.',
    ' Try it free, no sign-up.',
    ' Built for speed and privacy.',
    ' Results in seconds, no sign-up.',
    ' Made for quick, reliable results.',
    ' Great for reports, configs and pipelines.',
    ' Ideal for developers, analysts and data teams.',
    ' Perfect for config files, reports and data pipelines.',
]


def seo_description(frm, to):
    base = (
        'Free ' + frm + ' to ' + to + ' converter. Paste your ' + frm
        + ' and get clean ' + to + ' instantly, right in your browser. No sign-up, no uploads.'
    )
    for t in SEO_TAILS:
        s = base + t
        if 150 <= len(s) <= 160:
            return s
    raise ValueError('seo length fail for %s->%s (base %d)' % (frm, to, len(base)))

# ---------------- assembly ----------------
def esc_attr(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;')
             .replace('>', '&gt;').replace('"', '&quot;'))


def build_tool_ui(k, frm, frm_raw, to, tmeta):
    has_table = tmeta.get('has_table', False)
    table_field = ''
    if has_table:
        table_field = (
            '<div class="field">'
            '<label for="' + k + '-table">Table name</label>'
            '<input class="tool-text" style="min-height:0" id="' + k + '-table" value="my_table" spellcheck="false" />'
            '<div class="hint">Used in the INSERT INTO clause.</div>'
            '</div>'
        )
    privacy = FROM_PRIVACY[frm_raw]
    if tmeta['emit'] == 'xlsx':
        privacy += ' The spreadsheet library loads once from a CDN.'
    sample_line = FROM_SAMPLE[frm_raw].split('\n')[0][:70]
    return (
        '<div class="card panel">'
        '<h2>' + frm + ' input</h2>'
        '<p class="sub">Paste your ' + frm + ' below, then press Convert.</p>'
        '<div class="field">'
        '<label for="' + k + '-input">' + frm + ' data</label>'
        '<textarea class="tool-text" id="' + k + '-input" spellcheck="false" placeholder="' + esc_attr(sample_line) + '"></textarea>'
        '<div class="hint">' + FROM_HINT[frm_raw] + '</div>'
        '</div>'
        + table_field +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">'
        '<button class="btn btn-primary" id="' + k + '-convert">Convert to ' + to + '</button>'
        '<button class="btn btn-outline" id="' + k + '-sample">Load sample</button>'
        '</div>'
        '</div>'
        '<div class="card panel">'
        '<h2>' + to + ' output</h2>'
        '<p class="sub result-note" id="' + k + '-status">Waiting for ' + frm + ' input.</p>'
        '<div class="callout" id="' + k + '-error" role="alert" style="display:none"><strong>' + frm + ' parse error</strong><div class="msg" id="' + k + '-error-msg"></div></div>'
        '<div class="field">'
        '<label for="' + k + '-output">' + to + ' result</label>'
        '<textarea class="tool-text" id="' + k + '-output" spellcheck="false" readonly placeholder="Your converted ' + to + ' will appear here."></textarea>'
        '</div>'
        '<div style="display:flex;gap:10px;flex-wrap:wrap">'
        '<button class="btn" id="' + k + '-copy">Copy</button>'
        '<button class="btn" id="' + k + '-download">Download</button>'
        '</div>'
        '<div class="callout info" style="margin-top:14px"><strong>Private by design:</strong> ' + privacy + '</div>'
        '</div>'
    )


def build_tool_js(k, frm, to, frm_raw, tmeta):
    parse, delim = FROM_PARSE[frm_raw]
    js = wire_tpl
    js = js.replace('__CORE__', core_js)
    js = js.replace('__K__', k)
    js = js.replace('__FROM__', frm)
    js = js.replace('__TO__', to)
    js = js.replace('__PARSE__', parse)
    js = js.replace('__DELIM__', delim if delim else 'null')
    js = js.replace('__EMIT__', tmeta['emit'])
    js = js.replace('__ROOT__', tmeta['root'] if tmeta['root'] else 'null')
    js = js.replace('__SAMPLE__', json.dumps(FROM_SAMPLE[frm_raw]))
    js = js.replace('__DL_NAME__', tmeta['dl'][0])
    js = js.replace('__DL_MIME__', tmeta['dl'][1])
    js = js.replace('__HAS_TABLE__', 'true' if tmeta.get('has_table') else 'false')
    if re.search(r'__[A-Z]+__', js):
        raise ValueError('unreplaced token in toolJS for ' + k + ': ' + re.search(r'__[A-Z]+__', js).group(0))
    return js


def cap(s):
    return s[0].upper() + s[1:] if s else s


def build_entry(p):
    frm_raw, to_raw, slug = p['from'], p['to'], p['slug']
    frm, to = DISP[frm_raw], DISP[to_raw]
    k = slug[:-5]
    tmeta = TO[to_raw]
    title = frm + ' to ' + to
    faqs_raw = [tmeta['faqs'][0], FROM_PARSE_QA[frm_raw],
                tmeta['faqs'][1], tmeta['faqs'][2], tmeta['faqs'][3]]
    faqs = [{'q': q.replace('{FROM}', frm),
             'a': a.replace('{FROM}', frm).replace('{PRIVACY}', FROM_PRIVACY[frm_raw])}
            for (q, a) in faqs_raw]
    entry = {
        'slug': slug,
        'title': title,
        'cardDesc': 'Convert ' + frm + ' to ' + to + ' free, right in your browser.',
        'category': 'Developer Tools',
        'templateType': 'textToText',
        'generated': False,
        'source': 'blueprint',
        'pageTitle': title + ' Converter - Free Online Tool',
        'h1': title,
        'lede': ('Convert <strong>' + frm + '</strong> to <strong>' + to + '</strong> free, in seconds. '
                 'Paste your data below, press Convert, then copy the result and ' + tmeta['lede_tail'] + '. '
                 'Everything runs in your browser, so nothing is ever uploaded.'),
        'keywords': (frm.lower() + ' to ' + to.lower() + ', convert ' + frm.lower() + ' to ' + to.lower()
                     + ', ' + frm.lower() + ' to ' + to.lower() + ' online, free ' + to.lower()
                     + ' converter, ' + frm.lower() + ' ' + to.lower() + ' conversion tool'),
        'seoDescription': seo_description(frm, to),
        'toolUI': build_tool_ui(k, frm, frm_raw, to, tmeta),
        'toolJS': build_tool_js(k, frm, to, frm_raw, tmeta),
        'extraCSS': '',
        'explainer': [
            {'h': 'How this conversion works',
             'body': ('<p>Paste ' + frm + ' into the input box and press Convert (or just keep typing, '
                      'conversion happens as you type). The tool ' + FROM_PARSE_DESC[frm_raw] + ', then '
                      + tmeta['emit_desc'] + '. ' + cap(FROM_PRIVACY[frm_raw]) + '</p>')},
            {'h': tmeta['expl2_h'], 'body': tmeta['expl2_body']},
        ],
        'faq': faqs,
    }
    return entry


def main():
    assert len(pairs) == 50, 'expected 50 pairs, got %d' % len(pairs)
    want_slugs = [p['slug'] for p in pairs]
    assert len(set(want_slugs)) == 50, 'duplicate slugs in pair list'
    for s in want_slugs:
        assert s not in existing_slugs, 'slug already in registry: ' + s
    entries = [build_entry(p) for p in pairs]
    assert [e['slug'] for e in entries] == want_slugs
    out = os.path.join(BP, 'chunk_01.json')
    with open(out, 'w') as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print('wrote', out, 'with', len(entries), 'entries')


if __name__ == '__main__':
    main()
