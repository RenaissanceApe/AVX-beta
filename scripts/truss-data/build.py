# Builds src/data/truss/*.json from the manufacturers' documents (fetched with fetch.sh).
# Values are copied as published (metric columns only); Global Truss deflections are moved from
# cm to mm (x10). Every table is "unchecked" until a second person compares it with its source.
import hashlib, json, re, subprocess, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import prolyte as P, fantek as F

ROOT = sys.argv[1]              # scratchpad/web/truss
OUT = sys.argv[2]               # repo src/data/truss
RETRIEVED = '2026-10-27'

def sha(path): return hashlib.sha256(open(path, 'rb').read()).hexdigest()
def moddate(path):
    out = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    m = re.search(r'ModDate:\s+\w+\s+(\w+)\s+(\d+)\s+[\d:]+\s+(\d{4})', out)
    if not m:  # no date inside the file: the upload stamp in the publisher's file name (…_20240228161825.pdf)
        f = re.search(r'_(\d{4})(\d{2})(\d{2})\d{6}\.pdf$', path)
        return f'{f.group(1)}-{f.group(2)}-{f.group(3)}' if f else None
    months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()
    return f'{m.group(3)}-{months.index(m.group(1)) + 1:02d}-{int(m.group(2)):02d}'
def text(path, *args): return subprocess.run(['pdftotext', '-layout', *args, path, '-'], capture_output=True, text=True).stdout

# k for n-1 equal loads at L/n on a simple span: max moment = P * L * k
def k_n(n): return n / 8 if n % 2 == 0 else (n * n - 1) / (8 * n)

def validate(t):
    """Warnings for values that can't be right: order, monotonicity, beam-theory ratios at long spans."""
    cols, rows, out = t['columns'], t['rows'], []
    idx = {c: i for i, c in enumerate(cols)}
    spans = [r[0] for r in rows]
    if any(b <= a for a, b in zip(spans, spans[1:])): out.append('spans not increasing')
    steps = {round(b - a, 2) for a, b in zip(spans, spans[1:])}
    if len(steps) > 1: out.append(f'uneven span steps {sorted(steps)}: a row may be missing')
    loads = [c for c in cols if c == 'udl_kg_m' or re.fullmatch(r'p\d_kg', c) or c == 'udl_pa_kg_m']
    defls = [c for c in cols if c.endswith('_defl_mm')]
    for c in loads:
        v = [r[idx[c]] for r in rows if r[idx[c]] is not None]
        for i, (a, b) in enumerate(zip(v, v[1:])):
            if b > a: out.append(f'{c} rises from {a} to {b} after {spans[i]} m')
    for c in defls:
        v = [r[idx[c]] for r in rows if r[idx[c]] is not None]
        for i, (a, b) in enumerate(zip(v, v[1:])):
            if a - b > max(1.0, 0.1 * a): out.append(f'{c} falls from {a} to {b} after {spans[i]} m')
    points = sorted([c for c in cols if re.fullmatch(r'p\d_kg', c)], key=lambda c: int(c[1]))
    for r in rows:
        for a, b in zip(points, points[1:]):
            if r[idx[b]] is not None and r[idx[a]] is not None and r[idx[b]] > r[idx[a]] * 1.001:
                out.append(f'{b} ({r[idx[b]]}) above {a} ({r[idx[a]]}) at {r[0]} m')
    # Long spans are bending-governed: the cases must keep beam-theory ratios to the centre load
    if 'p2_kg' in idx:
        for r in rows:
            if r[0] < 0.6 * spans[-1]: continue
            p2 = r[idx['p2_kg']]
            for c in points[1:]:
                n = int(c[1]); want = 0.25 / k_n(n); got = r[idx[c]] / p2
                if abs(got / want - 1) > 0.15: out.append(f'{c}/p2 at {r[0]} m is {got:.2f}, beam theory gives {want:.2f}')
            if 'udl_kg_m' in idx:
                got = r[idx['udl_kg_m']] * r[0] / (2 * p2)
                if abs(got - 1) > 0.25: out.append(f'udl x span / (2 x p2) at {r[0]} m is {got:.2f}, expected about 1')
    return out

PROLYTE_COMMON = [
    'Static loads only.', 'Single span with supports at both ends; other static systems need a structural calculation.',
    'Self-weight of the truss already taken into account.', 'Only for the cross-section orientation shown in the table.',
    'Calculated to the Eurocodes; TÜV certification valid only for this table.']
GT_COMMON = ['Self-weight of the truss already taken into account.', 'Single span, supported at both ends (inclusive load table).']
FANTEK_COMMON = ['Load cases: UDL; UDL + 2 point loads for a PA hang (UDL+PA); n-1 equal point loads at L/n (p2 = centre).',
                 'Point deflection column applies to the point-load cases.', 'Aluminium 6082-T6.']

SHAPES = {'V': 'square', 'D': 'triangle', 'L': 'ladder', 'R': 'rectangle', 'SV': 'square', 'RV': 'rectangle'}
def prolyte_tables():
    tables = []
    pds_dir = os.path.join(ROOT, 'pro_pds')
    urls = dict(l.strip().split('|', 1) for l in open(os.path.join(os.path.dirname(__file__), 'prolyte-sources.txt')) if '|' in l)
    for f in sorted(os.listdir(os.path.join(ROOT, 'pro'))):
        name = f[:-4]
        path = os.path.join(ROOT, 'pro', f)
        if name == 'S36-PRE-RIG': continue  # different layout, see docs
        m = re.fullmatch(r'([A-Z])(\d+)([A-Z]+)', name)
        series, size, kind = m.group(1) + m.group(2), int(m.group(2)), m.group(3)
        shape = SHAPES.get(kind, kind)
        source = {'publisher': 'Prolyte', 'title': f'Loading table truss type {name}', 'url': urls[name],
                  'edition': moddate(path), 'retrieved': RETRIEVED, 'sha256': sha(path)}
        pds = next((p for p in os.listdir(pds_dir) if p[:-4] == name or name in p[:-4].split('-')), None)
        if kind == 'L':
            # Ladders: three support cases, 10 values per row (m ft | UDL kg/m lbs/ft | mm inch | CPL kg lbs | mm inch)
            t = text(path)
            parts = re.split(r'\n\s*' + name + r' - Allowable Loading \(([^)]*)\)', '\n' + t)
            for case, body in zip(parts[1::2], parts[2::2]):
                rows = []
                for line in body.splitlines():
                    tok = line.split()
                    tok = tok[:10]  # drawing labels (e.g. "1000") can follow a row
                    if len(tok) == 10 and re.fullmatch(r'\d+', tok[0]) and all(re.fullmatch(r'\d+([.,]\d+)?', x) for x in tok):
                        v = [float(x.replace(',', '.')) for x in tok]
                        assert abs(v[2] / 0.453 / 3.28 - v[3]) <= max(1.0, 0.01 * v[3]) and abs(v[6] / 0.453 - v[7]) <= max(1.0, 0.01 * v[7]), (name, v)
                        rows.append([v[0], v[2], v[4], v[6], v[8]])
                tables.append({'id': f'prolyte-{name.lower()}-{len([x for x in tables if x["series"] == name]) + 1}', 'brand': 'Prolyte', 'series': name,
                               'family': series, 'shape': shape, 'nominalCm': size, 'case': case.rstrip('.'),
                               'columns': ['span_m', 'udl_kg_m', 'udl_defl_mm', 'p2_kg', 'p2_defl_mm'], 'rows': rows,
                               'conditions': PROLYTE_COMMON + ['Loads suspended from the bottom chord only.'], 'source': source})
            continue
        rows = P.rows(path)
        bad = [r[0] for r in rows if P.check(r)]
        assert not bad, (name, bad)
        metric = [[r[0], r[2], r[4], r[6], r[8], r[10], r[12], r[14], r[16]] for r in rows]
        t = {'id': f'prolyte-{name.lower()}', 'brand': 'Prolyte', 'series': name, 'family': series, 'shape': shape, 'nominalCm': size,
             'columns': ['span_m', 'udl_kg_m', 'udl_defl_mm', 'p2_kg', 'p2_defl_mm', 'p3_kg', 'p4_kg', 'p5_kg', 'weight_kg'],
             'rows': metric, 'conditions': PROLYTE_COMMON, 'source': source,
             'checks': ['Every kg value agrees with its lbs column and every mm value with its inch column.']}
        if pds:
            pp = os.path.join(pds_dir, pds)
            # A data sheet can hold several types (S52SV-S52V): take this type's section
            sections = re.split(r'\n\s*([A-Za-z0-9 ]+?) - Allowable Loading', '\n' + text(pp))
            body = next((bd for title, bd in zip(sections[1::2], sections[2::2]) if name in title.split()), '')
            prow = [[float(x.replace(',', '.')) for x in line.split()] for line in body.splitlines()
                    if len(line.split()) == 17 and all(re.fullmatch(r'\d+([.,]\d+)?', x) for x in line.split())]
            same = [[r[0], r[2], r[4], r[6], r[8], r[10], r[12], r[14], r[16]] for r in prow] == metric
            t['crossCheck'] = {'title': f'Product data sheet {pds[:-4]}', 'url': urls.get('PDS-' + pds[:-4]), 'edition': moddate(pp),
                               'sha256': sha(pp), 'result': 'identical' if same else 'differs'}
        tables.append(t)
    return tables

GT_PAGES = {  # page in GT-Trussing-2023.pdf -> series; '-B' (black) pages repeat the table and are used as a check
    'F23': (12, None), 'F24': (16, None), 'F34': (44, 48), 'F34P': (54, 56), 'F34PL': (58, None),
    'F43': (76, None), 'F44': (80, None), 'F44P': (84, 88), 'F54': (92, None), 'F14': (4, None)}
def gt_rows(pdf, page):
    t = subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-layout', '-x', '0', '-y', '560', '-W', '595', '-H', '282', pdf, '-'],
                       capture_output=True, text=True).stdout
    out = []
    for line in t.splitlines():
        line = re.sub(r'(\d) ,(\d)', r'\1,\2', line)
        nums = re.findall(r'(?<![\d,])\d+,\d+(?![\d,])', line)
        if len(nums) == 12: nums = nums[1:]  # a dimension label left of the table ("18,5 cm")
        if len(nums) == 11: out.append([float(n.replace(',', '.')) for n in nums])
    return out
def gt_meta(pdf, page):
    t = text(pdf, '-f', str(page), '-l', str(page))
    pts = re.search(r'(\d)-[Pp]unkt', t); size = re.search(r'Außenmaß\s+von\s+(\d+)\s*cm', t)
    tube = re.search(r'(\d+\s*x\s*\d+(?:[.,]\d+)?)\s*mm\s+Gurtrohren', t)
    return {'shape': {'4': 'square', '3': 'triangle', '2': 'ladder'}.get(pts.group(1)) if pts else None,
            'nominalCm': int(size.group(1)) if size else None, 'chords': (tube.group(1).replace(' ', '') + ' mm') if tube else None}
def gt_tables():
    pdf = os.path.join(ROOT, 'gt', 'GT-Trussing-2023.pdf')
    source = {'publisher': 'Global Truss', 'title': 'Traversen / Trussing catalogue 2023',
              'url': 'https://globaltruss.de/marketing/files/website/GT-Trussing-2023.pdf', 'edition': moddate(pdf),
              'retrieved': RETRIEVED, 'sha256': sha(pdf)}
    tables = []
    for series, (page, twin) in GT_PAGES.items():
        rows = gt_rows(pdf, page)
        meta = gt_meta(pdf, page)
        metric = [[r[0], r[1], round(r[2] * 10, 1), r[3], round(r[4] * 10, 1), r[5], round(r[6] * 10, 1), r[7], round(r[8] * 10, 1), r[9], round(r[10] * 10, 1)] for r in rows]
        t = {'id': f'globaltruss-{series.lower()}', 'brand': 'Global Truss', 'series': series, 'family': series, **{k: v for k, v in meta.items() if v},
             'columns': ['span_m', 'udl_kg_m', 'udl_defl_mm', 'p2_kg', 'p2_defl_mm', 'p3_kg', 'p3_defl_mm', 'p4_kg', 'p4_defl_mm', 'p5_kg', 'p5_defl_mm'],
             'rows': metric, 'conditions': GT_COMMON + ['Deflections published in cm; stored here in mm.'],
             'source': {**source, 'page': page}}
        if twin:
            t['crossCheck'] = {'title': f'Same catalogue, page {twin} ({series}-B, black finish)', 'result': 'identical' if gt_rows(pdf, twin) == rows else 'differs'}
        tables.append(t)
    return tables

FANTEK_DOCS = {  # series -> (file, nominal cm, shape, published file name)
    'EC30': ('fantek_Manual_EC-30_2024_1_20240621133912.pdf', 30, 'square', 'Manual EC-30_2024 1_20240621133912.pdf'),
    'EC29P': ('fantek_Manual_EC-29p_2024_2_20240621133833.pdf', 29, 'square', 'Manual EC-29p_2024 2_20240621133833.pdf'),
    'EC76': ('fantek_Manual_EC-76_2024_6a_1_20240621112532.pdf', 76, 'square', 'Manual EC-76_2024_6a 1_20240621112532.pdf')}
FANTEK_URL = 'https://media.equipson.es/Docs/'
def fantek_tables():
    tables = []
    cols15 = ['span_m', 'udl_kg_m', 'udl_defl_mm', 'udl_pa_kg_m', 'udl_pa_defl_mm', 'p2_kg', 'p3_kg', 'p4_kg', 'p5_kg', 'p6_kg', 'p7_kg', 'p8_kg', 'p9_kg', 'points_defl_mm', 'weight_kg']
    for series, (f, size, shape, published) in FANTEK_DOCS.items():
        path = os.path.join(ROOT, 'pdf', f)
        rows = F.rows(path)
        copies = [[]]
        for x in rows:
            if copies[-1] and x[0] <= copies[-1][-1][0]: copies.append([])
            copies[-1].append(x)
        full = max(copies, key=len)
        others = [c for c in copies if c is not full and len(c) == len(full)]
        t = {'id': f'fantek-{series.lower()}', 'brand': 'Fantek', 'series': series.replace('P', 'p'), 'family': series, 'shape': shape, 'nominalCm': size,
             'columns': cols15, 'rows': full, 'conditions': FANTEK_COMMON,
             'source': {'publisher': 'Fantek Industrial S.L.', 'title': f'Manual técnico y documentación {series[:2]}-{series[2:].lower()} (section 2.2)',
                        'url': FANTEK_URL + 'Manuales/' + published.replace(' ', '%20'), 'edition': moddate(path), 'retrieved': RETRIEVED, 'sha256': sha(path)}}
        if others:
            t['crossCheck'] = {'title': 'Same manual, manufacturer\'s certificate (annex 3)', 'result': 'identical' if all(o == full for o in others) else 'differs'}
        tables.append(t)
    # EC 40: an image, transcribed by hand; checked against its own lbs and inch columns
    ec40 = json.load(open(os.path.join(os.path.dirname(__file__), 'ec40.json')))['rows']
    path = os.path.join(ROOT, 'pdf', 'fantek_Datos_tecnicos_EC_40_FK40Q_1_20240228161825.pdf')
    tables.append({'id': 'fantek-ec40', 'brand': 'Fantek', 'series': 'EC40', 'family': 'EC40', 'shape': 'square', 'nominalCm': 40, 'chords': '50x4 mm',
                   'columns': cols15,
                   'rows': [[r[0], r[1], r[3], r[5], r[7], r[9], r[11], r[13], r[15], r[17], r[19], r[21], r[23], r[25], r[27]] for r in ec40],
                   'conditions': FANTEK_COMMON,
                   'source': {'publisher': 'Fantek Industrial S.L.', 'title': 'Datos técnicos EC 40 FK40Q 1', 'url': FANTEK_URL + 'Datasheet/Datos%20tecnicos%20EC%2040%20FK40Q%201_20240228161825.pdf',
                              'edition': moddate(path), 'retrieved': RETRIEVED, 'sha256': sha(path)},
                   'checks': ['Published as an image: transcribed by hand at 200 dpi.', 'Edition: the upload date in the file name (the PDF carries none).', 'Every kg value agrees with its lbs column and every mm value with its inch column.']})
    return tables

def finish(tables):
    for t in tables:
        t['issues'] = validate(t)
        t['status'] = 'blocked' if t['issues'] or (t.get('crossCheck') or {}).get('result') == 'differs' else 'unchecked'
        t['checkedBy'] = None
        t['rows'] = [[int(x) if float(x).is_integer() else x for x in r] for r in t['rows']]
        assert all(len(r) == len(t['columns']) for r in t['rows']), t['id']
        assert len(t['rows']) >= 3, t['id']
    return tables

os.makedirs(OUT, exist_ok=True)
for brand, fn in [('prolyte', prolyte_tables), ('globaltruss', gt_tables), ('fantek', fantek_tables)]:
    tables = finish(fn())
    order = ['id', 'brand', 'series', 'family', 'shape', 'nominalCm', 'chords', 'case', 'status', 'checkedBy', 'issues', 'columns', 'rows', 'conditions', 'checks', 'source', 'crossCheck']
    tables = [{k: t[k] for k in order if k in t} for t in tables]
    # Readable diffs: one table row per line
    body = json.dumps({'brand': tables[0]['brand'], 'tables': tables}, ensure_ascii=False, indent=1)
    body = re.sub(r'\[\n\s*(-?[\d.]+(?:,\n\s*-?[\d.]+)*)\n\s*\]', lambda m: '[' + re.sub(r',\n\s*', ', ', m.group(1)) + ']', body)
    with open(os.path.join(OUT, f'{brand}.json'), 'w') as fh:
        fh.write(body + '\n')
    for t in tables:
        print(f"{t['id']:28} {t['status']:9} rows={len(t['rows']):2} {t['rows'][0][0]}-{t['rows'][-1][0]} m  cross={(t.get('crossCheck') or {}).get('result', '-'):9} issues={len(t['issues'])} {t['issues'][:2]}")
